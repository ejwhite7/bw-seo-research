import { AlertRule, AlertChannel } from './types';
import { MonitoringConfig } from './config';
import * as Sentry from '@sentry/nextjs';

interface Alert {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

interface AlertState {
  lastTriggered: Date;
  count: number;
  inCooldown: boolean;
}

export class AlertManager {
  private config: MonitoringConfig;
  private rules: AlertRule[];
  private activeAlerts: Map<string, Alert> = new Map();
  private alertStates: Map<string, AlertState> = new Map();
  private alertHistory: Alert[] = [];

  constructor(config: MonitoringConfig, rules: AlertRule[] = []) {
    this.config = config;
    this.rules = rules;
  }

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  updateRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const ruleIndex = this.rules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) return false;
    
    const currentRule = this.rules[ruleIndex];
    if (!currentRule) return false;
    
    const updatedRule: AlertRule = {
      id: currentRule.id,
      name: updates.name ?? currentRule.name,
      metric: updates.metric ?? currentRule.metric,
      condition: updates.condition ?? currentRule.condition,
      threshold: updates.threshold ?? currentRule.threshold,
      severity: updates.severity ?? currentRule.severity,
      enabled: updates.enabled ?? currentRule.enabled,
      cooldown: updates.cooldown ?? currentRule.cooldown,
      channels: updates.channels ?? currentRule.channels,
      description: updates.description ?? currentRule.description
    };
    this.rules[ruleIndex] = updatedRule;
    return true;
  }

  removeRule(ruleId: string): boolean {
    const ruleIndex = this.rules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) return false;
    
    this.rules.splice(ruleIndex, 1);
    return true;
  }

  triggerAlert(alert: Omit<Alert, 'id' | 'timestamp'>): string {
    const alertId = this.generateAlertId();
    const fullAlert: Alert = {
      id: alertId,
      timestamp: new Date(),
      ...alert
    };

    // Check if we should suppress this alert due to cooldown
    const ruleKey = `${alert.type}_${alert.severity}`;
    const state = this.alertStates.get(ruleKey);
    
    if (state?.inCooldown) {
      console.log(`Alert suppressed due to cooldown: ${alert.message}`);
      return alertId;
    }

    // Add to active alerts
    this.activeAlerts.set(alertId, fullAlert);
    this.alertHistory.push(fullAlert);

    // Update alert state
    this.updateAlertState(ruleKey);

    // Send alert through configured channels
    this.sendAlert(fullAlert);

    // Log to Sentry
    Sentry.withScope(scope => {
      scope.setLevel(this.mapSeverityToSentryLevel(alert.severity));
      scope.setTag('alert', true);
      scope.setTag('alertType', alert.type);
      scope.setTag('alertSeverity', alert.severity);
      scope.setContext('alertDetails', {
        id: alertId,
        type: alert.type,
        severity: alert.severity,
        metadata: alert.metadata
      });
      
      Sentry.captureMessage(`Alert triggered: ${alert.message}`, this.mapSeverityToSentryLevel(alert.severity));
    });

    return alertId;
  }

  resolveAlert(alertId: string, reason?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();
    
    this.activeAlerts.delete(alertId);

    // Send resolution notification
    this.sendResolution(alert, reason);

    // Log to Sentry
    Sentry.addBreadcrumb({
      message: `Alert resolved: ${alert.message}`,
      level: 'info',
      category: 'alert_resolution',
      data: {
        alertId,
        reason,
        duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
      }
    });

    return true;
  }

  checkMetricAgainstRules(metricName: string, value: number, tags?: Record<string, string>): void {
    const applicableRules = this.rules.filter(rule => 
      rule.enabled && rule.metric === metricName
    );

    applicableRules.forEach(rule => {
      if (this.evaluateCondition(rule, value)) {
        this.triggerAlert({
          type: 'metric_threshold',
          severity: rule.severity,
          message: `${rule.name}: ${metricName} is ${value} (threshold: ${rule.threshold})`,
          metadata: {
            rule: rule.id,
            metric: metricName,
            value,
            threshold: rule.threshold,
            condition: rule.condition,
            tags
          }
        });
      }
    });
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getAlertStats(timeWindow: number = 86400000): {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    avgResolutionTime: number;
    unresolvedCount: number;
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentAlerts = this.alertHistory.filter(alert => alert.timestamp > cutoff);
    
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    
    recentAlerts.forEach(alert => {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
      byType[alert.type] = (byType[alert.type] || 0) + 1;
      
      if (alert.resolved && alert.resolvedAt) {
        totalResolutionTime += alert.resolvedAt.getTime() - alert.timestamp.getTime();
        resolvedCount++;
      } else {
        unresolvedCount++;
      }
    });
    
    return {
      total: recentAlerts.length,
      bySeverity,
      byType,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      unresolvedCount
    };
  }

  private async sendAlert(alert: Alert): Promise<void> {
    if (!this.config.alerting.enabled) return;

    const channels = this.getChannelsForSeverity(alert.severity);
    
    // Send to each configured channel
    await Promise.allSettled([
      ...channels.includes('slack') ? [this.sendToSlack(alert)] : [],
      ...channels.includes('email') ? [this.sendToEmail(alert)] : [],
      ...channels.includes('pagerduty') ? [this.sendToPagerDuty(alert)] : []
    ]);
  }

  private async sendResolution(alert: Alert, reason?: string): Promise<void> {
    if (!this.config.alerting.enabled) return;

    const channels = this.getChannelsForSeverity(alert.severity);
    
    // Send resolution notifications
    await Promise.allSettled([
      ...channels.includes('slack') ? [this.sendResolutionToSlack(alert, reason)] : [],
      ...channels.includes('email') ? [this.sendResolutionToEmail(alert, reason)] : []
    ]);
  }

  private async sendToSlack(alert: Alert): Promise<void> {
    const slackConfig = this.config.alerting.channels.slack;
    if (!slackConfig?.webhookUrl) return;

    const color = this.getSeverityColor(alert.severity);
    const payload = {
      channel: slackConfig.channel,
      username: slackConfig.username || 'Alert Bot',
      attachments: [{
        color,
        title: `🚨 ${alert.severity.toUpperCase()} Alert`,
        text: alert.message,
        fields: [
          {
            title: 'Type',
            value: alert.type,
            short: true
          },
          {
            title: 'Severity',
            value: alert.severity,
            short: true
          },
          {
            title: 'Time',
            value: alert.timestamp.toISOString(),
            short: true
          },
          {
            title: 'Alert ID',
            value: alert.id,
            short: true
          }
        ],
        footer: 'Dream 100 Keyword Engine',
        ts: Math.floor(alert.timestamp.getTime() / 1000)
      }]
    };

    try {
      const response = await fetch(slackConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.error('Failed to send Slack alert:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending Slack alert:', error);
    }
  }

  private async sendResolutionToSlack(alert: Alert, reason?: string): Promise<void> {
    const slackConfig = this.config.alerting.channels.slack;
    if (!slackConfig?.webhookUrl) return;

    const duration = alert.resolvedAt && alert.timestamp 
      ? this.formatDuration(alert.resolvedAt.getTime() - alert.timestamp.getTime())
      : 'Unknown';

    const payload = {
      channel: slackConfig.channel,
      username: slackConfig.username || 'Alert Bot',
      attachments: [{
        color: 'good',
        title: '✅ Alert Resolved',
        text: `${alert.message}${reason ? ` - ${reason}` : ''}`,
        fields: [
          {
            title: 'Duration',
            value: duration,
            short: true
          },
          {
            title: 'Alert ID',
            value: alert.id,
            short: true
          }
        ],
        footer: 'Dream 100 Keyword Engine',
        ts: Math.floor((alert.resolvedAt || new Date()).getTime() / 1000)
      }]
    };

    try {
      await fetch(slackConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Error sending Slack resolution:', error);
    }
  }

  private async sendToEmail(alert: Alert): Promise<void> {
    // Email implementation would go here
    // This is a placeholder for email alerting
    console.log('Email alert would be sent:', alert);
  }

  private async sendResolutionToEmail(alert: Alert, reason?: string): Promise<void> {
    // Email resolution implementation would go here
    console.log('Email resolution would be sent:', alert, reason);
  }

  private async sendToPagerDuty(alert: Alert): Promise<void> {
    // PagerDuty implementation would go here
    console.log('PagerDuty alert would be sent:', alert);
  }

  private evaluateCondition(rule: AlertRule, value: number): boolean {
    switch (rule.condition) {
      case 'gt': return value > rule.threshold;
      case 'gte': return value >= rule.threshold;
      case 'lt': return value < rule.threshold;
      case 'lte': return value <= rule.threshold;
      case 'eq': return value === rule.threshold;
      default: return false;
    }
  }

  private updateAlertState(ruleKey: string): void {
    const currentTime = new Date();
    const state = this.alertStates.get(ruleKey) || {
      lastTriggered: currentTime,
      count: 0,
      inCooldown: false
    };
    
    state.lastTriggered = currentTime;
    state.count++;
    state.inCooldown = true;
    
    this.alertStates.set(ruleKey, state);
    
    // Set cooldown timer
    const rule = this.rules.find(r => `${r.metric}_${r.severity}` === ruleKey);
    const cooldownMs = (rule?.cooldown || 15) * 60 * 1000; // Convert minutes to ms
    
    setTimeout(() => {
      const currentState = this.alertStates.get(ruleKey);
      if (currentState) {
        currentState.inCooldown = false;
        this.alertStates.set(ruleKey, currentState);
      }
    }, cooldownMs);
  }

  private getChannelsForSeverity(severity: string): string[] {
    // Critical alerts go to all channels
    if (severity === 'critical') {
      return ['slack', 'email', 'pagerduty'];
    }
    // Warning alerts go to slack and email
    if (severity === 'warning') {
      return ['slack', 'email'];
    }
    // Info alerts go to slack only
    return ['slack'];
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'warning': return 'warning';
      case 'info': return 'good';
      default: return '#808080';
    }
  }

  private mapSeverityToSentryLevel(severity: string): 'fatal' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case 'critical': return 'fatal';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'error';
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  cleanup(): void {
    // Clean up old alert history (keep last 1000 alerts)
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 1000);
    }
    
    // Clean up old alert states (older than 24 hours)
    const cutoff = Date.now() - 86400000;
    this.alertStates.forEach((state, key) => {
      if (state.lastTriggered.getTime() < cutoff) {
        this.alertStates.delete(key);
      }
    });
  }
}