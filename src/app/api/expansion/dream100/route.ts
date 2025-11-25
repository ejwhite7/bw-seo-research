import { NextRequest, NextResponse } from 'next/server';
import { Dream100ExpansionService } from '../../../../services/expansion';
import * as Sentry from '@sentry/nextjs';

interface Dream100Request {
  seedKeywords: string[];
  targetCount?: number;
  market?: string;
  industry?: string;
  intentFocus?: 'commercial' | 'informational' | 'mixed';
  difficultyPreference?: 'easy' | 'mixed' | 'hard';
}

export async function POST(request: NextRequest) {
  try {
    const body: Dream100Request = await request.json();
    console.log('🔍 Dream 100 request received:', JSON.stringify(body, null, 2));
    const { seedKeywords, targetCount = 100, market = 'US', industry, intentFocus = 'mixed', difficultyPreference = 'mixed' } = body;

    // Validate input
    if (!seedKeywords || seedKeywords.length === 0) {
      console.log('❌ Validation failed: No seed keywords provided');
      return NextResponse.json({
        success: false,
        error: 'Seed keywords are required'
      }, { status: 400 });
    }

    if (seedKeywords.length > 20) {
      console.log('❌ Validation failed: Too many seed keywords:', seedKeywords.length);
      return NextResponse.json({
        success: false,
        error: 'Maximum 20 seed keywords allowed'
      }, { status: 400 });
    }

    // Check for LLM provider configuration
    const llmProvider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    // Check which API key is needed based on provider selection
    let requiredApiKey: string | undefined;
    let requiredApiKeyName: string;
    
    switch (llmProvider) {
      case 'openai':
        requiredApiKey = openaiApiKey;
        requiredApiKeyName = 'OPENAI_API_KEY';
        break;
      case 'gemini':
        requiredApiKey = geminiApiKey;
        requiredApiKeyName = 'GEMINI_API_KEY';
        break;
      case 'anthropic':
      default:
        requiredApiKey = anthropicApiKey;
        requiredApiKeyName = 'ANTHROPIC_API_KEY';
        break;
    }

    if (!requiredApiKey) {
      console.log(`❌ Validation failed: ${requiredApiKeyName} not configured for provider ${llmProvider}`);
      return NextResponse.json({
        success: false,
        error: `${requiredApiKeyName} not configured`,
        errorDetails: `Dream 100 expansion requires ${requiredApiKeyName} when using ${llmProvider} provider. Please configure this in your environment variables.`,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    const ahrefsApiKey = process.env.AHREFS_API_KEY;
    const dataForSEOLogin = process.env.DATAFORSEO_LOGIN;
    const dataForSEOPassword = process.env.DATAFORSEO_PASSWORD;

    // Log which providers are being used
    const modelEnvKey = `${llmProvider.toUpperCase()}_MODEL`;
    const selectedModel = process.env[modelEnvKey] || 'default';
    console.log(`✓ Using LLM provider: ${llmProvider} (model: ${selectedModel})`);
    
    if (dataForSEOLogin && dataForSEOPassword) {
      console.log('✓ Using DataForSEO for keyword data');
    } else if (ahrefsApiKey) {
      console.log('✓ Using Ahrefs for keyword data');
    } else {
      console.log('ℹ️ No keyword provider configured - metrics will be limited');
    }

    // Create expansion service - it will use LLM_PROVIDER env var to select provider
    // Pass undefined for apiKey since the factory reads from env vars
    const expansionService = new Dream100ExpansionService(
      undefined, // Let factory use env vars
      ahrefsApiKey || 'mock' // Pass mock to signal no Ahrefs, KeywordProvider will use DataForSEO if configured
    );

    // Generate a simple run ID for this request
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Attempt real integration - fail gracefully with clear error messages
    console.log(`🚀 Calling expandToDream100 with ${seedKeywords.length} seeds, target: ${targetCount}`);
    
    const result = await expansionService.expandToDream100({
      runId,
      seedKeywords,
      targetCount,
      market,
      industry,
      intentFocus,
      difficultyPreference
    });
    
    console.log(`✅ Success: Generated ${result.dream100Keywords.length} keywords with cost $${result.costBreakdown?.totalCost || 0}`);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dream 100 expansion error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    Sentry.captureException(error, {
      tags: {
        operation: 'dream100_expansion',
        endpoint: '/api/expansion/dream100'
      }
    });

    // If it's a JSON parsing error, return 400
    if (error instanceof Error && error.message.includes('JSON')) {
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON in request body',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Extract user-friendly error message
    let errorMessage = 'Failed to generate Dream 100 keywords';
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