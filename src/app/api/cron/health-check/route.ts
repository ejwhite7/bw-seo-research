import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Health check cron - monitors system health and sends alerts
export async function GET(): Promise<NextResponse> {
  // Verify this is a Vercel Cron request
  const headersList = await headers();
  const cronSecret = headersList.get('authorization');
  const userAgent = headersList.get('user-agent');
  
  // Check if request is from Vercel Cron
  if (!userAgent?.includes('vercel-cron') && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Unauthorized - This endpoint is for Vercel Cron only' },
      { status: 401 }
    );
  }
  
  // Verify cron secret if set
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized - Invalid cron secret' },
      { status: 401 }
    );
  }
  
  try {
    const startTime = Date.now();
    const healthResults = {
      services: {} as Record<string, unknown>,
      alerts: [] as Array<{
        service: string;
        level: string;
        message: string;
        threshold?: number;
        error?: string;
      }>,
      metrics: {} as Record<string, unknown>,
      overallStatus: 'healthy' as string
    };
    
    // Comprehensive health checks
    const healthChecks = [
      // Check Redis connectivity and performance
      async () => {
        try {
          // TODO: Implement actual Redis health check
          // const redis = RedisService.getInstance();
          // const pingStart = Date.now();
          // await redis.ping();
          // const pingTime = Date.now() - pingStart;
          
          const pingTime = Math.floor(Math.random() * 50) + 10; // Mock
          
          healthResults.services['redis'] = {
            status: pingTime < 100 ? 'healthy' : 'degraded',
            responseTime: pingTime,
            connections: Math.floor(Math.random() * 20) + 5,
            memoryUsage: Math.floor(Math.random() * 1024) + 256
          };
          
          if (pingTime > 100) {
            healthResults.alerts.push({
              service: 'redis',
              level: 'warning',
              message: `High Redis response time: ${pingTime}ms`,
              threshold: 100
            });
          }
        } catch (error) {
          healthResults.services['redis'] = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          healthResults.alerts.push({
            service: 'redis',
            level: 'critical',
            message: 'Redis connection failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
      
      // Check Supabase connectivity
      async () => {
        try {
          // TODO: Implement actual Supabase health check
          // const supabase = SupabaseService.getInstance();
          // const queryStart = Date.now();
          // const { data, error } = await supabase.from('health_check').select('1').limit(1);
          // const queryTime = Date.now() - queryStart;
          
          const queryTime = Math.floor(Math.random() * 200) + 50; // Mock
          
          healthResults.services['supabase'] = {
            status: queryTime < 300 ? 'healthy' : 'degraded',
            responseTime: queryTime,
            url: process.env.NEXT_PUBLIC_SUPABASE_URL
          };
          
          if (queryTime > 300) {
            healthResults.alerts.push({
              service: 'supabase',
              level: 'warning',
              message: `High Supabase response time: ${queryTime}ms`,
              threshold: 300
            });
          }
        } catch (error) {
          healthResults.services['supabase'] = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          healthResults.alerts.push({
            service: 'supabase',
            level: 'critical',
            message: 'Supabase connection failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
      
      // Check external API health
      async () => {
        try {
          // Check Anthropic API
          if (process.env.ANTHROPIC_API_KEY) {
            // Mock health check
            const isHealthy = Math.random() > 0.1; // 90% healthy
            healthResults.services['anthropic'] = {
              status: isHealthy ? 'healthy' : 'degraded',
              configured: true
            };
          } else {
            healthResults.services['anthropic'] = {
              status: 'not-configured',
              configured: false
            };
          }
          
          // Check Ahrefs API
          if (process.env.AHREFS_API_KEY) {
            // Mock health check
            const isHealthy = Math.random() > 0.05; // 95% healthy
            healthResults.services['ahrefs'] = {
              status: isHealthy ? 'healthy' : 'degraded',
              configured: true
            };
          } else {
            healthResults.services['ahrefs'] = {
              status: 'not-configured',
              configured: false
            };
          }
        } catch (error) {
          healthResults.alerts.push({
            service: 'external-apis',
            level: 'warning',
            message: 'External API health check failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
      
      // Check system metrics
      async () => {
        try {
          const memoryUsage = process.memoryUsage();
          const cpuUsage = process.cpuUsage();
          const uptime = process.uptime();
          
          healthResults.metrics = {
            memory: {
              used: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
              total: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
              external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100, // MB
              rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100 // MB
            },
            cpu: {
              user: Math.round(cpuUsage.user / 1000 * 100) / 100, // ms
              system: Math.round(cpuUsage.system / 1000 * 100) / 100 // ms
            },
            uptime: Math.round(uptime * 100) / 100, // seconds
            timestamp: new Date().toISOString()
          };
          
          // Check memory usage alerts
          const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
          if (memoryUsagePercent > 90) {
            healthResults.alerts.push({
              service: 'system',
              level: 'critical',
              message: `High memory usage: ${Math.round(memoryUsagePercent)}%`,
              threshold: 90
            });
          } else if (memoryUsagePercent > 75) {
            healthResults.alerts.push({
              service: 'system',
              level: 'warning',
              message: `Elevated memory usage: ${Math.round(memoryUsagePercent)}%`,
              threshold: 75
            });
          }
        } catch (error) {
          healthResults.alerts.push({
            service: 'system-metrics',
            level: 'warning',
            message: 'Failed to collect system metrics',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    ];
    
    // Execute all health checks in parallel
    await Promise.allSettled(healthChecks.map(check => check()));
    
    // Determine overall status
    const serviceStatuses = Object.values(healthResults.services).map((service: unknown) => {
      return (service as { status?: string })?.status;
    });
    const criticalAlerts = healthResults.alerts.filter(alert => alert.level === 'critical');
    const warningAlerts = healthResults.alerts.filter(alert => alert.level === 'warning');
    
    if (criticalAlerts.length > 0 || serviceStatuses.includes('unhealthy')) {
      healthResults.overallStatus = 'unhealthy';
    } else if (warningAlerts.length > 0 || serviceStatuses.includes('degraded')) {
      healthResults.overallStatus = 'degraded';
    } else {
      healthResults.overallStatus = 'healthy';
    }
    
    const duration = Date.now() - startTime;
    
    // Send alerts if there are any critical issues
    if (criticalAlerts.length > 0) {
      await sendHealthAlerts(criticalAlerts);
    }
    
    // Log health check results
    console.log('Health check completed:', {
      status: healthResults.overallStatus,
      duration,
      servicesChecked: Object.keys(healthResults.services).length,
      alertsFound: healthResults.alerts.length,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({
      status: 'success',
      message: 'Health check completed',
      duration,
      health: healthResults,
      timestamp: new Date().toISOString(),
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
      deployment: {
        id: process.env.VERCEL_DEPLOYMENT_ID,
        region: process.env.VERCEL_REGION,
        url: process.env.VERCEL_URL
      }
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    
    // Send critical alert for health check failure
    await sendHealthAlerts([{
      service: 'health-check',
      level: 'critical',
      message: 'Health check system failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }]);
    
    return NextResponse.json({
      status: 'error',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Helper function to send health alerts
async function sendHealthAlerts(alerts: Array<{
  service: string;
  level: string;
  message: string;
  threshold?: number;
  error?: string;
}>): Promise<void> {
  try {
    // Send Slack notifications if webhook is configured
    if (process.env.SLACK_WEBHOOK_URL) {
      const slackPayload = {
        text: '🚨 Dream 100 Keyword Engine Health Alert',
        attachments: alerts.map(alert => ({
          color: alert.level === 'critical' ? 'danger' : 'warning',
          fields: [
            {
              title: 'Service',
              value: alert.service,
              short: true
            },
            {
              title: 'Level',
              value: alert.level.toUpperCase(),
              short: true
            },
            {
              title: 'Message',
              value: alert.message,
              short: false
            }
          ],
          footer: 'Vercel Health Monitor',
          ts: Math.floor(Date.now() / 1000)
        }))
      };
      
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackPayload)
      });
    }
    
    // TODO: Add email notifications, PagerDuty, etc.
    
  } catch (error) {
    console.error('Failed to send health alerts:', error);
  }
}
