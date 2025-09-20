/**
 * Editorial Roadmap Generation API Route
 * 
 * POST /api/roadmap/generate
 * Generates a complete editorial roadmap from prioritized keyword clusters
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RoadmapGenerationService } from '../../../../services/roadmap';
import { RoadmapGenerationConfigSchema } from '../../../../models/roadmap';
import { ErrorHandler } from '../../../../utils/error-handler';
import type { ClusterWithKeywords } from '../../../../models/cluster';
import * as Sentry from '@sentry/nextjs';

// Request validation schema
const GenerateRoadmapRequestSchema = z.object({
  runId: z.string().uuid(),
  clusterIds: z.array(z.string().uuid()).min(1).max(100),
  config: RoadmapGenerationConfigSchema,
  options: z.object({
    includeAnalytics: z.boolean().default(true),
    includeBriefs: z.boolean().default(true),
    generateTitles: z.boolean().default(true),
    exportFormat: z.enum(['json', 'csv']).default('json')
  }).optional()
});

type GenerateRoadmapRequest = z.infer<typeof GenerateRoadmapRequestSchema>;

// Response interface
interface GenerateRoadmapResponse {
  success: boolean;
  data?: {
    roadmap: any;
    exportUrl?: string;
    processingTime: number;
  };
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateRoadmapResponse>> {
  const startTime = Date.now();
  // Error handler for this route
  const handleError = (error: Error) => ErrorHandler.handleWorkflowError(error, {
    stage: 'roadmap_generation',
    runId: 'unknown'
  });

  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = GenerateRoadmapRequestSchema.parse(body);
    
    const { runId, clusterIds, config, options = {} } = validatedRequest;

    // Log request for monitoring
    Sentry.addBreadcrumb({
      category: 'api_request',
      message: 'Roadmap generation requested',
      data: {
        runId,
        clusterCount: clusterIds.length,
        postsPerMonth: config.postsPerMonth,
        duration: config.duration,
        teamSize: config.teamMembers.length
      }
    });

    // Initialize service
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    const serviceConfig = {
      anthropicApiKey,
      defaultPostsPerMonth: 20,
      defaultDuration: 6,
      maxConcurrentTitleGeneration: 5,
      bufferDays: 2,
      holidayDates: getHolidayDates(),
      workingDays: [1, 2, 3, 4] // Mon-Thu
    };

    const roadmapService = new RoadmapGenerationService(serviceConfig);

    // Fetch clusters data (this would normally come from database)
    const clusters = await fetchClustersWithKeywords(runId, clusterIds);
    
    if (clusters.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'No valid clusters found for roadmap generation',
          code: 'NO_CLUSTERS_FOUND'
        }
      }, { status: 400 });
    }

    // Set up progress tracking (in real implementation, this might use WebSocket or server-sent events)
    let lastProgress: any = null;
    const onProgress = (progress: any) => {
      lastProgress = progress;
      // In a real implementation, you might emit this to a WebSocket or store in cache
      console.log(`Roadmap generation progress: ${progress.stage} - ${progress.currentStep}`);
    };

    // Generate roadmap
    const roadmap = await roadmapService.generateRoadmap(
      runId,
      clusters as unknown as ClusterWithKeywords[],
      config,
      onProgress
    );

    const processingTime = Date.now() - startTime;

    // Handle export if requested
    let exportUrl: string | undefined;
    if ((options as any).exportFormat === 'csv') {
      const csvData = roadmapService.exportToCsv(roadmap);
      exportUrl = await storeCsvExport(runId, csvData);
    }

    // Track successful generation
    Sentry.addBreadcrumb({
      category: 'roadmap_generation',
      message: 'Roadmap generated successfully',
      data: {
        runId,
        itemCount: roadmap.items.length,
        processingTime,
        pillarRatio: roadmap.pillarItems / roadmap.totalItems,
        quickWinCount: roadmap.analytics.quickWinCount
      }
    });

    const responseData = {
      roadmap: (options as any).includeAnalytics ? roadmap : {
        ...roadmap,
        analytics: undefined // Strip analytics if not requested
      },
      exportUrl,
      processingTime
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    const handledError = handleError(error as Error);
    
    Sentry.captureException(handledError, {
      tags: {
        api_route: 'roadmap_generate',
        error_type: handledError.name
      }
    });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    
    if (handledError.message.includes('validation')) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
    } else if (handledError.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
    } else if (handledError.message.includes('API key')) {
      statusCode = 401;
      errorCode = 'AUTHENTICATION_ERROR';
    }

    return NextResponse.json({
      success: false,
      error: {
        message: handledError.message,
        code: errorCode,
        ...(process.env.NODE_ENV === 'development' && { 
          details: handledError.stack 
        })
      }
    }, { status: statusCode });
  }
}

/**
 * Fetch clusters with keywords from database
 * In a real implementation, this would query the database
 */
async function fetchClustersWithKeywords(runId: string, clusterIds: string[]) {
  // Mock implementation - in real app, this would be a database query
  const mockClusters = [
    {
      id: clusterIds[0] || 'cluster-1',
      runId,
      label: 'Marketing Automation',
      size: 15,
      score: 0.85,
      intentMix: {
        transactional: 0.2,
        commercial: 0.4,
        informational: 0.3,
        navigational: 0.1
      },
      representativeKeywords: ['marketing automation', 'email automation', 'lead nurturing'],
      similarityThreshold: 0.75,
      embedding: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      keywords: Array.from({ length: 15 }, (_, i) => ({
        id: `keyword-${i + 1}`,
        runId,
        clusterId: clusterIds[0] || 'cluster-1',
        keyword: `marketing automation ${i + 1}`,
        stage: i < 5 ? 'dream100' : i < 10 ? 'tier2' : 'tier3',
        volume: Math.max(500, 5000 - (i * 200)),
        difficulty: Math.min(80, 25 + (i * 3)),
        intent: ['informational', 'commercial', 'transactional'][i % 3],
        relevance: Math.max(0.4, 0.95 - (i * 0.03)),
        trend: 0.1 + (Math.random() - 0.5) * 0.2,
        blendedScore: Math.max(0.3, 0.9 - (i * 0.03)),
        quickWin: i < 5 && Math.random() > 0.5,
        canonicalKeyword: i === 0 ? null : 'marketing automation',
        topSerpUrls: [`https://example${i + 1}.com/marketing-automation`],
        embedding: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })),
      analytics: {
        actualKeywordCount: 15,
        avgVolume: 3000,
        avgDifficulty: 45,
        avgBlendedScore: 0.65,
        quickWinCount: 4,
        medianVolume: 2800,
        totalVolume: 45000,
        difficultyRange: { min: 25, max: 68, spread: 43 },
        topKeywords: [
          { keyword: 'marketing automation', volume: 5000, score: 0.9 },
          { keyword: 'email automation', volume: 3500, score: 0.8 },
          { keyword: 'lead nurturing', volume: 2800, score: 0.75 }
        ],
        contentOpportunities: []
      }
    }
  ];

  return mockClusters;
}

/**
 * Get list of holiday dates to avoid scheduling
 */
function getHolidayDates(): string[] {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  return [
    // Major US holidays
    `${currentYear}-01-01`, // New Year's Day
    `${currentYear}-07-04`, // Independence Day
    `${currentYear}-11-28`, // Thanksgiving (approximate)
    `${currentYear}-12-25`, // Christmas
    `${nextYear}-01-01`,    // Next year New Year's
    `${nextYear}-07-04`,    // Next year Independence Day
    `${nextYear}-12-25`,    // Next year Christmas
  ];
}

/**
 * Store CSV export data and return download URL
 * In a real implementation, this would upload to cloud storage
 */
async function storeCsvExport(runId: string, csvData: any[]): Promise<string> {
  // Mock implementation - in real app, this would upload to S3/GCS/etc.
  const filename = `roadmap-${runId}-${Date.now()}.csv`;
  
  // Convert to CSV string
  if (csvData.length === 0) return '';
  
  const headers = Object.keys(csvData[0]);
  const csvContent = [
    headers.join(','),
    ...csvData.map(row => headers.map(header => {
      const value = row[header];
      // Escape commas and quotes in CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(','))
  ].join('\n');

  // In real implementation, upload to cloud storage
  // const uploadResult = await uploadToCloudStorage(filename, csvContent);
  // return uploadResult.url;
  
  // Mock URL
  return `/api/exports/${filename}`;
}

// Export type for API documentation
export type { GenerateRoadmapRequest, GenerateRoadmapResponse };