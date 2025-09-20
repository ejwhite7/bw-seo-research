/**
 * Keyword Data Models
 * 
 * Core interfaces for individual keywords with stage-specific metrics,
 * scoring, and enrichment data from external APIs.
 */

import { z } from 'zod';
import type { KeywordStage, KeywordIntent } from '../types/database';
import type { UUID, Timestamp, KeywordString } from './index';

/**
 * Core keyword interface matching database schema
 */
export interface Keyword {
  readonly id: UUID;
  readonly runId: UUID;
  readonly clusterId: UUID | null;
  readonly keyword: KeywordString;
  readonly stage: KeywordStage;
  readonly volume: number;
  readonly difficulty: number;
  readonly intent: KeywordIntent | null;
  readonly relevance: number;
  readonly trend: number;
  readonly blendedScore: number;
  readonly quickWin: boolean;
  readonly canonicalKeyword: KeywordString | null;
  readonly topSerpUrls: string[] | null;
  readonly embedding: number[] | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/**
 * Keyword creation input with required fields
 */
export interface CreateKeywordInput {
  readonly runId: UUID;
  readonly keyword: string;
  readonly stage: KeywordStage;
  readonly volume?: number;
  readonly difficulty?: number;
  readonly intent?: KeywordIntent;
  readonly relevance?: number;
  readonly trend?: number;
  readonly canonicalKeyword?: string;
  readonly topSerpUrls?: string[];
}

/**
 * Keyword update input with optional fields
 */
export interface UpdateKeywordInput {
  readonly clusterId?: UUID | null;
  readonly volume?: number;
  readonly difficulty?: number;
  readonly intent?: KeywordIntent | null;
  readonly relevance?: number;
  readonly trend?: number;
  readonly blendedScore?: number;
  readonly quickWin?: boolean;
  readonly canonicalKeyword?: string | null;
  readonly topSerpUrls?: string[] | null;
  readonly embedding?: number[] | null;
}

/**
 * Keyword with expanded cluster information
 */
export interface KeywordWithCluster extends Keyword {
  readonly cluster: {
    readonly id: UUID;
    readonly label: string;
    readonly score: number;
    readonly size: number;
  } | null;
}

/**
 * Enriched keyword with additional metrics and analysis
 */
export interface EnrichedKeyword extends Keyword {
  readonly metrics: {
    readonly cpc: number | null;
    readonly trafficPotential: number | null;
    readonly returnRate: number | null;
    readonly clicks: number | null;
    readonly globalVolume: number | null;
  };
  readonly serpFeatures: Array<{
    readonly type: string;
    readonly count: number;
    readonly positions: number[];
  }>;
  readonly competitors: Array<{
    readonly domain: string;
    readonly position: number;
    readonly url: string;
    readonly title: string;
    readonly traffic: number;
  }>;
  readonly parentTopic: {
    readonly keyword: KeywordString;
    readonly volume: number;
  } | null;
}

/**
 * Keyword batch for processing operations
 */
export interface KeywordBatch {
  readonly keywords: CreateKeywordInput[];
  readonly batchId: UUID;
  readonly runId: UUID;
  readonly stage: KeywordStage;
  readonly priority: number;
}

/**
 * Keyword search and filtering parameters
 */
export interface KeywordSearchParams {
  readonly runId?: UUID;
  readonly clusterId?: UUID;
  readonly stage?: KeywordStage;
  readonly intent?: KeywordIntent;
  readonly volumeMin?: number;
  readonly volumeMax?: number;
  readonly difficultyMin?: number;
  readonly difficultyMax?: number;
  readonly scoreMin?: number;
  readonly scoreMax?: number;
  readonly quickWinOnly?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'volume' | 'difficulty' | 'score' | 'relevance' | 'trend';
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Keyword analytics and metrics
 */
export interface KeywordAnalytics {
  readonly totalKeywords: number;
  readonly avgVolume: number;
  readonly avgDifficulty: number;
  readonly avgScore: number;
  readonly quickWinCount: number;
  readonly stageDistribution: Record<KeywordStage, number>;
  readonly intentDistribution: Record<KeywordIntent, number>;
  readonly volumeDistribution: {
    readonly low: number; // 0-1000
    readonly medium: number; // 1001-10000
    readonly high: number; // 10001+
  };
  readonly difficultyDistribution: {
    readonly easy: number; // 0-30
    readonly medium: number; // 31-70
    readonly hard: number; // 71-100
  };
}

/**
 * Keyword performance tracking over time
 */
export interface KeywordPerformance {
  readonly keywordId: UUID;
  readonly keyword: KeywordString;
  readonly measurements: Array<{
    readonly date: string;
    readonly volume: number;
    readonly difficulty: number;
    readonly position: number | null;
    readonly traffic: number | null;
    readonly impressions: number | null;
    readonly clicks: number | null;
  }>;
  readonly trend: {
    readonly direction: 'up' | 'down' | 'stable';
    readonly strength: number; // -1 to 1
    readonly confidence: number; // 0 to 1
  };
}

/**
 * Keyword similarity and relationship data
 */
export interface KeywordSimilarity {
  readonly keyword1: KeywordString;
  readonly keyword2: KeywordString;
  readonly similarity: number; // 0 to 1
  readonly type: 'semantic' | 'lexical' | 'intent' | 'serp_overlap';
  readonly confidence: number;
}

/**
 * Validation schemas using Zod
 */
export const KeywordStageSchema = z.enum(['dream100', 'tier2', 'tier3']);
export const KeywordIntentSchema = z.enum(['transactional', 'commercial', 'informational', 'navigational']);

export const CreateKeywordInputSchema = z.object({
  runId: z.string().uuid(),
  keyword: z.string().min(1).max(255).transform(val => val.trim().toLowerCase() as KeywordString),
  stage: KeywordStageSchema,
  volume: z.number().int().min(0).max(10000000).optional(),
  difficulty: z.number().int().min(0).max(100).optional(),
  intent: KeywordIntentSchema.optional(),
  relevance: z.number().min(0).max(1).optional(),
  trend: z.number().min(-1).max(1).optional(),
  canonicalKeyword: z.string().min(1).max(255).transform(val => val.trim().toLowerCase() as KeywordString).optional(),
  topSerpUrls: z.array(z.string().url()).max(10).optional()
});

export const UpdateKeywordInputSchema = z.object({
  clusterId: z.string().uuid().nullable().optional(),
  volume: z.number().int().min(0).max(10000000).optional(),
  difficulty: z.number().int().min(0).max(100).optional(),
  intent: KeywordIntentSchema.nullable().optional(),
  relevance: z.number().min(0).max(1).optional(),
  trend: z.number().min(-1).max(1).optional(),
  blendedScore: z.number().min(0).max(1).optional(),
  quickWin: z.boolean().optional(),
  canonicalKeyword: z.string().min(1).max(255).transform(val => val.trim().toLowerCase() as KeywordString).nullable().optional(),
  topSerpUrls: z.array(z.string().url()).max(10).nullable().optional(),
  embedding: z.array(z.number()).max(1536).nullable().optional() // OpenAI embedding size
});

export const KeywordSearchParamsSchema = z.object({
  runId: z.string().uuid().optional(),
  clusterId: z.string().uuid().optional(),
  stage: KeywordStageSchema.optional(),
  intent: KeywordIntentSchema.optional(),
  volumeMin: z.number().int().min(0).optional(),
  volumeMax: z.number().int().min(0).optional(),
  difficultyMin: z.number().int().min(0).max(100).optional(),
  difficultyMax: z.number().int().min(0).max(100).optional(),
  scoreMin: z.number().min(0).max(1).optional(),
  scoreMax: z.number().min(0).max(1).optional(),
  quickWinOnly: z.boolean().optional(),
  search: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['volume', 'difficulty', 'score', 'relevance', 'trend']).default('score'),
  orderDirection: z.enum(['asc', 'desc']).default('desc')
}).refine(data => {
  if (data.volumeMin !== undefined && data.volumeMax !== undefined) {
    return data.volumeMin <= data.volumeMax;
  }
  return true;
}, {
  message: "volumeMin must be less than or equal to volumeMax"
}).refine(data => {
  if (data.difficultyMin !== undefined && data.difficultyMax !== undefined) {
    return data.difficultyMin <= data.difficultyMax;
  }
  return true;
}, {
  message: "difficultyMin must be less than or equal to difficultyMax"
}).refine(data => {
  if (data.scoreMin !== undefined && data.scoreMax !== undefined) {
    return data.scoreMin <= data.scoreMax;
  }
  return true;
}, {
  message: "scoreMin must be less than or equal to scoreMax"
});

/**
 * Type guards for runtime type checking
 */
export const isKeywordStage = (value: unknown): value is KeywordStage => {
  return typeof value === 'string' && ['dream100', 'tier2', 'tier3'].includes(value);
};

export const isKeywordIntent = (value: unknown): value is KeywordIntent => {
  return typeof value === 'string' && 
    ['transactional', 'commercial', 'informational', 'navigational'].includes(value);
};

export const isKeyword = (value: unknown): value is Keyword => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.runId === 'string' &&
    typeof obj.keyword === 'string' &&
    isKeywordStage(obj.stage) &&
    typeof obj.volume === 'number' &&
    typeof obj.difficulty === 'number' &&
    typeof obj.relevance === 'number' &&
    typeof obj.trend === 'number' &&
    typeof obj.blendedScore === 'number' &&
    typeof obj.quickWin === 'boolean' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Utility functions for keyword operations
 */
export const calculateQuickWin = (difficulty: number, volume: number, clusterMedianVolume?: number): boolean => {
  const ease = 1 - (difficulty / 100);
  const volumeThreshold = clusterMedianVolume || 1000;
  return ease >= 0.7 && volume >= volumeThreshold;
};

export const extractDomain = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

export const normalizeKeyword = (keyword: string): KeywordString => {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ') as KeywordString;
};

export const getKeywordVariations = (keyword: KeywordString): KeywordString[] => {
  const variations: string[] = [];
  const base = keyword.toString();
  
  // Add common question formats
  variations.push(
    `what is ${base}`,
    `how to ${base}`,
    `${base} tips`,
    `${base} guide`,
    `${base} examples`,
    `best ${base}`,
    `${base} vs`,
    `${base} benefits`
  );
  
  return variations.map(v => normalizeKeyword(v));
};