/**
 * API endpoints for the ingestion service
 * 
 * Provides REST API endpoints for seed keyword processing, validation,
 * and run creation with comprehensive error handling and response formatting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  ingestionService,
  type IngestionRequest
  // Note: IngestionResponse is defined but not directly used in this file
} from '../services/ingestion';
import { ErrorHandler } from '../utils/error-handler';

/**
 * API request/response schemas
 */
const ProcessIngestionRequestSchema = z.object({
  userId: z.string().uuid(),
  seedKeywords: z.array(z.string()).min(1).max(5),
  market: z.string().optional(),
  settings: z.object({
    maxKeywords: z.number().int().min(100).max(10000).optional(),
    maxDream100: z.number().int().min(10).max(200).optional(),
    maxTier2PerDream: z.number().int().min(5).max(20).optional(),
    maxTier3PerTier2: z.number().int().min(5).max(20).optional(),
    enableCompetitorScraping: z.boolean().optional(),
    similarityThreshold: z.number().min(0.1).max(0.9).optional(),
    quickWinThreshold: z.number().min(0.5).max(0.9).optional(),
    targetMarket: z.string().optional(),
    language: z.string().optional(),
    industryContext: z.string().optional(),
    contentFocus: z.enum(['blog', 'product', 'service', 'mixed']).optional()
  }).optional(),
  budgetLimit: z.number().min(1).max(1000).optional(),
  validateOnly: z.boolean().optional()
});

const UpdateSettingsRequestSchema = z.object({
  userId: z.string().uuid(),
  ahrefsApiKey: z.string().min(10).max(500).nullable().optional(),
  anthropicApiKey: z.string().min(10).max(500).nullable().optional(),
  defaultWeights: z.object({
    dream100: z.object({
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      trend: z.number().min(0).max(1),
      ease: z.number().min(0).max(1)
    }).partial().optional(),
    tier2: z.object({
      volume: z.number().min(0).max(1),
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }).partial().optional(),
    tier3: z.object({
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }).partial().optional()
  }).partial().optional(),
  preferences: z.object({
    notifications: z.object({
      email: z.object({
        runCompleted: z.boolean().optional(),
        runFailed: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        quotaWarnings: z.boolean().optional(),
        newFeatures: z.boolean().optional()
      }).optional(),
      inApp: z.object({
        runStatusUpdates: z.boolean().optional(),
        costAlerts: z.boolean().optional(),
        recommendations: z.boolean().optional()
      }).optional()
    }).optional(),
    defaults: z.object({
      market: z.string().optional(),
      language: z.string().optional(),
      maxKeywords: z.number().int().min(100).max(10000).optional(),
      postsPerMonth: z.number().int().min(1).max(100).optional(),
      enableCompetitorScraping: z.boolean().optional(),
      contentFocus: z.enum(['blog', 'product', 'service', 'mixed']).optional()
    }).optional()
  }).partial().optional()
});

/**
 * POST /api/ingestion/process
 * Process seed keywords and create a new run
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `ing_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  try {
    Sentry.setTag('operation', 'process_ingestion');
    Sentry.setTag('requestId', requestId);
    
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = ProcessIngestionRequestSchema.parse(body);
    
    Sentry.addBreadcrumb({
      message: 'Processing ingestion request',
      level: 'info',
      category: 'api',
      data: {
        requestId,
        userId: validatedRequest.userId,
        seedKeywordCount: validatedRequest.seedKeywords.length,
        validateOnly: validatedRequest.validateOnly
      }
    });
    
    // Convert to internal request format
    const ingestionRequest: IngestionRequest = {
      userId: validatedRequest.userId,
      seedKeywords: validatedRequest.seedKeywords,
      market: validatedRequest.market,
      settings: validatedRequest.settings,
      budgetLimit: validatedRequest.budgetLimit,
      validateOnly: validatedRequest.validateOnly
    };
    
    // Process ingestion
    const result = await ingestionService.processIngestion(ingestionRequest);
    
    // Format response based on success/failure
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result,
        metadata: {
          requestId,
          timestamp: Date.now()
        }
      }, { status: 200 });
    } else {
      // Determine appropriate status code based on error types
      let statusCode = 400;
      if (result.errors.some(e => e.type === 'api_key')) {
        statusCode = 401;
      } else if (result.errors.some(e => e.type === 'budget')) {
        statusCode = 402;
      } else if (result.errors.some(e => e.type === 'rate_limit')) {
        statusCode = 429;
      } else if (result.errors.some(e => e.type === 'system')) {
        statusCode = 500;
      }
      
      return NextResponse.json({
        success: false,
        error: {
          message: 'Ingestion validation failed',
          details: result.errors,
          warnings: result.warnings
        },
        data: result,
        metadata: {
          requestId,
          timestamp: Date.now()
        }
      }, { status: statusCode });
    }
    
  } catch (error) {
    const apiError = ErrorHandler.handleApiError(error as Error, {
      provider: 'ingestion',
      endpoint: '/api/ingestion',
      method: 'POST'
    });
    
    Sentry.captureException(apiError);
    
    return NextResponse.json({
      success: false,
      error: {
        message: apiError.message,
        code: apiError.code,
        retryable: apiError.retryable
      },
      metadata: {
        requestId,
        timestamp: Date.now()
      }
    }, { 
      status: apiError.statusCode || 500 
    });
  }
}

/**
 * GET /api/ingestion/validate-keys?userId=<uuid>
 * Validate API keys for a user
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = `val_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  try {
    Sentry.setTag('operation', 'validate_keys');
    Sentry.setTag('requestId', requestId);
    
    // Get userId from query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'userId parameter is required',
          code: 'MISSING_PARAMETER'
        },
        metadata: {
          requestId,
          timestamp: Date.now()
        }
      }, { status: 400 });
    }
    
    // Validate UUID format
    z.string().uuid().parse(userId);
    
    // Get validation result
    const validation = await ingestionService.getSettingsValidation(userId);
    
    return NextResponse.json({
      success: true,
      data: validation,
      metadata: {
        requestId,
        timestamp: Date.now()
      }
    }, { status: 200 });
    
  } catch (error) {
    const apiError = ErrorHandler.handleValidationError(error as Error, {});
    
    Sentry.captureException(apiError);
    
    return NextResponse.json({
      success: false,
      error: {
        message: apiError.message,
        code: apiError.code,
        retryable: apiError.retryable
      },
      metadata: {
        requestId,
        timestamp: Date.now()
      }
    }, { 
      status: apiError.statusCode || 500 
    });
  }
}

/**
 * PUT /api/ingestion/settings
 * Update user settings including API keys
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const requestId = `set_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  try {
    Sentry.setTag('operation', 'update_settings');
    Sentry.setTag('requestId', requestId);
    
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = UpdateSettingsRequestSchema.parse(body);
    
    Sentry.addBreadcrumb({
      message: 'Updating user settings',
      level: 'info',
      category: 'api',
      data: {
        requestId,
        userId: validatedRequest.userId,
        hasAhrefsKey: !!validatedRequest.ahrefsApiKey,
        hasAnthropicKey: !!validatedRequest.anthropicApiKey,
        hasWeights: !!validatedRequest.defaultWeights,
        hasPreferences: !!validatedRequest.preferences
      }
    });
    
    // Update settings
    const updatedSettings = await ingestionService.updateSettings(
      validatedRequest.userId,
      {
        ahrefsApiKey: validatedRequest.ahrefsApiKey,
        anthropicApiKey: validatedRequest.anthropicApiKey,
        defaultWeights: validatedRequest.defaultWeights,
        preferences: validatedRequest.preferences
      }
    );
    
    // Remove sensitive data from response
    const responseSettings = {
      ...updatedSettings,
      ahrefsApiKeyEncrypted: updatedSettings.ahrefsApiKeyEncrypted ? '[CONFIGURED]' : null,
      anthropicApiKeyEncrypted: updatedSettings.anthropicApiKeyEncrypted ? '[CONFIGURED]' : null
    };
    
    return NextResponse.json({
      success: true,
      data: responseSettings,
      metadata: {
        requestId,
        timestamp: Date.now()
      }
    }, { status: 200 });
    
  } catch (error) {
    const apiError = ErrorHandler.handleSystemError(error as Error, {
      component: 'IngestionAPI',
      operation: 'update_settings'
    });
    
    Sentry.captureException(apiError);
    
    return NextResponse.json({
      success: false,
      error: {
        message: apiError.message,
        code: apiError.code,
        retryable: apiError.retryable
      },
      metadata: {
        requestId,
        timestamp: Date.now()
      }
    }, { 
      status: apiError.statusCode || 500 
    });
  }
}

/**
 * GET /api/ingestion/health
 * Health check endpoint for the ingestion service
 */
export async function GET_HEALTH(): Promise<NextResponse> {
  try {
    // Basic health metrics
    const health = {
      service: 'ingestion',
      status: 'healthy',
      timestamp: Date.now(),
      checks: {
        database: 'healthy', // Could add actual DB health check
        integrations: 'healthy', // Could add integration health check
        rateLimit: {
          remaining: 10, // Mock value - would access actual rate limiter
          nextRefill: Date.now() + 60000 // Mock next refill time
        }
      }
    };
    
    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      service: 'ingestion',
      status: 'unhealthy',
      timestamp: Date.now(),
      error: (error as Error).message
    }, { status: 503 });
  }
}

// Export named handlers for different HTTP methods
export { POST as processIngestion };
export { GET as validateApiKeys };
export { PUT as updateSettings };
export { GET_HEALTH as healthCheck };