import { NextRequest, NextResponse } from 'next/server';
import { integrations } from '../../../../integrations';
import { SentryReporter } from '../../../../utils/sentry';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const service = searchParams.get('service');
    const timeRange = searchParams.get('range') || '24h';
    
    // Get aggregated metrics
    const allMetrics = integrations.getAggregatedMetrics();
    
    // Filter by service if requested
    const metrics = service && allMetrics[service] ? 
      { [service]: allMetrics[service] } : allMetrics;
    
    // Calculate derived metrics
    const summary = Object.entries(metrics).reduce((acc, [serviceName, serviceMetrics]) => {
      const errorRate = serviceMetrics.requests > 0 ? 
        serviceMetrics.failures / serviceMetrics.requests : 0;
      
      const successRate = serviceMetrics.requests > 0 ? 
        serviceMetrics.successes / serviceMetrics.requests : 0;
      
      const avgCostPerRequest = serviceMetrics.requests > 0 ? 
        serviceMetrics.totalCost / serviceMetrics.requests : 0;
      
      acc[serviceName] = {
        ...serviceMetrics,
        errorRate: Math.round(errorRate * 10000) / 100, // Percentage with 2 decimals
        successRate: Math.round(successRate * 10000) / 100,
        avgCostPerRequest: Math.round(avgCostPerRequest * 100000) / 100000, // 5 decimal places
        uptimePercent: Math.round((1 - errorRate) * 10000) / 100,
        lastRequestAgo: serviceMetrics.lastRequest > 0 ? 
          Date.now() - serviceMetrics.lastRequest : null
      };
      
      return acc;
    }, {} as Record<string, any>);
    
    // Add totals
    const totals = Object.values(summary).reduce((acc, metrics) => {
      acc.totalRequests += metrics.requests;
      acc.totalSuccesses += metrics.successes;
      acc.totalFailures += metrics.failures;
      acc.totalCost += metrics.totalCost;
      acc.totalRateLimitHits += metrics.rateLimitHits;
      acc.totalCircuitBreakerTrips += metrics.circuitBreakerTrips;
      
      if (metrics.avgResponseTime > 0) {
        acc.avgResponseTime = (acc.avgResponseTime + metrics.avgResponseTime) / 2;
      }
      
      return acc;
    }, {
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalCost: 0,
      totalRateLimitHits: 0,
      totalCircuitBreakerTrips: 0,
      avgResponseTime: 0
    });
    
    // Report metrics to Sentry for monitoring
    Object.entries(summary).forEach(([serviceName, serviceMetrics]) => {
      SentryReporter.captureApiMetrics(serviceName, serviceMetrics);
    });
    
    return NextResponse.json({
      status: 'success',
      timeRange,
      services: summary,
      totals,
      timestamp: new Date().toISOString(),
      servicesCount: Object.keys(summary).length
    });
    
  } catch (error) {
    console.error('Metrics API error:', error);
    
    Sentry.captureException(error, {
      tags: { endpoint: 'metrics' },
      extra: { request: request.url }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Reset metrics endpoint (POST)
export async function POST(request: NextRequest) {
  try {
    const { service, confirm } = await request.json();
    
    if (!confirm) {
      return NextResponse.json({
        status: 'error',
        error: 'Confirmation required to reset metrics'
      }, { status: 400 });
    }
    
    if (service) {
      // Reset specific service metrics
      const client = service === 'ahrefs' ? integrations.getAhrefs() :
                     service === 'anthropic' ? integrations.getAnthropic() :
                     service === 'scraper' ? integrations.getScraper() : null;
      
      if (!client) {
        return NextResponse.json({
          status: 'error',
          error: `Unknown service: ${service}`
        }, { status: 400 });
      }
      
      // Clear cache for the service
      client.clearCache();
      
      Sentry.addBreadcrumb({
        message: `Metrics reset for service: ${service}`,
        level: 'info',
        category: 'metrics-reset'
      });
      
      return NextResponse.json({
        status: 'success',
        message: `Metrics reset for ${service}`,
        timestamp: new Date().toISOString()
      });
      
    } else {
      // Reset all metrics
      integrations.clearAllCaches();
      
      Sentry.addBreadcrumb({
        message: 'All service metrics reset',
        level: 'info',
        category: 'metrics-reset'
      });
      
      return NextResponse.json({
        status: 'success',
        message: 'All service metrics reset',
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Metrics reset error:', error);
    
    Sentry.captureException(error, {
      tags: { endpoint: 'metrics-reset' }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to reset metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}