/**
 * Export Progress Tracking API Route
 * 
 * GET /api/export/progress/:exportId
 * Get detailed progress information for a specific export
 * 
 * DELETE /api/export/progress/:exportId
 * Cancel a running export
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportService } from '../../../../../services/export';
import * as Sentry from '@sentry/nextjs';

interface ProgressResponse {
  success: boolean;
  data?: {
    exportId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number; // 0-100
    currentStage: string;
    recordsProcessed: number;
    totalRecords: number;
    startedAt: string;
    estimatedCompletion?: string;
    error?: string;
    stages: {
      name: string;
      completed: boolean;
      duration?: number;
      description: string;
    }[];
  };
  error?: {
    message: string;
    code: string;
  };
}

/**
 * GET /api/export/progress/:exportId
 * Get export progress information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> }
): Promise<NextResponse<ProgressResponse>> {
  try {
    const { exportId } = await params;

    if (!exportId) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Export ID is required',
          code: 'MISSING_PARAMETER'
        }
      }, { status: 400 });
    }

    const progress = exportService.getExportProgress(exportId);

    if (!progress) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Export progress not found or expired',
          code: 'NOT_FOUND'
        }
      }, { status: 404 });
    }

    // Calculate estimated completion time
    let estimatedCompletion: string | undefined;
    if (progress.status === 'processing' && progress.progress > 0) {
      const elapsed = Date.now() - new Date(progress.startedAt).getTime();
      const estimated = (elapsed / progress.progress) * 100;
      estimatedCompletion = new Date(Date.now() + estimated - elapsed).toISOString();
    }

    // Define export stages for detailed progress tracking
    const stages = [
      {
        name: 'validation',
        completed: progress.progress > 10,
        description: 'Validating export configuration'
      },
      {
        name: 'fetching_data',
        completed: progress.progress > 20,
        description: 'Fetching data from database'
      },
      {
        name: 'applying_filters',
        completed: progress.progress > 40,
        description: 'Applying filters and sorting'
      },
      {
        name: 'transforming_data',
        completed: progress.progress > 60,
        description: 'Transforming data for export format'
      },
      {
        name: 'generating_files',
        completed: progress.progress > 80,
        description: 'Generating export files'
      },
      {
        name: 'calculating_analytics',
        completed: progress.progress > 90,
        description: 'Calculating analytics and insights'
      },
      {
        name: 'complete',
        completed: progress.status === 'completed',
        description: 'Export completed successfully'
      }
    ];

    // Track progress check
    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Progress checked',
      data: {
        exportId,
        status: progress.status,
        progress: progress.progress,
        currentStage: progress.currentStage
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        exportId: progress.exportId,
        status: progress.status,
        progress: progress.progress,
        currentStage: progress.currentStage,
        recordsProcessed: progress.recordsProcessed,
        totalRecords: progress.totalRecords,
        startedAt: progress.startedAt,
        estimatedCompletion,
        error: progress.error,
        stages
      }
    });

  } catch (error) {
    Sentry.captureException(error, {
      tags: { api_route: 'export_progress' }
    });

    return NextResponse.json({
      success: false,
      error: {
        message: 'Failed to get export progress',
        code: 'PROGRESS_ERROR'
      }
    }, { status: 500 });
  }
}

/**
 * DELETE /api/export/progress/:exportId
 * Cancel a running export
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> }
): Promise<NextResponse<{ success: boolean; data?: { cancelled: boolean }; error?: { message: string; code: string } }>> {
  try {
    const { exportId } = await params;

    if (!exportId) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Export ID is required',
          code: 'MISSING_PARAMETER'
        }
      }, { status: 400 });
    }

    const cancelled = await exportService.cancelExport(exportId);

    // Track cancellation attempt
    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Export cancellation attempted',
      data: {
        exportId,
        cancelled
      }
    });

    return NextResponse.json({
      success: true,
      data: {
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
        code: 'CANCEL_ERROR'
      }
    }, { status: 500 });
  }
}