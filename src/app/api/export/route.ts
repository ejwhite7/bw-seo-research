/**
 * Comprehensive Export API Route
 * 
 * POST /api/export
 * Exports all data schemas (roadmap, keywords, clusters, competitors) with comprehensive filtering,
 * progress tracking, and multiple format support using the new ExportService.
 * 
 * GET /api/export/progress/:exportId
 * Get export progress for tracking long-running exports.
 * 
 * GET /api/export/templates/:runId?template=:template&format=:format
 * Quick template exports for predefined use cases.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { exportService } from '../../../services/export';
import { ExportConfigSchema } from '../../../models/export';
import type { ExportConfig } from '../../../models/export';
import * as Sentry from '@sentry/nextjs';

// Enhanced request validation schema using the comprehensive export models
const ExportRequestSchema = ExportConfigSchema.extend({
  // Add delivery options for backward compatibility with the existing API
  deliveryOptions: z.object({
    email: z.object({
      recipients: z.array(z.string().email()),
      subject: z.string().optional(),
      body: z.string().optional()
    }).optional(),
    downloadUrl: z.boolean().default(true),
    schedule: z.object({
      frequency: z.enum(['once', 'daily', 'weekly', 'monthly']).default('once'),
      time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      timezone: z.string().default('UTC')
    }).optional()
  }).optional()
});

// type ExportRequest = z.infer<typeof ExportRequestSchema>; // Currently unused

interface ExportResponse {
  success: boolean;
  data?: {
    exportId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    downloadUrl?: string;
    filename: string;
    format: string;
    recordCount: number;
    fileSize: number;
    expiresAt: string;
    progress?: number;
    currentStage?: string;
    metadata: {
      generatedAt: string;
      template: string;
      filtersApplied: number;
      processingTime: number;
      version: string;
      checksum: string;
    };
    analytics?: {
      dataQuality: {
        completeness: number;
        accuracy: number;
        consistency: number;
      };
      summary: {
        totalKeywords: number;
        totalClusters: number;
        totalRoadmapItems: number;
        quickWinCount: number;
        avgDifficulty: number;
        totalVolume: number;
      };
      recommendations: string[];
    };
  };
  error?: {
    message: string;
    code: string;
    details?: unknown;
    retryable?: boolean;
    suggestion?: string;
  };
}

/**
 * POST /api/export
 * Create a comprehensive export with full configuration options
 */
export async function POST(request: NextRequest): Promise<NextResponse<ExportResponse>> {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const { deliveryOptions, ...exportConfigData } = ExportRequestSchema.parse(body);
    
    // Build export configuration for the comprehensive export service
    const exportConfig: ExportConfig = {
      runId: exportConfigData.runId,
      format: exportConfigData.format,
      template: exportConfigData.template,
      filters: exportConfigData.filters,
      options: exportConfigData.options,
      scheduling: exportConfigData.scheduling || null,
      destinations: deliveryOptions?.email ? [{
        type: 'email',
        config: {
          type: 'email' as const,
          recipients: deliveryOptions.email.recipients,
          subject: deliveryOptions.email.subject || `Export Ready: ${exportConfigData.template}`,
          body: deliveryOptions.email.body || 'Your export is ready for download.',
          attachmentName: `${exportConfigData.template}-export.${exportConfigData.format}`
        },
        enabled: true
      }] : []
    };

    // Use the comprehensive export service
    const result = await exportService.createExport(exportConfig);

    // Handle different result statuses
    if (result.status === 'failed') {
      let statusCode = 500;
      
      switch (result.error?.code) {
        case 'VALIDATION_ERROR':
          statusCode = 400;
          break;
        case 'NOT_FOUND':
          statusCode = 404;
          break;
        case 'UNAUTHORIZED':
          statusCode = 401;
          break;
        case 'SIZE_LIMIT_EXCEEDED':
          statusCode = 413;
          break;
        default:
          statusCode = 500;
      }

      return NextResponse.json({
        success: false,
        error: {
          message: result.error?.message || 'Export failed',
          code: result.error?.code || 'EXPORT_FAILED',
          details: result.error?.details,
          retryable: result.error?.retryable || false,
          suggestion: result.error?.suggestion || 'Please check your configuration and try again'
        }
      }, { status: statusCode });
    }

    const processingTime = Date.now() - startTime;

    // Track export metrics with enhanced data
    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Comprehensive export completed',
      data: {
        runId: exportConfig.runId,
        template: exportConfig.template,
        format: exportConfig.format,
        recordCount: result.metadata.processedRecords,
        fileSize: result.metadata.fileSize,
        processingTime,
        quickWinCount: result.analytics.summary.quickWinCount,
        dataQuality: result.analytics.dataQuality.completeness
      }
    });

    // Get progress if available
    const progress = exportService.getExportProgress(result.id);

    // Return enhanced response with analytics
    return NextResponse.json({
      success: true,
      data: {
        exportId: result.id,
        status: result.status,
        downloadUrl: deliveryOptions?.downloadUrl !== false && result.files.length > 0 
          ? result.files[0].downloadUrl : undefined,
        filename: result.files.length > 0 ? result.files[0].name : '',
        format: exportConfig.format,
        recordCount: result.metadata.processedRecords,
        fileSize: result.metadata.fileSize,
        expiresAt: result.files.length > 0 ? result.files[0].expiresAt : '',
        progress: progress?.progress || 100,
        currentStage: progress?.currentStage || 'completed',
        metadata: {
          generatedAt: result.completedAt || new Date().toISOString(),
          template: exportConfig.template,
          filtersApplied: Object.keys(exportConfig.filters.keywords || {}).length +
                         Object.keys(exportConfig.filters.roadmap || {}).length +
                         Object.keys(exportConfig.filters.clusters || {}).length,
          processingTime: result.metadata.processingTime,
          version: result.metadata.version,
          checksum: result.metadata.checksum
        },
        analytics: exportConfig.options.includeAnalytics ? {
          dataQuality: result.analytics.dataQuality,
          summary: result.analytics.summary,
          recommendations: result.analytics.recommendations
        } : undefined
      }
    });

  } catch (error) {
    Sentry.captureException(error, {
      tags: { api_route: 'comprehensive_export' }
    });

    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred during export';

    if (error instanceof z.ZodError) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Invalid export configuration: ' + error.errors.map(e => e.message).join(', ');
    } else if (error instanceof Error) {
      message = error.message;
      
      if (message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (message.includes('unauthorized') || message.includes('authentication')) {
        statusCode = 401;
        errorCode = 'UNAUTHORIZED';
      } else if (message.includes('limit') || message.includes('size')) {
        statusCode = 413;
        errorCode = 'SIZE_LIMIT_EXCEEDED';
      }
    }

    return NextResponse.json({
      success: false,
      error: {
        message,
        code: errorCode,
        retryable: !['VALIDATION_ERROR', 'UNAUTHORIZED', 'NOT_FOUND'].includes(errorCode),
        suggestion: getSuggestionForError(errorCode),
        ...(process.env.NODE_ENV === 'development' && {
          details: error instanceof Error ? error.stack : String(error)
        })
      }
    }, { status: statusCode });
  }
}

/**
 * GET /api/export?runId={id}&template={template}&format={format}
 * Quick template exports for predefined use cases
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');
  const template = url.searchParams.get('template') as 'writers' | 'seo_ops' | 'stakeholders';
  const format = url.searchParams.get('format') as 'csv' | 'excel' | 'json' || 'csv';

  // Handle progress tracking requests
  const progressId = url.searchParams.get('progressId');
  if (progressId) {
    try {
      const progress = exportService.getExportProgress(progressId);
      
      if (!progress) {
        return NextResponse.json({
          success: false,
          error: {
            message: 'Export progress not found',
            code: 'NOT_FOUND'
          }
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: {
          exportId: progress.exportId,
          status: progress.status,
          progress: progress.progress,
          currentStage: progress.currentStage,
          recordsProcessed: progress.recordsProcessed,
          totalRecords: progress.totalRecords,
          estimatedCompletion: progress.estimatedCompletion,
          error: progress.error
        }
      });

    } catch {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Failed to get export progress',
          code: 'PROGRESS_ERROR'
        }
      }, { status: 500 });
    }
  }

  if (!runId) {
    return NextResponse.json({
      success: false,
      error: {
        message: 'runId parameter is required',
        code: 'MISSING_PARAMETER'
      }
    }, { status: 400 });
  }

  if (!template || !['writers', 'seo_ops', 'stakeholders'].includes(template)) {
    return NextResponse.json({
      success: false,
      error: {
        message: 'Valid template parameter required (writers, seo_ops, stakeholders)',
        code: 'INVALID_TEMPLATE'
      }
    }, { status: 400 });
  }

  try {
    // Use the predefined template export
    const result = await exportService.generateTemplateExport(runId as any, template, format);

    if (result.status === 'failed') {
      return NextResponse.json({
        success: false,
        error: {
          message: result.error?.message || 'Template export failed',
          code: result.error?.code || 'EXPORT_FAILED',
          retryable: result.error?.retryable || false
        }
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        exportId: result.id,
        status: result.status,
        downloadUrl: result.files[0]?.downloadUrl,
        filename: result.files[0]?.name || '',
        format,
        recordCount: result.metadata.processedRecords,
        fileSize: result.metadata.fileSize,
        expiresAt: result.files[0]?.expiresAt || '',
        metadata: {
          generatedAt: result.completedAt || new Date().toISOString(),
          template,
          filtersApplied: 0,
          processingTime: result.metadata.processingTime,
          version: result.metadata.version,
          checksum: result.metadata.checksum
        }
      }
    });

  } catch (error) {
    Sentry.captureException(error, {
      tags: { api_route: 'template_export' }
    });

    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Template export failed',
        code: 'EXPORT_FAILED',
        retryable: true
      }
    }, { status: 500 });
  }
}

/**
 * DELETE /api/export?exportId={id}
 * Cancel an active export
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const exportId = url.searchParams.get('exportId');

  if (!exportId) {
    return NextResponse.json({
      success: false,
      error: {
        message: 'exportId parameter is required',
        code: 'MISSING_PARAMETER'
      }
    }, { status: 400 });
  }

  try {
    const cancelled = await exportService.cancelExport(exportId as any);

    return NextResponse.json({
      success: true,
      data: {
        exportId,
        cancelled
      }
    });

  } catch (error) {
    Sentry.captureException(error, {
      tags: { api_route: 'export_cancel' }
    });

    return NextResponse.json({
      success: false,
      error: {
        message: 'Failed to cancel export',
        code: 'CANCEL_FAILED'
      }
    }, { status: 500 });
  }
}

/**
 * Helper function to provide contextual error suggestions
 */
function getSuggestionForError(errorCode: string): string {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return 'Please check your export configuration parameters and try again';
    case 'NOT_FOUND':
      return 'Verify that the run ID exists and you have access to it';
    case 'SIZE_LIMIT_EXCEEDED':
      return 'Try filtering your data to reduce the export size, or use maxRows to limit results';
    case 'UNAUTHORIZED':
      return 'Please check your authentication credentials';
    case 'CONCURRENT_LIMIT':
      return 'Wait for current exports to complete or cancel unnecessary exports';
    default:
      return 'Please try again in a few moments or contact support if the issue persists';
  }
}

/**
 * Enhanced email notification with export details
 */
async function sendEmailExport(emailOptions: any, filename: string, downloadUrl: string, metadata: any) {
  try {
    // Enhanced email content with export details
    const emailContent = {
      recipients: emailOptions.recipients,
      subject: emailOptions.subject || `Export Ready: ${filename}`,
      body: emailOptions.body || generateEmailBody(metadata, downloadUrl),
      attachmentUrl: downloadUrl,
      attachmentName: filename
    };

    // Log enhanced email details
    console.log('Enhanced email export sent:', {
      recipients: emailContent.recipients.length,
      template: metadata.template,
      recordCount: metadata.recordCount
    });
    
    // Track email delivery
    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Export email sent',
      data: {
        recipients: emailOptions.recipients.length,
        template: metadata.template,
        recordCount: metadata.recordCount
      }
    });
    
    // In real implementation, integrate with email service:
    // await emailService.send({
    //   to: emailOptions.recipients,
    //   subject: emailContent.subject,
    //   html: emailContent.body,
    //   attachments: [{ name: filename, url: downloadUrl }]
    // });
    
  } catch (error) {
    console.error('Failed to send export email:', error);
    Sentry.captureException(error, {
      tags: { component: 'email_export' }
    });
    // Don't throw - email failure shouldn't break the export
  }
}

/**
 * Generate detailed email body with export information
 */
function generateEmailBody(metadata: any, downloadUrl: string): string {
  const templateName = metadata.template.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  
  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">Your ${templateName} Export is Ready!</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">Export Details</h3>
            <ul style="list-style: none; padding: 0;">
              <li style="padding: 5px 0;"><strong>Records:</strong> ${metadata.recordCount?.toLocaleString() || 'N/A'}</li>
              <li style="padding: 5px 0;"><strong>Template:</strong> ${templateName}</li>
              <li style="padding: 5px 0;"><strong>Run ID:</strong> ${metadata.runId || 'N/A'}</li>
              <li style="padding: 5px 0;"><strong>Generated:</strong> ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${downloadUrl}" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Download Export
            </a>
          </div>
          
          <p style="color: #6c757d; font-size: 14px; text-align: center;">
            This download link will expire in 24 hours for security reasons.
          </p>
          
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
          
          <p style="color: #6c757d; font-size: 12px; text-align: center;">
            This email was sent by the Dream 100 Keyword Engine export system.
          </p>
        </div>
      </body>
    </html>
  `;
}