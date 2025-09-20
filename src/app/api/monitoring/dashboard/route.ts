import { NextRequest, NextResponse } from 'next/server';
import { getMonitoring, initializeMonitoring } from '../../../../lib/monitoring/index';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dashboardId = searchParams.get('dashboard') || 'system-health';
    const timeRange = searchParams.get('timeRange');
    
    // Get or initialize monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    // Get dashboard data
    const dashboardData = await monitoring.dashboard.getDashboardData(
      dashboardId,
      timeRange ? { from: timeRange, to: 'now' } : undefined
    );
    
    if (!dashboardData) {
      return NextResponse.json({
        status: 'error',
        error: 'Dashboard not found',
        message: `Dashboard '${dashboardId}' does not exist`,
        timestamp: new Date().toISOString()
      }, { status: 404 });
    }
    
    return NextResponse.json({
      status: 'success',
      data: dashboardData,
      timestamp: new Date().toISOString(),
      dashboardId
    });
    
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-dashboard',
        component: 'monitoring'
      },
      extra: { 
        request: request.url,
        searchParams: Object.fromEntries(request.nextUrl.searchParams)
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to fetch dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// POST endpoint for creating/updating dashboards
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, dashboardConfig } = body;
    
    // Get or initialize monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    switch (action) {
      case 'create':
      case 'update':
        monitoring.dashboard.createDashboard(dashboardConfig);
        break;
        
      case 'list':
        const dashboards = monitoring.dashboard.listDashboards();
        return NextResponse.json({
          status: 'success',
          data: { dashboards },
          timestamp: new Date().toISOString()
        });
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return NextResponse.json({
      status: 'success',
      message: `Dashboard ${action}d successfully`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Dashboard management error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-dashboard-post',
        component: 'monitoring'
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to manage dashboard',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}