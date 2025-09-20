import { 
  ApiResponse, 
  ApiClientConfig, 
  ApiError, 
  ApiUsageEvent,
  ApiMetrics,
  RateLimiter 
} from '../types/api';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { TokenBucket } from '../utils/rate-limiter';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { SentryReporter } from '../utils/sentry';
import * as Sentry from '@sentry/nextjs';

export abstract class BaseApiClient {
  protected rateLimiter: RateLimiter;
  protected circuitBreaker: CircuitBreaker;
  protected cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  protected metrics: ApiMetrics = {
    requests: 0,
    successes: 0,
    failures: 0,
    avgResponseTime: 0,
    totalCost: 0,
    lastRequest: 0,
    rateLimitHits: 0,
    circuitBreakerTrips: 0
  };
  
  constructor(
    protected config: ApiClientConfig,
    protected provider: string
  ) {
    this.rateLimiter = new TokenBucket(config.rateLimiter);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker, provider);
    
    // Clean cache periodically
    setInterval(() => this.cleanExpiredCache(), 300000); // 5 minutes
  }
  
  protected async makeRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: Record<string, string>;
      body?: any;
      cacheKey?: string;
      cacheTtl?: number;
      cost?: number;
      skipRateLimit?: boolean;
      timeout?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      cacheKey,
      cacheTtl = this.config.cache?.ttl || 30 * 24 * 60 * 60 * 1000, // 30 days
      cost = 0,
      skipRateLimit = false,
      timeout = this.config.timeout
    } = options;
    
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (cacheKey && method === 'GET') {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.trackUsage(endpoint, method, 200, Date.now() - startTime, cost, true);
          return {
            data: cached,
            success: true,
            metadata: {
              requestId,
              timestamp: startTime,
              cached: true
            }
          };
        }
      }
      
      // Rate limiting
      if (!skipRateLimit) {
        const canProceed = await this.checkRateLimit();
        if (!canProceed) {
          this.metrics.rateLimitHits++;
          throw (ErrorHandler as any).createRateLimitError(
            {
              limit: (this.rateLimiter as any).config?.capacity || 0,
              remaining: this.rateLimiter.getRemainingTokens(),
              reset: Math.ceil(this.rateLimiter.getNextRefillTime() / 1000),
              retryAfter: Math.ceil((this.rateLimiter.getNextRefillTime() - Date.now()) / 1000)
            },
            this.provider
          );
        }
      }
      
      // Circuit breaker check
      const response = await this.circuitBreaker.execute(async () => {
        return await this.executeRequest<T>(endpoint, {
          method,
          headers: {
            ...this.getDefaultHeaders(),
            ...headers
          },
          body,
          timeout
        });
      });
      
      const responseTime = Date.now() - startTime;
      
      // Cache successful responses
      if (cacheKey && method === 'GET' && response.success) {
        this.setCache(cacheKey, response.data, cacheTtl);
      }
      
      // Update metrics
      this.updateMetrics(true, responseTime, cost);
      this.trackUsage(endpoint, method, 200, responseTime, cost, false);
      
      return {
        ...response,
        metadata: {
          requestId,
          timestamp: startTime,
          cached: false,
          rateLimit: this.getRateLimitInfo(),
          cost: cost > 0 ? { credits: cost, estimatedDollars: cost } : undefined
        }
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const apiError = error as ApiError;
      
      // Circuit breaker tracking
      const errorMessage = (error as Error).message;
      if (errorMessage && errorMessage.includes('Circuit breaker')) {
        this.metrics.circuitBreakerTrips++;
      }
      
      // Update metrics
      this.updateMetrics(false, responseTime, cost);
      this.trackUsage(endpoint, method, apiError.statusCode || 500, responseTime, cost, false);
      
      // Enhanced error context
      const enhancedError = (ErrorHandler as any).handle(error as Error, {
        provider: this.provider,
        endpoint,
        method,
        requestId,
        responseTime
      }) as ApiError;
      
      throw enhancedError;
    }
  }
  
  protected abstract executeRequest<T>(
    endpoint: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: any;
      timeout: number;
    }
  ): Promise<ApiResponse<T>>;
  
  protected abstract getDefaultHeaders(): Record<string, string>;
  
  private async checkRateLimit(): Promise<boolean> {
    if (this.rateLimiter instanceof TokenBucket) {
      return this.rateLimiter.tryConsume();
    }
    
    // For async rate limiters
    const tryConsumeMethod = (this.rateLimiter as any).tryConsume;
    if (typeof tryConsumeMethod === 'function') {
      return await tryConsumeMethod.call(this.rateLimiter);
    }
    
    return true;
  }
  
  private getRateLimitInfo() {
    const config = (this.rateLimiter as any).config;
    return {
      limit: config?.capacity || 0,
      remaining: this.rateLimiter.getRemainingTokens(),
      reset: Math.ceil(this.rateLimiter.getNextRefillTime() / 1000)
    };
  }
  
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.timestamp + cached.ttl) {
      return cached.data;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }
  
  private setCache(key: string, data: any, ttl: number): void {
    // Respect cache size limit
    if (this.config.cache?.maxSize && this.cache.size >= this.config.cache.maxSize) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.ceil(this.cache.size * 0.1); // Remove 10%
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of Array.from(this.cache.entries())) {
      if (now > value.timestamp + value.ttl) {
        this.cache.delete(key);
      }
    }
  }
  
  private updateMetrics(success: boolean, responseTime: number, cost: number): void {
    this.metrics.requests++;
    this.metrics.lastRequest = Date.now();
    this.metrics.totalCost += cost;
    
    if (success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
    }
    
    // Update average response time (exponential moving average)
    const alpha = 0.1;
    this.metrics.avgResponseTime = 
      this.metrics.avgResponseTime * (1 - alpha) + responseTime * alpha;
  }
  
  private trackUsage(
    endpoint: string,
    method: string,
    status: number,
    responseTime: number,
    cost: number,
    cached: boolean
  ): void {
    const event: ApiUsageEvent = {
      provider: this.provider as any,
      endpoint,
      method,
      status,
      responseTime,
      cost,
      cached,
      timestamp: Date.now()
    };
    
    SentryReporter.captureApiUsage(event);
  }
  
  private generateRequestId(): string {
    return `${this.provider}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  // Public methods for monitoring
  public getMetrics(): ApiMetrics {
    return { ...this.metrics };
  }
  
  public getCircuitBreakerStatus() {
    return this.circuitBreaker.getStats();
  }
  
  public getRateLimiterStatus() {
    const getStatusMethod = (this.rateLimiter as any).getStatus;
    if (typeof getStatusMethod === 'function') {
      return getStatusMethod.call(this.rateLimiter);
    }
    
    return {
      tokens: this.rateLimiter.getRemainingTokens(),
      nextRefill: this.rateLimiter.getNextRefillTime()
    };
  }
  
  public clearCache(): void {
    this.cache.clear();
  }
  
  public getCacheStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    const expired = entries.filter(e => now > e.timestamp + e.ttl).length;
    
    return {
      total: this.cache.size,
      expired,
      valid: this.cache.size - expired,
      maxSize: this.config.cache?.maxSize || 0
    };
  }
  
  // Health check method
  public async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: ApiMetrics;
    circuitBreaker: any;
    rateLimit: any;
    cache: any;
  }> {
    const issues: string[] = [];
    
    // Check circuit breaker
    const cbStatus = this.getCircuitBreakerStatus();
    if (cbStatus.isOpen) {
      issues.push(`Circuit breaker is OPEN (retry in ${cbStatus.timeUntilRetry}ms)`);
    }
    
    // Check rate limiting
    const rlStatus = this.getRateLimiterStatus();
    if (rlStatus.tokens === 0) {
      issues.push(`Rate limit exhausted (refills at ${new Date(rlStatus.nextRefill)})`);
    }
    
    // Check error rates
    const errorRate = this.metrics.requests > 0 ? 
      this.metrics.failures / this.metrics.requests : 0;
    if (errorRate > 0.1) {
      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    
    // Check response times
    if (this.metrics.avgResponseTime > 10000) {
      issues.push(`Slow responses: ${this.metrics.avgResponseTime}ms avg`);
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      metrics: this.getMetrics(),
      circuitBreaker: cbStatus,
      rateLimit: rlStatus,
      cache: this.getCacheStats()
    };
  }
}