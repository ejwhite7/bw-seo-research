/**
 * Export Data Models
 * 
 * CSV export schemas, data transformation utilities,
 * and export configuration for keyword research results.
 */

import { z } from 'zod';
import type { UUID, Timestamp, KeywordString, DomainString } from './index';
import type { KeywordStage, KeywordIntent, RoadmapStage } from '../types/database';
import type { RoadmapItemWithCluster } from './roadmap';
import type { KeywordWithCluster } from './keyword';
import type { ClusterWithKeywords, IntentMix } from './cluster';

/**
 * Export configuration and settings
 */
export interface ExportConfig {
  readonly runId: UUID;
  readonly format: ExportFormat;
  readonly template: ExportTemplate;
  readonly filters: ExportFilters;
  readonly options: ExportOptions;
  readonly scheduling: ExportScheduling | null;
  readonly destinations: ExportDestination[];
}

/**
 * Available export formats
 */
export type ExportFormat = 'csv' | 'excel' | 'json' | 'pdf' | 'google_sheets' | 'airtable';

/**
 * Export template definitions
 */
export type ExportTemplate = 
  | 'editorial_roadmap'
  | 'keyword_universe'
  | 'cluster_analysis'
  | 'competitor_insights'
  | 'quick_wins'
  | 'custom';

/**
 * Export filtering criteria
 */
export interface ExportFilters {
  readonly keywords: {
    readonly stages?: KeywordStage[] | undefined;
    readonly intents?: KeywordIntent[] | undefined;
    readonly minVolume?: number | undefined;
    readonly maxVolume?: number | undefined;
    readonly minDifficulty?: number | undefined;
    readonly maxDifficulty?: number | undefined;
    readonly minScore?: number | undefined;
    readonly maxScore?: number | undefined;
    readonly quickWinsOnly?: boolean | undefined;
    readonly clusters?: UUID[] | undefined;
  };
  readonly roadmap: {
    readonly stages?: RoadmapStage[] | undefined;
    readonly dris?: string[] | undefined;
    readonly dueDateFrom?: string | undefined;
    readonly dueDateTo?: string | undefined;
    readonly includeNotes?: boolean | undefined;
  };
  readonly clusters: {
    readonly minSize?: number | undefined;
    readonly maxSize?: number | undefined;
    readonly minScore?: number | undefined;
    readonly primaryIntents?: KeywordIntent[] | undefined;
  };
}

/**
 * Export options and formatting
 */
export interface ExportOptions {
  readonly includeMetadata: boolean;
  readonly includeAnalytics: boolean;
  readonly groupBy?: 'cluster' | 'intent' | 'stage' | 'dri' | 'month' | undefined;
  readonly sortBy?: 'volume' | 'difficulty' | 'score' | 'date' | 'alphabetical' | undefined;
  readonly sortDirection?: 'asc' | 'desc' | undefined;
  readonly maxRows?: number | undefined;
  readonly customFields?: CustomField[] | undefined;
  readonly formatting: {
    readonly dateFormat: 'US' | 'EU' | 'ISO';
    readonly numberFormat: 'US' | 'EU';
    readonly currencySymbol: string;
    readonly booleanFormat: 'true_false' | 'yes_no' | '1_0';
  };
}

/**
 * Custom field definition
 */
export interface CustomField {
  readonly name: string;
  readonly type: 'text' | 'number' | 'boolean' | 'date' | 'url';
  readonly source: 'keyword' | 'cluster' | 'roadmap' | 'calculated';
  readonly formula?: string; // for calculated fields
  readonly defaultValue?: string;
  readonly visible: boolean;
}

/**
 * Export scheduling configuration
 */
export interface ExportScheduling {
  readonly enabled: boolean;
  readonly frequency: 'daily' | 'weekly' | 'monthly';
  readonly dayOfWeek?: number | undefined; // 0-6 for weekly
  readonly dayOfMonth?: number | undefined; // 1-31 for monthly
  readonly time: string; // HH:mm format
  readonly timezone: string;
  readonly lastRun?: Timestamp | undefined;
  readonly nextRun?: Timestamp | undefined;
}

/**
 * Export destination configuration
 */
export interface ExportDestination {
  readonly type: 'email' | 'url' | 'cloud_storage' | 'database';
  readonly config?: DestinationConfig;
  readonly enabled: boolean;
}

/**
 * Destination-specific configuration
 */
export type DestinationConfig = 
  | EmailDestination
  | WebhookDestination
  | CloudStorageDestination
  | DatabaseDestination;

export interface EmailDestination {
  readonly type: 'email';
  readonly recipients: string[];
  readonly subject: string;
  readonly body: string;
  readonly attachmentName: string;
}

export interface WebhookDestination {
  readonly type: 'url';
  readonly url: string;
  readonly method: 'POST' | 'PUT';
  readonly headers: Record<string, string>;
  readonly authentication?: {
    readonly type: 'bearer' | 'basic' | 'api_key';
    readonly credentials: string;
  };
}

export interface CloudStorageDestination {
  readonly type: 'cloud_storage';
  readonly provider: 'aws' | 'gcp' | 'azure';
  readonly bucket: string;
  readonly path: string;
  readonly credentials: string;
  readonly publicAccess: boolean;
}

export interface DatabaseDestination {
  readonly type: 'database';
  readonly connectionString: string;
  readonly tableName: string;
  readonly upsertMode: boolean;
  readonly primaryKey: string;
}

/**
 * Export execution result
 */
export interface ExportResult {
  readonly id: UUID;
  readonly runId: UUID;
  readonly config: ExportConfig;
  readonly status: ExportStatus;
  readonly startedAt: Timestamp;
  readonly completedAt: Timestamp | null;
  readonly metadata: ExportMetadata;
  readonly files: ExportFile[];
  readonly error: ExportError | null;
  readonly analytics: ExportAnalytics;
}

/**
 * Export status enumeration
 */
export type ExportStatus = 
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Export metadata
 */
export interface ExportMetadata {
  readonly totalRecords: number;
  readonly processedRecords: number;
  readonly skippedRecords: number;
  readonly fileSize: number; // bytes
  readonly processingTime: number; // milliseconds
  readonly version: string;
  readonly generatedBy: UUID;
  readonly checksum: string;
}

/**
 * Export file information
 */
export interface ExportFile {
  readonly name: string;
  readonly path: string;
  readonly format: ExportFormat;
  readonly size: number; // bytes
  readonly records: number;
  readonly downloadUrl: string;
  readonly expiresAt: Timestamp;
  readonly checksum: string;
}

/**
 * Export error information
 */
export interface ExportError {
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;
  readonly suggestion?: string;
}

/**
 * Export analytics and insights
 */
export interface ExportAnalytics {
  readonly dataQuality: {
    readonly completeness: number; // percentage
    readonly accuracy: number; // percentage
    readonly consistency: number; // percentage
  };
  readonly distribution: {
    readonly recordsByType: Record<string, number>;
    readonly recordsByStage: Record<string, number>;
    readonly recordsByIntent: Record<string, number>;
  };
  readonly summary: {
    readonly totalKeywords: number;
    readonly totalClusters: number;
    readonly totalRoadmapItems: number;
    readonly quickWinCount: number;
    readonly avgDifficulty: number;
    readonly totalVolume: number;
  };
  readonly recommendations: string[];
}

/**
 * CSV Schema Definitions - Editorial Roadmap
 */
export interface EditorialRoadmapCSV {
  readonly post_id: string;
  readonly cluster_label: string;
  readonly stage: RoadmapStage;
  readonly primary_keyword: string;
  readonly secondary_keywords: string; // comma-separated
  readonly intent: KeywordIntent | null;
  readonly volume: number;
  readonly difficulty: number;
  readonly blended_score: number;
  readonly quick_win: boolean;
  readonly suggested_title: string | null;
  readonly dri: string | null;
  readonly due_date: string | null;
  readonly notes: string | null;
  readonly source_urls: string; // comma-separated
  readonly run_id: string;
  readonly estimated_traffic: number;
  readonly content_type: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly status: 'not_started' | 'in_progress' | 'completed';
}

/**
 * CSV Schema - Keyword Universe
 */
export interface KeywordUniverseCSV {
  readonly keyword: string;
  readonly tier: KeywordStage;
  readonly cluster_label: string | null;
  readonly volume: number;
  readonly difficulty: number;
  readonly intent: KeywordIntent | null;
  readonly relevance: number;
  readonly trend: number;
  readonly blended_score: number;
  readonly quick_win: boolean;
  readonly canonical_keyword: string | null;
  readonly top_serp_urls: string; // comma-separated
  readonly cpc: number | null;
  readonly traffic_potential: number | null;
  readonly parent_topic: string | null;
  readonly serp_features: string; // comma-separated
  readonly competition_level: 'low' | 'medium' | 'high';
  readonly content_opportunity: string;
  readonly last_updated: string;
}

/**
 * CSV Schema - Cluster Analysis
 */
export interface ClusterAnalysisCSV {
  readonly cluster_id: string;
  readonly cluster_label: string;
  readonly size: number;
  readonly score: number;
  readonly primary_intent: KeywordIntent;
  readonly intent_distribution: string; // JSON string
  readonly representative_keywords: string; // comma-separated
  readonly avg_volume: number;
  readonly avg_difficulty: number;
  readonly total_volume: number;
  readonly quick_win_count: number;
  readonly content_pillar: string;
  readonly recommended_content_type: string;
  readonly priority_level: 'high' | 'medium' | 'low';
  readonly seasonal_trend: string | null;
  readonly competitive_landscape: string;
}

/**
 * CSV Schema - Competitor Insights
 */
export interface CompetitorInsightsCSV {
  readonly domain: DomainString;
  readonly discovery_keyword: string;
  readonly total_titles: number;
  readonly unique_titles: number;
  readonly scrape_status: string;
  readonly content_themes: string; // comma-separated
  readonly avg_title_length: number;
  readonly content_frequency: number; // posts per month
  readonly domain_authority: number | null;
  readonly estimated_traffic: number | null;
  readonly content_gaps: string; // JSON array
  readonly opportunities: string; // JSON array
  readonly scrape_date: string;
  readonly last_updated: string;
}

/**
 * CSV Schema - Quick Wins Report
 */
export interface QuickWinsCSV {
  readonly keyword: string;
  readonly volume: number;
  readonly difficulty: number;
  readonly ease_score: number; // 1 - (difficulty/100)
  readonly intent: KeywordIntent | null;
  readonly cluster_label: string | null;
  readonly estimated_traffic: number;
  readonly competition_analysis: string;
  readonly content_suggestion: string;
  readonly priority_score: number;
  readonly effort_estimate: 'low' | 'medium' | 'high';
  readonly time_to_rank: string; // estimated months
  readonly recommended_content_type: string;
  readonly target_audience: string;
}

/**
 * Validation schemas using Zod
 */
export const ExportFormatSchema = z.enum(['csv', 'excel', 'json', 'pdf', 'google_sheets', 'airtable']);
export const ExportTemplateSchema = z.enum([
  'editorial_roadmap', 'keyword_universe', 'cluster_analysis', 
  'competitor_insights', 'quick_wins', 'custom'
]);

export const ExportFiltersSchema = z.object({
  keywords: z.object({
    stages: z.array(z.enum(['dream100', 'tier2', 'tier3'])).optional(),
    intents: z.array(z.enum(['transactional', 'commercial', 'informational', 'navigational'])).optional(),
    minVolume: z.number().int().min(0).optional(),
    maxVolume: z.number().int().min(0).optional(),
    minDifficulty: z.number().int().min(0).max(100).optional(),
    maxDifficulty: z.number().int().min(0).max(100).optional(),
    minScore: z.number().min(0).max(1).optional(),
    maxScore: z.number().min(0).max(1).optional(),
    quickWinsOnly: z.boolean().optional(),
    clusters: z.array(z.string().uuid()).optional()
  }),
  roadmap: z.object({
    stages: z.array(z.enum(['pillar', 'supporting'])).optional(),
    dris: z.array(z.string().min(1).max(100)).optional(),
    dueDateFrom: z.string().date().optional(),
    dueDateTo: z.string().date().optional(),
    includeNotes: z.boolean().default(true)
  }),
  clusters: z.object({
    minSize: z.number().int().min(1).optional(),
    maxSize: z.number().int().min(1).optional(),
    minScore: z.number().min(0).max(1).optional(),
    primaryIntents: z.array(z.enum(['transactional', 'commercial', 'informational', 'navigational'])).optional()
  })
});

export const ExportConfigSchema = z.object({
  runId: z.string().uuid(),
  format: ExportFormatSchema,
  template: ExportTemplateSchema,
  filters: ExportFiltersSchema,
  options: z.object({
    includeMetadata: z.boolean().default(true),
    includeAnalytics: z.boolean().default(false),
    groupBy: z.enum(['cluster', 'intent', 'stage', 'dri', 'month']).optional(),
    sortBy: z.enum(['volume', 'difficulty', 'score', 'date', 'alphabetical']).default('score'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
    maxRows: z.number().int().min(1).max(100000).optional(),
    customFields: z.array(z.object({
      name: z.string().min(1).max(50),
      type: z.enum(['text', 'number', 'boolean', 'date', 'url']),
      source: z.enum(['keyword', 'cluster', 'roadmap', 'calculated']),
      formula: z.string().max(500).optional(),
      defaultValue: z.string().max(100).optional(),
      visible: z.boolean().default(true)
    })).default([]),
    formatting: z.object({
      dateFormat: z.enum(['US', 'EU', 'ISO']).default('US'),
      numberFormat: z.enum(['US', 'EU']).default('US'),
      currencySymbol: z.string().length(1).default('$'),
      booleanFormat: z.enum(['true_false', 'yes_no', '1_0']).default('true_false')
    })
  }),
  scheduling: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().min(1).max(50),
    lastRun: z.string().optional(),
    nextRun: z.string().optional()
  }).nullable(),
  destinations: z.array(z.object({
    type: z.enum(['email', 'url', 'cloud_storage', 'database']),
    config: z.any(), // Allowing any config type for flexibility
    enabled: z.boolean().default(true)
  })).default([])
});

/**
 * Type guards for runtime type checking
 */
export const isExportFormat = (value: unknown): value is ExportFormat => {
  return typeof value === 'string' && 
    ['csv', 'excel', 'json', 'pdf', 'google_sheets', 'airtable'].includes(value);
};

export const isExportStatus = (value: unknown): value is ExportStatus => {
  return typeof value === 'string' && 
    ['queued', 'processing', 'completed', 'failed', 'cancelled'].includes(value);
};

export const isExportResult = (value: unknown): value is ExportResult => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.runId === 'string' &&
    isExportStatus(obj.status) &&
    typeof obj.startedAt === 'string'
  );
};

/**
 * Data transformation utilities
 */
export const transformToEditorialRoadmapCSV = (
  roadmapItems: RoadmapItemWithCluster[],
  options: ExportOptions
): EditorialRoadmapCSV[] => {
  return roadmapItems.map(item => {
    const estimatedTraffic = Math.round(item.volume * 0.3); // Rough CTR estimate
    const contentType = inferContentType(item.intent, item.primaryKeyword);
    const priority = item.blendedScore >= 0.7 ? 'high' : item.blendedScore >= 0.4 ? 'medium' : 'low';
    
    return {
      post_id: item.postId,
      cluster_label: item.cluster?.label || 'Unclustered',
      stage: item.stage,
      primary_keyword: item.primaryKeyword.toString(),
      secondary_keywords: (item.secondaryKeywords || []).join(', '),
      intent: item.intent,
      volume: item.volume,
      difficulty: item.difficulty,
      blended_score: Math.round(item.blendedScore * 100) / 100,
      quick_win: item.quickWin,
      suggested_title: item.suggestedTitle,
      dri: item.dri,
      due_date: item.dueDate,
      notes: item.notes,
      source_urls: (item.sourceUrls || []).join(', '),
      run_id: item.runId,
      estimated_traffic: estimatedTraffic,
      content_type: contentType,
      priority: priority as 'high' | 'medium' | 'low',
      status: 'not_started' as const
    };
  });
};

export const transformToKeywordUniverseCSV = (
  keywords: KeywordWithCluster[],
  options: ExportOptions
): KeywordUniverseCSV[] => {
  return keywords.map(keyword => {
    const competitionLevel = keyword.difficulty >= 70 ? 'high' : 
                           keyword.difficulty >= 40 ? 'medium' : 'low';
    const contentOpportunity = generateContentOpportunity(keyword);
    
    return {
      keyword: keyword.keyword.toString(),
      tier: keyword.stage,
      cluster_label: keyword.cluster?.label || null,
      volume: keyword.volume,
      difficulty: keyword.difficulty,
      intent: keyword.intent,
      relevance: Math.round(keyword.relevance * 100) / 100,
      trend: Math.round(keyword.trend * 100) / 100,
      blended_score: Math.round(keyword.blendedScore * 100) / 100,
      quick_win: keyword.quickWin,
      canonical_keyword: keyword.canonicalKeyword?.toString() || null,
      top_serp_urls: (keyword.topSerpUrls || []).join(', '),
      cpc: null, // Would be populated from enriched data
      traffic_potential: Math.round(keyword.volume * 0.3),
      parent_topic: keyword.canonicalKeyword?.toString() || null,
      serp_features: '', // Would be populated from SERP data
      competition_level: competitionLevel as 'low' | 'medium' | 'high',
      content_opportunity: contentOpportunity,
      last_updated: keyword.updatedAt
    };
  });
};

export const transformToClusterAnalysisCSV = (
  clusters: ClusterWithKeywords[],
  options: ExportOptions
): ClusterAnalysisCSV[] => {
  return clusters.map(cluster => {
    const primaryIntent = getPrimaryIntent(cluster.intentMix);
    const priorityLevel = cluster.score >= 0.7 ? 'high' : cluster.score >= 0.4 ? 'medium' : 'low';
    const contentPillar = generateContentPillar(cluster.label, cluster.analytics.topKeywords);
    
    return {
      cluster_id: cluster.id,
      cluster_label: cluster.label,
      size: cluster.size,
      score: Math.round(cluster.score * 100) / 100,
      primary_intent: primaryIntent,
      intent_distribution: JSON.stringify(cluster.intentMix),
      representative_keywords: cluster.representativeKeywords.join(', '),
      avg_volume: Math.round(cluster.analytics.avgVolume),
      avg_difficulty: Math.round(cluster.analytics.avgDifficulty),
      total_volume: Math.round(cluster.analytics.totalVolume),
      quick_win_count: cluster.analytics.quickWinCount,
      content_pillar: contentPillar,
      recommended_content_type: recommendContentType(primaryIntent, cluster.analytics.avgVolume),
      priority_level: priorityLevel as 'high' | 'medium' | 'low',
      seasonal_trend: null, // Would be populated from trend analysis
      competitive_landscape: assessCompetitiveLandscape(cluster.analytics.avgDifficulty)
    };
  });
};

/**
 * Helper functions for data transformation
 */
const inferContentType = (intent: KeywordIntent | null, keyword: KeywordString): string => {
  if (!intent) return 'Blog Post';
  
  const keywordStr = keyword.toString().toLowerCase();
  
  if (intent === 'transactional') return 'Landing Page';
  if (intent === 'commercial') {
    if (keywordStr.includes('vs') || keywordStr.includes('compare')) return 'Comparison';
    if (keywordStr.includes('best') || keywordStr.includes('top')) return 'Listicle';
    return 'Product Guide';
  }
  if (intent === 'informational') {
    if (keywordStr.includes('how') || keywordStr.includes('guide')) return 'How-to Guide';
    if (keywordStr.includes('what') || keywordStr.includes('definition')) return 'Explainer';
    return 'Blog Post';
  }
  
  return 'Blog Post';
};

const generateContentOpportunity = (keyword: KeywordWithCluster): string => {
  const { volume, difficulty, quickWin, intent } = keyword;
  
  if (quickWin) return 'Quick Win - Low competition, good volume';
  if (volume > 10000 && difficulty < 50) return 'High Impact - High volume, manageable difficulty';
  if (difficulty < 30) return 'Low Hanging Fruit - Very low difficulty';
  if (volume > 50000) return 'High Volume - Significant traffic potential';
  if (intent === 'commercial') return 'Commercial Intent - Revenue opportunity';
  
  return 'Standard Opportunity - Balanced metrics';
};

const getPrimaryIntent = (intentMix: IntentMix): KeywordIntent => {
  const intents: Array<[KeywordIntent, number]> = [
    ['transactional', intentMix.transactional],
    ['commercial', intentMix.commercial], 
    ['informational', intentMix.informational],
    ['navigational', intentMix.navigational]
  ];
  const sorted = intents.sort(([, a], [, b]) => b - a);
  return sorted[0][0];
};

const generateContentPillar = (label: string, topKeywords: Array<{ keyword: KeywordString }>): string => {
  // Extract main theme from cluster label and top keywords
  const mainTerm = label.split(' ')[0];
  return `${mainTerm.charAt(0).toUpperCase() + mainTerm.slice(1)} Hub`;
};

const recommendContentType = (intent: KeywordIntent, avgVolume: number): string => {
  if (avgVolume > 10000) {
    return intent === 'commercial' ? 'Comprehensive Guide' : 'Pillar Page';
  }
  
  switch (intent) {
    case 'transactional': return 'Landing Page';
    case 'commercial': return 'Comparison Post';
    case 'informational': return 'How-to Guide';
    case 'navigational': return 'Resource Page';
    default: return 'Blog Post';
  }
};

const assessCompetitiveLandscape = (avgDifficulty: number): string => {
  if (avgDifficulty >= 70) return 'Highly Competitive';
  if (avgDifficulty >= 50) return 'Moderately Competitive';
  if (avgDifficulty >= 30) return 'Low Competition';
  return 'Very Low Competition';
};

/**
 * Export utility functions
 */
export const getExportFileExtension = (format: ExportFormat): string => {
  switch (format) {
    case 'csv': return '.csv';
    case 'excel': return '.xlsx';
    case 'json': return '.json';
    case 'pdf': return '.pdf';
    default: return '.csv';
  }
};

export const getExportMimeType = (format: ExportFormat): string => {
  switch (format) {
    case 'csv': return 'text/csv';
    case 'excel': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'json': return 'application/json';
    case 'pdf': return 'application/pdf';
    default: return 'text/csv';
  }
};

export const generateExportFilename = (
  template: ExportTemplate,
  runId: UUID,
  format: ExportFormat,
  timestamp?: string
): string => {
  const dateStr = timestamp ? new Date(timestamp).toISOString().slice(0, 10) : 
                             new Date().toISOString().slice(0, 10);
  const runIdShort = runId.slice(0, 8);
  const extension = getExportFileExtension(format);
  
  return `${template}-${runIdShort}-${dateStr}${extension}`;
};

export const calculateExportSize = (recordCount: number, format: ExportFormat): number => {
  // Rough size estimates in bytes
  const avgRecordSizes: Record<ExportFormat, number> = {
    'csv': 200,
    'excel': 300,
    'json': 400,
    'pdf': 500,
    'google_sheets': 200,
    'airtable': 300
  };
  
  return recordCount * (avgRecordSizes[format] || 200);
};

export const formatExportValue = (
  value: unknown,
  type: 'text' | 'number' | 'boolean' | 'date' | 'url',
  formatting: ExportOptions['formatting']
): string => {
  if (value === null || value === undefined) return '';
  
  switch (type) {
    case 'boolean':
      const boolVal = Boolean(value);
      switch (formatting.booleanFormat) {
        case 'yes_no': return boolVal ? 'Yes' : 'No';
        case '1_0': return boolVal ? '1' : '0';
        default: return boolVal ? 'true' : 'false';
      }
    
    case 'number':
      const numVal = Number(value);
      return formatting.numberFormat === 'EU' ? 
        numVal.toLocaleString('de-DE') : 
        numVal.toLocaleString('en-US');
    
    case 'date':
      const dateVal = new Date(value as string);
      switch (formatting.dateFormat) {
        case 'EU': return dateVal.toLocaleDateString('en-GB');
        case 'ISO': return dateVal.toISOString().slice(0, 10);
        default: return dateVal.toLocaleDateString('en-US');
      }
    
    default:
      return String(value);
  }
};

export const validateExportData = (data: unknown[]): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!Array.isArray(data)) {
    errors.push('Export data must be an array');
    return { isValid: false, errors };
  }
  
  if (data.length === 0) {
    errors.push('Export data is empty');
    return { isValid: false, errors };
  }
  
  if (data.length > 100000) {
    errors.push('Export data exceeds maximum allowed records (100,000)');
  }
  
  // Check for consistent object structure
  if (data.length > 0) {
    const firstItem = data[0];
    const keys = Object.keys(firstItem as object);
    
    for (let i = 1; i < Math.min(data.length, 10); i++) {
      const itemKeys = Object.keys(data[i] as object);
      if (itemKeys.length !== keys.length || !keys.every(key => itemKeys.includes(key))) {
        errors.push('Inconsistent object structure in export data');
        break;
      }
    }
  }
  
  return { isValid: errors.length === 0, errors };
};