import { TraceData, LogEntry, ObservabilityData } from './types';
import { MonitoringConfig } from './config';
import * as Sentry from '@sentry/nextjs';

export class SystemObservability {
  private config: MonitoringConfig;
  private traces: Map<string, TraceData> = new Map();
  private logs: LogEntry[] = [];
  private correlationMap: Map<string, string[]> = new Map(); // traceId -> [spanIds]
  private activeSpans: Map<string, any> = new Map();

  constructor(config: MonitoringConfig) {
    this.config = config;
    
    // Start periodic cleanup
    setInterval(() => this.cleanup(), 300000); // Every 5 minutes
  }

  // Distributed Tracing
  startTrace(
    operationName: string,
    tags?: Record<string, string>
  ): { traceId: string; span: any } {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    
    // Create Sentry span
    const transaction = Sentry.startSpan({
      name: operationName,
      op: 'trace',
      attributes: {
        traceId,
        service: 'keyword-engine',
        ...tags
      }
    }, () => {});
    
    const traceData: TraceData = {
      traceId,
      spanId,
      operationName,
      startTime: new Date(),
      duration: 0,
      tags: {
        service: 'keyword-engine',
        ...tags
      },
      logs: [],
      status: 'ok'
    };
    
    this.traces.set(traceId, traceData);
    this.correlationMap.set(traceId, [spanId]);
    this.activeSpans.set(spanId, transaction);
    
    return { traceId, span: transaction };
  }

  startSpan(
    traceId: string,
    operationName: string,
    parentSpanId?: string,
    tags?: Record<string, string>
  ): { spanId: string; span: any } {
    const spanId = this.generateSpanId();
    const parentTransaction = this.activeSpans.get(parentSpanId || '');
    
    // Create child span
    const span = parentTransaction?.startChild({
      op: 'span',
      description: operationName,
      tags: {
        traceId,
        spanId,
        parentSpanId,
        ...tags
      }
    });
    
    const spanData: TraceData = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: new Date(),
      duration: 0,
      tags: {
        service: 'keyword-engine',
        ...tags
      },
      logs: [],
      status: 'ok'
    };
    
    this.traces.set(`${traceId}_${spanId}`, spanData);
    
    // Update correlation map
    const spanIds = this.correlationMap.get(traceId) || [];
    spanIds.push(spanId);
    this.correlationMap.set(traceId, spanIds);
    
    if (span) {
      this.activeSpans.set(spanId, span);
    }
    
    return { spanId, span };
  }

  finishSpan(
    traceId: string,
    spanId: string,
    status: 'ok' | 'error' = 'ok',
    error?: Error
  ): void {
    const spanKey = spanId === traceId ? traceId : `${traceId}_${spanId}`;
    const spanData = this.traces.get(spanKey);
    const span = this.activeSpans.get(spanId);
    
    if (spanData) {
      spanData.duration = Date.now() - spanData.startTime.getTime();
      spanData.status = status;
      
      if (error) {
        this.addSpanLog(traceId, spanId, 'error', error.message, {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        });
      }
    }
    
    if (span) {
      if (error) {
        span.setStatus('internal_error');
        span.setData('error', error);
      }
      span.finish();
      this.activeSpans.delete(spanId);
    }
  }

  addSpanLog(
    traceId: string,
    spanId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      service: 'keyword-engine',
      traceId,
      spanId,
      metadata
    };
    
    // Add to span logs
    const spanKey = spanId === traceId ? traceId : `${traceId}_${spanId}`;
    const spanData = this.traces.get(spanKey);
    if (spanData) {
      spanData.logs = spanData.logs || [];
      spanData.logs.push(logEntry);
    }
    
    // Add to global logs
    this.logs.push(logEntry);
    
    // Add to Sentry span
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.setData('log', { level, message, ...metadata });
    }
    
    // Add breadcrumb to Sentry
    Sentry.addBreadcrumb({
      message,
      level: level === 'error' ? 'error' : 'info',
      category: 'span_log',
      data: {
        traceId,
        spanId,
        ...metadata
      }
    });
  }

  // Structured Logging
  log(
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: string,
    metadata?: Record<string, any>,
    traceId?: string,
    spanId?: string
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      service: 'keyword-engine',
      traceId,
      spanId,
      metadata
    };
    
    // Add error details if present
    if (metadata?.error && metadata.error instanceof Error) {
      logEntry.error = {
        name: metadata.error.name,
        message: metadata.error.message,
        stack: metadata.error.stack
      };
    }
    
    this.logs.push(logEntry);
    
    // Send to Sentry based on level
    if (level === 'error' || level === 'fatal') {
      Sentry.withScope(scope => {
        scope.setLevel(level === 'fatal' ? 'fatal' : 'error');
        scope.setTag('logLevel', level);
        
        if (traceId) scope.setTag('traceId', traceId);
        if (spanId) scope.setTag('spanId', spanId);
        
        if (metadata) {
          scope.setContext('logMetadata', metadata);
        }
        
        if (logEntry.error) {
          const error = new Error(logEntry.error.message);
          error.name = logEntry.error.name;
          error.stack = logEntry.error.stack;
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage(message, level === 'fatal' ? 'fatal' : 'error');
        }
      });
    } else {
      // Add as breadcrumb for non-error logs
      Sentry.addBreadcrumb({
        message,
        level: level === 'warn' ? 'warning' : 'info',
        category: 'application_log',
        data: {
          level,
          traceId,
          spanId,
          ...metadata
        }
      });
    }
    
    // Console output for development
    if (this.config.environment === 'development') {
      const logMethod = level === 'error' || level === 'fatal' ? console.error :
                       level === 'warn' ? console.warn :
                       console.log;
      
      logMethod(`[${level.toUpperCase()}] ${message}`, {
        timestamp: logEntry.timestamp,
        traceId,
        spanId,
        ...metadata
      });
    }
  }

  // Correlation and Context
  setTraceContext(traceId: string, context: Record<string, any>): void {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.tags = { ...trace.tags, ...context };
    }
    
    // Set in Sentry
    Sentry.withScope(scope => {
      scope.setTag('traceId', traceId);
      scope.setContext('traceContext', context);
    });
  }

  getTraceContext(traceId: string): Record<string, any> | null {
    const trace = this.traces.get(traceId);
    return trace?.tags || null;
  }

  // Query and Analysis
  getTrace(traceId: string): {
    trace: TraceData | null;
    spans: TraceData[];
    logs: LogEntry[];
  } {
    const mainTrace = this.traces.get(traceId);
    const spanIds = this.correlationMap.get(traceId) || [];
    
    const spans = spanIds
      .map(spanId => this.traces.get(`${traceId}_${spanId}`))
      .filter(Boolean) as TraceData[];
    
    const logs = this.logs.filter(log => log.traceId === traceId);
    
    return {
      trace: mainTrace || null,
      spans,
      logs
    };
  }

  searchLogs(
    query: {
      level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
      service?: string;
      traceId?: string;
      timeRange?: { start: Date; end: Date };
      messageContains?: string;
    },
    limit: number = 100
  ): LogEntry[] {
    let filteredLogs = this.logs;
    
    if (query.level) {
      filteredLogs = filteredLogs.filter(log => log.level === query.level);
    }
    
    if (query.service) {
      filteredLogs = filteredLogs.filter(log => log.service === query.service);
    }
    
    if (query.traceId) {
      filteredLogs = filteredLogs.filter(log => log.traceId === query.traceId);
    }
    
    if (query.timeRange) {
      filteredLogs = filteredLogs.filter(log => 
        log.timestamp >= query.timeRange!.start && 
        log.timestamp <= query.timeRange!.end
      );
    }
    
    if (query.messageContains) {
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(query.messageContains!.toLowerCase())
      );
    }
    
    return filteredLogs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getObservabilityData(timeWindow: number = 3600000): ObservabilityData {
    const cutoff = new Date(Date.now() - timeWindow);
    
    const recentTraces = Array.from(this.traces.values())
      .filter(trace => trace.startTime > cutoff);
    
    const recentLogs = this.logs.filter(log => log.timestamp > cutoff);
    
    // Generate mock metrics for the interface
    const metrics = [
      {
        name: 'trace_count',
        value: recentTraces.length,
        timestamp: new Date(),
        tags: { service: 'keyword-engine' }
      },
      {
        name: 'avg_trace_duration',
        value: recentTraces.length > 0 
          ? recentTraces.reduce((sum, t) => sum + t.duration, 0) / recentTraces.length 
          : 0,
        timestamp: new Date(),
        tags: { service: 'keyword-engine' }
      },
      {
        name: 'error_log_count',
        value: recentLogs.filter(l => l.level === 'error' || l.level === 'fatal').length,
        timestamp: new Date(),
        tags: { service: 'keyword-engine' }
      }
    ];
    
    return {
      traces: recentTraces,
      logs: recentLogs,
      metrics,
      errors: [] // Would be populated from error tracking
    };
  }

  getPerformanceInsights(): {
    slowestOperations: Array<{ operation: string; avgDuration: number; count: number }>;
    errorHotspots: Array<{ operation: string; errorCount: number; errorRate: number }>;
    throughputMetrics: Array<{ operation: string; requestsPerMinute: number }>;
  } {
    const recentTraces = Array.from(this.traces.values())
      .filter(trace => trace.startTime > new Date(Date.now() - 3600000)); // Last hour
    
    // Group by operation
    const operationStats = new Map<string, {
      durations: number[];
      errorCount: number;
      totalCount: number;
    }>();
    
    recentTraces.forEach(trace => {
      const operation = trace.operationName;
      const stats = operationStats.get(operation) || {
        durations: [],
        errorCount: 0,
        totalCount: 0
      };
      
      stats.durations.push(trace.duration);
      stats.totalCount++;
      
      if (trace.status === 'error') {
        stats.errorCount++;
      }
      
      operationStats.set(operation, stats);
    });
    
    // Calculate insights
    const slowestOperations = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        avgDuration: stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length,
        count: stats.totalCount
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
    
    const errorHotspots = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        errorCount: stats.errorCount,
        errorRate: stats.errorCount / stats.totalCount
      }))
      .filter(item => item.errorCount > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10);
    
    const throughputMetrics = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        requestsPerMinute: stats.totalCount
      }))
      .sort((a, b) => b.requestsPerMinute - a.requestsPerMinute)
      .slice(0, 10);
    
    return {
      slowestOperations,
      errorHotspots,
      throughputMetrics
    };
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private generateSpanId(): string {
    return `span_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - (this.config.retention.traces * 24 * 60 * 60 * 1000));
    
    // Clean up old traces
    const tracesToDelete: string[] = [];
    this.traces.forEach((trace, key) => {
      if (trace.startTime < cutoff) {
        tracesToDelete.push(key);
      }
    });
    
    tracesToDelete.forEach(key => {
      this.traces.delete(key);
    });
    
    // Clean up old logs
    const logCutoff = new Date(Date.now() - (this.config.retention.logs * 24 * 60 * 60 * 1000));
    this.logs = this.logs.filter(log => log.timestamp > logCutoff);
    
    // Clean up correlation map
    this.correlationMap.forEach((spanIds, traceId) => {
      if (!this.traces.has(traceId)) {
        this.correlationMap.delete(traceId);
      }
    });
  }
}