/**
 * Scraping Service Configuration
 * 
 * Centralized configuration for ethical web scraping including
 * security settings, rate limits, compliance controls, and monitoring.
 */

import { ScrapeConfig } from '../models/competitor';
import { DomainString } from '../models/index';

/**
 * Security configuration for content scraping
 */
export const SECURITY_CONFIG = {
  // Content size limits to prevent abuse
  MAX_ROBOTS_TXT_SIZE: 100 * 1024, // 100KB
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_CONTENT_LENGTH: 50000, // 50KB
  MAX_H2_TAGS: 20,
  MAX_IMAGES_PER_PAGE: 10,
  
  // Network security
  MAX_REQUEST_TIMEOUT: 30000, // 30 seconds
  MAX_REDIRECTS: 5,
  ALLOWED_PROTOCOLS: ['http:', 'https:'],
  
  // Content filtering patterns
  DANGEROUS_PATTERNS: [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
    /<object[^>]*>[\s\S]*?<\/object>/gi,
    /<embed[^>]*>[\s\S]*?<\/embed>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:(?!image\/(png|jpeg|gif|webp))[^;]*/gi
  ],
  
  // robots.txt cache settings
  ROBOTS_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours
  ROBOTS_FETCH_TIMEOUT: 10000, // 10 seconds
  
  // User agent identification
  DEFAULT_USER_AGENT: 'Dream100Bot/1.0 (SEO Research; +https://olli.social/bot)',
  FALLBACK_USER_AGENT: 'Mozilla/5.0 (compatible; Dream100Bot/1.0; +https://olli.social/bot)'
};

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  // Base delays (milliseconds)
  MIN_DELAY_BETWEEN_REQUESTS: 500,
  DEFAULT_DELAY_BETWEEN_REQUESTS: 1500,
  MAX_DELAY_BETWEEN_REQUESTS: 10000,
  
  // Request limits
  DEFAULT_REQUESTS_PER_MINUTE: 20,
  MAX_REQUESTS_PER_MINUTE: 60,
  MIN_REQUESTS_PER_MINUTE: 5,
  
  // Backoff settings
  INITIAL_BACKOFF_MS: 60000,      // 1 minute
  MAX_BACKOFF_MS: 3600000,        // 1 hour
  BACKOFF_MULTIPLIER: 2,
  
  // Jitter settings
  MAX_JITTER_MS: 2000,            // 2 seconds
  MIN_JITTER_MS: 100,             // 100ms
  
  // Batch processing
  DEFAULT_BATCH_SIZE: 10,
  MAX_BATCH_SIZE: 50,
  MIN_BATCH_SIZE: 1
};

/**
 * Domain-specific configurations for known websites
 */
export const DOMAIN_SPECIFIC_CONFIG: Record<string, Partial<ScrapeConfig>> = {
  // Conservative settings for major platforms
  'wordpress.com': {
    crawlDelay: 3,
    rateLimitPerMinute: 10,
    maxPages: 50
  },
  'medium.com': {
    crawlDelay: 2,
    rateLimitPerMinute: 15,
    maxPages: 30
  },
  'substack.com': {
    crawlDelay: 2,
    rateLimitPerMinute: 15,
    maxPages: 25
  },
  'ghost.org': {
    crawlDelay: 1.5,
    rateLimitPerMinute: 20,
    maxPages: 40
  },
  
  // Aggressive rate limiting for known restrictive sites
  'linkedin.com': {
    crawlDelay: 5,
    rateLimitPerMinute: 5,
    maxPages: 10
  },
  'facebook.com': {
    crawlDelay: 10,
    rateLimitPerMinute: 3,
    maxPages: 5
  },
  'twitter.com': {
    crawlDelay: 5,
    rateLimitPerMinute: 6,
    maxPages: 10
  },
  
  // Default settings for common CMSes
  'shopify.com': {
    crawlDelay: 2,
    rateLimitPerMinute: 20,
    allowedPaths: ['/blogs/', '/pages/', '/collections/']
  },
  'squarespace.com': {
    crawlDelay: 2,
    rateLimitPerMinute: 15,
    allowedPaths: ['/blog/', '/journal/', '/news/']
  }
};

/**
 * Common content paths to discover across websites
 */
export const CONTENT_DISCOVERY_PATHS = {
  // Blog and article sections
  BLOG_PATHS: [
    '/blog/',
    '/blog',
    '/articles/',
    '/articles',
    '/posts/',
    '/posts',
    '/news/',
    '/news',
    '/insights/',
    '/insights',
    '/journal/',
    '/journal'
  ],
  
  // Resource sections
  RESOURCE_PATHS: [
    '/resources/',
    '/resources',
    '/guides/',
    '/guides',
    '/tutorials/',
    '/tutorials',
    '/help/',
    '/help',
    '/support/',
    '/support',
    '/docs/',
    '/docs',
    '/documentation/',
    '/documentation'
  ],
  
  // Landing pages
  LANDING_PATHS: [
    '/',
    '/about/',
    '/about',
    '/services/',
    '/services',
    '/products/',
    '/products',
    '/solutions/',
    '/solutions'
  ],
  
  // Paths to exclude (admin, private, etc.)
  EXCLUDED_PATHS: [
    '/admin/',
    '/wp-admin/',
    '/login/',
    '/signin/',
    '/signup/',
    '/register/',
    '/cart/',
    '/checkout/',
    '/account/',
    '/dashboard/',
    '/api/',
    '/private/',
    '/internal/',
    '/test/',
    '/dev/',
    '/staging/',
    '/tmp/',
    '/temp/',
    '/backup/',
    '/old/',
    '/archive/',
    '/cdn-cgi/',
    '/wp-content/uploads/',
    '/assets/',
    '/images/',
    '/css/',
    '/js/',
    '/fonts/'
  ]
};

/**
 * Monitoring and alerting thresholds
 */
export const MONITORING_CONFIG = {
  // Success rate thresholds
  MIN_SUCCESS_RATE: 0.7,          // Alert if success rate drops below 70%
  TARGET_SUCCESS_RATE: 0.85,      // Target 85% success rate
  
  // Performance thresholds
  MAX_AVG_RESPONSE_TIME: 5000,    // 5 seconds
  MAX_REQUEST_TIMEOUT_RATE: 0.1,  // 10% timeout rate
  
  // Error rate thresholds
  MAX_ERROR_RATE: 0.2,            // 20% error rate
  MAX_BLOCKED_RATE: 0.1,          // 10% blocked rate
  
  // Resource usage thresholds
  MAX_MEMORY_USAGE_MB: 512,       // 512MB memory limit
  MAX_CACHE_SIZE: 10000,          // 10k cached items
  
  // Alert frequencies
  ERROR_ALERT_FREQUENCY_MS: 300000,     // 5 minutes
  PERFORMANCE_ALERT_FREQUENCY_MS: 600000, // 10 minutes
  
  // Health check intervals
  HEALTH_CHECK_INTERVAL_MS: 60000,      // 1 minute
  DETAILED_HEALTH_CHECK_INTERVAL_MS: 300000 // 5 minutes
};

/**
 * Compliance and legal settings
 */
export const COMPLIANCE_CONFIG = {
  // Data retention
  COMPETITOR_DATA_RETENTION_DAYS: 90,
  SCRAPE_LOG_RETENTION_DAYS: 30,
  ERROR_LOG_RETENTION_DAYS: 7,
  
  // Content policies
  RESPECT_ROBOTS_TXT: true,
  HONOR_CRAWL_DELAY: true,
  MAX_CRAWL_DELAY_OVERRIDE: 60,    // Don't wait more than 60 seconds
  
  // Privacy settings
  COLLECT_PERSONAL_DATA: false,
  COLLECT_EMAIL_ADDRESSES: false,
  COLLECT_PHONE_NUMBERS: false,
  COLLECT_SOCIAL_HANDLES: false,
  
  // Geographic restrictions
  ALLOWED_COUNTRIES: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK'],
  BLOCKED_COUNTRIES: ['CN', 'RU', 'IR', 'KP'], // Countries with strict data laws
  
  // Industry compliance
  GDPR_COMPLIANT: true,
  CCPA_COMPLIANT: true,
  COPPA_COMPLIANT: true
};

/**
 * Cost and budget controls
 */
export const COST_CONFIG = {
  // Ahrefs API costs (per request)
  AHREFS_COST_PER_KEYWORD: 0.002,  // $0.002 per keyword lookup
  AHREFS_COST_PER_SERP: 0.005,     // $0.005 per SERP lookup
  AHREFS_COST_PER_COMPETITOR: 0.01, // $0.01 per competitor analysis
  
  // Budget thresholds
  DAILY_BUDGET_LIMIT: 50.00,        // $50 per day
  MONTHLY_BUDGET_LIMIT: 1000.00,    // $1000 per month
  
  // Cost alerts
  BUDGET_WARNING_THRESHOLD: 0.8,    // Alert at 80% of budget
  BUDGET_CRITICAL_THRESHOLD: 0.95,  // Critical alert at 95%
  
  // Free tier limits
  FREE_TIER_KEYWORDS_PER_DAY: 100,
  FREE_TIER_COMPETITORS_PER_DAY: 10,
  FREE_TIER_PAGES_PER_DAY: 500
};

/**
 * Environment-specific configurations
 */
export const ENV_CONFIGS = {
  development: {
    // More aggressive settings for development
    enableDebugLogging: true,
    crawlDelay: 0.5,
    rateLimitPerMinute: 60,
    respectRobotsTxt: false,  // For testing only
    maxPages: 10,
    enableMetrics: true
  },
  
  staging: {
    // Conservative settings for staging
    enableDebugLogging: true,
    crawlDelay: 1,
    rateLimitPerMinute: 30,
    respectRobotsTxt: true,
    maxPages: 50,
    enableMetrics: true
  },
  
  production: {
    // Production-safe settings
    enableDebugLogging: false,
    crawlDelay: 1.5,
    rateLimitPerMinute: 20,
    respectRobotsTxt: true,
    maxPages: 100,
    enableMetrics: true,
    enableAlerts: true
  }
};

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  return ENV_CONFIGS[env as keyof typeof ENV_CONFIGS] || ENV_CONFIGS.development;
}

/**
 * Get domain-specific configuration
 */
export function getDomainConfig(domain: DomainString): Partial<ScrapeConfig> {
  // Check for exact domain match
  if (DOMAIN_SPECIFIC_CONFIG[domain]) {
    return DOMAIN_SPECIFIC_CONFIG[domain];
  }
  
  // Check for parent domain match
  for (const [configDomain, config] of Object.entries(DOMAIN_SPECIFIC_CONFIG)) {
    if (domain.endsWith(configDomain)) {
      return config;
    }
  }
  
  return {};
}

/**
 * Create optimized scraping configuration for a domain
 */
export function createOptimizedScrapeConfig(
  domain: DomainString,
  overrides: Partial<ScrapeConfig> = {}
): ScrapeConfig {
  const envConfig = getEnvironmentConfig();
  const domainConfig = getDomainConfig(domain);
  
  return {
    respectRobotsTxt: COMPLIANCE_CONFIG.RESPECT_ROBOTS_TXT,
    crawlDelay: envConfig.crawlDelay || RATE_LIMIT_CONFIG.DEFAULT_DELAY_BETWEEN_REQUESTS / 1000,
    maxPages: envConfig.maxPages || 100,
    maxDepth: 3,
    allowedPaths: [
      ...CONTENT_DISCOVERY_PATHS.BLOG_PATHS,
      ...CONTENT_DISCOVERY_PATHS.RESOURCE_PATHS,
      ...CONTENT_DISCOVERY_PATHS.LANDING_PATHS
    ],
    excludedPaths: CONTENT_DISCOVERY_PATHS.EXCLUDED_PATHS,
    userAgent: SECURITY_CONFIG.DEFAULT_USER_AGENT,
    timeout: SECURITY_CONFIG.MAX_REQUEST_TIMEOUT / 1000,
    retryAttempts: 3,
    rateLimitPerMinute: envConfig.rateLimitPerMinute || RATE_LIMIT_CONFIG.DEFAULT_REQUESTS_PER_MINUTE,
    
    // Apply domain-specific overrides
    ...domainConfig,
    
    // Apply user overrides last
    ...overrides
  };
}

/**
 * Validate scraping configuration for security and compliance
 */
export function validateScrapeConfig(config: ScrapeConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Security validations
  if (config.crawlDelay < RATE_LIMIT_CONFIG.MIN_DELAY_BETWEEN_REQUESTS / 1000) {
    errors.push(`Crawl delay too aggressive: minimum ${RATE_LIMIT_CONFIG.MIN_DELAY_BETWEEN_REQUESTS / 1000}s required`);
  }
  
  if (config.rateLimitPerMinute > RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    errors.push(`Rate limit too high: maximum ${RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE} requests/minute allowed`);
  }
  
  if (config.maxPages > 10000) {
    errors.push('Maximum pages limit exceeded: 10,000 pages maximum');
  }
  
  if (!config.respectRobotsTxt && process.env.NODE_ENV === 'production') {
    errors.push('robots.txt must be respected in production environment');
  }
  
  if (config.timeout > SECURITY_CONFIG.MAX_REQUEST_TIMEOUT / 1000) {
    warnings.push(`Request timeout is high: ${config.timeout}s (max recommended: ${SECURITY_CONFIG.MAX_REQUEST_TIMEOUT / 1000}s)`);
  }
  
  // Compliance validations
  if (!config.userAgent.includes('Bot') && !config.userAgent.includes('bot')) {
    warnings.push('User agent should clearly identify as a bot for transparency');
  }
  
  if (config.rateLimitPerMinute > 30 && config.crawlDelay < 2) {
    warnings.push('High request rate with low delay may trigger anti-bot measures');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get monitoring thresholds based on configuration
 */
export function getMonitoringThresholds(config: ScrapeConfig) {
  return {
    maxResponseTime: MONITORING_CONFIG.MAX_AVG_RESPONSE_TIME,
    minSuccessRate: MONITORING_CONFIG.MIN_SUCCESS_RATE,
    maxErrorRate: MONITORING_CONFIG.MAX_ERROR_RATE,
    budgetWarning: COST_CONFIG.BUDGET_WARNING_THRESHOLD,
    
    // Dynamic thresholds based on configuration
    expectedRequestsPerHour: config.rateLimitPerMinute * 60,
    maxDailyPages: config.maxPages * 24, // Assuming max 24 domains per day
    estimatedDailyCost: config.maxPages * 0.001 // Rough estimate
  };
}

/**
 * Export default configuration for easy imports
 */
export default {
  SECURITY_CONFIG,
  RATE_LIMIT_CONFIG,
  DOMAIN_SPECIFIC_CONFIG,
  CONTENT_DISCOVERY_PATHS,
  MONITORING_CONFIG,
  COMPLIANCE_CONFIG,
  COST_CONFIG,
  ENV_CONFIGS,
  getEnvironmentConfig,
  getDomainConfig,
  createOptimizedScrapeConfig,
  validateScrapeConfig,
  getMonitoringThresholds
};
