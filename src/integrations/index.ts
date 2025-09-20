// Integration factory and health monitoring
import { AhrefsClient } from './ahrefs';
import { AnthropicClient } from './anthropic';
import { WebScraper } from './scraper';
import { ApiMetrics } from '../types/api';
import { SentryReporter } from '../utils/sentry';
import * as Sentry from '@sentry/nextjs';

export interface IntegrationConfig {
  ahrefs?: {
    apiKey: string;
    enabled: boolean;
  };
  anthropic?: {
    apiKey: string;
    enabled: boolean;
  };
  scraper?: {
    enabled: boolean;
  };
  redis?: any; // ioredis instance
}

export interface IntegrationHealth {
  healthy: boolean;
  services: {
    ahrefs?: {
      healthy: boolean;
      issues: string[];
      metrics: ApiMetrics;
      lastChecked: number;
    };
    anthropic?: {
      healthy: boolean;
      issues: string[];
      metrics: ApiMetrics;
      lastChecked: number;
    };
    scraper?: {
      healthy: boolean;
      issues: string[];
      metrics: ApiMetrics;
      lastChecked: number;
    };
  };
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: number;
}

export class IntegrationFactory {
  private static instance: IntegrationFactory | null = null;
  private ahrefs: AhrefsClient | null = null;
  private anthropic: AnthropicClient | null = null;
  private scraper: WebScraper | null = null;
  private config: IntegrationConfig | null = null;
  private healthCache: IntegrationHealth | null = null;
  private healthCacheExpiry: number = 0;
  
  private constructor() {}
  
  public static getInstance(): IntegrationFactory {
    if (!this.instance) {
      this.instance = new IntegrationFactory();
    }
    return this.instance;
  }
  
  /**
   * Initialize all integrations with configuration
   */
  public initialize(config: IntegrationConfig): void {
    this.config = config;
    
    // Initialize Ahrefs if configured
    if (config.ahrefs?.enabled && config.ahrefs.apiKey) {
      try {
        this.ahrefs = AhrefsClient.getInstance(config.ahrefs.apiKey, config.redis);
        console.log('✓ Ahrefs integration initialized');
      } catch (error) {
        console.error('✗ Failed to initialize Ahrefs:', (error as Error).message);
        Sentry.captureException(error, { tags: { integration: 'ahrefs' } });
      }
    }
    
    // Initialize Anthropic if configured
    if (config.anthropic?.enabled && config.anthropic.apiKey) {
      try {
        this.anthropic = AnthropicClient.getInstance(config.anthropic.apiKey, config.redis);
        console.log('✓ Anthropic integration initialized');
      } catch (error) {
        console.error('✗ Failed to initialize Anthropic:', (error as Error).message);
        Sentry.captureException(error, { tags: { integration: 'anthropic' } });
      }
    }
    
    // Initialize Scraper if enabled
    if (config.scraper?.enabled) {
      try {
        this.scraper = WebScraper.getInstance(config.redis);
        console.log('✓ Web scraper integration initialized');
      } catch (error) {
        console.error('✗ Failed to initialize Web scraper:', (error as Error).message);
        Sentry.captureException(error, { tags: { integration: 'scraper' } });
      }
    }
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    Sentry.addBreadcrumb({
      message: 'Integrations initialized',
      level: 'info',
      category: 'integration-setup',
      data: {
        ahrefs: !!this.ahrefs,
        anthropic: !!this.anthropic,
        scraper: !!this.scraper
      }
    });
  }
  
  /**
   * Get Ahrefs client instance
   */
  public getAhrefs(): AhrefsClient {
    if (!this.ahrefs) {
      throw new Error('Ahrefs integration not initialized. Check configuration.');
    }
    return this.ahrefs;
  }
  
  /**
   * Get Anthropic client instance
   */
  public getAnthropic(): AnthropicClient {
    if (!this.anthropic) {
      throw new Error('Anthropic integration not initialized. Check configuration.');
    }
    return this.anthropic;
  }
  
  /**
   * Get Web scraper instance
   */
  public getScraper(): WebScraper {
    if (!this.scraper) {
      throw new Error('Web scraper integration not initialized. Check configuration.');
    }
    return this.scraper;
  }
  
  /**
   * Check if a specific integration is available
   */
  public isAvailable(service: 'ahrefs' | 'anthropic' | 'scraper'): boolean {
    switch (service) {
      case 'ahrefs':
        return !!this.ahrefs;
      case 'anthropic':
        return !!this.anthropic;
      case 'scraper':
        return !!this.scraper;
      default:
        return false;
    }
  }
  
  /**
   * Get comprehensive health status of all integrations
   */
  public async getHealthStatus(useCache: boolean = true): Promise<IntegrationHealth> {
    // Return cached result if available and fresh
    if (useCache && this.healthCache && Date.now() < this.healthCacheExpiry) {
      return this.healthCache;
    }
    
    const health: IntegrationHealth = {
      healthy: true,
      services: {},
      overallStatus: 'healthy',
      lastHealthCheck: Date.now()
    };
    
    const healthChecks: Promise<any>[] = [];
    
    // Check Ahrefs health
    if (this.ahrefs) {
      healthChecks.push(
        this.ahrefs.healthCheck()
          .then(result => {
            health.services.ahrefs = {
              ...result,
              lastChecked: Date.now()
            };
          })
          .catch(error => {
            health.services.ahrefs = {
              healthy: false,
              issues: [error.message],
              metrics: this.ahrefs!.getMetrics(),
              lastChecked: Date.now()
            };
          })
      );
    }
    
    // Check Anthropic health
    if (this.anthropic) {
      healthChecks.push(
        this.anthropic.healthCheck()
          .then(result => {
            health.services.anthropic = {
              ...result,
              lastChecked: Date.now()
            };
          })
          .catch(error => {
            health.services.anthropic = {
              healthy: false,
              issues: [error.message],
              metrics: this.anthropic!.getMetrics(),
              lastChecked: Date.now()
            };
          })
      );
    }
    
    // Check Scraper health
    if (this.scraper) {
      healthChecks.push(
        this.scraper.healthCheck()
          .then(result => {
            health.services.scraper = {
              ...result,
              lastChecked: Date.now()
            };
          })
          .catch(error => {
            health.services.scraper = {
              healthy: false,
              issues: [error.message],
              metrics: this.scraper!.getMetrics(),
              lastChecked: Date.now()
            };
          })
      );
    }
    
    // Wait for all health checks
    await Promise.all(healthChecks);
    
    // Determine overall status
    const serviceStatuses = Object.values(health.services);
    const healthyCount = serviceStatuses.filter(s => s.healthy).length;
    const totalCount = serviceStatuses.length;
    
    if (healthyCount === totalCount) {
      health.overallStatus = 'healthy';
    } else if (healthyCount > totalCount / 2) {
      health.overallStatus = 'degraded';
    } else {
      health.overallStatus = 'unhealthy';
    }
    
    health.healthy = health.overallStatus === 'healthy';
    
    // Cache result for 30 seconds
    this.healthCache = health;
    this.healthCacheExpiry = Date.now() + 30000;
    
    // Report health status to Sentry
    if (health.overallStatus !== 'healthy') {
      SentryReporter.captureApiMetrics('integration_health', {
        requests: totalCount,
        successes: healthyCount,
        failures: totalCount - healthyCount,
        avgResponseTime: 0,
        totalCost: 0,
        lastRequest: Date.now(),
        rateLimitHits: 0,
        circuitBreakerTrips: 0
      });
    }
    
    return health;
  }
  
  /**
   * Get aggregated metrics from all integrations
   */
  public getAggregatedMetrics(): Record<string, ApiMetrics> {
    const metrics: Record<string, ApiMetrics> = {};
    
    if (this.ahrefs) {
      metrics.ahrefs = this.ahrefs.getMetrics();
    }
    
    if (this.anthropic) {
      metrics.anthropic = this.anthropic.getMetrics();
    }
    
    if (this.scraper) {
      metrics.scraper = this.scraper.getMetrics();
    }
    
    return metrics;
  }
  
  /**
   * Clear all caches across integrations
   */
  public clearAllCaches(): void {
    if (this.ahrefs) {
      this.ahrefs.clearCache();
    }
    
    if (this.anthropic) {
      this.anthropic.clearCache();
    }
    
    if (this.scraper) {
      this.scraper.clearCache();
    }
    
    // Clear health cache
    this.healthCache = null;
    this.healthCacheExpiry = 0;
    
    console.log('All integration caches cleared');
  }
  
  /**
   * Get budget status across all services
   */
  public async getBudgetStatus(): Promise<{
    totalSpent: number;
    budgetsByService: Record<string, {
      spent: number;
      estimated: number;
      remaining?: number;
    }>;
    alerts: Array<{
      service: string;
      message: string;
      level: 'warning' | 'critical';
    }>;
  }> {
    const metrics = this.getAggregatedMetrics();
    const alerts: Array<{ service: string; message: string; level: 'warning' | 'critical' }> = [];
    
    let totalSpent = 0;
    const budgetsByService: Record<string, any> = {};
    
    for (const [service, serviceMetrics] of Object.entries(metrics)) {
      const spent = serviceMetrics.totalCost;
      totalSpent += spent;
      
      budgetsByService[service] = {
        spent,
        estimated: spent * 1.1 // Estimate 10% more for current period
      };
      
      // Generate alerts based on spending patterns
      if (spent > 10) { // Alert if spending more than $10
        alerts.push({
          service,
          message: `High spending detected: $${spent.toFixed(2)}`,
          level: spent > 50 ? 'critical' : 'warning'
        });
      }
      
      if (serviceMetrics.rateLimitHits > 0) {
        alerts.push({
          service,
          message: `${serviceMetrics.rateLimitHits} rate limit hits may indicate inefficient usage`,
          level: 'warning'
        });
      }
    }
    
    return {
      totalSpent,
      budgetsByService,
      alerts
    };
  }
  
  /**
   * Start background health monitoring
   */
  private startHealthMonitoring(): void {
    // Check health every 5 minutes
    setInterval(async () => {
      try {
        const health = await this.getHealthStatus(false); // Force fresh check
        
        if (health.overallStatus === 'unhealthy') {
          Sentry.captureMessage(
            `Integration health check failed: ${Object.values(health.services)
              .filter(s => !s.healthy)
              .map(s => s.issues.join(', '))
              .join('; ')}`,
            'error'
          );
        }
        
        // Report metrics to Sentry
        Object.entries(health.services).forEach(([service, status]) => {
          SentryReporter.captureApiMetrics(service, status.metrics);
        });
        
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✓ Health monitoring started (5-minute intervals)');
  }
  
  /**
   * Graceful shutdown of all integrations
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down integrations...');
    
    // Clear any pending intervals/timers
    // Note: In production, you'd want to track and clear these properly
    
    // Clear caches
    this.clearAllCaches();
    
    // Reset instances
    this.ahrefs = null;
    this.anthropic = null;
    this.scraper = null;
    this.config = null;
    
    console.log('✓ Integrations shutdown complete');
  }
}

// Convenience exports
export const integrations = IntegrationFactory.getInstance();

// Export individual clients for direct import
export { AhrefsClient } from './ahrefs';
export { AnthropicClient } from './anthropic';
export { WebScraper } from './scraper';

// Export new keyword provider clients
export { MozClient, createMozClient, isMozConfigured } from './moz';
export { SEMRushClient, createSEMRushClient, isSEMRushConfigured } from './semrush';
export { KeywordProvider, getKeywordProvider, getAvailableProviders } from './keyword-provider';

// Export types
export * from '../types/ahrefs';
export * from '../types/anthropic';
export * from '../types/api';