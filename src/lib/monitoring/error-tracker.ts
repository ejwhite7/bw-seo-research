import * as Sentry from '@sentry/nextjs';
import { ErrorEvent, ErrorDetails } from './types';
import { MonitoringConfig } from './config';
import { AlertManager } from './alert-manager';

export class ErrorTracker {
  private config: MonitoringConfig;
  private alertManager: AlertManager;
  private errorQueue: ErrorEvent[] = [];
  private errorCounts: Map<string, number> = new Map();
  private lastFlush: Date = new Date();

  constructor(config: MonitoringConfig, alertManager: AlertManager) {
    this.config = config;
    this.alertManager = alertManager;
    
    // Initialize error tracking
    this.initializeErrorCapture();
    
    // Start periodic flush
    setInterval(() => this.flushErrors(), 60000); // Every minute
  }

  private initializeErrorCapture(): void {
    if (!this.config.errorTracking.enableAutomaticCapture) return;

    // Capture unhandled promise rejections
    if (this.config.errorTracking.enablePromiseRejectionCapture) {
      if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', (event) => {
          this.captureError({
            message: event.reason?.message || 'Unhandled promise rejection',
            stack: event.reason?.stack,
            severity: 'high',
            context: {
              type: 'unhandledrejection',
              reason: event.reason
            }
          });
        });
      } else {
        process.on('unhandledRejection', (reason, promise) => {
          this.captureError({
            message: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error ? reason.stack : undefined,
            severity: 'high',
            context: {
              type: 'unhandledRejection',
              promise: promise.toString()
            }
          });
        });
      }
    }

    // Capture window errors (browser only)
    if (this.config.errorTracking.enableWindowErrorCapture && typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.captureError({
          message: event.message,
          stack: event.error?.stack,
          severity: 'medium',
          context: {
            type: 'windowError',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        });
      });
    }

    // Capture console errors
    if (this.config.errorTracking.enableConsoleCapture) {
      const originalConsoleError = console.error;
      console.error = (...args) => {
        this.captureError({
          message: args.join(' '),
          severity: 'low',
          context: {
            type: 'consoleError',
            args: args.map(arg => String(arg))
          }
        });
        originalConsoleError.apply(console, args);
      };
    }
  }

  captureError(
    error: Error | string | Partial<ErrorEvent>,
    context?: Record<string, any>,
    user?: { id: string; email?: string }
  ): string {
    const errorId = this.generateErrorId();
    
    let errorEvent: ErrorEvent;
    
    if (error instanceof Error) {
      errorEvent = {
        id: errorId,
        message: error.message,
        stack: error.stack,
        timestamp: new Date(),
        service: 'keyword-engine',
        severity: 'medium',
        context,
        user,
        fingerprint: this.generateFingerprint(error.message, error.stack),
        resolved: false,
        tags: {
          errorType: error.constructor.name,
          service: 'keyword-engine'
        }
      };
    } else if (typeof error === 'string') {
      errorEvent = {
        id: errorId,
        message: error,
        timestamp: new Date(),
        service: 'keyword-engine',
        severity: 'low',
        context,
        user,
        fingerprint: this.generateFingerprint(error),
        resolved: false,
        tags: {
          errorType: 'string',
          service: 'keyword-engine'
        }
      };
    } else {
      errorEvent = {
        id: errorId,
        message: error.message || 'Unknown error',
        timestamp: new Date(),
        service: 'keyword-engine',
        severity: 'medium',
        resolved: false,
        tags: {
          service: 'keyword-engine'
        },
        ...error,
        context: { ...context, ...error.context },
        user: user || error.user
      };
    }

    // Filter sensitive data if enabled
    if (this.config.errorTracking.filterSensitiveData) {
      errorEvent = this.filterSensitiveData(errorEvent);
    }

    // Add to queue
    this.errorQueue.push(errorEvent);
    
    // Track error counts for rate limiting
    const fingerprint = errorEvent.fingerprint || 'unknown';
    this.errorCounts.set(fingerprint, (this.errorCounts.get(fingerprint) || 0) + 1);

    // Send to Sentry immediately for high/critical errors
    if (errorEvent.severity === 'high' || errorEvent.severity === 'critical') {
      this.sendToSentry(errorEvent);
      
      // Trigger alert for critical errors
      if (errorEvent.severity === 'critical') {
        this.alertManager.triggerAlert({
          type: 'error',
          severity: 'critical',
          message: `Critical error: ${errorEvent.message}`,
          metadata: {
            errorId: errorEvent.id,
            service: errorEvent.service,
            timestamp: errorEvent.timestamp
          }
        });
      }
    }

    // Check for error rate alerts
    this.checkErrorRate();

    return errorId;
  }

  captureException(
    exception: Error,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'error',
    context?: Record<string, any>
  ): string {
    const severity = this.mapLevelToSeverity(level);
    return this.captureError(exception, { level, ...context });
  }

  captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: Record<string, any>
  ): string {
    const severity = this.mapLevelToSeverity(level);
    return this.captureError({ message, severity }, context);
  }

  setUserContext(user: { id: string; email?: string; organization?: string }): void {
    Sentry.setUser(user);
  }

  setTagContext(tags: Record<string, string>): void {
    Object.entries(tags).forEach(([key, value]) => {
      Sentry.setTag(key, value);
    });
  }

  addBreadcrumb(
    message: string,
    category: string,
    level: 'debug' | 'info' | 'warning' | 'error' = 'info',
    data?: Record<string, any>
  ): void {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data,
      timestamp: Date.now() / 1000
    });
  }

  startTransaction(name: string, operation: string): any {
    return Sentry.startSpan({
      name,
      op: operation,
      attributes: {
        service: 'keyword-engine'
      }
    }, () => {});
  }

  capturePerformanceIssue(
    operation: string,
    duration: number,
    threshold: number,
    context?: Record<string, any>
  ): void {
    if (duration > threshold) {
      this.captureMessage(
        `Slow operation detected: ${operation} took ${duration}ms (threshold: ${threshold}ms)`,
        'warning',
        {
          operation,
          duration,
          threshold,
          ...context
        }
      );
    }
  }

  getErrorStats(timeWindow: number = 3600000): {
    total: number;
    byseverity: Record<string, number>;
    byService: Record<string, number>;
    topErrors: Array<{ fingerprint: string; count: number; message: string }>;
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentErrors = this.errorQueue.filter(error => error.timestamp > cutoff);
    
    const byService: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const fingerprints: Record<string, { count: number; message: string }> = {};
    
    recentErrors.forEach(error => {
      // By service
      byService[error.service] = (byService[error.service] || 0) + 1;
      
      // By severity
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      
      // By fingerprint
      const fp = error.fingerprint || 'unknown';
      if (!fingerprints[fp]) {
        fingerprints[fp] = { count: 0, message: error.message };
      }
      fingerprints[fp].count++;
    });
    
    const topErrors = Object.entries(fingerprints)
      .map(([fingerprint, data]) => ({ fingerprint, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      total: recentErrors.length,
      byseverity: bySeverity,
      byService,
      topErrors
    };
  }

  private sendToSentry(error: ErrorEvent): void {
    Sentry.withScope(scope => {
      // Set context
      if (error.user) {
        scope.setUser(error.user);
      }
      
      if (error.tags) {
        Object.entries(error.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }
      
      if (error.context) {
        scope.setContext('error_context', error.context);
      }
      
      scope.setLevel(this.mapSeverityToSentryLevel(error.severity));
      scope.setFingerprint([error.fingerprint || error.message]);
      
      // Capture to Sentry
      if (error.stack) {
        const sentryError = new Error(error.message);
        sentryError.stack = error.stack;
        Sentry.captureException(sentryError);
      } else {
        Sentry.captureMessage(error.message);
      }
    });
  }

  private flushErrors(): void {
    // Clean up old errors
    const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours
    this.errorQueue = this.errorQueue.filter(error => error.timestamp > cutoff);
    
    // Reset error counts periodically
    if (Date.now() - this.lastFlush.getTime() > 3600000) { // 1 hour
      this.errorCounts.clear();
      this.lastFlush = new Date();
    }
  }

  private checkErrorRate(): void {
    const recentErrors = this.getErrorStats(300000); // 5 minutes
    const errorRate = recentErrors.total / 300; // errors per second
    
    if (errorRate > 1) { // More than 1 error per second
      this.alertManager.triggerAlert({
        type: 'error_rate',
        severity: 'warning',
        message: `High error rate detected: ${errorRate.toFixed(2)} errors/second`,
        metadata: {
          errorRate,
          recentErrors: recentErrors.total,
          timeWindow: '5 minutes'
        }
      });
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(message: string, stack?: string): string {
    // Create a stable fingerprint for error grouping
    const content = `${message}${stack ? stack.split('\n')[0] : ''}`;
    return Buffer.from(content).toString('base64').slice(0, 32);
  }

  private filterSensitiveData(error: ErrorEvent): ErrorEvent {
    const sensitive = ['password', 'token', 'key', 'secret', 'auth', 'credit'];
    
    const filterObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      const filtered = { ...obj };
      Object.keys(filtered).forEach(key => {
        if (sensitive.some(s => key.toLowerCase().includes(s))) {
          filtered[key] = '[FILTERED]';
        } else if (typeof filtered[key] === 'object') {
          filtered[key] = filterObject(filtered[key]);
        }
      });
      return filtered;
    };
    
    return {
      ...error,
      context: filterObject(error.context)
    };
  }

  private mapLevelToSeverity(level: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (level) {
      case 'fatal': return 'critical';
      case 'error': return 'high';
      case 'warning': return 'medium';
      case 'info':
      case 'debug': return 'low';
      default: return 'medium';
    }
  }

  private mapSeverityToSentryLevel(severity: string): 'fatal' | 'error' | 'warning' | 'info' | 'debug' {
    switch (severity) {
      case 'critical': return 'fatal';
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'error';
    }
  }
}