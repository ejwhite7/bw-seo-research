/**
 * Cluster Data Models
 * 
 * Semantic keyword groupings with similarity thresholds, intent analysis,
 * and cluster-level metrics for content planning.
 */

import { z } from 'zod';
import type { KeywordIntent } from '../types/database';
import type { UUID, Timestamp, KeywordString } from './index';
import type { Keyword } from './keyword';

/**
 * Core cluster interface matching database schema
 */
export interface Cluster {
  readonly id: UUID;
  readonly runId: UUID;
  readonly label: string;
  readonly size: number;
  readonly score: number;
  readonly intentMix: IntentMix;
  readonly representativeKeywords: KeywordString[];
  readonly similarityThreshold: number;
  readonly embedding: number[] | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/**
 * Intent distribution within a cluster
 */
export interface IntentMix {
  readonly transactional: number;
  readonly commercial: number;
  readonly informational: number;
  readonly navigational: number;
}

/**
 * Cluster creation input
 */
export interface CreateClusterInput {
  readonly runId: UUID;
  readonly label: string;
  readonly intentMix?: Partial<IntentMix>;
  readonly representativeKeywords?: string[];
  readonly similarityThreshold?: number;
  readonly embedding?: number[];
}

/**
 * Cluster update input
 */
export interface UpdateClusterInput {
  readonly label?: string;
  readonly score?: number;
  readonly intentMix?: Partial<IntentMix>;
  readonly representativeKeywords?: string[];
  readonly similarityThreshold?: number;
  readonly embedding?: number[];
}

/**
 * Cluster with associated keywords
 */
export interface ClusterWithKeywords extends Cluster {
  readonly keywords: Keyword[];
  readonly analytics: ClusterAnalytics;
}

/**
 * Detailed cluster analytics
 */
export interface ClusterAnalytics {
  readonly actualKeywordCount: number;
  readonly avgVolume: number;
  readonly avgDifficulty: number;
  readonly avgBlendedScore: number;
  readonly quickWinCount: number;
  readonly medianVolume: number;
  readonly totalVolume: number;
  readonly difficultyRange: {
    readonly min: number;
    readonly max: number;
    readonly spread: number;
  };
  readonly topKeywords: Array<{
    readonly keyword: KeywordString;
    readonly volume: number;
    readonly score: number;
  }>;
  readonly contentOpportunities: ContentOpportunity[];
}

/**
 * Content opportunity within a cluster
 */
export interface ContentOpportunity {
  readonly type: 'pillar' | 'supporting' | 'comparison' | 'how-to' | 'listicle' | 'guide';
  readonly priority: number; // 1-5
  readonly keywords: KeywordString[];
  readonly estimatedTraffic: number;
  readonly competitionLevel: 'low' | 'medium' | 'high';
  readonly contentFormat: string[];
  readonly suggestedTitle: string;
  readonly reasoning: string;
}

/**
 * Clustering configuration parameters
 */
export interface ClusteringParams {
  readonly method: 'semantic' | 'intent' | 'topic' | 'hybrid';
  readonly minClusterSize: number;
  readonly maxClusterSize: number;
  readonly similarityThreshold: number;
  readonly intentWeight: number; // 0-1
  readonly semanticWeight: number; // 0-1
  readonly maxClusters: number;
  readonly outlierThreshold: number;
}

/**
 * Clustering result with metadata
 */
export interface ClusteringResult {
  readonly clusters: ClusterWithKeywords[];
  readonly outliers: Keyword[];
  readonly unclusteredKeywords: Keyword[]; // Alias for outliers for compatibility
  readonly parameters: ClusteringParams;
  readonly metrics: ClusteringMetrics;
  readonly processingTime: number;
  readonly quality: ClusteringQuality;
}

/**
 * Clustering performance metrics
 */
export interface ClusteringMetrics {
  readonly totalKeywords: number;
  readonly clustersCreated: number;
  readonly outlierCount: number;
  readonly avgClusterSize: number;
  readonly avgSilhouetteScore: number;
  readonly silhouetteScore: number; // Alias for avgSilhouetteScore
  readonly withinClusterSimilarity: number;
  readonly betweenClusterSeparation: number;
  readonly coverageRatio: number; // keywords clustered / total keywords
}

/**
 * Clustering quality assessment
 */
export interface ClusteringQuality {
  readonly overallScore: number; // 0-1
  readonly coherence: number; // How well keywords fit within clusters
  readonly separation: number; // How distinct clusters are from each other
  readonly coverage: number; // Percentage of keywords successfully clustered
  readonly balance: number; // How evenly sized clusters are
  readonly recommendations: string[];
}

/**
 * Cluster comparison for A/B testing or optimization
 */
export interface ClusterComparison {
  readonly baseline: ClusteringResult;
  readonly variant: ClusteringResult;
  readonly improvements: {
    readonly qualityImprovement: number;
    readonly coverageImprovement: number;
    readonly coherenceImprovement: number;
    readonly separationImprovement: number;
  };
  readonly recommendation: 'baseline' | 'variant' | 'hybrid';
  readonly reasoning: string;
}

/**
 * Cluster search and filtering parameters
 */
export interface ClusterSearchParams {
  readonly runId?: UUID;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly minScore?: number;
  readonly maxScore?: number;
  readonly primaryIntent?: KeywordIntent;
  readonly hasQuickWins?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'size' | 'score' | 'volume' | 'label';
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Cluster merge or split operations
 */
export interface ClusterOperation {
  readonly type: 'merge' | 'split' | 'reassign';
  readonly sourceClusterIds: UUID[];
  readonly targetClusterId?: UUID;
  readonly keywordIds?: UUID[];
  readonly newLabel?: string;
  readonly reason: string;
  readonly userId: UUID;
}

/**
 * Cluster validation result
 */
export interface ClusterValidation {
  readonly clusterId: UUID;
  readonly isValid: boolean;
  readonly issues: Array<{
    readonly type: 'size' | 'coherence' | 'intent_mismatch' | 'duplicate_keywords';
    readonly severity: 'warning' | 'error';
    readonly message: string;
    readonly suggestion?: string;
  }>;
  readonly score: number;
  readonly recommendations: string[];
}

/**
 * Validation schemas using Zod
 */
const IntentMixBaseSchema = z.object({
  transactional: z.number().min(0).max(1),
  commercial: z.number().min(0).max(1),
  informational: z.number().min(0).max(1),
  navigational: z.number().min(0).max(1)
});

export const IntentMixSchema = IntentMixBaseSchema.refine(data => {
  const sum = data.transactional + data.commercial + data.informational + data.navigational;
  return Math.abs(sum - 1) < 0.01; // Allow for floating point precision
}, {
  message: "Intent mix percentages must sum to 1.0"
});

export const PartialIntentMixSchema = IntentMixBaseSchema.partial();

export const CreateClusterInputSchema = z.object({
  runId: z.string().uuid(),
  label: z.string().min(1).max(100).transform(val => val.trim()),
  intentMix: PartialIntentMixSchema.optional(),
  representativeKeywords: z.array(z.string().min(1).max(255)).max(10).optional(),
  similarityThreshold: z.number().min(0).max(1).default(0.7),
  embedding: z.array(z.number()).max(1536).optional()
});

export const UpdateClusterInputSchema = z.object({
  label: z.string().min(1).max(100).transform(val => val.trim()).optional(),
  score: z.number().min(0).max(1).optional(),
  intentMix: PartialIntentMixSchema.optional(),
  representativeKeywords: z.array(z.string().min(1).max(255)).max(10).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  embedding: z.array(z.number()).max(1536).optional()
});

export const ClusteringParamsSchema = z.object({
  method: z.enum(['semantic', 'intent', 'topic', 'hybrid']).default('hybrid'),
  minClusterSize: z.number().int().min(2).max(50).default(3),
  maxClusterSize: z.number().int().min(5).max(500).default(100),
  similarityThreshold: z.number().min(0.1).max(0.9).default(0.7),
  intentWeight: z.number().min(0).max(1).default(0.3),
  semanticWeight: z.number().min(0).max(1).default(0.7),
  maxClusters: z.number().int().min(1).max(1000).default(100),
  outlierThreshold: z.number().min(0.1).max(0.9).default(0.5)
}).refine(data => {
  return data.minClusterSize < data.maxClusterSize;
}, {
  message: "minClusterSize must be less than maxClusterSize"
}).refine(data => {
  return Math.abs((data.intentWeight + data.semanticWeight) - 1) < 0.01;
}, {
  message: "intentWeight and semanticWeight must sum to 1.0"
});

export const ClusterSearchParamsSchema = z.object({
  runId: z.string().uuid().optional(),
  minSize: z.number().int().min(1).optional(),
  maxSize: z.number().int().min(1).optional(),
  minScore: z.number().min(0).max(1).optional(),
  maxScore: z.number().min(0).max(1).optional(),
  primaryIntent: z.enum(['transactional', 'commercial', 'informational', 'navigational']).optional(),
  hasQuickWins: z.boolean().optional(),
  search: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['size', 'score', 'volume', 'label']).default('score'),
  orderDirection: z.enum(['asc', 'desc']).default('desc')
}).refine(data => {
  if (data.minSize !== undefined && data.maxSize !== undefined) {
    return data.minSize <= data.maxSize;
  }
  return true;
}, {
  message: "minSize must be less than or equal to maxSize"
}).refine(data => {
  if (data.minScore !== undefined && data.maxScore !== undefined) {
    return data.minScore <= data.maxScore;
  }
  return true;
}, {
  message: "minScore must be less than or equal to maxScore"
});

/**
 * Type guards for runtime type checking
 */
export const isCluster = (value: unknown): value is Cluster => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.runId === 'string' &&
    typeof obj.label === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.score === 'number' &&
    typeof obj.similarityThreshold === 'number' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

export const isIntentMix = (value: unknown): value is IntentMix => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.transactional === 'number' &&
    typeof obj.commercial === 'number' &&
    typeof obj.informational === 'number' &&
    typeof obj.navigational === 'number' &&
    obj.transactional >= 0 && obj.transactional <= 1 &&
    obj.commercial >= 0 && obj.commercial <= 1 &&
    obj.informational >= 0 && obj.informational <= 1 &&
    obj.navigational >= 0 && obj.navigational <= 1
  );
};

/**
 * Utility functions for cluster operations
 */
export const calculateClusterScore = (keywords: Keyword[]): number => {
  if (keywords.length === 0) return 0;
  
  const avgScore = keywords.reduce((sum, k) => sum + k.blendedScore, 0) / keywords.length;
  const quickWinRatio = keywords.filter(k => k.quickWin).length / keywords.length;
  const volumeWeight = Math.log10(keywords.reduce((sum, k) => sum + k.volume, 0) + 1) / 7; // Normalized log scale
  
  return Math.min(1, (avgScore * 0.6) + (quickWinRatio * 0.25) + (volumeWeight * 0.15));
};

export const calculateIntentMix = (keywords: Keyword[]): IntentMix => {
  const total = keywords.length;
  if (total === 0) {
    return { transactional: 0, commercial: 0, informational: 1, navigational: 0 };
  }
  
  const counts = keywords.reduce((acc, keyword) => {
    const intent = keyword.intent || 'informational';
    acc[intent] = (acc[intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    transactional: (counts.transactional || 0) / total,
    commercial: (counts.commercial || 0) / total,
    informational: (counts.informational || 0) / total,
    navigational: (counts.navigational || 0) / total
  };
};

export const generateClusterLabel = (keywords: KeywordString[]): string => {
  if (keywords.length === 0) return 'Empty Cluster';
  
  // Extract common terms from keywords
  const termFreq = new Map<string, number>();
  
  keywords.forEach(keyword => {
    const terms = keyword.toString().split(' ');
    terms.forEach(term => {
      if (term.length > 2) { // Ignore short terms
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }
    });
  });
  
  // Find the most common meaningful term
  const sortedTerms = Array.from(termFreq.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  
  if (sortedTerms.length > 0) {
    const [topTerm] = sortedTerms[0];
    const secondTerm = sortedTerms.length > 1 ? sortedTerms[1][0] : null;
    
    if (secondTerm && termFreq.get(topTerm)! > keywords.length * 0.5) {
      return `${topTerm} ${secondTerm}`.toLowerCase();
    }
    
    return topTerm.toLowerCase();
  }
  
  return 'Mixed Topics';
};

export const getClusterRecommendations = (cluster: ClusterWithKeywords): string[] => {
  const recommendations: string[] = [];
  const { keywords, analytics } = cluster;
  
  if (keywords.length < 3) {
    recommendations.push('Consider merging with similar clusters (very small cluster)');
  }
  
  if (keywords.length > 100) {
    recommendations.push('Consider splitting into sub-clusters (very large cluster)');
  }
  
  if (analytics.quickWinCount / keywords.length > 0.7) {
    recommendations.push('High quick-win potential - prioritize for immediate content creation');
  }
  
  if (analytics.avgDifficulty < 30) {
    recommendations.push('Low competition cluster - excellent for quick wins');
  }
  
  if (analytics.avgVolume > 10000) {
    recommendations.push('High-volume cluster - consider pillar content strategy');
  }
  
  const intentMix = cluster.intentMix;
  if (intentMix.commercial > 0.6) {
    recommendations.push('Commercial intent cluster - focus on product/service content');
  } else if (intentMix.informational > 0.8) {
    recommendations.push('Educational content cluster - focus on how-to and guides');
  }
  
  return recommendations;
};