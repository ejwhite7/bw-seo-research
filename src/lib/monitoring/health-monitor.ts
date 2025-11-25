import { HealthStatus } from './types';
import { MonitoringConfig } from './config';
import { AlertManager } from './alert-manager';
import * as Sentry from '@sentry/nextjs';
import { DEFAULT_ANTHROPIC_MODEL } from '../../integrations/anthropic';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime?: number;
  errorRate?: number;
  consecutiveFailures: number;
  details?: Record<string, any>;
  dependencies?: ServiceHealth[];
}

interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; details?: any; responseTime?: number }>;
  timeout: number;
  interval: number;
  retries: number;
}

export class HealthMonitor {
  private config: MonitoringConfig;
  private alertManager: AlertManager;
  private services: Map<string, ServiceHealth> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  constructor(config: MonitoringConfig, alertManager: AlertManager) {
    this.config = config;
    this.alertManager = alertManager;
    
    this.initializeDefaultHealthChecks();
    this.startHealthChecks();
  }

  private initializeDefaultHealthChecks(): void {
    // Database health check
    this.addHealthCheck({
      name: 'database',
      check: async () => {
        try {
          const startTime = Date.now();
          // Simple query to test database connectivity
          // This would be replaced with actual database query
          await new Promise(resolve => setTimeout(resolve, 10));
          const responseTime = Date.now() - startTime;
          
          return {
            healthy: true,
            responseTime,
            details: {
              connectionPool: 'healthy',
              activeConnections: 5,
              maxConnections: 20
            }
          };
        } catch (error) {
          return {
            healthy: false,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
      },
      timeout: 5000,
      interval: 30000, // 30 seconds
      retries: 3
    });

    // Redis health check
    this.addHealthCheck({
      name: 'redis',
      check: async () => {
        try {
          const startTime = Date.now();
          // Redis ping command
          // This would be replaced with actual Redis ping
          await new Promise(resolve => setTimeout(resolve, 5));
          const responseTime = Date.now() - startTime;
          
          return {
            healthy: true,
            responseTime,
            details: {
              status: 'connected',
              memoryUsage: '45MB',
              connectedClients: 3
            }
          };
        } catch (error) {
          return {
            healthy: false,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
      },
      timeout: 3000,
      interval: 30000,
      retries: 2
    });

    // External API health checks
    this.addHealthCheck({
      name: 'ahrefs_api',
      check: async () => {
        try {
          const startTime = Date.now();
          // Mock API health check - would be actual API call
          const healthy = Math.random() > 0.1; // 90% success rate
          const responseTime = Date.now() - startTime + Math.random() * 100;
          
          return {
            healthy,
            responseTime,
            details: {
              endpoint: 'https://apiv2.ahrefs.com',
              quota: {
                remaining: 8500,
                limit: 10000,
                resetDate: new Date(Date.now() + 86400000).toISOString()
              }
            }
          };
        } catch (error) {
          return {
            healthy: false,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
      },
      timeout: 10000,
      interval: 60000, // 1 minute
      retries: 2
    });

    this.addHealthCheck({
      name: 'anthropic_api',
      check: async () => {
        try {
          const startTime = Date.now();
          // Mock API health check
          const healthy = Math.random() > 0.05; // 95% success rate
          const responseTime = Date.now() - startTime + Math.random() * 200;
          
          return {
            healthy,
            responseTime,
            details: {
              endpoint: 'https://api.anthropic.com',
              model: DEFAULT_ANTHROPIC_MODEL,
              quotaStatus: 'healthy'
            }
          };
        } catch (error) {
          return {
            healthy: false,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
      },
      timeout: 15000,
      interval: 60000,
      retries: 2
    });

    // Application-specific health checks
    this.addHealthCheck({
      name: 'keyword_processing',
      check: async () => {
        try {
          // Check if keyword processing is working
          const queueHealth = await this.checkQueueHealth();
          const processingHealth = await this.checkProcessingHealth();
          
          return {
            healthy: queueHealth.healthy && processingHealth.healthy,
            details: {
              queue: queueHealth,
              processing: processingHealth
            }
          };
        } catch (error) {
          return {
            healthy: false,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
      },
      timeout: 5000,
      interval: 45000,
      retries: 1
    });
  }

  addHealthCheck(healthCheck: HealthCheck): void {
    this.healthChecks.set(healthCheck.name, healthCheck);
    
    // Initialize service health
    this.services.set(healthCheck.name, {
      name: healthCheck.name,
      status: 'healthy',
      lastCheck: new Date(),
      consecutiveFailures: 0
    });
    
    // Start the health check interval
    this.startHealthCheck(healthCheck.name);
  }

  removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    this.services.delete(name);
    
    const interval = this.checkIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }
  }

  private startHealthChecks(): void {
    if (!this.config.healthMonitoring.enabled) return;
    
    this.healthChecks.forEach((_, name) => {
      this.startHealthCheck(name);
    });
  }

  private startHealthCheck(name: string): void {
    const healthCheck = this.healthChecks.get(name);
    if (!healthCheck) return;
    
    // Clear existing interval if any
    const existingInterval = this.checkIntervals.get(name);
    if (existingInterval) {
      clearInterval(existingInterval);
    }
    
    // Start new interval
    const interval = setInterval(async () => {
      await this.performHealthCheck(name);
    }, healthCheck.interval);
    
    this.checkIntervals.set(name, interval);
    
    // Perform initial check
    this.performHealthCheck(name);
  }

  private async performHealthCheck(name: string): Promise<void> {
    const healthCheck = this.healthChecks.get(name);
    const service = this.services.get(name);
    
    if (!healthCheck || !service) return;
    
    let attempt = 0;
    let lastError: any;
    
    while (attempt < healthCheck.retries) {
      try {
        const startTime = Date.now();
        
        // Run health check with timeout
        const result = await Promise.race([
          healthCheck.check(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), healthCheck.timeout)
          )
        ]);
        
        const responseTime = Date.now() - startTime;
        
        // Update service health
        service.status = result.healthy ? 'healthy' : 'unhealthy';
        service.lastCheck = new Date();
        service.responseTime = result.responseTime || responseTime;
        service.details = result.details;
        service.consecutiveFailures = result.healthy ? 0 : service.consecutiveFailures + 1;
        
        // Alert on health changes
        if (!result.healthy && service.consecutiveFailures === 1) {
          this.alertManager.triggerAlert({
            type: 'health_check',
            severity: 'warning',
            message: `Service ${name} is unhealthy`,
            metadata: {
              service: name,
              details: result.details,
              responseTime: service.responseTime
            }
          });
        } else if (result.healthy && service.consecutiveFailures > 0) {
          // Service recovered
          this.alertManager.triggerAlert({
            type: 'health_recovery',
            severity: 'info',
            message: `Service ${name} has recovered`,
            metadata: {
              service: name,
              downDuration: service.consecutiveFailures * healthCheck.interval
            }
          });
        }
        
        // Send to Sentry
        Sentry.addBreadcrumb({
          message: `Health check: ${name}`,
          level: result.healthy ? 'info' : 'warning',
          category: 'health_check',
          data: {
            service: name,
            healthy: result.healthy,
            responseTime: service.responseTime,
            consecutiveFailures: service.consecutiveFailures
          }
        });
        
        break; // Success, exit retry loop
        
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt < healthCheck.retries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // If all attempts failed
    if (attempt >= healthCheck.retries) {
      service.status = 'unhealthy';
      service.lastCheck = new Date();
      service.consecutiveFailures++;
      service.details = {
        error: lastError instanceof Error ? lastError.message : 'Unknown error',
        attempts: attempt
      };
      
      // Alert on persistent failures
      if (service.consecutiveFailures >= 3) {
        this.alertManager.triggerAlert({
          type: 'health_check',
          severity: 'critical',
          message: `Service ${name} has been unhealthy for ${service.consecutiveFailures} consecutive checks`,
          metadata: {
            service: name,
            consecutiveFailures: service.consecutiveFailures,
            error: service.details.error
          }
        });
      }
    }
    
    // Update overall health
    this.updateOverallHealth();
  }

  private updateOverallHealth(): void {
    const services = Array.from(this.services.values());
    
    if (services.length === 0) {
      this.overallHealth = 'healthy';
      return;
    }
    
    const unhealthyServices = services.filter(s => s.status === 'unhealthy');
    const degradedServices = services.filter(s => s.status === 'degraded');
    
    if (unhealthyServices.length > 0) {
      this.overallHealth = 'unhealthy';
    } else if (degradedServices.length > 0) {
      this.overallHealth = 'degraded';
    } else {
      this.overallHealth = 'healthy';
    }
  }

  private async checkQueueHealth(): Promise<{ healthy: boolean; details: any }> {
    // Mock queue health check
    return {
      healthy: true,
      details: {
        pending: 5,
        processing: 2,
        failed: 0,
        avgProcessingTime: 2500
      }
    };
  }

  private async checkProcessingHealth(): Promise<{ healthy: boolean; details: any }> {
    // Mock processing health check
    return {
      healthy: true,
      details: {
        activeRuns: 3,
        completedToday: 45,
        failureRate: 0.02,
        avgKeywordsPerMinute: 150
      }
    };
  }

  getHealthStatus(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, HealthStatus>;
    lastUpdate: Date;
  } {
    const servicesStatus: Record<string, HealthStatus> = {};
    
    this.services.forEach((service, name) => {
      servicesStatus[name] = {
        service: name,
        status: service.status,
        lastCheck: service.lastCheck,
        responseTime: service.responseTime,
        errorRate: service.consecutiveFailures > 0 ? service.consecutiveFailures / 10 : 0,
        details: service.details
      };
    });
    
    return {
      overall: this.overallHealth,
      services: servicesStatus,
      lastUpdate: new Date()
    };
  }

  getServiceHealth(serviceName: string): HealthStatus | null {
    const service = this.services.get(serviceName);
    if (!service) return null;
    
    return {
      service: serviceName,
      status: service.status,
      lastCheck: service.lastCheck,
      responseTime: service.responseTime,
      errorRate: service.consecutiveFailures > 0 ? service.consecutiveFailures / 10 : 0,
      details: service.details
    };
  }

  getHealthSummary(timeWindow: number = 3600000): {
    uptime: number;
    availability: number;
    avgResponseTime: number;
    healthyServices: number;
    totalServices: number;
    incidentCount: number;
  } {
    const services = Array.from(this.services.values());
    const healthyServices = services.filter(s => s.status === 'healthy').length;
    const totalResponseTime = services.reduce((sum, s) => sum + (s.responseTime || 0), 0);
    
    return {
      uptime: this.overallHealth === 'healthy' ? 100 : 95, // Simplified calculation
      availability: healthyServices / services.length * 100,
      avgResponseTime: services.length > 0 ? totalResponseTime / services.length : 0,
      healthyServices,
      totalServices: services.length,
      incidentCount: services.filter(s => s.consecutiveFailures > 0).length
    };
  }

  destroy(): void {
    // Clear all intervals
    this.checkIntervals.forEach(interval => clearInterval(interval));
    this.checkIntervals.clear();
  }
}