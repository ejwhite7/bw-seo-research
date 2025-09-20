import { NextRequest, NextResponse } from 'next/server';
import { integrations } from '@/integrations';
import { SentryReporter } from '@/utils/sentry';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const detailed = searchParams.get('detailed') === 'true';
    
    // Get health status
    const health = await integrations.getHealthStatus();
    
    // Add additional system info for detailed check
    if (detailed) {
      const metrics = integrations.getAggregatedMetrics();
      const budgetStatus = await integrations.getBudgetStatus();
      
      return NextResponse.json({
        status: 'success',
        health,
        metrics,
        budget: budgetStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    }
    
    // Simple health check response
    return NextResponse.json({
      status: health.healthy ? 'healthy' : 'unhealthy',
      overallStatus: health.overallStatus,
      services: Object.keys(health.services),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Health check error:', error);
    
    Sentry.captureException(error, {
      tags: { endpoint: 'health' },
      extra: { request: request.url }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Health check endpoint that returns appropriate HTTP status codes
export async function HEAD(request: NextRequest) {
  try {
    const health = await integrations.getHealthStatus();
    
    const status = health.overallStatus === 'healthy' ? 200 : 
                   health.overallStatus === 'degraded' ? 207 : 503;
    
    return new NextResponse(null, { 
      status,
      headers: {
        'X-Health-Status': health.overallStatus,
        'X-Services-Count': Object.keys(health.services).length.toString(),
        'X-Last-Check': health.lastHealthCheck.toString()
      }
    });
    
  } catch (error) {
    return new NextResponse(null, { 
      status: 500,
      headers: {
        'X-Health-Status': 'error'
      }
    });
  }
}