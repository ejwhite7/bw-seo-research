import { NextRequest, NextResponse } from 'next/server';
import { getCacheSystem, ensureCacheSystem } from '../../../../lib/cache-init';

/**
 * Cache status and health check endpoint
 */
export async function GET() {
  try {
    // Ensure cache system is initialized
    const cacheSystem = await ensureCacheSystem({
      enableMonitoring: true,
      enableWarming: false, // Don't auto-warm on status check
    });
    
    // Get comprehensive health status
    const health = await cacheSystem.getHealth();
    
    // Get monitoring data if available
    const monitor = cacheSystem.getMonitor();
    let monitoring = null;
    
    if (monitor) {
      const alerts = monitor.getAlerts({ resolved: false });
      const metrics = monitor.getMetrics({ limit: 100 });
      const report = await monitor.generateReport(24 * 60 * 60 * 1000); // 24 hours
      
      monitoring = {
        alerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.type === 'critical').length,
        warningAlerts: alerts.filter(a => a.type === 'warning').length,
        recentMetrics: metrics.length,
        report: {
          avgHitRate: report.summary.avgHitRate,
          avgResponseTime: report.summary.avgResponseTime,
          topIssues: report.topIssues,
          recommendations: report.recommendations.slice(0, 3),
        },
      };
    }
    
    // Get warming status if available
    const warming = cacheSystem.getWarming();
    let warmingStatus = null;
    
    if (warming) {
      warmingStatus = warming.getWarmingStatus();
    }
    
    return NextResponse.json({
      success: true,
      data: {
        status: health.cache.healthy ? 'healthy' : 'degraded',
        cache: {
          redis: health.cache.redis,
          fallback: health.cache.fallback,
          stats: health.cache.stats,
          issues: health.cache.issues,
        },
        system: health.system,
        analytics: health.analytics,
        monitoring,
        warming: warmingStatus,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('Cache status check failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Cache status check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

/**
 * Clear cache or specific cache patterns
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pattern = url.searchParams.get('pattern');
    const namespace = url.searchParams.get('namespace');
    const tags = url.searchParams.get('tags')?.split(',');
    
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return NextResponse.json(
        { success: false, error: 'Cache system not initialized' },
        { status: 503 }
      );
    }
    
    const cache = cacheSystem.getCache();
    const integrations = cacheSystem.getIntegrations();
    
    let deletedCount = 0;
    
    if (tags && tags.length > 0) {
      // Delete by tags
      deletedCount = await integrations.invalidateByTags(tags);
    } else if (pattern) {
      // Delete by pattern
      deletedCount = await cache.clear(pattern);
    } else if (namespace) {
      // Delete by namespace (implement pattern for namespace)
      const namespacePattern = `*${namespace}:*`;
      deletedCount = await cache.clear(namespacePattern);
    } else {
      // Clear all cache
      deletedCount = await cache.clear();
    }
    
    return NextResponse.json({
      success: true,
      data: {
        deleted: deletedCount,
        pattern: pattern || 'all',
        namespace,
        tags,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('Cache clear failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Cache clear failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
