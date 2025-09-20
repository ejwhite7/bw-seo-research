import { NextRequest, NextResponse } from 'next/server';
import { getCacheSystem, ensureCacheSystem } from '../../../../lib/cache-init';

/**
 * Cache warming endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      strategies,
      maxTime = 300, // 5 minutes default
      maxCost = 10, // $10 default
      dryRun = false,
    } = body;
    
    // Ensure cache system is initialized with warming enabled
    const cacheSystem = await ensureCacheSystem({
      enableWarming: true,
      enableMonitoring: true,
    });
    
    const warming = cacheSystem.getWarming();
    if (!warming) {
      return NextResponse.json(
        { success: false, error: 'Cache warming not enabled' },
        { status: 400 }
      );
    }
    
    // Start warming process
    const result = await warming.warmCache({
      strategies,
      maxTime,
      maxCost,
      dryRun,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        dryRun,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('Cache warming failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Cache warming failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get warming status and available strategies
 */
export async function GET() {
  try {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return NextResponse.json(
        { success: false, error: 'Cache system not initialized' },
        { status: 503 }
      );
    }
    
    const warming = cacheSystem.getWarming();
    if (!warming) {
      return NextResponse.json({
        success: true,
        data: {
          enabled: false,
          message: 'Cache warming not enabled',
        },
      });
    }
    
    const status = warming.getWarmingStatus();
    
    return NextResponse.json({
      success: true,
      data: {
        enabled: true,
        ...status,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('Failed to get warming status:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get warming status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
