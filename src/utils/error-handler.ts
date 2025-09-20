/**
 * Advanced Error Handler Utility
 * Provides comprehensive error handling, classification, and reporting
 */

import { SentryReporter } from './sentry';
import { ApiError, RateLimitInfo, CostInfo } from '../types/api';

/**
 * Error classification types
 */
export enum ErrorType {
  API_ERROR = 'API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Enhanced error class with additional metadata
 */
export class EnhancedError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly context: Record<string, any>;
  public readonly retryable: boolean;
  public readonly timestamp: number;
  public readonly userMessage?: string;
  public readonly cause?: Error;
  public readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      type: ErrorType;
      severity: ErrorSeverity;
      code: string;
      context?: Record<string, any>;
      retryable?: boolean;
      cause?: Error;
      userMessage?: string;
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = 'EnhancedError';
    this.type = options.type;
    this.severity = options.severity;
    this.code = options.code;
    this.context = options.context || {};
    this.retryable = options.retryable || false;
    this.timestamp = Date.now();
    this.userMessage = options.userMessage;
    this.cause = options.cause;
    this.statusCode = options.statusCode;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedError);
    }
  }
}

/**
 * Error handler utility class
 */
export class ErrorHandler {
  private static readonly MAX_ERROR_CACHE = 100;
  private static errorCache = new Map<string, { count: number; lastSeen: number }>();
  private static errorCallbacks = new Map<ErrorType, Array<(error: EnhancedError) => void>>();

  /**
   * Handle API errors with proper classification and reporting
   */
  static handleApiError(
    error: Error,
    context: {
      provider: string;
      endpoint: string;
      method: string;
      statusCode?: number;
      requestData?: any;
      responseData?: any;
      userId?: string;
      runId?: string;
    }
  ): EnhancedError {
    const statusCode = context.statusCode || 500;
    let type: ErrorType = ErrorType.API_ERROR;
    let severity: ErrorSeverity = ErrorSeverity.MEDIUM;
    let retryable = false;

    // Classify error based on status code
    if (statusCode === 401) {
      type = ErrorType.AUTHENTICATION_ERROR;
      severity = ErrorSeverity.HIGH;
    } else if (statusCode === 403) {
      type = ErrorType.AUTHORIZATION_ERROR;
      severity = ErrorSeverity.HIGH;
    } else if (statusCode === 429) {
      type = ErrorType.RATE_LIMIT_ERROR;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (statusCode >= 500) {
      type = ErrorType.SYSTEM_ERROR;
      severity = ErrorSeverity.HIGH;
      retryable = true;
    } else if (statusCode >= 400) {
      type = ErrorType.VALIDATION_ERROR;
      severity = ErrorSeverity.LOW;
    }

    const enhancedError = new EnhancedError(error.message, {
      type,
      severity,
      code: `API_${statusCode}`,
      context: {
        provider: context.provider,
        endpoint: context.endpoint,
        method: context.method,
        statusCode,
        requestData: this.sanitizeData(context.requestData),
        responseData: this.sanitizeData(context.responseData),
        userId: context.userId,
        runId: context.runId
      },
      retryable,
      cause: error,
      userMessage: this.getApiErrorUserMessage(statusCode),
      statusCode
    });

    this.reportError(enhancedError);
    return enhancedError;
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(
    error: Error,
    context: {
      field?: string;
      value?: any;
      schema?: string;
      expectedType?: string;
      userId?: string;
    }
  ): EnhancedError {
    const enhancedError = new EnhancedError(error.message, {
      type: ErrorType.VALIDATION_ERROR,
      severity: ErrorSeverity.LOW,
      code: 'VALIDATION_FAILED',
      context: {
        field: context.field,
        value: this.sanitizeData(context.value),
        schema: context.schema,
        expectedType: context.expectedType,
        userId: context.userId
      },
      retryable: false,
      cause: error,
      userMessage: `Invalid value for ${context.field || 'field'}`
    });

    this.reportError(enhancedError);
    return enhancedError;
  }

  /**
   * Handle workflow/business logic errors
   */
  static handleWorkflowError(
    error: Error,
    context: {
      stage: string;
      runId: string;
      userId?: string;
      keywordsProcessed?: number;
      totalKeywords?: number;
      operation?: string;
    }
  ): EnhancedError {
    const severity = context.stage === 'dream100' ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH;

    const enhancedError = new EnhancedError(error.message, {
      type: ErrorType.BUSINESS_ERROR,
      severity,
      code: `WORKFLOW_${context.stage.toUpperCase()}_ERROR`,
      context: {
        stage: context.stage,
        runId: context.runId,
        userId: context.userId,
        progress: context.keywordsProcessed && context.totalKeywords 
          ? context.keywordsProcessed / context.totalKeywords 
          : undefined,
        operation: context.operation
      },
      retryable: true,
      cause: error,
      userMessage: `Error in ${context.stage} stage. Please try again.`
    });

    this.reportError(enhancedError);
    return enhancedError;
  }

  /**
   * Handle system/infrastructure errors
   */
  static handleSystemError(
    error: Error,
    context: {
      component: string;
      operation?: string;
      userId?: string;
      details?: Record<string, any>;
    }
  ): EnhancedError {
    const enhancedError = new EnhancedError(error.message, {
      type: ErrorType.SYSTEM_ERROR,
      severity: ErrorSeverity.CRITICAL,
      code: `SYSTEM_${context.component.toUpperCase()}_ERROR`,
      context: {
        component: context.component,
        operation: context.operation,
        userId: context.userId,
        details: context.details
      },
      retryable: false,
      cause: error,
      userMessage: 'System error occurred. Please contact support if the issue persists.'
    });

    this.reportError(enhancedError);
    return enhancedError;
  }

  /**
   * Handle network/connectivity errors
   */
  static handleNetworkError(
    error: Error,
    context: {
      url?: string;
      method?: string;
      timeout?: boolean;
      userId?: string;
    }
  ): EnhancedError {
    const type = context.timeout ? ErrorType.TIMEOUT_ERROR : ErrorType.NETWORK_ERROR;

    const enhancedError = new EnhancedError(error.message, {
      type,
      severity: ErrorSeverity.MEDIUM,
      code: context.timeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
      context: {
        url: context.url,
        method: context.method,
        timeout: context.timeout,
        userId: context.userId
      },
      retryable: true,
      cause: error,
      userMessage: context.timeout 
        ? 'Request timed out. Please try again.'
        : 'Network error occurred. Please check your connection.'
    });

    this.reportError(enhancedError);
    return enhancedError;
  }

  /**
   * Register error callback for specific error types
   */
  static onError(type: ErrorType, callback: (error: EnhancedError) => void): void {
    if (!this.errorCallbacks.has(type)) {
      this.errorCallbacks.set(type, []);
    }
    this.errorCallbacks.get(type)!.push(callback);
  }

  /**
   * Check if error should be retried based on type and context
   */
  static shouldRetry(error: EnhancedError, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) return false;
    if (!error.retryable) return false;

    // Don't retry validation errors
    if (error.type === ErrorType.VALIDATION_ERROR) return false;

    // Don't retry auth errors
    if ([ErrorType.AUTHENTICATION_ERROR, ErrorType.AUTHORIZATION_ERROR].includes(error.type)) {
      return false;
    }

    // For rate limit errors, always retry with backoff
    if (error.type === ErrorType.RATE_LIMIT_ERROR) return true;

    // For system errors, retry with exponential backoff
    if (error.type === ErrorType.SYSTEM_ERROR) return attempt < 3;

    return true;
  }

  /**
   * Get retry delay based on error type and attempt
   */
  static getRetryDelay(error: EnhancedError, attempt: number): number {
    const baseDelay = 1000; // 1 second

    switch (error.type) {
      case ErrorType.RATE_LIMIT_ERROR:
        // Exponential backoff for rate limits: 1s, 2s, 4s, 8s...
        return baseDelay * Math.pow(2, attempt - 1);
      
      case ErrorType.NETWORK_ERROR:
      case ErrorType.TIMEOUT_ERROR:
        // Linear backoff for network errors: 2s, 4s, 6s...
        return baseDelay * 2 * attempt;
      
      case ErrorType.SYSTEM_ERROR:
        // Exponential backoff with jitter for system errors
        const delay = baseDelay * Math.pow(2, attempt - 1);
        return delay + Math.random() * 1000;
      
      default:
        return baseDelay * attempt;
    }
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: EnhancedError): string {
    return error.userMessage || this.getDefaultUserMessage(error.type);
  }

  /**
   * Clear error cache
   */
  static clearCache(): void {
    this.errorCache.clear();
  }

  /**
   * Get error statistics
   */
  static getStats(): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    topErrors: Array<{ error: string; count: number }>;
  } {
    const errorsByType: Record<ErrorType, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;

    // Initialize counters
    Object.values(ErrorType).forEach(type => {
      errorsByType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });

    const topErrors = Array.from(this.errorCache.entries())
      .map(([error, data]) => ({ error, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors: this.errorCache.size,
      errorsByType,
      errorsBySeverity,
      topErrors
    };
  }

  private static reportError(error: EnhancedError): void {
    // Deduplicate errors
    const errorKey = `${error.type}:${error.code}:${error.message}`;
    const cached = this.errorCache.get(errorKey);
    
    if (cached) {
      cached.count++;
      cached.lastSeen = Date.now();
      
      // Only report every 10th occurrence after the first few
      if (cached.count <= 3 || cached.count % 10 === 0) {
        this.sendToSentry(error, cached.count);
      }
    } else {
      this.errorCache.set(errorKey, { count: 1, lastSeen: Date.now() });
      this.sendToSentry(error, 1);
      
      // Cleanup old cache entries
      if (this.errorCache.size > this.MAX_ERROR_CACHE) {
        this.cleanupCache();
      }
    }

    // Trigger registered callbacks
    const callbacks = this.errorCallbacks.get(error.type) || [];
    callbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError);
      }
    });
  }

  private static sendToSentry(error: EnhancedError, count: number): void {
    SentryReporter.captureError(error, {
      errorType: error.type,
      severity: error.severity,
      code: error.code,
      retryable: error.retryable,
      occurrenceCount: count,
      context: error.context
    });
  }

  private static cleanupCache(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    const entries = Array.from(this.errorCache.entries());
    for (const [key, data] of entries) {
      if (now - data.lastSeen > maxAge) {
        this.errorCache.delete(key);
      }
    }
  }

  private static sanitizeData(data: any): any {
    if (!data) return undefined;
    
    if (typeof data === 'string') {
      return data.length > 500 ? data.substring(0, 500) + '...[TRUNCATED]' : data;
    }
    
    if (typeof data === 'object') {
      const sanitized = { ...data };
      
      // Remove sensitive fields
      const sensitiveFields = ['apiKey', 'api_key', 'password', 'token', 'secret', 'authorization'];
      sensitiveFields.forEach(field => {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      });
      
      // Truncate large objects
      const jsonString = JSON.stringify(sanitized);
      if (jsonString.length > 1000) {
        return JSON.stringify(sanitized).substring(0, 1000) + '...[TRUNCATED]';
      }
      
      return sanitized;
    }
    
    return data;
  }

  private static getApiErrorUserMessage(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Authentication failed. Please check your API credentials.';
      case 403:
        return 'Access denied. You may not have permission for this operation.';
      case 404:
        return 'Resource not found. The requested item may no longer exist.';
      case 429:
        return 'Rate limit exceeded. Please wait a moment before trying again.';
      case 500:
        return 'Server error occurred. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Service temporarily unavailable. Please try again in a few minutes.';
      default:
        return 'An error occurred while processing your request.';
    }
  }

  private static getDefaultUserMessage(type: ErrorType): string {
    switch (type) {
      case ErrorType.API_ERROR:
        return 'API error occurred. Please try again.';
      case ErrorType.VALIDATION_ERROR:
        return 'Please check your input and try again.';
      case ErrorType.BUSINESS_ERROR:
        return 'Processing error occurred. Please try again.';
      case ErrorType.SYSTEM_ERROR:
        return 'System error occurred. Please contact support if the issue persists.';
      case ErrorType.NETWORK_ERROR:
        return 'Network error occurred. Please check your connection.';
      case ErrorType.TIMEOUT_ERROR:
        return 'Request timed out. Please try again.';
      case ErrorType.RATE_LIMIT_ERROR:
        return 'Rate limit exceeded. Please wait a moment before trying again.';
      case ErrorType.AUTHENTICATION_ERROR:
        return 'Authentication failed. Please check your credentials.';
      case ErrorType.AUTHORIZATION_ERROR:
        return 'Access denied. You may not have permission for this operation.';
      default:
        return 'An error occurred. Please try again.';
    }
  }
}

// Utility function to wrap async functions with error handling
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: {
    component: string;
    operation: string;
    userId?: string;
  }
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw ErrorHandler.handleSystemError(error as Error, {
        component: context.component,
        operation: context.operation,
        userId: context.userId
      });
    }
  }) as T;
}

// Utility function for retry logic
export async function retryWithErrorHandling<T>(
  fn: () => Promise<T>,
  context: {
    maxAttempts?: number;
    operation: string;
    userId?: string;
  }
): Promise<T> {
  const maxAttempts = context.maxAttempts || 3;
  let lastError: EnhancedError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof EnhancedError) {
        lastError = error;
      } else {
        lastError = ErrorHandler.handleSystemError(error as Error, {
          component: 'retry',
          operation: context.operation,
          userId: context.userId
        });
      }

      if (!ErrorHandler.shouldRetry(lastError, attempt, maxAttempts)) {
        break;
      }

      const delay = ErrorHandler.getRetryDelay(lastError, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Retry failed without specific error');
}

// Backward compatibility for existing integrations
export class CustomApiError extends Error implements ApiError {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false,
    public rateLimit?: RateLimitInfo,
    public cost?: CostInfo,
    public provider?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends CustomApiError {
  constructor(
    message: string,
    rateLimit: RateLimitInfo,
    provider: string
  ) {
    super(
      `${message}. Retry after ${rateLimit.retryAfter || rateLimit.reset} seconds`,
      'RATE_LIMIT_EXCEEDED',
      429,
      true,
      rateLimit,
      undefined,
      provider
    );
    this.name = 'RateLimitError';
  }
}

export class RetryableError extends CustomApiError {
  constructor(
    message: string,
    code: string,
    statusCode?: number,
    rateLimit?: RateLimitInfo,
    cost?: CostInfo,
    provider?: string
  ) {
    super(message, code, statusCode, true, rateLimit, cost, provider);
    this.name = 'RetryableError';
  }
}

// Backward compatible RetryHandler export
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      shouldRetry?: (error: Error) => boolean;
      onRetry?: (error: Error, attempt: number) => void;
      provider?: string;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      shouldRetry = (error) => error instanceof CustomApiError && error.retryable,
      onRetry,
      provider = 'unknown'
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts || !shouldRetry(lastError)) {
          throw lastError;
        }
        
        if (onRetry) {
          onRetry(lastError, attempt);
        }
        
        // Simple exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

// Add missing static methods to ErrorHandler class
(ErrorHandler as any).createRateLimitError = (
  rateLimit: RateLimitInfo,
  provider: string,
  message?: string
): RateLimitError => {
  return new RateLimitError(
    message || `Rate limit exceeded for ${provider}`,
    rateLimit,
    provider
  );
};

(ErrorHandler as any).createTimeoutError = (timeoutMs: number, provider: string): ApiError => {
  return new RetryableError(
    `Request timed out after ${timeoutMs}ms`,
    'TIMEOUT',
    408,
    undefined,
    undefined,
    provider
  );
};

(ErrorHandler as any).createNetworkError = (error: Error, provider: string): ApiError => {
  return new RetryableError(
    error.message || 'Network error occurred',
    'NETWORK_ERROR',
    500,
    undefined,
    undefined,
    provider
  );
};

(ErrorHandler as any).handle = (error: Error, context?: Record<string, any>): ApiError => {
  if (error instanceof CustomApiError) {
    return error;
  }
  
  return new CustomApiError(
    error.message,
    'UNKNOWN_ERROR',
    undefined,
    false,
    undefined,
    undefined,
    context?.provider
  );
};