import { CircuitState, CircuitBreakerConfig, ApiError } from '../types/api';
import * as Sentry from '@sentry/nextjs';

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private nextRetryTime: number = 0;
  private successCount: number = 0;
  private readonly failureWindow: number[] = [];
  
  constructor(
    protected config: CircuitBreakerConfig,
    private name: string
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextRetryTime) {
        throw new Error(`Circuit breaker ${this.name} is OPEN. Next retry at ${new Date(this.nextRetryTime)}`);
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }
  
  protected onSuccess(): void {
    this.failures = 0;
    this.removeOldFailures();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = CircuitState.CLOSED;
        Sentry.addBreadcrumb({
          message: `Circuit breaker ${this.name} closed after successful recovery`,
          level: 'info',
          category: 'circuit-breaker'
        });
      }
    }
  }
  
  protected onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.failureWindow.push(this.lastFailureTime);
    
    // Remove old failures outside monitoring period
    this.removeOldFailures();
    
    const shouldTrip = this.shouldTripBreaker();
    
    if (shouldTrip && this.state === CircuitState.CLOSED) {
      this.state = CircuitState.OPEN;
      this.nextRetryTime = Date.now() + this.config.recoveryTimeout;
      
      Sentry.captureException(error, {
        tags: {
          circuitBreaker: this.name,
          state: 'TRIPPED'
        },
        extra: {
          failures: this.failures,
          failureRate: this.getCurrentFailureRate(),
          config: this.config
        }
      });
      
      console.warn(`Circuit breaker ${this.name} tripped. Failures: ${this.failures}, Rate: ${this.getCurrentFailureRate()}`);
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Immediately return to OPEN on any failure in HALF_OPEN
      this.state = CircuitState.OPEN;
      this.nextRetryTime = Date.now() + this.config.recoveryTimeout;
    }
  }
  
  private shouldTripBreaker(): boolean {
    // Trip if we exceed the failure threshold
    if (this.failures >= this.config.failureThreshold) {
      return true;
    }
    
    // Trip if failure rate is too high (if configured)
    if (this.config.expectedFailureRate) {
      const currentRate = this.getCurrentFailureRate();
      if (currentRate > this.config.expectedFailureRate) {
        return true;
      }
    }
    
    return false;
  }
  
  private getCurrentFailureRate(): number {
    this.removeOldFailures();
    const totalRequests = this.failures + this.successCount;
    return totalRequests > 0 ? this.failures / totalRequests : 0;
  }
  
  private removeOldFailures(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    while (this.failureWindow.length > 0 && this.failureWindow[0] < cutoff) {
      this.failureWindow.shift();
      this.failures = Math.max(0, this.failures - 1);
    }
  }
  
  getState(): CircuitState {
    return this.state;
  }
  
  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.nextRetryTime,
      successCount: this.successCount,
      failureRate: this.getCurrentFailureRate(),
      isOpen: this.state === CircuitState.OPEN,
      timeUntilRetry: Math.max(0, this.nextRetryTime - Date.now())
    };
  }
  
  // Manual controls for testing/emergency
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.recoveryTimeout;
  }
  
  forceClose(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successCount = 0;
    this.failureWindow.length = 0;
  }
  
  reset(): void {
    this.forceClose();
  }
}

// Circuit breaker with exponential backoff
export class ExponentialBackoffCircuitBreaker extends CircuitBreaker {
  private backoffMultiplier: number = 2;
  private maxBackoffTime: number = 300000; // 5 minutes
  private baseRecoveryTimeout: number;
  private currentBackoffLevel: number = 0;
  
  constructor(config: CircuitBreakerConfig, name: string) {
    super(config, name);
    this.baseRecoveryTimeout = config.recoveryTimeout;
  }
  
  protected onFailure(error: Error): void {
    // Calculate exponential backoff
    const backoffTime = Math.min(
      this.baseRecoveryTimeout * Math.pow(this.backoffMultiplier, this.currentBackoffLevel),
      this.maxBackoffTime
    );
    
    this.currentBackoffLevel++;
    
    // Override the recovery timeout with backoff time
    (this.config as any).recoveryTimeout = backoffTime;
    
    super.onFailure(error);
  }
  
  protected onSuccess(): void {
    // Reset backoff on success
    this.currentBackoffLevel = 0;
    (this.config as any).recoveryTimeout = this.baseRecoveryTimeout;
    
    super.onSuccess();
  }
}

// Factory for creating circuit breakers
export class CircuitBreakerFactory {
  private static breakers = new Map<string, CircuitBreaker>();
  
  static getOrCreate(
    name: string,
    config: CircuitBreakerConfig,
    useExponentialBackoff: boolean = false
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = useExponentialBackoff
        ? new ExponentialBackoffCircuitBreaker(config, name)
        : new CircuitBreaker(config, name);
        
      this.breakers.set(name, breaker);
    }
    
    return this.breakers.get(name)!;
  }
  
  static createAhrefsBreaker(): CircuitBreaker {
    return this.getOrCreate('ahrefs', {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      expectedFailureRate: 0.1 // 10%
    }, true);
  }
  
  static createAnthropicBreaker(): CircuitBreaker {
    return this.getOrCreate('anthropic', {
      failureThreshold: 3,
      recoveryTimeout: 30000, // 30 seconds
      monitoringPeriod: 180000, // 3 minutes
      expectedFailureRate: 0.05 // 5%
    }, true);
  }
  
  static createScraperBreaker(): CircuitBreaker {
    return this.getOrCreate('scraper', {
      failureThreshold: 10,
      recoveryTimeout: 120000, // 2 minutes
      monitoringPeriod: 600000, // 10 minutes
      expectedFailureRate: 0.2 // 20% (scraping is more prone to failures)
    }, true);
  }
  
  static getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }
  
  static resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
  
  static getHealthStatus(): Array<{name: string, status: any}> {
    return Array.from(this.breakers.entries()).map(([name, breaker]) => ({
      name,
      status: breaker.getStats()
    }));
  }
}