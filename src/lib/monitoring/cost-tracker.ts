import { CostMetric, BudgetAlert } from './types';
import { MonitoringConfig } from './config';
import { AlertManager } from './alert-manager';
import * as Sentry from '@sentry/nextjs';

interface BudgetConfig {
  service: string;
  dailyLimit: number;
  monthlyLimit: number;
  currency: string;
  alertThresholds: number[]; // e.g., [0.5, 0.75, 0.9] for 50%, 75%, 90%
}

interface CostSummary {
  service: string;
  daily: { cost: number; percentage: number };
  monthly: { cost: number; percentage: number };
  currency: string;
  lastUpdated: Date;
}

export class CostTracker {
  private config: MonitoringConfig;
  private alertManager: AlertManager;
  private costs: CostMetric[] = [];
  private budgets: Map<string, BudgetConfig> = new Map();
  private alerts: BudgetAlert[] = [];
  private costSummaries: Map<string, CostSummary> = new Map();
  private updateTimer?: NodeJS.Timeout;

  constructor(config: MonitoringConfig, alertManager: AlertManager) {
    this.config = config;
    this.alertManager = alertManager;
    
    this.initializeDefaultBudgets();
    this.startPeriodicUpdates();
  }

  private initializeDefaultBudgets(): void {
    // Default budgets for Dream 100 Keyword Engine services
    this.setBudget('ahrefs', {
      service: 'ahrefs',
      dailyLimit: 50, // $50/day
      monthlyLimit: 1000, // $1000/month
      currency: 'USD',
      alertThresholds: [0.5, 0.75, 0.9]
    });
    
    this.setBudget('anthropic', {
      service: 'anthropic',
      dailyLimit: 30, // $30/day
      monthlyLimit: 600, // $600/month
      currency: 'USD',
      alertThresholds: [0.6, 0.8, 0.95]
    });
    
    this.setBudget('infrastructure', {
      service: 'infrastructure',
      dailyLimit: 20, // $20/day
      monthlyLimit: 500, // $500/month
      currency: 'USD',
      alertThresholds: [0.7, 0.85, 0.95]
    });
    
    this.setBudget('total', {
      service: 'total',
      dailyLimit: 100, // $100/day total
      monthlyLimit: 2000, // $2000/month total
      currency: 'USD',
      alertThresholds: [0.6, 0.8, 0.9]
    });
  }

  setBudget(service: string, budget: BudgetConfig): void {
    this.budgets.set(service, budget);
    
    // Initialize cost summary
    this.costSummaries.set(service, {
      service,
      daily: { cost: 0, percentage: 0 },
      monthly: { cost: 0, percentage: 0 },
      currency: budget.currency,
      lastUpdated: new Date()
    });
  }

  getBudget(service: string): BudgetConfig | null {
    return this.budgets.get(service) || null;
  }

  recordCost(
    service: string,
    operation: string,
    cost: number,
    currency: string = 'USD',
    metadata?: Record<string, any>
  ): void {
    if (!this.config.businessMetrics.enableCostTracking) return;

    const costMetric: CostMetric = {
      service,
      operation,
      cost,
      currency,
      timestamp: new Date(),
      metadata
    };

    this.costs.push(costMetric);

    // Update cost summaries
    this.updateCostSummary(service);
    this.updateCostSummary('total'); // Update total costs

    // Check budget alerts
    this.checkBudgetAlerts(service);
    this.checkBudgetAlerts('total');

    // Send to Sentry
    Sentry.addBreadcrumb({
      message: `Cost recorded: ${service} ${operation}`,
      level: 'info',
      category: 'cost_tracking',
      data: {
        service,
        operation,
        cost,
        currency,
        ...metadata
      }
    });

    Sentry.setMeasurement(`cost_${service}_${operation}`, cost, 'USD');

    // Alert on high individual costs
    if (cost > 10) { // Alert for single operations > $10
      this.alertManager.triggerAlert({
        type: 'high_cost_operation',
        severity: 'warning',
        message: `High cost operation: ${service} ${operation} cost $${cost.toFixed(2)}`,
        metadata: {
          service,
          operation,
          cost,
          currency,
          ...metadata
        }
      });
    }
  }

  private updateCostSummary(service: string): void {
    const budget = this.budgets.get(service);
    if (!budget) return;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get costs for this service (or all services for 'total')
    const serviceCosts = service === 'total' 
      ? this.costs 
      : this.costs.filter(cost => cost.service === service);

    // Calculate daily costs
    const dailyCosts = serviceCosts.filter(cost => cost.timestamp >= startOfDay);
    const dailyTotal = dailyCosts.reduce((sum, cost) => sum + cost.cost, 0);
    const dailyPercentage = (dailyTotal / budget.dailyLimit) * 100;

    // Calculate monthly costs
    const monthlyCosts = serviceCosts.filter(cost => cost.timestamp >= startOfMonth);
    const monthlyTotal = monthlyCosts.reduce((sum, cost) => sum + cost.cost, 0);
    const monthlyPercentage = (monthlyTotal / budget.monthlyLimit) * 100;

    // Update summary
    this.costSummaries.set(service, {
      service,
      daily: { cost: dailyTotal, percentage: dailyPercentage },
      monthly: { cost: monthlyTotal, percentage: monthlyPercentage },
      currency: budget.currency,
      lastUpdated: now
    });
  }

  private checkBudgetAlerts(service: string): void {
    const budget = this.budgets.get(service);
    const summary = this.costSummaries.get(service);
    
    if (!budget || !summary) return;

    // Check daily budget alerts
    budget.alertThresholds.forEach(threshold => {
      if (summary.daily.percentage >= threshold * 100 && summary.daily.percentage < (threshold * 100 + 5)) {
        this.triggerBudgetAlert(service, 'daily', threshold, summary.daily.cost, budget.dailyLimit);
      }
    });

    // Check monthly budget alerts
    budget.alertThresholds.forEach(threshold => {
      if (summary.monthly.percentage >= threshold * 100 && summary.monthly.percentage < (threshold * 100 + 5)) {
        this.triggerBudgetAlert(service, 'monthly', threshold, summary.monthly.cost, budget.monthlyLimit);
      }
    });

    // Critical alert if budget exceeded
    if (summary.daily.percentage > 100) {
      this.triggerBudgetAlert(service, 'daily', 1.0, summary.daily.cost, budget.dailyLimit, 'critical');
    }
    
    if (summary.monthly.percentage > 100) {
      this.triggerBudgetAlert(service, 'monthly', 1.0, summary.monthly.cost, budget.monthlyLimit, 'critical');
    }
  }

  private triggerBudgetAlert(
    service: string,
    period: 'daily' | 'monthly',
    threshold: number,
    currentSpend: number,
    budgetLimit: number,
    severity: 'warning' | 'critical' = 'warning'
  ): void {
    const alert: BudgetAlert = {
      service,
      currentSpend,
      budgetLimit,
      percentage: (currentSpend / budgetLimit) * 100,
      period,
      timestamp: new Date()
    };

    this.alerts.push(alert);

    // Send alert
    this.alertManager.triggerAlert({
      type: 'budget_alert',
      severity,
      message: `Budget ${severity}: ${service} ${period} spending at ${alert.percentage.toFixed(1)}% ($${currentSpend.toFixed(2)}/$${budgetLimit})`,
      metadata: {
        service,
        period,
        currentSpend,
        budgetLimit,
        percentage: alert.percentage,
        threshold
      }
    });

    // Send to Sentry
    Sentry.withScope(scope => {
      scope.setLevel(severity === 'critical' ? 'error' : 'warning');
      scope.setTag('budgetAlert', true);
      scope.setTag('service', service);
      scope.setTag('period', period);
      scope.setContext('budgetDetails', alert as Record<string, any>);
      
      Sentry.captureMessage(
        `Budget ${severity}: ${service} ${period} at ${alert.percentage.toFixed(1)}%`,
        severity === 'critical' ? 'error' : 'warning'
      );
    });
  }

  getCostSummary(service?: string): CostSummary[] {
    if (service) {
      const summary = this.costSummaries.get(service);
      return summary ? [summary] : [];
    }
    
    return Array.from(this.costSummaries.values());
  }

  getCostBreakdown(timeWindow: number = 86400000): {
    byService: Record<string, number>;
    byOperation: Record<string, number>;
    total: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentCosts = this.costs.filter(cost => cost.timestamp > cutoff);

    const byService: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let total = 0;

    recentCosts.forEach(cost => {
      byService[cost.service] = (byService[cost.service] || 0) + cost.cost;
      
      const operationKey = `${cost.service}.${cost.operation}`;
      byOperation[operationKey] = (byOperation[operationKey] || 0) + cost.cost;
      
      total += cost.cost;
    });

    // Calculate trend (compare with previous period)
    const previousPeriodCutoff = new Date(cutoff.getTime() - timeWindow);
    const previousCosts = this.costs.filter(
      cost => cost.timestamp > previousPeriodCutoff && cost.timestamp <= cutoff
    );
    const previousTotal = previousCosts.reduce((sum, cost) => sum + cost.cost, 0);
    
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (total > previousTotal * 1.1) {
      trend = 'increasing';
    } else if (total < previousTotal * 0.9) {
      trend = 'decreasing';
    }

    return {
      byService,
      byOperation,
      total,
      trend
    };
  }

  getTopCostOperations(limit: number = 10, timeWindow: number = 86400000): Array<{
    service: string;
    operation: string;
    totalCost: number;
    requestCount: number;
    avgCostPerRequest: number;
  }> {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentCosts = this.costs.filter(cost => cost.timestamp > cutoff);

    const operationStats = new Map<string, {
      totalCost: number;
      requestCount: number;
      service: string;
      operation: string;
    }>();

    recentCosts.forEach(cost => {
      const key = `${cost.service}.${cost.operation}`;
      const stats = operationStats.get(key) || {
        totalCost: 0,
        requestCount: 0,
        service: cost.service,
        operation: cost.operation
      };
      
      stats.totalCost += cost.cost;
      stats.requestCount++;
      operationStats.set(key, stats);
    });

    return Array.from(operationStats.values())
      .map(stats => ({
        service: stats.service,
        operation: stats.operation,
        totalCost: stats.totalCost,
        requestCount: stats.requestCount,
        avgCostPerRequest: stats.totalCost / stats.requestCount
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit);
  }

  getCostProjection(service: string): {
    dailyProjection: number;
    monthlyProjection: number;
    budgetExhaustionDate?: Date;
  } {
    const now = new Date();
    const last24Hours = this.costs.filter(
      cost => (service === 'total' || cost.service === service) &&
              cost.timestamp > new Date(now.getTime() - 86400000)
    );
    
    const currentDailyCost = last24Hours.reduce((sum, cost) => sum + cost.cost, 0);
    const budget = this.budgets.get(service);
    
    if (!budget) {
      return {
        dailyProjection: currentDailyCost,
        monthlyProjection: currentDailyCost * 30
      };
    }

    // Calculate remaining days in month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const remainingDays = daysInMonth - currentDay;
    
    const monthlyProjection = currentDailyCost * remainingDays;
    
    // Calculate budget exhaustion date
    let budgetExhaustionDate: Date | undefined;
    if (currentDailyCost > 0) {
      const summary = this.costSummaries.get(service);
      if (summary) {
        const remainingBudget = budget.monthlyLimit - summary.monthly.cost;
        const daysUntilExhaustion = remainingBudget / currentDailyCost;
        
        if (daysUntilExhaustion > 0 && daysUntilExhaustion <= 31) {
          budgetExhaustionDate = new Date(now.getTime() + (daysUntilExhaustion * 86400000));
        }
      }
    }

    return {
      dailyProjection: currentDailyCost,
      monthlyProjection,
      budgetExhaustionDate
    };
  }

  getBudgetAlerts(timeWindow: number = 86400000): BudgetAlert[] {
    const cutoff = new Date(Date.now() - timeWindow);
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  private startPeriodicUpdates(): void {
    // Update cost summaries every 5 minutes
    this.updateTimer = setInterval(() => {
      this.budgets.forEach((_, service) => {
        this.updateCostSummary(service);
      });
      this.cleanup();
    }, 300000);
  }

  private cleanup(): void {
    // Keep costs for retention period
    const cutoff = new Date(Date.now() - (this.config.retention.metrics * 24 * 60 * 60 * 1000));
    this.costs = this.costs.filter(cost => cost.timestamp > cutoff);
    
    // Keep alerts for 30 days
    const alertCutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
    this.alerts = this.alerts.filter(alert => alert.timestamp > alertCutoff);
  }

  destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }
}