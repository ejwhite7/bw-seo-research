// Integration initialization utility for Next.js app
import { integrations } from '../integrations';
import { SentryReporter } from '../utils/sentry';
import Redis from 'ioredis';
import * as Sentry from '@sentry/nextjs';

interface IntegrationEnvConfig {
  AHREFS_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  REDIS_URL?: string;
  NODE_ENV: string;
  ENABLE_AHREFS?: string;
  ENABLE_ANTHROPIC?: string;
  ENABLE_SCRAPER?: string;
}

let redis: Redis | undefined;
let initialized = false;

/**
 * Initialize all external API integrations
 * Call this once during app startup
 */
export async function initializeIntegrations(config?: Partial<IntegrationEnvConfig>): Promise<void> {
  if (initialized) {
    console.log('Integrations already initialized');
    return;
  }
  
  try {
    const env: IntegrationEnvConfig = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      AHREFS_API_KEY: process.env.AHREFS_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      REDIS_URL: process.env.REDIS_URL,
      ENABLE_AHREFS: process.env.ENABLE_AHREFS || 'true',
      ENABLE_ANTHROPIC: process.env.ENABLE_ANTHROPIC || 'true',
      ENABLE_SCRAPER: process.env.ENABLE_SCRAPER || 'true',
      ...config
    };
    
    console.log('🚀 Initializing external API integrations...');
    
    // Initialize Redis if URL is provided
    if (env.REDIS_URL) {
      try {
        redis = new Redis(env.REDIS_URL, {
          retryDelayOnFailover: 100,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          lazyConnect: true
        } as import('ioredis').RedisOptions);
        
        // Test Redis connection
        await redis.ping();
        console.log('✓ Redis connection established');
        
        // Set up Redis error handling
        redis.on('error', (error) => {
          console.warn('Redis connection error:', error.message);
          Sentry.captureException(error, { 
            tags: { component: 'redis' },
            level: 'warning' 
          });
        });
        
        redis.on('reconnecting', () => {
          console.log('Redis reconnecting...');
        });
        
        redis.on('ready', () => {
          console.log('✓ Redis connection ready');
        });
        
      } catch (redisError) {
        console.warn('Redis initialization failed, continuing without Redis:', (redisError as Error).message);
        redis = undefined;
      }
    }
    
    // Initialize integrations
    integrations.initialize({
      ahrefs: {
        apiKey: env.AHREFS_API_KEY || '',
        enabled: env.ENABLE_AHREFS === 'true' && !!env.AHREFS_API_KEY
      },
      anthropic: {
        apiKey: env.ANTHROPIC_API_KEY || '',
        enabled: env.ENABLE_ANTHROPIC === 'true' && !!env.ANTHROPIC_API_KEY
      },
      scraper: {
        enabled: env.ENABLE_SCRAPER === 'true'
      },
      redis
    });
    
    // Perform initial health check
    const health = await integrations.getHealthStatus(false);
    
    console.log('🔍 Integration health check:');
    if (health && health.services) {
      Object.entries(health.services).forEach(([service, status]) => {
        if (status && typeof status === 'object' && 'healthy' in status) {
          const icon = status.healthy ? '✓' : '✗';
          console.log(`${icon} ${service}: ${status.healthy ? 'healthy' : 'unhealthy'}`);
          
          if (!status.healthy && 'issues' in status && Array.isArray(status.issues)) {
            console.log(`  Issues: ${status.issues.join(', ')}`);
          }
        }
      });
    }
    
    console.log(`📊 Overall status: ${health?.overallStatus || 'unknown'}`);
    
    // Report initialization to Sentry
    Sentry.addBreadcrumb({
      message: 'External API integrations initialized',
      level: 'info',
      category: 'initialization',
      data: {
        services: health?.services ? Object.keys(health.services) : [],
        overallStatus: health?.overallStatus || 'unknown',
        hasRedis: !!redis,
        environment: env.NODE_ENV
      }
    });
    
    // Set up graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      
      try {
        await integrations.shutdown();
        
        if (redis) {
          await redis.quit();
          console.log('✓ Redis connection closed');
        }
        
        console.log('✓ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', (error as Error).message);
        process.exit(1);
      }
    };
    
    // Handle various termination signals
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart
    
    initialized = true;
    console.log('🎉 Integration initialization complete\n');
    
  } catch (error) {
    console.error('❌ Failed to initialize integrations:', error);
    
    Sentry.captureException(error, {
      tags: { 
        component: 'initialization',
        critical: true
      }
    });
    
    throw error;
  }
}

/**
 * Get the current Redis instance (if available)
 */
export function getRedis(): Redis | undefined {
  return redis;
}

/**
 * Check if integrations are properly initialized
 */
export function areIntegrationsInitialized(): boolean {
  return initialized;
}

/**
 * Get initialization status and available services
 */
export function getInitializationStatus(): {
  initialized: boolean;
  services: {
    ahrefs: boolean;
    anthropic: boolean;
    scraper: boolean;
  };
  redis: boolean;
} {
  return {
    initialized,
    services: {
      ahrefs: integrations.isAvailable('ahrefs'),
      anthropic: integrations.isAvailable('anthropic'),
      scraper: integrations.isAvailable('scraper')
    },
    redis: !!redis
  };
}

/**
 * Force re-initialization (useful for configuration changes)
 */
export async function reinitializeIntegrations(config?: Partial<IntegrationEnvConfig>): Promise<void> {
  console.log('🔄 Reinitializing integrations...');
  
  try {
    // Shutdown existing integrations
    await integrations.shutdown();
    
    if (redis) {
      await redis.quit();
      redis = undefined;
    }
    
    initialized = false;
    
    // Reinitialize
    await initializeIntegrations(config);
    
  } catch (error) {
    console.error('Failed to reinitialize integrations:', error);
    throw error;
  }
}

/**
 * Middleware to ensure integrations are initialized before API requests
 */
export async function ensureIntegrationsInitialized(): Promise<void> {
  if (!initialized) {
    await initializeIntegrations();
  }
}

/**
 * Development helper to test all integrations
 */
export async function testIntegrations(): Promise<{
  ahrefs?: any;
  anthropic?: any;
  scraper?: any;
  redis?: any;
}> {
  if (!initialized) {
    throw new Error('Integrations not initialized');
  }
  
  const results: any = {};
  
  // Test Ahrefs
  if (integrations.isAvailable('ahrefs')) {
    try {
      const ahrefs = integrations.getAhrefs();
      const quotaStatus = await ahrefs.getQuotaStatus();
      results.ahrefs = {
        status: 'available',
        quota: quotaStatus,
        metrics: ahrefs.getMetrics()
      };
    } catch (error) {
      results.ahrefs = {
        status: 'error',
        error: (error as Error).message
      };
    }
  }
  
  // Test Anthropic
  if (integrations.isAvailable('anthropic')) {
    try {
      const anthropic = integrations.getAnthropic();
      const costEstimate = anthropic.estimateCost('classify', 10);
      results.anthropic = {
        status: 'available',
        costEstimate,
        metrics: anthropic.getMetrics()
      };
    } catch (error) {
      results.anthropic = {
        status: 'error',
        error: (error as Error).message
      };
    }
  }
  
  // Test Scraper
  if (integrations.isAvailable('scraper')) {
    try {
      const scraper = integrations.getScraper();
      results.scraper = {
        status: 'available',
        metrics: scraper.getMetrics()
      };
    } catch (error) {
      results.scraper = {
        status: 'error',
        error: (error as Error).message
      };
    }
  }
  
  // Test Redis
  if (redis) {
    try {
      const pong = await redis.ping();
      results.redis = {
        status: pong === 'PONG' ? 'available' : 'error',
        info: await redis.info('server')
      };
    } catch (error) {
      results.redis = {
        status: 'error',
        error: (error as Error).message
      };
    }
  }
  
  return results;
}