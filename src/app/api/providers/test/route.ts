/**
 * API Provider Test Route
 * Tests connectivity and basic functionality for Ahrefs, Moz, and SEMRush APIs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getKeywordProvider, getAvailableProviders } from '../../../../integrations/keyword-provider';
import * as Sentry from '@sentry/nextjs';

// Only allow in development and staging environments
const ALLOWED_ENVIRONMENTS = ['development', 'staging', 'test'];

export async function GET(request: NextRequest) {
  // Security check
  if (!ALLOWED_ENVIRONMENTS.includes(process.env.NODE_ENV || '')) {
    return NextResponse.json({
      status: 'error',
      error: 'Test endpoint not available in production'
    }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider') as 'ahrefs' | 'moz' | 'semrush' | null;
    const operation = searchParams.get('operation');
    const keyword = searchParams.get('keyword') || 'test keyword';

    // Get available providers
    const availableProviders = getAvailableProviders();
    const keywordProvider = getKeywordProvider();

    if (!provider && !operation) {
      // Return provider status and available operations
      return NextResponse.json({
        status: 'success',
        availableProviders,
        mockMode: process.env.MOCK_EXTERNAL_APIS === 'true',
        availableOperations: {
          'provider-status': 'GET /api/providers/test?operation=provider-status',
          'keyword-metrics': 'GET /api/providers/test?operation=keyword-metrics&keyword=social%20selling',
          'keyword-suggestions': 'GET /api/providers/test?operation=keyword-suggestions&keyword=social%20selling',
          'provider-health': 'GET /api/providers/test?operation=provider-health',
          'specific-provider': 'GET /api/providers/test?provider=moz&operation=keyword-metrics&keyword=test'
        }
      });
    }

    // Handle general operations
    if (!provider) {
      switch (operation) {
        case 'provider-status':
          return NextResponse.json({
            status: 'success',
            operation: 'provider_status',
            results: {
              availableProviders,
              mockMode: process.env.MOCK_EXTERNAL_APIS === 'true',
              configuredProviders: {
                ahrefs: !!process.env.AHREFS_API_KEY && process.env.AHREFS_API_KEY !== 'your-dev-ahrefs-api-key',
                moz: !!process.env.MOZ_API_KEY && process.env.MOZ_API_KEY !== 'your-dev-moz-api-key',
                semrush: !!process.env.SEMRUSH_API_KEY && process.env.SEMRUSH_API_KEY !== 'your-dev-semrush-api-key'
              }
            }
          });

        case 'provider-health':
          const healthStatus = await keywordProvider.getProviderStatus();
          return NextResponse.json({
            status: 'success',
            operation: 'provider_health',
            results: healthStatus
          });

        case 'keyword-metrics':
          const keywordData = await keywordProvider.getKeywordMetrics(keyword);
          return NextResponse.json({
            status: 'success',
            operation: 'keyword_metrics',
            results: {
              keyword: keywordData.keyword,
              volume: keywordData.volume,
              difficulty: keywordData.difficulty,
              cpc: keywordData.cpc,
              source: keywordData.source,
              confidence: keywordData.confidence
            }
          });

        case 'keyword-suggestions':
          const suggestions = await keywordProvider.getKeywordSuggestions(keyword, { limit: 10 });
          return NextResponse.json({
            status: 'success',
            operation: 'keyword_suggestions',
            results: {
              seedKeyword: keyword,
              suggestions: suggestions.slice(0, 10),
              totalSuggestions: suggestions.length
            }
          });

        default:
          return NextResponse.json({
            status: 'error',
            error: `Unknown operation: ${operation}`
          }, { status: 400 });
      }
    }

    // Handle provider-specific operations
    if (!availableProviders.includes(provider)) {
      return NextResponse.json({
        status: 'error',
        error: `Provider '${provider}' is not configured or available. Available providers: ${availableProviders.join(', ')}`
      }, { status: 400 });
    }

    let results;

    switch (operation) {
      case 'keyword-metrics':
        const keywordData = await keywordProvider.getKeywordMetrics(keyword, { provider });
        results = {
          keyword: keywordData.keyword,
          volume: keywordData.volume,
          difficulty: keywordData.difficulty,
          cpc: keywordData.cpc,
          competition: keywordData.competition,
          source: keywordData.source,
          confidence: keywordData.confidence
        };
        break;

      case 'keyword-suggestions':
        const suggestions = await keywordProvider.getKeywordSuggestions(keyword, { 
          provider, 
          limit: 10 
        });
        results = {
          seedKeyword: keyword,
          suggestions: suggestions.slice(0, 10),
          totalSuggestions: suggestions.length,
          provider
        };
        break;

      case 'bulk-keywords':
        const keywords = (searchParams.get('keywords') || 'test,example,demo').split(',');
        const bulkData = await keywordProvider.getBulkKeywordMetrics(keywords.slice(0, 5), { 
          provider,
          batchSize: 5 
        });
        results = {
          requestedKeywords: keywords.slice(0, 5),
          results: bulkData.map(data => ({
            keyword: data.keyword,
            volume: data.volume,
            difficulty: data.difficulty,
            source: data.source
          })),
          provider
        };
        break;

      case 'health':
        const healthStatus = await keywordProvider.getProviderStatus();
        const providerHealth = healthStatus.find(h => h.provider === provider);
        results = providerHealth || { provider, isHealthy: false, error: 'Provider not found' };
        break;

      default:
        return NextResponse.json({
          status: 'error',
          error: `Unknown operation '${operation}' for provider '${provider}'`
        }, { status: 400 });
    }

    return NextResponse.json({
      status: 'success',
      provider,
      operation,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Provider test error:', error);

    Sentry.captureException(error, {
      tags: { endpoint: 'provider-test' },
      extra: { request: request.url }
    });

    return NextResponse.json({
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Security check
  if (!ALLOWED_ENVIRONMENTS.includes(process.env.NODE_ENV || '')) {
    return NextResponse.json({
      status: 'error',
      error: 'Test endpoint not available in production'
    }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { provider, operation, keywords, options } = body;

    const keywordProvider = getKeywordProvider();
    const availableProviders = getAvailableProviders();

    if (provider && !availableProviders.includes(provider)) {
      return NextResponse.json({
        status: 'error',
        error: `Provider '${provider}' is not configured or available`
      }, { status: 400 });
    }

    let results;

    switch (operation) {
      case 'bulk-test':
        if (!keywords || !Array.isArray(keywords)) {
          return NextResponse.json({
            status: 'error',
            error: 'keywords array is required for bulk-test operation'
          }, { status: 400 });
        }

        const bulkResults = await keywordProvider.getBulkKeywordMetrics(
          keywords.slice(0, 10), // Limit to 10 for testing
          { provider, ...options }
        );

        results = {
          requestedKeywords: keywords.slice(0, 10),
          processedCount: bulkResults.length,
          results: bulkResults.map(data => ({
            keyword: data.keyword,
            volume: data.volume,
            difficulty: data.difficulty,
            cpc: data.cpc,
            source: data.source,
            confidence: data.confidence
          })),
          provider: provider || 'auto-selected'
        };
        break;

      case 'expansion-test':
        const seedKeyword = body.seedKeyword || 'marketing';
        const limit = Math.min(body.limit || 20, 50); // Max 50 for testing

        const suggestions = await keywordProvider.getKeywordSuggestions(seedKeyword, {
          provider,
          limit,
          ...options
        });

        results = {
          seedKeyword,
          expandedKeywords: suggestions,
          totalExpanded: suggestions.length,
          provider: provider || 'auto-selected'
        };
        break;

      default:
        return NextResponse.json({
          status: 'error',
          error: `Unknown POST operation: ${operation}`
        }, { status: 400 });
    }

    return NextResponse.json({
      status: 'success',
      operation,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Provider POST test error:', error);

    Sentry.captureException(error, {
      tags: { endpoint: 'provider-test-post' },
      extra: { request: request.url }
    });

    return NextResponse.json({
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}