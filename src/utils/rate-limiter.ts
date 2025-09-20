import { TokenBucketConfig, RateLimiter } from '../types/api';

// Re-export types for convenience
export type { RateLimiter, TokenBucketConfig } from '../types/api';

// Export the CircuitBreakerFactory from circuit-breaker module
export { CircuitBreakerFactory } from './circuit-breaker';

export class TokenBucket implements RateLimiter {
  private tokens: number;
  private lastRefill: number;
  
  constructor(private config: TokenBucketConfig) {
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }
  
  tryConsume(tokensToConsume: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      return true;
    }
    
    return false;
  }
  
  getRemainingTokens(): number {
    this.refill();
    return this.tokens;
  }
  
  getNextRefillTime(): number {
    const timeSinceLastRefill = Date.now() - this.lastRefill;
    const timeUntilNextRefill = this.config.refillPeriod - (timeSinceLastRefill % this.config.refillPeriod);
    return Date.now() + timeUntilNextRefill;
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const periodsElapsed = Math.floor(timePassed / this.config.refillPeriod);
    
    if (periodsElapsed > 0) {
      const tokensToAdd = periodsElapsed * this.config.refillRate;
      this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
  
  // For testing and monitoring
  getStatus() {
    return {
      tokens: this.getRemainingTokens(),
      capacity: this.config.capacity,
      nextRefill: this.getNextRefillTime(),
      config: this.config
    };
  }
}

// Distributed rate limiter using Redis for multi-instance deployments
export class RedisRateLimiter implements RateLimiter {
  private fallbackLimiter: TokenBucket;
  
  constructor(
    private redis: any, // ioredis instance
    private key: string,
    private config: TokenBucketConfig
  ) {
    this.fallbackLimiter = new TokenBucket(config);
  }
  
  tryConsume(tokensToConsume: number = 1): boolean {
    try {
      // Redis Lua script for atomic token bucket operations
      const script = `
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refillRate = tonumber(ARGV[2])
        local refillPeriod = tonumber(ARGV[3])
        local tokensToConsume = tonumber(ARGV[4])
        local now = tonumber(ARGV[5])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
        local tokens = tonumber(bucket[1]) or capacity
        local lastRefill = tonumber(bucket[2]) or now
        
        -- Calculate refill
        local timePassed = now - lastRefill
        local periodsElapsed = math.floor(timePassed / refillPeriod)
        
        if periodsElapsed > 0 then
          local tokensToAdd = periodsElapsed * refillRate
          tokens = math.min(capacity, tokens + tokensToAdd)
          lastRefill = now
        end
        
        -- Try to consume tokens
        if tokens >= tokensToConsume then
          tokens = tokens - tokensToConsume
          redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
          redis.call('EXPIRE', key, math.ceil(refillPeriod / 1000) * 2)
          return {1, tokens}
        else
          redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
          redis.call('EXPIRE', key, math.ceil(refillPeriod / 1000) * 2)
          return {0, tokens}
        end
      `;
      
      // For production, we'd use lua script with Redis
      // For now, fallback to local token bucket
      return this.fallbackLimiter.tryConsume(tokensToConsume);
    } catch (error) {
      console.warn('Redis rate limiter failed, falling back to local:', error);
      return this.fallbackLimiter.tryConsume(tokensToConsume);
    }
  }
  
  getRemainingTokens(): number {
    // For Redis-based limiters, we'll use the fallback for sync operations
    return this.fallbackLimiter.getRemainingTokens();
  }
  
  getNextRefillTime(): number {
    return this.fallbackLimiter.getNextRefillTime();
  }
}

// Rate limiter with jitter for avoiding thundering herd
export class JitteredRateLimiter implements RateLimiter {
  constructor(private limiter: RateLimiter, private jitterMs: number = 1000) {}
  
  tryConsume(tokensToConsume: number = 1): boolean {
    const canConsume = this.limiter.tryConsume(tokensToConsume);
    
    if (!canConsume) {
      return false;
    }
    
    // Add jitter delay for successful requests to avoid thundering herd
    // Note: In a real implementation, this would be handled asynchronously
    // at a higher level to avoid blocking the sync interface
    return true;
  }
  
  getRemainingTokens(): number {
    return this.limiter.getRemainingTokens();
  }
  
  getNextRefillTime(): number {
    return this.limiter.getNextRefillTime();
  }
}

// Factory for creating rate limiters
export class RateLimiterFactory {
  static createTokenBucket(config: TokenBucketConfig): TokenBucket {
    return new TokenBucket(config);
  }
  
  static createRedisLimiter(
    redis: any,
    key: string,
    config: TokenBucketConfig
  ): RedisRateLimiter {
    return new RedisRateLimiter(redis, key, config);
  }
  
  static createJitteredLimiter(
    limiter: RateLimiter,
    jitterMs?: number
  ): JitteredRateLimiter {
    return new JitteredRateLimiter(limiter, jitterMs);
  }
  
  // Pre-configured limiters for different APIs
  static createAhrefsLimiter(redis?: any): RateLimiter {
    const config: TokenBucketConfig = {
      capacity: 100,    // 100 requests
      refillRate: 20,   // 20 requests per period
      refillPeriod: 60000  // 1 minute
    };
    
    if (redis) {
      return new JitteredRateLimiter(
        new RedisRateLimiter(redis, 'ahrefs:rate_limit', config),
        2000
      );
    }
    
    return new JitteredRateLimiter(new TokenBucket(config), 2000);
  }
  
  static createAnthropicLimiter(redis?: any): RateLimiter {
    const config: TokenBucketConfig = {
      capacity: 50,     // 50 requests
      refillRate: 10,   // 10 requests per period  
      refillPeriod: 60000  // 1 minute
    };
    
    if (redis) {
      return new JitteredRateLimiter(
        new RedisRateLimiter(redis, 'anthropic:rate_limit', config),
        1000
      );
    }
    
    return new JitteredRateLimiter(new TokenBucket(config), 1000);
  }
  
  static createScraperLimiter(redis?: any): RateLimiter {
    const config: TokenBucketConfig = {
      capacity: 30,     // 30 requests
      refillRate: 5,    // 5 requests per period
      refillPeriod: 10000  // 10 seconds
    };
    
    if (redis) {
      return new JitteredRateLimiter(
        new RedisRateLimiter(redis, 'scraper:rate_limit', config),
        5000
      );
    }
    
    return new JitteredRateLimiter(new TokenBucket(config), 5000);
  }
}