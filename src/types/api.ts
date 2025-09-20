// Shared types for external API integrations
export interface ApiResponse<T = any> {
  data: T;
  success: boolean;
  error?: string;
  metadata?: {
    requestId: string;
    timestamp: number;
    cached: boolean;
    rateLimit?: RateLimitInfo;
    cost?: CostInfo;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface CostInfo {
  credits: number;
  estimatedDollars: number;
  budgetRemaining?: number;
}

export interface ApiError extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;
  rateLimit?: RateLimitInfo;
  cost?: CostInfo;
}

// Circuit breaker states
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedFailureRate?: number;
}

// Rate limiting
export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
  refillPeriod: number;
}

export interface RateLimiter {
  tryConsume(tokens?: number): boolean;
  getRemainingTokens(): number;
  getNextRefillTime(): number;
}

// API client configuration
export interface ApiClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  retries: number;
  rateLimiter: TokenBucketConfig;
  circuitBreaker: CircuitBreakerConfig;
  cache?: {
    ttl: number;
    maxSize: number;
  };
}

// Common API request/response patterns
export interface PaginatedRequest {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

// Metric tracking
export interface ApiMetrics {
  requests: number;
  successes: number;
  failures: number;
  avgResponseTime: number;
  totalCost: number;
  lastRequest: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
}

export interface ApiUsageEvent {
  provider: 'ahrefs' | 'anthropic' | 'scraper';
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  cost: number;
  cached: boolean;
  timestamp: number;
  userId?: string;
  runId?: string;
}