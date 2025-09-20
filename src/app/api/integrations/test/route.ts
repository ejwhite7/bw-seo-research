// Test API route for integration functionality
import { NextRequest, NextResponse } from 'next/server';
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
    const service = searchParams.get('service') as 'ahrefs' | 'anthropic' | 'scraper' | null;
    const operation = searchParams.get('operation');
    
    if (!service && !operation) {
      // Return all available test operations
      return NextResponse.json({
        status: 'success',
        availableTests: {
          'ahrefs': [
            'GET /api/integrations/test?service=ahrefs&operation=quota',
            'GET /api/integrations/test?service=ahrefs&operation=keywords',
            'GET /api/integrations/test?service=ahrefs&operation=health'
          ],
          'anthropic': [
            'GET /api/integrations/test?service=anthropic&operation=expand',
            'GET /api/integrations/test?service=anthropic&operation=classify',
            'GET /api/integrations/test?service=anthropic&operation=health'
          ],
          'scraper': [
            'GET /api/integrations/test?service=scraper&operation=scrape',
            'GET /api/integrations/test?service=scraper&operation=health'
          ],
          'general': [
            'GET /api/integrations/test?operation=health',
            'GET /api/integrations/test?operation=metrics'
          ]
        }
      });
    }
    
    // General operations
    if (!service && operation === 'health') {
      return NextResponse.json({
        status: 'success',
        operation: 'health_test',
        results: { message: 'All integrations healthy' }
      });
    }
    
    if (!service && operation === 'metrics') {
      return NextResponse.json({
        status: 'success',
        operation: 'metrics_test',
        results: {
          metrics: { requests: 0, errors: 0 },
          budget: { used: 0, remaining: 1000 }
        }
      });
    }
    
    // Mock service-specific tests
    let results;
    
    switch (service) {
      case 'ahrefs':
        results = await testAhrefs(operation!);
        break;
      case 'anthropic':
        results = await testAnthropic(operation!);
        break;
      case 'scraper':
        results = await testScraper(operation!);
        break;
      default:
        return NextResponse.json({
          status: 'error',
          error: `Unknown service: ${service}`
        }, { status: 400 });
    }
    
    return NextResponse.json({
      status: 'success',
      service,
      operation,
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Integration test error:', error);
    
    Sentry.captureException(error, {
      tags: { endpoint: 'integration-test' },
      extra: { request: request.url }
    });
    
    return NextResponse.json({
      status: 'error',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Mock test functions
async function testAhrefs(operation: string) {
  switch (operation) {
    case 'quota':
      return { quota: 1000, used: 0, remaining: 1000 };
      
    case 'keywords':
      return {
        requestSuccessful: true,
        keywordCount: 2,
        sampleKeyword: { keyword: 'test', volume: 1000, difficulty: 50 }
      };
      
    case 'health':
      return { status: 'healthy', responseTime: 100 };
      
    default:
      throw new Error(`Unknown Ahrefs test operation: ${operation}`);
  }
}

async function testAnthropic(operation: string) {
  switch (operation) {
    case 'expand':
      return {
        requestSuccessful: true,
        keywordCount: 5,
        sampleKeywords: ['content marketing', 'marketing content', 'content strategy']
      };
      
    case 'classify':
      return {
        requestSuccessful: true,
        resultCount: 3,
        sampleClassifications: [
          { keyword: 'best seo tools', intent: 'commercial' },
          { keyword: 'what is seo', intent: 'informational' }
        ]
      };
      
    case 'health':
      return { status: 'healthy', responseTime: 200 };
      
    default:
      throw new Error(`Unknown Anthropic test operation: ${operation}`);
  }
}

async function testScraper(operation: string) {
  switch (operation) {
    case 'scrape':
      return {
        totalAttempted: 1,
        successful: 1,
        failed: 0,
        successRate: 1.0
      };
      
    case 'health':
      return { status: 'healthy', responseTime: 150 };
      
    default:
      throw new Error(`Unknown Scraper test operation: ${operation}`);
  }
}