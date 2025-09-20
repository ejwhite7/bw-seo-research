/**
 * Utility Data Models and Types
 * 
 * Common utility types, helper functions, and shared patterns
 * used across the Dream 100 Keyword Engine models.
 */

import { z } from 'zod';
import type { UUID, Timestamp, JSONValue } from './index';

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
  readonly offset: number;
  readonly cursor?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  readonly data: T[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly pages: number;
    readonly hasNext: boolean;
    readonly hasPrev: boolean;
    readonly nextCursor?: string;
    readonly prevCursor?: string;
  };
  readonly metadata: {
    readonly took: number; // milliseconds
    readonly cached: boolean;
    readonly source: string;
  };
}

/**
 * Sort parameters for ordered queries
 */
export interface SortParams {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
  readonly nullsFirst?: boolean;
}

/**
 * Filter operators for query building
 */
export type FilterOperator = 
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
  | 'in' | 'nin' | 'like' | 'ilike'
  | 'is_null' | 'not_null'
  | 'between' | 'not_between';

/**
 * Filter condition for queries
 */
export interface FilterCondition {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
  readonly values?: unknown[]; // for 'in', 'nin', 'between'
}

/**
 * Filter group with logical operators
 */
export interface FilterGroup {
  readonly operator: 'and' | 'or';
  readonly conditions: FilterCondition[];
  readonly groups?: FilterGroup[];
}

/**
 * Search parameters with full-text search
 */
export interface SearchParams {
  readonly query?: string;
  readonly fields?: string[];
  readonly fuzzy?: boolean;
  readonly boost?: Record<string, number>;
  readonly filters?: FilterGroup;
  readonly facets?: string[];
}

/**
 * Search result with highlighting and facets
 */
export interface SearchResult<T> {
  readonly items: Array<T & {
    readonly _score: number;
    readonly _highlights?: Record<string, string[]>;
  }>;
  readonly total: number;
  readonly maxScore: number;
  readonly took: number; // milliseconds
  readonly facets?: Record<string, FacetResult>;
}

/**
 * Facet result for search aggregations
 */
export interface FacetResult {
  readonly field: string;
  readonly buckets: Array<{
    readonly key: string;
    readonly count: number;
    readonly selected?: boolean;
  }>;
  readonly totalCount: number;
  readonly otherCount: number;
}

/**
 * Time range parameters
 */
export interface TimeRange {
  readonly start: Timestamp;
  readonly end: Timestamp;
  readonly timezone?: string;
}

/**
 * Aggregation parameters
 */
export interface AggregationParams {
  readonly field: string;
  readonly type: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'terms' | 'date_histogram';
  readonly interval?: string; // for date_histogram
  readonly size?: number; // for terms
  readonly order?: { field: string; direction: 'asc' | 'desc' };
}

/**
 * Aggregation result
 */
export interface AggregationResult {
  readonly field: string;
  readonly type: string;
  readonly buckets?: Array<{
    readonly key: string | number;
    readonly count: number;
    readonly value?: number;
  }>;
  readonly value?: number; // for metric aggregations
  readonly min?: number;
  readonly max?: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  readonly enabled: boolean;
  readonly ttl: number; // seconds
  readonly key: string;
  readonly tags?: string[];
  readonly invalidateOn?: string[]; // events that invalidate cache
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  readonly requests: number;
  readonly window: number; // seconds
  readonly burst?: number;
  readonly key: string; // identifier for rate limiting
}

/**
 * Audit trail entry
 */
export interface AuditEntry {
  readonly id: UUID;
  readonly entityType: string;
  readonly entityId: UUID;
  readonly action: 'create' | 'update' | 'delete' | 'view' | 'export';
  readonly userId: UUID;
  readonly userEmail: string;
  readonly timestamp: Timestamp;
  readonly changes?: {
    readonly before: JSONValue;
    readonly after: JSONValue;
    readonly fields: string[];
  };
  readonly metadata: {
    readonly userAgent?: string;
    readonly ipAddress?: string;
    readonly source: string;
    readonly requestId?: UUID;
  };
}

/**
 * Event system for model changes
 */
export interface ModelEvent<T = JSONValue> {
  readonly id: UUID;
  readonly type: string;
  readonly version: string;
  readonly timestamp: Timestamp;
  readonly source: string;
  readonly subject: {
    readonly type: string;
    readonly id: UUID;
  };
  readonly data: T;
  readonly metadata: {
    readonly userId?: UUID;
    readonly correlationId?: UUID;
    readonly causationId?: UUID;
    readonly tags?: string[];
  };
}

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  readonly event: string;
  readonly timestamp: Timestamp;
  readonly data: JSONValue;
  readonly signature: string;
  readonly delivery: {
    readonly id: UUID;
    readonly attempt: number;
    readonly maxAttempts: number;
  };
}

/**
 * Background job definition
 */
export interface BackgroundJob {
  readonly id: UUID;
  readonly type: string;
  readonly priority: number;
  readonly payload: JSONValue;
  readonly options: {
    readonly delay?: number; // milliseconds
    readonly retry?: {
      readonly attempts: number;
      readonly backoff: 'fixed' | 'exponential';
      readonly delay: number;
    };
    readonly timeout?: number; // milliseconds
    readonly cron?: string; // for scheduled jobs
  };
  readonly status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  readonly createdAt: Timestamp;
  readonly processedAt?: Timestamp;
  readonly completedAt?: Timestamp;
  readonly error?: {
    readonly message: string;
    readonly stack?: string;
    readonly code?: string;
  };
  readonly result?: JSONValue;
  readonly attempts: number;
}

/**
 * Metrics collection point
 */
export interface MetricPoint {
  readonly name: string;
  readonly value: number;
  readonly timestamp: Timestamp;
  readonly tags: Record<string, string>;
  readonly type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

/**
 * Health check result
 */
export interface HealthCheck {
  readonly service: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly timestamp: Timestamp;
  readonly duration: number; // milliseconds
  readonly details: {
    readonly version?: string;
    readonly uptime?: number;
    readonly memory?: { used: number; total: number };
    readonly database?: { connected: boolean; latency: number };
    readonly apis?: Array<{ name: string; status: string; latency: number }>;
  };
  readonly dependencies: Array<{
    readonly name: string;
    readonly status: 'healthy' | 'degraded' | 'unhealthy';
    readonly latency: number;
  }>;
}

/**
 * Configuration value with metadata
 */
export interface ConfigValue<T = unknown> {
  readonly key: string;
  readonly value: T;
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly description: string;
  readonly defaultValue: T;
  readonly required: boolean;
  readonly sensitive: boolean; // should be encrypted/masked
  readonly validation?: {
    readonly min?: number;
    readonly max?: number;
    readonly pattern?: string;
    readonly enum?: unknown[];
  };
  readonly updatedAt: Timestamp;
  readonly updatedBy: UUID;
}

/**
 * Feature flag definition
 */
export interface FeatureFlag {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly conditions?: {
    readonly userIds?: UUID[];
    readonly userPercent?: number;
    readonly attributes?: Record<string, unknown>;
    readonly startDate?: Timestamp;
    readonly endDate?: Timestamp;
  };
  readonly variants?: Array<{
    readonly key: string;
    readonly name: string;
    readonly weight: number; // 0-100
    readonly payload?: JSONValue;
  }>;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly createdBy: UUID;
}

/**
 * API response envelope
 */
export interface APIResponse<T = unknown> {
  readonly success: boolean;
  readonly data: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: JSONValue;
  };
  readonly meta: {
    readonly requestId: UUID;
    readonly timestamp: Timestamp;
    readonly version: string;
    readonly took: number; // milliseconds
    readonly rateLimit?: {
      readonly limit: number;
      readonly remaining: number;
      readonly reset: number;
    };
  };
}

/**
 * Validation schemas for utility types
 */
export const UtilitySchemas = {
  PaginationParams: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(1000).default(50),
    offset: z.number().int().min(0).default(0),
    cursor: z.string().optional()
  }).transform(data => ({
    ...data,
    offset: (data.page - 1) * data.limit
  })),
  
  SortParams: z.object({
    field: z.string().min(1).max(100),
    direction: z.enum(['asc', 'desc']).default('asc'),
    nullsFirst: z.boolean().optional()
  }),
  
  FilterCondition: z.object({
    field: z.string().min(1).max(100),
    operator: z.enum([
      'eq', 'ne', 'lt', 'le', 'gt', 'ge',
      'in', 'nin', 'like', 'ilike',
      'is_null', 'not_null',
      'between', 'not_between'
    ]),
    value: z.unknown(),
    values: z.array(z.unknown()).optional()
  }).refine(data => {
    // Validate that 'in' and 'nin' have values array
    if (['in', 'nin'].includes(data.operator)) {
      return Array.isArray(data.values) && data.values.length > 0;
    }
    // Validate that 'between' has exactly 2 values
    if (['between', 'not_between'].includes(data.operator)) {
      return Array.isArray(data.values) && data.values.length === 2;
    }
    return true;
  }, {
    message: "Invalid values for operator"
  }),
  
  TimeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    timezone: z.string().optional()
  }).refine(data => {
    return new Date(data.start) <= new Date(data.end);
  }, {
    message: "Start time must be before end time"
  }),
  
  CacheConfig: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().int().min(1).max(86400).default(300), // 5 minutes default
    key: z.string().min(1).max(200),
    tags: z.array(z.string().min(1).max(50)).optional(),
    invalidateOn: z.array(z.string().min(1).max(100)).optional()
  }),
  
  RateLimitConfig: z.object({
    requests: z.number().int().min(1).max(10000),
    window: z.number().int().min(1).max(3600), // max 1 hour window
    burst: z.number().int().min(1).optional(),
    key: z.string().min(1).max(200)
  })
} as const;

/**
 * Type guards for utility types
 */
export const isPaginationParams = (value: unknown): value is PaginationParams => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.page === 'number' &&
    typeof obj.limit === 'number' &&
    typeof obj.offset === 'number' &&
    obj.page >= 1 &&
    obj.limit >= 1 &&
    obj.limit <= 1000 &&
    obj.offset >= 0
  );
};

export const isFilterCondition = (value: unknown): value is FilterCondition => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  const validOperators = [
    'eq', 'ne', 'lt', 'le', 'gt', 'ge',
    'in', 'nin', 'like', 'ilike',
    'is_null', 'not_null',
    'between', 'not_between'
  ];
  
  return (
    typeof obj.field === 'string' &&
    obj.field.length > 0 &&
    typeof obj.operator === 'string' &&
    validOperators.includes(obj.operator)
  );
};

export const isAPIResponse = (value: unknown): value is APIResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.success === 'boolean' &&
    'data' in obj &&
    typeof obj.meta === 'object' &&
    obj.meta !== null
  );
};

/**
 * Utility functions
 */
export const createPagination = (
  page: number,
  limit: number,
  total: number
): PaginatedResponse<never>['pagination'] => {
  const pages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  
  return {
    page,
    limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1
  };
};

export const buildCacheKey = (
  prefix: string,
  params: Record<string, unknown>
): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  
  return `${prefix}:${btoa(sortedParams).replace(/[+/=]/g, '')}`;
};

export const parseTimeRange = (
  range: string | TimeRange
): TimeRange => {
  if (typeof range === 'object') {
    return range;
  }
  
  const now = new Date();
  const start = new Date(now);
  
  switch (range) {
    case 'last_hour':
      start.setHours(now.getHours() - 1);
      break;
    case 'last_24h':
      start.setDate(now.getDate() - 1);
      break;
    case 'last_7d':
      start.setDate(now.getDate() - 7);
      break;
    case 'last_30d':
      start.setDate(now.getDate() - 30);
      break;
    case 'last_90d':
      start.setDate(now.getDate() - 90);
      break;
    default:
      // Try to parse as ISO date
      if (range.includes('T')) {
        return {
          start: range,
          end: now.toISOString()
        };
      }
      throw new Error(`Invalid time range: ${range}`);
  }
  
  return {
    start: start.toISOString(),
    end: now.toISOString()
  };
};

export const generateId = (): UUID => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) as UUID;
};

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
};

export const formatNumber = (
  value: number,
  options: {
    locale?: string;
    style?: 'decimal' | 'currency' | 'percent';
    currency?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {}
): string => {
  const {
    locale = 'en-US',
    style = 'decimal',
    currency = 'USD',
    ...formatOptions
  } = options;
  
  return new Intl.NumberFormat(locale, {
    style,
    currency: style === 'currency' ? currency : undefined,
    ...formatOptions
  }).format(value);
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
};

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export const retry = async <T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    delay: number;
    backoff?: 'linear' | 'exponential';
    retryIf?: (error: Error) => boolean;
  }
): Promise<T> => {
  const { attempts, delay, backoff = 'exponential', retryIf } = options;
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === attempts;
      const shouldRetry = !retryIf || retryIf(error as Error);
      
      if (isLastAttempt || !shouldRetry) {
        throw error;
      }
      
      const waitTime = backoff === 'exponential' 
        ? delay * Math.pow(2, attempt - 1)
        : delay * attempt;
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error('Retry attempts exhausted');
};

export const groupBy = <T, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T[]> => {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
};

export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const unique = <T>(array: T[], key?: keyof T): T[] => {
  if (!key) {
    return Array.from(new Set(array));
  }
  
  const seen = new Set();
  return array.filter(item => {
    const keyValue = item[key];
    if (seen.has(keyValue)) {
      return false;
    }
    seen.add(keyValue);
    return true;
  });
};

export const pick = <T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
};

export const omit = <T, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
};

export const deepMerge = <T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T => {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
          targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        (result as any)[key] = deepMerge(targetValue as Record<string, any>, sourceValue as Record<string, any>);
      } else {
        (result as any)[key] = sourceValue;
      }
    }
  }
  
  return result;
};

export const isEmptyValue = (value: unknown): boolean => {
  return value === null || 
         value === undefined || 
         value === '' || 
         (Array.isArray(value) && value.length === 0) ||
         (typeof value === 'object' && Object.keys(value as object).length === 0);
};

export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const parseJSON = <T = unknown>(
  json: string,
  defaultValue: T
): T => {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
};

export const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};