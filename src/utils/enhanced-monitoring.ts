/**
 * Enhanced Monitoring Utilities
 * Provides comprehensive error handling, circuit breaker management, and performance monitoring
 */

import { CircuitBreaker, CircuitBreakerFactory } from './circuit-breaker';
import { TokenBucket, RateLimiterFactory } from './rate-limiter';
import { SentryReporter } from './sentry';
import { ErrorHandler } from './error-handler';
import type { RateLimiter, CircuitBreakerConfig, TokenBucketConfig } from '../types/api';

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enableCircuitBreaker: boolean;
  enableRateLimit: boolean;
  enableMetrics: boolean;
  enableErrorTracking: boolean;
  circuitBreakerConfig?: CircuitBreakerConfig;
  rateLimitConfig?: TokenBucketConfig;
  errorThreshold?: number;
  metricsInterval?: number;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  errorRate: number;
  responseTime: number;
  circuitBreakerState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  rateLimitRemaining?: number;
  lastError?: {
    message: string;
    timestamp: number;
    count: number;
  };
}

/**
 * Monitoring metrics
 */
export interface MonitoringMetrics {
  requests: number;
  successes: number;
  failures: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  errorRate: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
  lastRequestTime: number;
  uptime: number;
}

/**
 * Enhanced monitoring service for API integrations
 */
export class EnhancedMonitor {
  private name: string;
  private config: MonitoringConfig;
  private circuitBreaker?: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  private metrics: MonitoringMetrics;
  private responseTimes: number[] = [];
  private startTime: number;
  private lastError?: Error;
  private errorCount: number = 0;

  constructor(name: string, config: MonitoringConfig) {
    this.name = name;
    this.config = config;
    this.startTime = Date.now();
    
    // Initialize metrics
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      errorRate: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      lastRequestTime: 0,
      uptime: 0
    };

    this.initialize();
  }

  private initialize(): void {
    // Initialize circuit breaker
    if (this.config.enableCircuitBreaker && this.config.circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker(this.config.circuitBreakerConfig, this.name);
    }

    // Initialize rate limiter
    if (this.config.enableRateLimit && this.config.rateLimitConfig) {
      this.rateLimiter = new TokenBucket(this.config.rateLimitConfig);
    }

    // Start metrics collection
    if (this.config.enableMetrics) {
      const interval = this.config.metricsInterval || 60000; // 1 minute default
      setInterval(() => this.collectMetrics(), interval);
    }
  }

  /**
   * Execute an operation with monitoring
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: {
      endpoint?: string;
      method?: string;
      userId?: string;
      runId?: string;
    }
  ): Promise<T> {
    const startTime = Date.now();
    this.metrics.requests++;
    this.metrics.lastRequestTime = startTime;

    // Check rate limit
    if (this.rateLimiter && !this.rateLimiter.tryConsume(1)) {
      this.metrics.rateLimitHits++;
      const error = new Error(`Rate limit exceeded for ${this.name}`);
      this.handleError(error, context);
      throw error;
    }

    try {
      let result: T;

      // Execute with circuit breaker if enabled
      if (this.circuitBreaker) {
        result = await this.circuitBreaker.execute(operation);
      } else {
        result = await operation();
      }

      // Track success
      const duration = Date.now() - startTime;
      this.trackSuccess(duration, context);
      
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.trackError(error as Error, duration, context);
      throw error;
    }
  }

  /**
   * Check if service can handle requests (rate limit + circuit breaker)
   */
  canExecute(): boolean {
    // Check circuit breaker state
    if (this.circuitBreaker) {
      const state = this.circuitBreaker.getState();
      if (state === 'OPEN') {
        return false;
      }
    }

    // Check rate limit
    if (this.rateLimiter) {
      return this.rateLimiter.getRemainingTokens() > 0;
    }

    return true;
  }

  /**
   * Get current service health
   */
  getHealth(): ServiceHealth {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Determine health status
    if (this.metrics.errorRate > 0.5) {
      status = 'unhealthy';
    } else if (this.metrics.errorRate > 0.1 || this.metrics.averageResponseTime > 5000) {
      status = 'degraded';
    }

    // Check circuit breaker state
    if (this.circuitBreaker) {
      const cbState = this.circuitBreaker.getState();
      if (cbState === 'OPEN') {
        status = 'unhealthy';
      } else if (cbState === 'HALF_OPEN') {
        status = 'degraded';
      }
    }

    return {
      name: this.name,
      status,
      uptime,
      errorRate: this.metrics.errorRate,
      responseTime: this.metrics.averageResponseTime,
      circuitBreakerState: this.circuitBreaker?.getState(),
      rateLimitRemaining: this.rateLimiter?.getRemainingTokens(),
      lastError: this.lastError ? {
        message: this.lastError.message,
        timestamp: this.metrics.lastRequestTime,
        count: this.errorCount
      } : undefined
    };
  }

  /**
   * Get detailed metrics
   */
  getMetrics(): MonitoringMetrics {
    return { ...this.metrics, uptime: Date.now() - this.startTime };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      errorRate: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      lastRequestTime: 0,
      uptime: 0
    };
    this.responseTimes = [];
    this.errorCount = 0;
    this.lastError = undefined;
  }

  private trackSuccess(duration: number, context?: any): void {
    this.metrics.successes++;
    this.addResponseTime(duration);
    
    if (this.config.enableMetrics) {
      SentryReporter.captureApiUsage({
        provider: this.name,
        endpoint: context?.endpoint || 'unknown',
        method: context?.method || 'unknown',
        status: 200,
        responseTime: duration,
        cost: 0,
        cached: false,
        timestamp: Date.now(),
        userId: context?.userId,
        runId: context?.runId
      });
    }
  }

  private trackError(error: Error, duration: number, context?: any): void {
    this.metrics.failures++;
    this.addResponseTime(duration);
    this.lastError = error;
    this.errorCount++;

    if (this.config.enableErrorTracking) {
      ErrorHandler.handleApiError(error, {
        provider: this.name,
        endpoint: context?.endpoint || 'unknown',
        method: context?.method || 'unknown',
        requestData: context,
        userId: context?.userId,
        runId: context?.runId
      });
    }

    // Check if circuit breaker was tripped
    if (this.circuitBreaker) {
      const cbStats = this.circuitBreaker.getStats();
      if (cbStats.state === 'OPEN') {
        this.metrics.circuitBreakerTrips++;
      }
    }
  }

  private addResponseTime(duration: number): void {
    this.responseTimes.push(duration);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
  }

  private collectMetrics(): void {
    if (this.responseTimes.length === 0) return;

    // Calculate average response time
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.averageResponseTime = sum / this.responseTimes.length;

    // Calculate 95th percentile
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    this.metrics.p95ResponseTime = sorted[p95Index] || 0;

    // Calculate error rate
    const totalRequests = this.metrics.successes + this.metrics.failures;
    this.metrics.errorRate = totalRequests > 0 ? this.metrics.failures / totalRequests : 0;

    // Report metrics to Sentry
    if (this.config.enableMetrics) {
      SentryReporter.captureApiMetrics(this.name, {
        requests: this.metrics.requests,
        successRate: 1 - this.metrics.errorRate,
        averageResponseTime: this.metrics.averageResponseTime,
        p95ResponseTime: this.metrics.p95ResponseTime,
        rateLimitHits: this.metrics.rateLimitHits,
        circuitBreakerTrips: this.metrics.circuitBreakerTrips
      });
    }
  }

  private handleError(error: Error, context?: any): void {
    // This is for non-operation errors (like rate limiting)
    if (this.config.enableErrorTracking) {
      SentryReporter.captureError(error, {
        service: this.name,
        context: context || {},
        monitoring: {
          errorRate: this.metrics.errorRate,
          circuitBreakerState: this.circuitBreaker?.getState(),
          rateLimitRemaining: this.rateLimiter?.getRemainingTokens()
        }
      });
    }
  }
}

/**
 * Factory for creating enhanced monitors for different services
 */
export class MonitoringFactory {
  private static monitors = new Map<string, EnhancedMonitor>();

  static createAhrefsMonitor(): EnhancedMonitor {
    return this.getOrCreate('ahrefs', {
      enableCircuitBreaker: true,
      enableRateLimit: true,
      enableMetrics: true,
      enableErrorTracking: true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringPeriod: 300000,
        expectedFailureRate: 0.1
      },
      rateLimitConfig: {
        capacity: 100,
        refillRate: 20,
        refillPeriod: 60000
      },
      errorThreshold: 0.1,
      metricsInterval: 60000
    });
  }

  static createAnthropicMonitor(): EnhancedMonitor {
    return this.getOrCreate('anthropic', {
      enableCircuitBreaker: true,
      enableRateLimit: true,
      enableMetrics: true,
      enableErrorTracking: true,
      circuitBreakerConfig: {
        failureThreshold: 3,
        recoveryTimeout: 30000,
        monitoringPeriod: 180000,
        expectedFailureRate: 0.05
      },
      rateLimitConfig: {
        capacity: 50,
        refillRate: 10,
        refillPeriod: 60000
      },
      errorThreshold: 0.05,
      metricsInterval: 60000
    });
  }

  static createScraperMonitor(): EnhancedMonitor {
    return this.getOrCreate('scraper', {
      enableCircuitBreaker: true,
      enableRateLimit: true,
      enableMetrics: true,
      enableErrorTracking: true,
      circuitBreakerConfig: {
        failureThreshold: 10,
        recoveryTimeout: 120000,
        monitoringPeriod: 600000,
        expectedFailureRate: 0.2
      },
      rateLimitConfig: {
        capacity: 30,
        refillRate: 5,
        refillPeriod: 10000
      },
      errorThreshold: 0.2,
      metricsInterval: 30000
    });
  }

  static getOrCreate(name: string, config: MonitoringConfig): EnhancedMonitor {
    if (!this.monitors.has(name)) {
      this.monitors.set(name, new EnhancedMonitor(name, config));
    }
    return this.monitors.get(name)!;
  }

  static getAllMonitors(): Map<string, EnhancedMonitor> {
    return new Map(this.monitors);
  }

  static getHealthSummary(): Array<ServiceHealth> {
    return Array.from(this.monitors.values()).map(monitor => monitor.getHealth());
  }

  static resetAll(): void {
    this.monitors.forEach(monitor => monitor.resetMetrics());
  }

  static shutdown(): void {
    this.monitors.clear();
  }
}

/**
 * Decorator for adding monitoring to class methods
 */
export function withMonitoring(monitorName: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = (async function (this: any, ...args: any[]) {
      const monitor = MonitoringFactory.getAllMonitors().get(monitorName);
      
      if (!monitor) {
        console.warn(`Monitor '${monitorName}' not found, executing without monitoring`);
        return originalMethod.apply(this, args);
      }

      return monitor.execute(() => originalMethod.apply(this, args), {
        endpoint: `${target.constructor.name}.${propertyKey}`,
        method: 'METHOD_CALL'
      });
    }) as T;

    return descriptor;
  };
}

/**
 * Utility function to create monitored API client
 */
export function createMonitoredClient<T>(
  client: T,
  monitorName: string,
  monitor: EnhancedMonitor
): T {
  return new Proxy(client as any, {
    get(target, prop) {
      const value = target[prop];
      
      if (typeof value === 'function') {
        return async (...args: any[]) => {
          return monitor.execute(() => value.apply(target, args), {
            endpoint: String(prop),
            method: 'API_CALL'
          });
        };
      }
      
      return value;
    }
  });
}

// Export singleton monitors for convenience
export const ahrefsMonitor = MonitoringFactory.createAhrefsMonitor();
export const anthropicMonitor = MonitoringFactory.createAnthropicMonitor();
export const scraperMonitor = MonitoringFactory.createScraperMonitor();