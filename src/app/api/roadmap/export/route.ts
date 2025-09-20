/**
 * Roadmap Export API Route
 * 
 * POST /api/roadmap/export
 * Exports roadmap data in various formats with custom filtering and templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RoadmapGenerationService } from '../../../../services/roadmap';
import { ExportConfigSchema } from '../../../../models/export';
import * as Sentry from '@sentry/nextjs';

// Request validation schema
const ExportRequestSchema = z.object({
  runId: z.string().uuid(),
  format: z.enum(['csv', 'excel', 'json']).default('csv'),
  template: z.enum([
    'editorial_roadmap',
    'content_calendar', 
    'team_assignments',
    'quick_wins_report',
    'custom'
  ]).default('editorial_roadmap'),
  filters: z.object({
    stages: z.array(z.enum(['pillar', 'supporting'])).optional(),
    intents: z.array(z.enum(['transactional', 'commercial', 'informational', 'navigational'])).optional(),
    dris: z.array(z.string()).optional(),
    dueDateFrom: z.string().date().optional(),
    dueDateTo: z.string().date().optional(),
    quickWinsOnly: z.boolean().optional(),
    minVolume: z.number().min(0).optional(),
    maxDifficulty: z.number().min(0).max(100).optional(),
    clusters: z.array(z.string().uuid()).optional()
  }).optional(),
  options: z.object({
    includeMetadata: z.boolean().default(true),
    includeAnalytics: z.boolean().default(false),
    groupBy: z.enum(['dri', 'cluster', 'month', 'stage', 'intent']).optional(),
    sortBy: z.enum(['dueDate', 'volume', 'difficulty', 'score', 'keyword']).default('dueDate'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
    customFields: z.array(z.object({
      name: z.string(),
      formula: z.string().optional(),
      defaultValue: z.string().optional()
    })).optional(),
    formatting: z.object({
      dateFormat: z.enum(['US', 'EU', 'ISO']).default('US'),
      numberFormat: z.enum(['US', 'EU']).default('US'),
      booleanFormat: z.enum(['true_false', 'yes_no', '1_0']).default('true_false')
    }).optional()
  }).optional(),
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

type ExportRequest = z.infer<typeof ExportRequestSchema>;

interface ExportResponse {
  success: boolean;
  data?: {
    exportId: string;
    downloadUrl?: string;
    filename: string;
    format: string;
    recordCount: number;
    fileSize: number;
    expiresAt: string;
    metadata: {
      generatedAt: string;
      template: string;
      filtersApplied: number;
      processingTime: number;
    };
  };
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ExportResponse>> {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const validatedRequest = ExportRequestSchema.parse(body);
    
    const { 
      runId, 
      format, 
      template, 
      filters = {}, 
      options = {},
      deliveryOptions = {}
    } = validatedRequest;

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

    // Apply filters
    const filteredItems = applyExportFilters(roadmap.items, filters);
    
    if (filteredItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'No items match the specified filters',
          code: 'NO_DATA'
        }
      }, { status: 400 });
    }

    // Apply sorting
    const sortedItems = applySorting(filteredItems, (options as any).sortBy || 'dueDate', (options as any).sortDirection || 'asc');

    // Generate export data based on template
    const exportData = await generateExportData(
      { ...roadmap, items: sortedItems },
      template,
      format,
      options
    );

    // Generate unique export ID
    const exportId = `export-${runId}-${Date.now()}`;
    const filename = generateFilename(template, runId, format);

    // Store export data and get download URL
    const { downloadUrl, fileSize } = await storeExportData(
      exportId,
      filename,
      exportData,
      format
    );

    // Handle delivery options
    if ((deliveryOptions as any).email) {
      await sendEmailExport(
        (deliveryOptions as any).email,
        filename,
        downloadUrl,
        {
          template,
          recordCount: filteredItems.length,
          runId
        }
      );
    }

    const processingTime = Date.now() - startTime;

    // Track export metrics
    Sentry.addBreadcrumb({
      category: 'export',
      message: 'Roadmap export completed',
      data: {
        runId,
        template,
        format,
        recordCount: filteredItems.length,
        fileSize,
        processingTime,
        filtersApplied: Object.keys(filters).length
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        exportId,
        downloadUrl: (deliveryOptions as any)?.downloadUrl !== false ? downloadUrl : undefined,
        filename,
        format,
        recordCount: filteredItems.length,
        fileSize,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        metadata: {
          generatedAt: new Date().toISOString(),
          template,
          filtersApplied: Object.keys(filters).length,
          processingTime
        }
      }
    });

  } catch (error) {
    Sentry.captureException(error, {
      tags: { api_route: 'roadmap_export' }
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
      }
    }

    return NextResponse.json({
      success: false,
      error: {
        message,
        code: errorCode,
        ...(process.env.NODE_ENV === 'development' && {
          details: error instanceof Error ? error.stack : String(error)
        })
      }
    }, { status: statusCode });
  }
}

/**
 * Fetch roadmap data (mock implementation)
 */
async function fetchRoadmapData(runId: string) {
  // Mock implementation - in real app, query database
  return {
    runId,
    generatedAt: new Date().toISOString(),
    totalItems: 25,
    pillarItems: 5,
    supportingItems: 20,
    timeframe: {
      startDate: '2024-03-01',
      endDate: '2024-09-01',
      totalWeeks: 26,
      postsPerWeek: 4.8
    },
    items: Array.from({ length: 25 }, (_, i) => ({
      id: `item-${i + 1}`,
      runId,
      clusterId: `cluster-${Math.floor(i / 5) + 1}`,
      postId: `post-${i + 1}`,
      stage: i < 5 ? 'pillar' : 'supporting',
      primaryKeyword: `keyword ${i + 1}`,
      secondaryKeywords: [`related ${i + 1}a`, `related ${i + 1}b`],
      intent: ['informational', 'commercial', 'transactional', 'navigational'][i % 4],
      volume: Math.max(500, 6000 - (i * 120)),
      difficulty: Math.min(85, 15 + (i * 2.5)),
      blendedScore: Math.max(0.2, 0.95 - (i * 0.025)),
      quickWin: i < 10 && (i % 3 === 0),
      suggestedTitle: `Complete Guide: ${i + 1} Ways to Master Keyword ${i + 1}`,
      dri: ['Sarah Chen', 'Mike Rodriguez', 'Emily Johnson', 'David Kim'][i % 4],
      dueDate: new Date(2024, 2, 1 + Math.floor(i * 5.2)).toISOString().split('T')[0],
      notes: i < 5 ? `Pillar content brief:\n- Comprehensive coverage needed\n- Target 3000+ words\n- Include case studies` : null,
      sourceUrls: [`https://competitor${i % 3 + 1}.com/example-${i + 1}`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cluster: {
        id: `cluster-${Math.floor(i / 5) + 1}`,
        label: `Marketing Topic ${Math.floor(i / 5) + 1}`,
        score: Math.max(0.6, 0.9 - (Math.floor(i / 5) * 0.05)),
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
      totalEstimatedTraffic: 85000,
      quickWinCount: 6,
      avgDifficulty: 48,
      intentDistribution: {
        transactional: 6,
        commercial: 7,
        informational: 6,
        navigational: 6
      },
      stageDistribution: {
        pillar: 5,
        supporting: 20
      },
      monthlyDistribution: [
        { month: '2024-03', items: 8, estimatedTraffic: 28000, quickWins: 3 },
        { month: '2024-04', items: 7, estimatedTraffic: 24000, quickWins: 2 },
        { month: '2024-05', items: 5, estimatedTraffic: 18000, quickWins: 1 },
        { month: '2024-06', items: 3, estimatedTraffic: 10000, quickWins: 0 },
        { month: '2024-07', items: 2, estimatedTraffic: 5000, quickWins: 0 }
      ],
      driWorkload: [
        { dri: 'Sarah Chen', itemsAssigned: 7, estimatedHours: 42, quickWins: 2 },
        { dri: 'Mike Rodriguez', itemsAssigned: 6, estimatedHours: 38, quickWins: 2 },
        { dri: 'Emily Johnson', itemsAssigned: 6, estimatedHours: 36, quickWins: 1 },
        { dri: 'David Kim', itemsAssigned: 6, estimatedHours: 34, quickWins: 1 }
      ],
      contentTypes: [
        { type: 'Comprehensive Guide', count: 5, avgDifficulty: 65 },
        { type: 'How-to Guide', count: 8, avgDifficulty: 42 },
        { type: 'Listicle', count: 7, avgDifficulty: 35 },
        { type: 'Comparison', count: 3, avgDifficulty: 55 },
        { type: 'Blog Post', count: 2, avgDifficulty: 28 }
      ]
    },
    recommendations: [
      'Strong quick-win opportunities in first quarter',
      'Balance pillar content timing for maximum impact',
      'Consider additional resources for high-competition keywords'
    ]
  };
}

/**
 * Apply export filters to roadmap items
 */
function applyExportFilters(items: any[], filters: any) {
  return items.filter(item => {
    if (filters.stages && !filters.stages.includes(item.stage)) return false;
    if (filters.intents && item.intent && !filters.intents.includes(item.intent)) return false;
    if (filters.dris && item.dri && !filters.dris.includes(item.dri)) return false;
    if (filters.quickWinsOnly && !item.quickWin) return false;
    if (filters.minVolume && item.volume < filters.minVolume) return false;
    if (filters.maxDifficulty && item.difficulty > filters.maxDifficulty) return false;
    if (filters.clusters && !filters.clusters.includes(item.clusterId)) return false;
    
    if (filters.dueDateFrom && item.dueDate) {
      if (new Date(item.dueDate) < new Date(filters.dueDateFrom)) return false;
    }
    
    if (filters.dueDateTo && item.dueDate) {
      if (new Date(item.dueDate) > new Date(filters.dueDateTo)) return false;
    }
    
    return true;
  });
}

/**
 * Apply sorting to items
 */
function applySorting(items: any[], sortBy: string, direction: string) {
  return [...items].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'dueDate':
        comparison = (a.dueDate || '').localeCompare(b.dueDate || '');
        break;
      case 'volume':
        comparison = a.volume - b.volume;
        break;
      case 'difficulty':
        comparison = a.difficulty - b.difficulty;
        break;
      case 'score':
        comparison = a.blendedScore - b.blendedScore;
        break;
      case 'keyword':
        comparison = a.primaryKeyword.localeCompare(b.primaryKeyword);
        break;
      default:
        comparison = 0;
    }
    
    return direction === 'desc' ? -comparison : comparison;
  });
}

/**
 * Generate export data based on template and format
 */
async function generateExportData(roadmap: any, template: string, format: string, options: any) {
  switch (template) {
    case 'editorial_roadmap':
      return generateEditorialRoadmapExport(roadmap, options);
    
    case 'content_calendar':
      return generateContentCalendarExport(roadmap, options);
    
    case 'team_assignments':
      return generateTeamAssignmentsExport(roadmap, options);
    
    case 'quick_wins_report':
      return generateQuickWinsExport(roadmap, options);
    
    default:
      return generateCustomExport(roadmap, options);
  }
}

function generateEditorialRoadmapExport(roadmap: any, options: any) {
  return roadmap.items.map((item: any, index: number) => ({
    post_id: item.postId,
    sequence: index + 1,
    cluster_label: item.cluster?.label || 'Unclustered',
    stage: item.stage,
    primary_keyword: item.primaryKeyword,
    secondary_keywords: (item.secondaryKeywords || []).join(', '),
    intent: item.intent || 'informational',
    volume: item.volume,
    difficulty: item.difficulty,
    blended_score: Math.round(item.blendedScore * 1000) / 1000,
    quick_win: item.quickWin,
    suggested_title: item.suggestedTitle || '',
    content_type: inferContentType(item),
    estimated_hours: estimateContentHours(item),
    dri: item.dri || 'Unassigned',
    due_date: item.dueDate || '',
    status: 'not_started',
    priority: item.blendedScore >= 0.7 ? 'high' : item.blendedScore >= 0.4 ? 'medium' : 'low',
    estimated_traffic: Math.round(item.volume * 0.3),
    notes: item.notes || '',
    source_urls: (item.sourceUrls || []).join(', '),
    run_id: item.runId,
    created_at: item.createdAt,
    last_updated: item.updatedAt
  }));
}

function generateContentCalendarExport(roadmap: any, options: any) {
  return roadmap.items.map((item: any) => ({
    week: getWeekOfYear(item.dueDate),
    month: item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '',
    due_date: item.dueDate || '',
    title: item.suggestedTitle || `Content for ${item.primaryKeyword}`,
    keyword: item.primaryKeyword,
    stage: item.stage,
    dri: item.dri || 'Unassigned',
    estimated_hours: estimateContentHours(item),
    quick_win: item.quickWin,
    priority: item.blendedScore >= 0.7 ? 'high' : item.blendedScore >= 0.4 ? 'medium' : 'low',
    cluster: item.cluster?.label || 'Unclustered'
  }));
}

function generateTeamAssignmentsExport(roadmap: any, options: any) {
  const driGroups = roadmap.items.reduce((groups: any, item: any) => {
    const dri = item.dri || 'Unassigned';
    if (!groups[dri]) {
      groups[dri] = [];
    }
    groups[dri].push(item);
    return groups;
  }, {});

  const assignments: any[] = [];
  
  Object.entries(driGroups).forEach(([dri, items]: [string, any]) => {
    (items as any[]).forEach(item => {
      assignments.push({
        dri,
        post_id: item.postId,
        title: item.suggestedTitle || item.primaryKeyword,
        keyword: item.primaryKeyword,
        stage: item.stage,
        due_date: item.dueDate || '',
        estimated_hours: estimateContentHours(item),
        difficulty: item.difficulty,
        volume: item.volume,
        quick_win: item.quickWin,
        priority: item.blendedScore >= 0.7 ? 'high' : item.blendedScore >= 0.4 ? 'medium' : 'low',
        notes: item.notes || ''
      });
    });
  });

  return assignments;
}

function generateQuickWinsExport(roadmap: any, options: any) {
  return roadmap.items
    .filter((item: any) => item.quickWin)
    .map((item: any) => ({
      keyword: item.primaryKeyword,
      volume: item.volume,
      difficulty: item.difficulty,
      ease_score: Math.round((1 - item.difficulty / 100) * 1000) / 1000,
      blended_score: item.blendedScore,
      intent: item.intent || 'informational',
      cluster: item.cluster?.label || 'Unclustered',
      suggested_title: item.suggestedTitle || '',
      estimated_traffic: Math.round(item.volume * 0.4), // Higher CTR for quick wins
      content_type: inferContentType(item),
      effort_estimate: item.difficulty < 30 ? 'low' : item.difficulty < 60 ? 'medium' : 'high',
      time_to_rank: item.difficulty < 30 ? '1-2 months' : item.difficulty < 60 ? '2-4 months' : '4-6 months',
      dri: item.dri || 'Unassigned',
      due_date: item.dueDate || '',
      priority_rank: Math.ceil(item.blendedScore * 100)
    }));
}

function generateCustomExport(roadmap: any, options: any) {
  // Custom export based on options.customFields
  return roadmap.items.map((item: any) => {
    const customData: any = {
      // Base fields
      keyword: item.primaryKeyword,
      volume: item.volume,
      difficulty: item.difficulty,
      stage: item.stage,
      dri: item.dri,
      due_date: item.dueDate
    };

    // Add custom fields if specified
    if (options.customFields) {
      options.customFields.forEach((field: any) => {
        if (field.formula) {
          // Simple formula evaluation (in real app, use a proper expression parser)
          customData[field.name] = field.defaultValue || '';
        } else {
          customData[field.name] = field.defaultValue || '';
        }
      });
    }

    return customData;
  });
}

/**
 * Helper functions
 */
function inferContentType(item: any): string {
  if (item.stage === 'pillar') return 'Comprehensive Guide';
  if (item.intent === 'transactional') return 'Landing Page';
  if (item.intent === 'commercial') return 'Product Guide';
  if (item.primaryKeyword.includes('how')) return 'How-to Guide';
  if (item.primaryKeyword.includes('best') || item.primaryKeyword.includes('top')) return 'Listicle';
  return 'Blog Post';
}

function estimateContentHours(item: any): number {
  const baseHours = item.stage === 'pillar' ? 8 : 4;
  const difficultyMultiplier = 1 + (item.difficulty / 100);
  return Math.round(baseHours * difficultyMultiplier);
}

function getWeekOfYear(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return `Week ${Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)}`;
}

function generateFilename(template: string, runId: string, format: string): string {
  const timestamp = new Date().toISOString().slice(0, 10);
  const runIdShort = runId.slice(0, 8);
  const extension = format === 'excel' ? 'xlsx' : format;
  return `${template}-${runIdShort}-${timestamp}.${extension}`;
}

/**
 * Store export data and return download URL
 */
async function storeExportData(exportId: string, filename: string, data: any[], format: string) {
  let content: string;
  let mimeType: string;

  switch (format) {
    case 'csv':
      content = convertToCSV(data);
      mimeType = 'text/csv';
      break;
    case 'json':
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      break;
    default:
      content = convertToCSV(data);
      mimeType = 'text/csv';
  }

  const fileSize = Buffer.byteLength(content, 'utf8');
  
  // In real implementation, upload to cloud storage (S3, GCS, etc.)
  // const uploadResult = await uploadToStorage(filename, content, mimeType);
  // return { downloadUrl: uploadResult.url, fileSize };
  
  // Mock implementation
  const downloadUrl = `/api/downloads/${exportId}/${filename}`;
  
  return { downloadUrl, fileSize };
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');
  
  return csvContent;
}

/**
 * Send export via email
 */
async function sendEmailExport(emailOptions: any, filename: string, downloadUrl: string, metadata: any) {
  // Mock implementation - in real app, integrate with email service
  console.log('Email export sent:', {
    recipients: emailOptions.recipients,
    filename,
    downloadUrl,
    metadata
  });
  
  // In real implementation:
  // await emailService.send({
  //   to: emailOptions.recipients,
  //   subject: emailOptions.subject || `Export Ready: ${filename}`,
  //   body: emailOptions.body || `Your export is ready for download: ${downloadUrl}`,
  //   attachments: [{ name: filename, url: downloadUrl }]
  // });
}