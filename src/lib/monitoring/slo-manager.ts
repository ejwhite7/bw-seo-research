import { SLOTarget, MetricData } from './types';
import { MonitoringConfig } from './config';
import { AlertManager } from './alert-manager';
import * as Sentry from '@sentry/nextjs';

interface SLOStatus {
  target: SLOTarget;
  currentValue: number;
  errorBudgetRemaining: number;
  errorBudgetUsed: number;
  status: 'healthy' | 'warning' | 'critical';
  lastUpdated: Date;
  trend: 'improving' | 'stable' | 'degrading';
  burnRate: number;
  timeToExhaustion?: number; // hours
}

interface SLOViolation {
  id: string;
  sloId: string;
  timestamp: Date;
  severity: 'warning' | 'critical';
  currentValue: number;
  threshold: number;
  errorBudgetUsed: number;
  resolved?: boolean;
  resolvedAt?: Date;
}

export class SLOManager {
  private config: MonitoringConfig;
  private alertManager: AlertManager;
  private targets: Map<string, SLOTarget> = new Map();
  private metrics: Map<string, MetricData[]> = new Map();
  private sloStatus: Map<string, SLOStatus> = new Map();
  private violations: SLOViolation[] = [];
  private updateTimer?: NodeJS.Timeout;

  constructor(config: MonitoringConfig, alertManager: AlertManager, targets: SLOTarget[] = []) {
    this.config = config;
    this.alertManager = alertManager;
    
    // Initialize targets
    targets.forEach(target => this.addTarget(target));
    
    // Start periodic SLO evaluation
    this.startPeriodicEvaluation();
  }

  addTarget(target: SLOTarget): void {
    const targetId = this.generateTargetId(target);
    this.targets.set(targetId, target);
    
    // Initialize metrics storage
    this.metrics.set(targetId, []);
    
    // Initialize SLO status
    this.sloStatus.set(targetId, {
      target,
      currentValue: 0,
      errorBudgetRemaining: target.errorBudget,
      errorBudgetUsed: 0,
      status: 'healthy',
      lastUpdated: new Date(),
      trend: 'stable',
      burnRate: 0
    });
  }

  removeTarget(service: string, metric: string): boolean {
    const targetId = `${service}_${metric}`;
    const removed = this.targets.delete(targetId);
    
    if (removed) {
      this.metrics.delete(targetId);
      this.sloStatus.delete(targetId);
    }
    
    return removed;
  }

  recordMetric(service: string, metric: string, value: number, timestamp: Date = new Date()): void {
    const targetId = `${service}_${metric}`;
    const target = this.targets.get(targetId);
    
    if (!target) return;
    
    // Add metric data
    const metricData: MetricData = {
      name: metric,
      value,
      timestamp,
      tags: { service }
    };
    
    const metrics = this.metrics.get(targetId) || [];
    metrics.push(metricData);
    
    // Keep only data within the SLO window
    const windowMs = this.parseTimeWindow(target.window);
    const cutoff = new Date(timestamp.getTime() - windowMs);
    const filteredMetrics = metrics.filter(m => m.timestamp > cutoff);
    
    this.metrics.set(targetId, filteredMetrics);
    
    // Update SLO status
    this.updateSLOStatus(targetId);
  }

  private updateSLOStatus(targetId: string): void {
    const target = this.targets.get(targetId);
    const metrics = this.metrics.get(targetId);
    const currentStatus = this.sloStatus.get(targetId);
    
    if (!target || !metrics || !currentStatus) return;
    
    // Calculate current SLO value based on metric type
    const currentValue = this.calculateSLOValue(target, metrics);
    const previousValue = currentStatus.currentValue;
    
    // Calculate error budget usage
    const errorBudgetUsed = this.calculateErrorBudgetUsed(target, currentValue);
    const errorBudgetRemaining = target.errorBudget - errorBudgetUsed;
    
    // Calculate burn rate (rate of error budget consumption)
    const burnRate = this.calculateBurnRate(targetId, errorBudgetUsed);
    
    // Calculate time to exhaustion
    const timeToExhaustion = burnRate > 0 ? (errorBudgetRemaining / burnRate) * 24 : undefined;
    
    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (errorBudgetUsed >= target.errorBudget * 0.9) {
      status = 'critical';
    } else if (errorBudgetUsed >= target.errorBudget * 0.75 || (timeToExhaustion && timeToExhaustion < 24)) {
      status = 'warning';
    }
    
    // Determine trend
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (Math.abs(currentValue - previousValue) > target.target * 0.01) { // 1% change
      if (target.metric.includes('error') || target.metric.includes('failure')) {
        trend = currentValue < previousValue ? 'improving' : 'degrading';
      } else {
        trend = currentValue > previousValue ? 'improving' : 'degrading';
      }
    }
    
    // Update status
    const newStatus: SLOStatus = {
      target,
      currentValue,
      errorBudgetRemaining,
      errorBudgetUsed,
      status,
      lastUpdated: new Date(),
      trend,
      burnRate,
      timeToExhaustion
    };
    
    this.sloStatus.set(targetId, newStatus);
    
    // Check for violations and alerts
    this.checkForViolations(targetId, newStatus);
    
    // Send to Sentry
    Sentry.setMeasurement(`slo_${targetId}_value`, currentValue, 'percent');
    Sentry.setMeasurement(`slo_${targetId}_error_budget_used`, errorBudgetUsed, 'percent');
    Sentry.setMeasurement(`slo_${targetId}_burn_rate`, burnRate, 'ratio');
  }

  private calculateSLOValue(target: SLOTarget, metrics: MetricData[]): number {
    if (metrics.length === 0) return 0;
    
    switch (target.metric) {
      case 'availability':
        // For availability, calculate percentage of successful requests
        const successCount = metrics.filter(m => m.value === 1).length;
        return (successCount / metrics.length) * 100;
        
      case 'latency_p95':
        // For latency, calculate 95th percentile
        const sortedLatencies = metrics.map(m => m.value).sort((a, b) => a - b);
        const p95Index = Math.floor(sortedLatencies.length * 0.95);
        return sortedLatencies[p95Index] || 0;
        
      case 'success_rate':
        // For success rate, calculate percentage of successful operations
        const successfulOps = metrics.filter(m => m.value === 1).length;
        return (successfulOps / metrics.length) * 100;
        
      case 'error_rate':
        // For error rate, calculate percentage of failed operations
        const failedOps = metrics.filter(m => m.value === 1).length;
        return (failedOps / metrics.length) * 100;
        
      case 'relevance_score':
        // For relevance score, calculate average score
        const totalScore = metrics.reduce((sum, m) => sum + m.value, 0);
        return (totalScore / metrics.length);
        
      default:
        // Default: calculate average
        const total = metrics.reduce((sum, m) => sum + m.value, 0);
        return total / metrics.length;
    }
  }

  private calculateErrorBudgetUsed(target: SLOTarget, currentValue: number): number {
    // Calculate how much of the error budget has been consumed
    if (target.metric.includes('error') || target.metric.includes('failure')) {
      // For error rates, higher values consume more budget
      return Math.max(0, currentValue);
    } else {
      // For success metrics, lower values consume more budget
      const shortfall = Math.max(0, target.target - currentValue);
      return (shortfall / target.target) * target.errorBudget;
    }
  }

  private calculateBurnRate(targetId: string, currentErrorBudgetUsed: number): number {
    // Simple burn rate calculation - could be made more sophisticated
    const status = this.sloStatus.get(targetId);
    if (!status) return 0;
    
    const timeDiff = Date.now() - status.lastUpdated.getTime();
    if (timeDiff === 0) return 0;
    
    const budgetDiff = currentErrorBudgetUsed - status.errorBudgetUsed;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    return budgetDiff / hoursDiff;
  }

  private checkForViolations(targetId: string, status: SLOStatus): void {
    const { target, errorBudgetUsed, currentValue } = status;
    
    // Check for error budget violation
    if (errorBudgetUsed >= target.errorBudget * 0.9 && status.status === 'critical') {
      this.recordViolation(targetId, 'critical', currentValue, target.target, errorBudgetUsed);
      
      this.alertManager.triggerAlert({
        type: 'slo_violation',
        severity: 'critical',
        message: `SLO critical violation: ${target.service} ${target.metric} - ${errorBudgetUsed.toFixed(1)}% error budget used`,
        metadata: {
          service: target.service,
          metric: target.metric,
          currentValue,
          target: target.target,
          errorBudgetUsed,
          errorBudgetRemaining: target.errorBudget - errorBudgetUsed
        }
      });
    } else if (errorBudgetUsed >= target.errorBudget * 0.75 && status.status === 'warning') {
      this.recordViolation(targetId, 'warning', currentValue, target.target, errorBudgetUsed);
      
      this.alertManager.triggerAlert({
        type: 'slo_warning',
        severity: 'warning',
        message: `SLO warning: ${target.service} ${target.metric} - ${errorBudgetUsed.toFixed(1)}% error budget used`,
        metadata: {
          service: target.service,
          metric: target.metric,
          currentValue,
          target: target.target,
          errorBudgetUsed,
          timeToExhaustion: status.timeToExhaustion
        }
      });
    }
    
    // Check for fast burn rate
    if (status.timeToExhaustion && status.timeToExhaustion < 6) { // Less than 6 hours
      this.alertManager.triggerAlert({
        type: 'slo_fast_burn',
        severity: 'warning',
        message: `Fast SLO burn rate: ${target.service} ${target.metric} - error budget will be exhausted in ${status.timeToExhaustion.toFixed(1)} hours`,
        metadata: {
          service: target.service,
          metric: target.metric,
          burnRate: status.burnRate,
          timeToExhaustion: status.timeToExhaustion
        }
      });
    }
  }

  private recordViolation(
    sloId: string,
    severity: 'warning' | 'critical',
    currentValue: number,
    threshold: number,
    errorBudgetUsed: number
  ): void {
    const violation: SLOViolation = {
      id: this.generateViolationId(),
      sloId,
      timestamp: new Date(),
      severity,
      currentValue,
      threshold,
      errorBudgetUsed,
      resolved: false
    };
    
    this.violations.push(violation);
  }

  private startPeriodicEvaluation(): void {
    // Evaluate SLOs every 5 minutes
    this.updateTimer = setInterval(() => {
      this.targets.forEach((_, targetId) => {
        this.updateSLOStatus(targetId);
      });
      this.cleanup();
    }, 300000);
  }

  private parseTimeWindow(window: string): number {
    const value = parseInt(window.slice(0, -1));
    const unit = window.slice(-1);
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      case 'm': return value * 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  }

  private generateTargetId(target: SLOTarget): string {
    return `${target.service}_${target.metric}`;
  }

  private generateViolationId(): string {
    return `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSLOStatus(service?: string): SLOStatus[] {
    const statuses = Array.from(this.sloStatus.values());
    
    if (service) {
      return statuses.filter(status => status.target.service === service);
    }
    
    return statuses;
  }

  getSLOSummary(): {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    avgErrorBudgetUsed: number;
    worstPerforming: SLOStatus[];
  } {
    const statuses = Array.from(this.sloStatus.values());
    
    const summary = {
      total: statuses.length,
      healthy: statuses.filter(s => s.status === 'healthy').length,
      warning: statuses.filter(s => s.status === 'warning').length,
      critical: statuses.filter(s => s.status === 'critical').length,
      avgErrorBudgetUsed: statuses.length > 0 
        ? statuses.reduce((sum, s) => sum + s.errorBudgetUsed, 0) / statuses.length 
        : 0,
      worstPerforming: statuses
        .filter(s => s.status !== 'healthy')
        .sort((a, b) => b.errorBudgetUsed - a.errorBudgetUsed)
        .slice(0, 5)
    };
    
    return summary;
  }

  getViolations(timeWindow: number = 86400000): SLOViolation[] {
    const cutoff = new Date(Date.now() - timeWindow);
    return this.violations.filter(v => v.timestamp > cutoff);
  }

  resolveViolation(violationId: string): boolean {
    const violation = this.violations.find(v => v.id === violationId);
    if (!violation) return false;
    
    violation.resolved = true;
    violation.resolvedAt = new Date();
    return true;
  }

  private cleanup(): void {
    // Clean up old violations (keep last 1000)
    if (this.violations.length > 1000) {
      this.violations = this.violations
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 1000);
    }
    
    // Clean up old metrics beyond SLO windows
    this.targets.forEach((target, targetId) => {
      const windowMs = this.parseTimeWindow(target.window);
      const cutoff = new Date(Date.now() - windowMs * 2); // Keep 2x window for trend analysis
      
      const metrics = this.metrics.get(targetId) || [];
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoff);
      this.metrics.set(targetId, filteredMetrics);
    });
  }

  destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }
}