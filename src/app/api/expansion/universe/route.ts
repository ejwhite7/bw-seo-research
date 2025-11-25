import { NextRequest, NextResponse } from 'next/server';
import { UniverseExpansionService } from '../../../../services/universe';
import * as Sentry from '@sentry/nextjs';

// Configure route for long-running operations
export const maxDuration = 300; // 5 minutes max on Vercel Pro (60 min locally)
export const dynamic = 'force-dynamic';

interface UniverseRequest {
  dream100Keywords: string[];
  targetTier2Count?: number;
  targetTier3Count?: number;
  market?: string;
  industry?: string;
  maxDepth?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: UniverseRequest = await request.json();
    const {
      dream100Keywords,
      targetTier2Count = 1000,
      targetTier3Count = 9000,
      market = 'US',
      industry,
      maxDepth = 3
    } = body;

    // Validate input
    if (!dream100Keywords || dream100Keywords.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Dream 100 keywords are required for universe expansion'
      }, { status: 400 });
    }

    if (dream100Keywords.length > 100) {
      return NextResponse.json({
        success: false,
        error: 'Maximum 100 Dream keywords allowed'
      }, { status: 400 });
    }

    // Check for required API keys
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const ahrefsApiKey = process.env.AHREFS_API_KEY;
    const dataForSEOLogin = process.env.DATAFORSEO_LOGIN;
    const dataForSEOPassword = process.env.DATAFORSEO_PASSWORD;

    // Check if we have a keyword data provider (DataForSEO or Ahrefs)
    const hasKeywordProvider = (dataForSEOLogin && dataForSEOPassword) || ahrefsApiKey;
    
    // Log which provider is being used
    if (dataForSEOLogin && dataForSEOPassword) {
      console.log('✓ Universe expansion using DataForSEO for keyword data');
    } else if (ahrefsApiKey) {
      console.log('✓ Universe expansion using Ahrefs for keyword data');
    } else {
      console.log('ℹ️ No keyword provider - universe expansion will use LLM-only mode');
    }

    if (!anthropicApiKey) {
      return NextResponse.json({
        success: false,
        error: 'Anthropic API key not configured',
        errorDetails: 'Universe expansion requires an Anthropic API key. Please configure ANTHROPIC_API_KEY in your environment variables.',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Create universe expansion service
    // Pass placeholder for Ahrefs key since we're disabling Ahrefs features anyway
    const universeService = new UniverseExpansionService(
      anthropicApiKey!, // Safe: we return early if undefined
      ahrefsApiKey || 'disabled'
    );

    // Generate a simple run ID for this request
    const runId = `universe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Attempt universe expansion - fail gracefully with clear error messages
    console.log(`🚀 Calling expandToUniverse with ${dream100Keywords.length} Dream 100 keywords`);
    
    // Disable Ahrefs-dependent features until API endpoints are fixed (currently returning 404)
    const universeResult = await universeService.expandToUniverse({
      runId,
      dream100Keywords,
      targetTotalCount: targetTier2Count + targetTier3Count,
      market,
      industry,
      enableSerpAnalysis: false,      // Disabled: Ahrefs keyword-ideas endpoint returns 404
      enableCompetitorMining: false   // Disabled: Requires working Ahrefs integration
    });

    console.log(`🎯 Universe expansion result structure:`, {
      hasKeywordsByTier: !!universeResult.keywordsByTier,
      tier2Length: universeResult.keywordsByTier?.tier2?.length || 0,
      tier3Length: universeResult.keywordsByTier?.tier3?.length || 0,
      success: universeResult.success
    });

    // Transform the real service result to match expected API format
    if (!universeResult.keywordsByTier || !universeResult.keywordsByTier.tier2 || !universeResult.keywordsByTier.tier3) {
      throw new Error('Invalid universe result structure from service');
    }

    const result = {
      tier2Keywords: universeResult.keywordsByTier.tier2.map(k => k.keyword),
      tier3Keywords: universeResult.keywordsByTier.tier3.map(k => k.keyword),
      processingStats: universeResult.processingStats,
      costBreakdown: universeResult.costBreakdown
    };

    console.log(`✅ Successfully transformed universe result: tier2=${result.tier2Keywords.length}, tier3=${result.tier3Keywords.length}`);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Universe expansion error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    Sentry.captureException(error, {
      tags: {
        operation: 'universe_expansion',
        endpoint: '/api/expansion/universe'
      }
    });

    // Extract user-friendly error message
    let errorMessage = 'Failed to expand keyword universe';
    let errorDetails = '';
    
    if (error instanceof Error) {
      const errorStr = error.message;
      
      // Check for specific error types and provide helpful messages
      if (errorStr.includes('overloaded') || errorStr.includes('529')) {
        errorMessage = 'Service temporarily unavailable';
        errorDetails = 'The AI service is currently overloaded. Please try again in a few minutes.';
      } else if (errorStr.includes('rate limit') || errorStr.includes('429')) {
        errorMessage = 'Rate limit exceeded';
        errorDetails = 'Too many requests. Please wait a moment before trying again.';
      } else if (errorStr.includes('Circuit breaker')) {
        errorMessage = 'Service temporarily unavailable';
        errorDetails = 'The AI service is experiencing issues. The circuit breaker has been activated to protect the system. Please try again in 30-60 seconds.';
      } else if (errorStr.includes('timeout') || errorStr.includes('Timeout')) {
        errorMessage = 'Request timed out';
        errorDetails = 'The request took too long to process. This may happen during peak usage. Please try again with fewer keywords.';
      } else if (errorStr.includes('API key') || errorStr.includes('authentication')) {
        errorMessage = 'Authentication failed';
        errorDetails = 'There is an issue with the API credentials. Please check your configuration.';
      } else if (errorStr.includes('Invalid universe result')) {
        errorMessage = 'Invalid response from service';
        errorDetails = 'The expansion service returned an unexpected response format. Please try again.';
      } else {
        // Use the error message if it's user-friendly, otherwise provide generic message
        errorDetails = errorStr.length < 200 ? errorStr : 'An unexpected error occurred while processing your request.';
      }
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      errorDetails,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}