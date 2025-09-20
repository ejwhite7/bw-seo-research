/**
 * Content Calendar API Route
 * 
 * GET /api/roadmap/calendar?runId={runId}&view={view}&dri={dri}
 * Generates calendar view of editorial roadmap with filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RoadmapGenerationService } from '../../../../services/roadmap';
import type { ContentCalendar, CalendarFilters } from '../../../../models/roadmap';
import * as Sentry from '@sentry/nextjs';

// Query parameters validation
const CalendarQuerySchema = z.object({
  runId: z.string().uuid(),
  view: z.enum(['week', 'month', 'quarter']).default('month'),
  dri: z.string().optional(),
  stage: z.enum(['pillar', 'supporting']).optional(),
  intent: z.enum(['transactional', 'commercial', 'informational', 'navigational']).optional(),
  quickWinsOnly: z.string().transform(val => val === 'true').optional(),
  minVolume: z.string().transform(val => parseInt(val)).optional(),
  maxDifficulty: z.string().transform(val => parseInt(val)).optional(),
  clusters: z.string().transform(val => val.split(',').filter(Boolean)).optional()
});

interface CalendarResponse {
  success: boolean;
  data?: {
    calendar: ContentCalendar;
    summary: {
      totalPeriods: number;
      totalItems: number;
      avgItemsPerPeriod: number;
      peakPeriod: {
        label: string;
        itemCount: number;
      };
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse<CalendarResponse>> {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    
    const validatedParams = CalendarQuerySchema.parse(queryParams);
    const { runId, view, ...filterParams } = validatedParams;

    // Build filters
    const filters: CalendarFilters = {
      ...(filterParams.dri && { dri: filterParams.dri }),
      ...(filterParams.stage && { stage: filterParams.stage }),
      ...(filterParams.intent && { intent: filterParams.intent }),
      ...(filterParams.quickWinsOnly && { quickWinsOnly: filterParams.quickWinsOnly }),
      ...(filterParams.minVolume && { minVolume: filterParams.minVolume }),
      ...(filterParams.maxDifficulty && { maxDifficulty: filterParams.maxDifficulty }),
      ...(filterParams.clusters && { clusters: filterParams.clusters as any[] })
    };

    // Initialize service
    const serviceConfig = {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      defaultPostsPerMonth: 20,
      defaultDuration: 6,
      maxConcurrentTitleGeneration: 5,
      bufferDays: 2,
      holidayDates: [],
      workingDays: [1, 2, 3, 4]
    };

    const roadmapService = new RoadmapGenerationService(serviceConfig);

    // Fetch roadmap data
    const roadmap = await fetchRoadmapData(runId);
    
    if (!roadmap) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Roadmap not found',
          code: 'NOT_FOUND'
        }
      }, { status: 404 });
    }

    // Apply filters to roadmap items
    const filteredRoadmap = {
      ...roadmap,
      items: applyFilters(roadmap.items, filters)
    };

    // Generate calendar
    const calendar = roadmapService.createContentCalendar(filteredRoadmap, view, filters);

    // Calculate summary statistics
    const totalItems = calendar.periods.reduce((sum, period) => sum + period.items.length, 0);
    const avgItemsPerPeriod = totalItems / calendar.periods.length || 0;
    
    const peakPeriod = calendar.periods.reduce((peak, current) => 
      current.items.length > peak.items.length ? current : peak,
      calendar.periods[0] || { label: '', items: [] }
    );

    const summary = {
      totalPeriods: calendar.periods.length,
      totalItems,
      avgItemsPerPeriod: Math.round(avgItemsPerPeriod * 10) / 10,
      peakPeriod: {
        label: peakPeriod.label,
        itemCount: peakPeriod.items.length
      }
    };

    // Track API usage
    Sentry.addBreadcrumb({
      category: 'api_request',
      message: 'Calendar generated',
      data: {
        runId,
        view,
        filtersApplied: Object.keys(filters).length,
        periodsGenerated: calendar.periods.length,
        totalItems
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        calendar,
        summary
      }
    });

  } catch (error) {
    Sentry.captureException(error, {
      tags: { api_route: 'roadmap_calendar' }
    });

    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (error instanceof z.ZodError) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Invalid query parameters: ' + error.errors.map(e => e.message).join(', ');
    } else if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({
      success: false,
      error: {
        message,
        code: errorCode
      }
    }, { status: statusCode });
  }
}

/**
 * Fetch roadmap data from storage
 */
async function fetchRoadmapData(runId: string) {
  // Mock implementation - in real app, this would query the database
  return {
    runId,
    generatedAt: new Date().toISOString(),
    totalItems: 20,
    pillarItems: 6,
    supportingItems: 14,
    timeframe: {
      startDate: '2024-03-01',
      endDate: '2024-09-01',
      totalWeeks: 26,
      postsPerWeek: 4.6
    },
    items: Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i + 1}`,
      runId,
      clusterId: `cluster-${Math.floor(i / 5) + 1}`,
      postId: `post-${i + 1}`,
      stage: i < 6 ? 'pillar' : 'supporting',
      primaryKeyword: `keyword ${i + 1}`,
      secondaryKeywords: [`related ${i + 1}a`, `related ${i + 1}b`],
      intent: ['informational', 'commercial', 'transactional', 'navigational'][i % 4],
      volume: Math.max(500, 5000 - (i * 150)),
      difficulty: Math.min(80, 20 + (i * 2)),
      blendedScore: Math.max(0.3, 0.9 - (i * 0.025)),
      quickWin: i < 8 && Math.random() > 0.6,
      suggestedTitle: `Title for Keyword ${i + 1}`,
      dri: ['Writer A', 'Writer B', 'Editor C'][i % 3],
      dueDate: new Date(2024, 2, 1 + Math.floor(i * 7)).toISOString().split('T')[0],
      notes: i < 6 ? 'Pillar content - comprehensive guide needed' : null,
      sourceUrls: [`https://example${i + 1}.com`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cluster: {
        id: `cluster-${Math.floor(i / 5) + 1}`,
        label: `Cluster ${Math.floor(i / 5) + 1}`,
        score: 0.8,
        size: 5,
        intentMix: {
          transactional: 0.2,
          commercial: 0.3,
          informational: 0.4,
          navigational: 0.1
        }
      }
    })),
    analytics: {
      totalEstimatedTraffic: 50000,
      quickWinCount: 8,
      avgDifficulty: 45,
      intentDistribution: {
        transactional: 5,
        commercial: 5,
        informational: 5,
        navigational: 5
      },
      stageDistribution: {
        pillar: 6,
        supporting: 14
      },
      monthlyDistribution: [],
      driWorkload: [],
      contentTypes: []
    },
    recommendations: []
  };
}

/**
 * Apply filters to roadmap items
 */
function applyFilters(items: any[], filters: CalendarFilters) {
  return items.filter(item => {
    if (filters.dri && item.dri !== filters.dri) return false;
    if (filters.stage && item.stage !== filters.stage) return false;
    if (filters.intent && item.intent !== filters.intent) return false;
    if (filters.quickWinsOnly && !item.quickWin) return false;
    if (filters.minVolume && item.volume < filters.minVolume) return false;
    if (filters.maxDifficulty && item.difficulty > filters.maxDifficulty) return false;
    if (filters.clusters && !filters.clusters.includes(item.clusterId)) return false;
    
    return true;
  });
}