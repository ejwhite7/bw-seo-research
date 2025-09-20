/**
 * Roadmap Data Models
 * 
 * Editorial calendar and content planning structures with
 * assignments, due dates, and content recommendations.
 */

import { z } from 'zod';
import type { RoadmapStage, KeywordIntent } from '../types/database';
import type { UUID, Timestamp, KeywordString } from './index';

/**
 * Core roadmap item interface matching database schema
 */
export interface RoadmapItem {
  readonly id: UUID;
  readonly runId: UUID;
  readonly clusterId: UUID | null;
  readonly postId: string;
  readonly stage: RoadmapStage;
  readonly primaryKeyword: KeywordString;
  readonly secondaryKeywords: KeywordString[] | null;
  readonly intent: KeywordIntent | null;
  readonly volume: number;
  readonly difficulty: number;
  readonly blendedScore: number;
  readonly quickWin: boolean;
  readonly suggestedTitle: string | null;
  readonly dri: string | null; // Directly Responsible Individual
  readonly dueDate: string | null; // ISO date string
  readonly notes: string | null;
  readonly sourceUrls: string[] | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/**
 * Roadmap item creation input
 */
export interface CreateRoadmapItemInput {
  readonly runId: UUID;
  readonly clusterId?: UUID;
  readonly postId: string;
  readonly stage: RoadmapStage;
  readonly primaryKeyword: string;
  readonly secondaryKeywords?: string[];
  readonly intent?: KeywordIntent;
  readonly volume?: number;
  readonly difficulty?: number;
  readonly blendedScore?: number;
  readonly quickWin?: boolean;
  readonly suggestedTitle?: string;
  readonly dri?: string;
  readonly dueDate?: string;
  readonly notes?: string;
  readonly sourceUrls?: string[];
}

/**
 * Roadmap item update input
 */
export interface UpdateRoadmapItemInput {
  readonly clusterId?: UUID | null;
  readonly stage?: RoadmapStage;
  readonly primaryKeyword?: string;
  readonly secondaryKeywords?: string[] | null;
  readonly intent?: KeywordIntent | null;
  readonly volume?: number;
  readonly difficulty?: number;
  readonly blendedScore?: number;
  readonly quickWin?: boolean;
  readonly suggestedTitle?: string | null;
  readonly dri?: string | null;
  readonly dueDate?: string | null;
  readonly notes?: string | null;
  readonly sourceUrls?: string[] | null;
}

/**
 * Enhanced roadmap item with cluster information
 */
export interface RoadmapItemWithCluster extends RoadmapItem {
  readonly cluster: {
    readonly id: UUID;
    readonly label: string;
    readonly score: number;
    readonly size: number;
    readonly intentMix: Record<KeywordIntent, number>;
  } | null;
}

/**
 * Complete editorial roadmap for a run
 */
export interface EditorialRoadmap {
  readonly runId: UUID;
  readonly generatedAt: Timestamp;
  readonly totalItems: number;
  readonly pillarItems: number;
  readonly supportingItems: number;
  readonly timeframe: {
    readonly startDate: string;
    readonly endDate: string;
    readonly totalWeeks: number;
    readonly postsPerWeek: number;
  };
  readonly items: RoadmapItemWithCluster[];
  readonly analytics: RoadmapAnalytics;
  readonly recommendations: string[];
}

/**
 * Roadmap analytics and insights
 */
export interface RoadmapAnalytics {
  readonly totalEstimatedTraffic: number;
  readonly quickWinCount: number;
  readonly avgDifficulty: number;
  readonly intentDistribution: Record<KeywordIntent, number>;
  readonly stageDistribution: Record<RoadmapStage, number>;
  readonly monthlyDistribution: Array<{
    readonly month: string;
    readonly items: number;
    readonly estimatedTraffic: number;
    readonly quickWins: number;
  }>;
  readonly driWorkload: Array<{
    readonly dri: string;
    readonly itemsAssigned: number;
    readonly estimatedHours: number;
    readonly quickWins: number;
  }>;
  readonly contentTypes: Array<{
    readonly type: string;
    readonly count: number;
    readonly avgDifficulty: number;
  }>;
}

/**
 * Roadmap generation configuration
 */
export interface RoadmapGenerationConfig {
  readonly postsPerMonth: number;
  readonly startDate: string; // ISO date string
  readonly duration: number; // months
  readonly pillarRatio: number; // 0-1, percentage of pillar content
  readonly quickWinPriority: boolean;
  readonly teamMembers: TeamMember[];
  readonly contentTypes: ContentTypeConfig[];
  readonly seasonalAdjustments?: SeasonalAdjustment[];
}

/**
 * Team member configuration for assignments
 */
export interface TeamMember {
  readonly name: string;
  readonly email: string;
  readonly role: 'writer' | 'editor' | 'strategist' | 'designer';
  readonly capacity: number; // posts per month
  readonly specialties: string[];
  readonly unavailable: string[]; // ISO date strings
}

/**
 * Content type configuration and templates
 */
export interface ContentTypeConfig {
  readonly type: string;
  readonly intents: KeywordIntent[];
  readonly minVolume: number;
  readonly maxDifficulty: number;
  readonly estimatedHours: number;
  readonly template: {
    readonly titleFormat: string;
    readonly structure: string[];
    readonly wordCount: number;
    readonly requiredSections: string[];
  };
}

/**
 * Seasonal content adjustments
 */
export interface SeasonalAdjustment {
  readonly startDate: string;
  readonly endDate: string;
  readonly multiplier: number; // content volume multiplier
  readonly focusTopics: string[];
  readonly reason: string;
}

/**
 * Content calendar view of roadmap
 */
export interface ContentCalendar {
  readonly runId: UUID;
  readonly generatedAt: Timestamp;
  readonly view: 'week' | 'month' | 'quarter';
  readonly periods: CalendarPeriod[];
  readonly filters: CalendarFilters;
}

/**
 * Calendar period (week/month/quarter)
 */
export interface CalendarPeriod {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
  readonly items: RoadmapItemWithCluster[];
  readonly metrics: {
    readonly totalItems: number;
    readonly quickWins: number;
    readonly estimatedTraffic: number;
    readonly avgDifficulty: number;
  };
  readonly workloadByDri: Record<string, number>;
}

/**
 * Calendar filtering options
 */
export interface CalendarFilters {
  readonly dri?: string;
  readonly stage?: RoadmapStage;
  readonly intent?: KeywordIntent;
  readonly quickWinsOnly?: boolean;
  readonly minVolume?: number;
  readonly maxDifficulty?: number;
  readonly clusters?: UUID[];
}

/**
 * Roadmap search and filtering parameters
 */
export interface RoadmapSearchParams {
  readonly runId?: UUID;
  readonly clusterId?: UUID;
  readonly stage?: RoadmapStage;
  readonly intent?: KeywordIntent;
  readonly dri?: string;
  readonly quickWinsOnly?: boolean;
  readonly dueDateFrom?: string;
  readonly dueDateTo?: string;
  readonly minVolume?: number;
  readonly maxVolume?: number;
  readonly minDifficulty?: number;
  readonly maxDifficulty?: number;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'dueDate' | 'volume' | 'difficulty' | 'score' | 'createdAt';
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Roadmap optimization suggestions
 */
export interface RoadmapOptimization {
  readonly runId: UUID;
  readonly currentScore: number;
  readonly optimizedScore: number;
  readonly improvements: OptimizationImprovement[];
  readonly rebalancing: {
    readonly pillarContentIncrease: number;
    readonly quickWinFocus: boolean;
    readonly timelineAdjustments: TimelineAdjustment[];
    readonly teamReassignments: TeamReassignment[];
  };
}

/**
 * Individual optimization improvement
 */
export interface OptimizationImprovement {
  readonly type: 'content_gap' | 'timing' | 'assignment' | 'prioritization' | 'clustering';
  readonly description: string;
  readonly impact: number; // 1-10
  readonly effort: number; // 1-10
  readonly roi: number;
  readonly actionItems: string[];
}

/**
 * Timeline adjustment recommendation
 */
export interface TimelineAdjustment {
  readonly itemId: UUID;
  readonly currentDueDate: string;
  readonly suggestedDueDate: string;
  readonly reason: string;
  readonly impact: 'high' | 'medium' | 'low';
}

/**
 * Team reassignment recommendation
 */
export interface TeamReassignment {
  readonly itemId: UUID;
  readonly currentDri: string | null;
  readonly suggestedDri: string;
  readonly reason: string;
  readonly confidenceScore: number;
}

/**
 * Roadmap export configuration
 */
export interface RoadmapExportConfig {
  readonly format: 'csv' | 'excel' | 'json' | 'pdf' | 'ical';
  readonly includeAnalytics: boolean;
  readonly includeNotes: boolean;
  readonly groupBy?: 'dri' | 'cluster' | 'month' | 'stage';
  readonly filterCriteria?: RoadmapSearchParams;
  readonly customFields?: string[];
}

/**
 * Validation schemas using Zod
 */
export const RoadmapStageSchema = z.enum(['pillar', 'supporting']);

export const CreateRoadmapItemInputSchema = z.object({
  runId: z.string().uuid(),
  clusterId: z.string().uuid().optional(),
  postId: z.string().min(1).max(100).transform(val => val.trim()),
  stage: RoadmapStageSchema,
  primaryKeyword: z.string().min(1).max(255).transform(val => val.trim().toLowerCase()),
  secondaryKeywords: z.array(z.string().min(1).max(255)).max(10).optional(),
  intent: z.enum(['transactional', 'commercial', 'informational', 'navigational']).optional(),
  volume: z.number().int().min(0).max(10000000).optional(),
  difficulty: z.number().int().min(0).max(100).optional(),
  blendedScore: z.number().min(0).max(1).optional(),
  quickWin: z.boolean().default(false),
  suggestedTitle: z.string().min(1).max(200).optional(),
  dri: z.string().min(1).max(100).optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
  sourceUrls: z.array(z.string().url()).max(10).optional()
});

export const UpdateRoadmapItemInputSchema = z.object({
  clusterId: z.string().uuid().nullable().optional(),
  stage: RoadmapStageSchema.optional(),
  primaryKeyword: z.string().min(1).max(255).transform(val => val.trim().toLowerCase()).optional(),
  secondaryKeywords: z.array(z.string().min(1).max(255)).max(10).nullable().optional(),
  intent: z.enum(['transactional', 'commercial', 'informational', 'navigational']).nullable().optional(),
  volume: z.number().int().min(0).max(10000000).optional(),
  difficulty: z.number().int().min(0).max(100).optional(),
  blendedScore: z.number().min(0).max(1).optional(),
  quickWin: z.boolean().optional(),
  suggestedTitle: z.string().min(1).max(200).nullable().optional(),
  dri: z.string().min(1).max(100).nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  sourceUrls: z.array(z.string().url()).max(10).nullable().optional()
});

export const RoadmapGenerationConfigSchema = z.object({
  postsPerMonth: z.number().int().min(1).max(100).default(20),
  startDate: z.string().date(),
  duration: z.number().int().min(1).max(24).default(6),
  pillarRatio: z.number().min(0.1).max(0.9).default(0.3),
  quickWinPriority: z.boolean().default(true),
  teamMembers: z.array(z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['writer', 'editor', 'strategist', 'designer']),
    capacity: z.number().int().min(1).max(50),
    specialties: z.array(z.string().min(1).max(50)).default([]),
    unavailable: z.array(z.string().date()).default([])
  })).min(1),
  contentTypes: z.array(z.object({
    type: z.string().min(1).max(50),
    intents: z.array(z.enum(['transactional', 'commercial', 'informational', 'navigational'])),
    minVolume: z.number().int().min(0).default(0),
    maxDifficulty: z.number().int().min(0).max(100).default(100),
    estimatedHours: z.number().min(0.5).max(40).default(4),
    template: z.object({
      titleFormat: z.string().min(1).max(200),
      structure: z.array(z.string().min(1).max(100)),
      wordCount: z.number().int().min(300).max(10000),
      requiredSections: z.array(z.string().min(1).max(100))
    })
  })).default([]),
  seasonalAdjustments: z.array(z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    multiplier: z.number().min(0.1).max(5),
    focusTopics: z.array(z.string().min(1).max(100)),
    reason: z.string().min(1).max(200)
  })).optional()
}).refine(data => {
  // Validate team capacity vs posts per month
  const totalCapacity = data.teamMembers.reduce((sum, member) => sum + member.capacity, 0);
  return totalCapacity >= data.postsPerMonth;
}, {
  message: "Team capacity must be at least equal to posts per month"
});

export const RoadmapSearchParamsSchema = z.object({
  runId: z.string().uuid().optional(),
  clusterId: z.string().uuid().optional(),
  stage: RoadmapStageSchema.optional(),
  intent: z.enum(['transactional', 'commercial', 'informational', 'navigational']).optional(),
  dri: z.string().min(1).max(100).optional(),
  quickWinsOnly: z.boolean().optional(),
  dueDateFrom: z.string().date().optional(),
  dueDateTo: z.string().date().optional(),
  minVolume: z.number().int().min(0).optional(),
  maxVolume: z.number().int().min(0).optional(),
  minDifficulty: z.number().int().min(0).max(100).optional(),
  maxDifficulty: z.number().int().min(0).max(100).optional(),
  search: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['dueDate', 'volume', 'difficulty', 'score', 'createdAt']).default('dueDate'),
  orderDirection: z.enum(['asc', 'desc']).default('asc')
}).refine(data => {
  if (data.dueDateFrom && data.dueDateTo) {
    return new Date(data.dueDateFrom) <= new Date(data.dueDateTo);
  }
  return true;
}, {
  message: "dueDateFrom must be before or equal to dueDateTo"
}).refine(data => {
  if (data.minVolume !== undefined && data.maxVolume !== undefined) {
    return data.minVolume <= data.maxVolume;
  }
  return true;
}, {
  message: "minVolume must be less than or equal to maxVolume"
}).refine(data => {
  if (data.minDifficulty !== undefined && data.maxDifficulty !== undefined) {
    return data.minDifficulty <= data.maxDifficulty;
  }
  return true;
}, {
  message: "minDifficulty must be less than or equal to maxDifficulty"
});

/**
 * Type guards for runtime type checking
 */
export const isRoadmapStage = (value: unknown): value is RoadmapStage => {
  return typeof value === 'string' && ['pillar', 'supporting'].includes(value);
};

export const isRoadmapItem = (value: unknown): value is RoadmapItem => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.runId === 'string' &&
    typeof obj.postId === 'string' &&
    isRoadmapStage(obj.stage) &&
    typeof obj.primaryKeyword === 'string' &&
    typeof obj.volume === 'number' &&
    typeof obj.difficulty === 'number' &&
    typeof obj.blendedScore === 'number' &&
    typeof obj.quickWin === 'boolean' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Utility functions for roadmap operations
 */
export const generatePostId = (keyword: KeywordString, stage: RoadmapStage): string => {
  const cleanKeyword = keyword.toString().replace(/[^a-z0-9]/g, '-');
  const timestamp = Date.now().toString().slice(-6);
  return `${stage}-${cleanKeyword}-${timestamp}`;
};

export const calculateRoadmapDuration = (itemCount: number, postsPerMonth: number): number => {
  return Math.ceil(itemCount / postsPerMonth);
};

export const distributeItemsAcrossTime = (
  items: RoadmapItemWithCluster[],
  config: RoadmapGenerationConfig
): RoadmapItemWithCluster[] => {
  const { postsPerMonth, startDate, pillarRatio, quickWinPriority } = config;
  const startDateTime = new Date(startDate);
  
  // Sort items by priority (quick wins first if enabled, then by score)
  const sortedItems = [...items].sort((a, b) => {
    if (quickWinPriority) {
      if (a.quickWin && !b.quickWin) return -1;
      if (!a.quickWin && b.quickWin) return 1;
    }
    return b.blendedScore - a.blendedScore;
  });
  
  // Separate pillar and supporting content
  const pillarCount = Math.ceil(items.length * pillarRatio);
  const pillarItems = sortedItems
    .filter(item => item.stage === 'pillar')
    .slice(0, pillarCount);
  const supportingItems = sortedItems
    .filter(item => item.stage === 'supporting')
    .slice(0, items.length - pillarItems.length);
  
  // Distribute items across months
  const distributedItems: RoadmapItemWithCluster[] = [];
  let currentMonth = 0;
  let itemsThisMonth = 0;
  
  [...pillarItems, ...supportingItems].forEach((item, index) => {
    if (itemsThisMonth >= postsPerMonth) {
      currentMonth++;
      itemsThisMonth = 0;
    }
    
    const dueDate = new Date(startDateTime);
    dueDate.setMonth(dueDate.getMonth() + currentMonth);
    
    // Distribute within the month (roughly weekly)
    const weekOfMonth = Math.floor(itemsThisMonth / (postsPerMonth / 4));
    dueDate.setDate(dueDate.getDate() + (weekOfMonth * 7));
    
    distributedItems.push({
      ...item,
      dueDate: dueDate.toISOString().split('T')[0]
    });
    
    itemsThisMonth++;
  });
  
  return distributedItems;
};

export const assignTeamMembers = (
  items: RoadmapItemWithCluster[],
  teamMembers: TeamMember[]
): RoadmapItemWithCluster[] => {
  const assignments = new Map<string, number>(); // track workload per member
  teamMembers.forEach(member => assignments.set(member.name, 0));
  
  return items.map(item => {
    // Find best match based on specialties and current workload
    let bestMember = teamMembers[0];
    let bestScore = -1;
    
    teamMembers.forEach(member => {
      const currentLoad = assignments.get(member.name) || 0;
      const loadScore = Math.max(0, (member.capacity - currentLoad) / member.capacity);
      
      // Check specialty match
      let specialtyScore = 0.5; // default
      if (item.cluster && member.specialties.length > 0) {
        const clusterLabel = item.cluster.label.toLowerCase();
        const hasSpecialty = member.specialties.some(specialty => 
          clusterLabel.includes(specialty.toLowerCase())
        );
        specialtyScore = hasSpecialty ? 1 : 0.3;
      }
      
      const totalScore = (loadScore * 0.7) + (specialtyScore * 0.3);
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMember = member;
      }
    });
    
    // Update assignment count
    const currentAssignments = assignments.get(bestMember.name) || 0;
    assignments.set(bestMember.name, currentAssignments + 1);
    
    return {
      ...item,
      dri: bestMember.name
    };
  });
};

export const generateContentCalendar = (
  roadmap: EditorialRoadmap,
  view: 'week' | 'month' | 'quarter' = 'month'
): ContentCalendar => {
  const { items, timeframe } = roadmap;
  const startDate = new Date(timeframe.startDate);
  const endDate = new Date(timeframe.endDate);
  
  const periods: CalendarPeriod[] = [];
  const currentDate = new Date(startDate);
  let periodId = 1;
  
  while (currentDate <= endDate) {
    let periodStart = new Date(currentDate);
    let periodEnd = new Date(currentDate);
    let label = '';
    
    if (view === 'week') {
      // Set to start of week (Monday)
      periodStart.setDate(periodStart.getDate() - periodStart.getDay() + 1);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 6);
      label = `Week ${periodId} (${periodStart.toLocaleDateString()})`;
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (view === 'month') {
      periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      label = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else if (view === 'quarter') {
      const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
      periodStart = new Date(currentDate.getFullYear(), (quarter - 1) * 3, 1);
      periodEnd = new Date(currentDate.getFullYear(), quarter * 3, 0);
      label = `Q${quarter} ${currentDate.getFullYear()}`;
      currentDate.setMonth(currentDate.getMonth() + 3);
    }
    
    // Filter items for this period
    const periodItems = items.filter(item => {
      if (!item.dueDate) return false;
      const itemDate = new Date(item.dueDate);
      return itemDate >= periodStart && itemDate <= periodEnd;
    });
    
    // Calculate period metrics
    const metrics = {
      totalItems: periodItems.length,
      quickWins: periodItems.filter(item => item.quickWin).length,
      estimatedTraffic: periodItems.reduce((sum, item) => sum + item.volume, 0),
      avgDifficulty: periodItems.length > 0 
        ? periodItems.reduce((sum, item) => sum + item.difficulty, 0) / periodItems.length 
        : 0
    };
    
    // Calculate workload by DRI
    const workloadByDri: Record<string, number> = {};
    periodItems.forEach(item => {
      if (item.dri) {
        workloadByDri[item.dri] = (workloadByDri[item.dri] || 0) + 1;
      }
    });
    
    periods.push({
      id: `${view}-${periodId}`,
      startDate: periodStart.toISOString().split('T')[0],
      endDate: periodEnd.toISOString().split('T')[0],
      label,
      items: periodItems,
      metrics,
      workloadByDri
    });
    
    periodId++;
  }
  
  return {
    runId: roadmap.runId,
    generatedAt: new Date().toISOString(),
    view,
    periods,
    filters: {} // Default empty filters
  };
};

export const optimizeRoadmap = (roadmap: EditorialRoadmap): RoadmapOptimization => {
  const { items, analytics } = roadmap;
  const improvements: OptimizationImprovement[] = [];
  
  // Check pillar content ratio
  const currentPillarRatio = analytics.stageDistribution.pillar / items.length;
  if (currentPillarRatio < 0.2) {
    improvements.push({
      type: 'content_gap',
      description: 'Increase pillar content ratio to improve topical authority',
      impact: 8,
      effort: 5,
      roi: 1.6,
      actionItems: [
        'Identify high-volume keywords suitable for pillar content',
        'Create comprehensive guides targeting main topics',
        'Link supporting content to pillar pages'
      ]
    });
  }
  
  // Check quick win opportunity
  const quickWinRatio = analytics.quickWinCount / items.length;
  if (quickWinRatio > 0.7) {
    improvements.push({
      type: 'prioritization',
      description: 'Prioritize quick wins for immediate traffic gains',
      impact: 7,
      effort: 3,
      roi: 2.3,
      actionItems: [
        'Move quick wins to earlier publication dates',
        'Allocate best writers to quick win content',
        'Create templates for quick win content types'
      ]
    });
  }
  
  // Check DRI workload balance
  const driWorkloads = analytics.driWorkload;
  const maxWorkload = Math.max(...driWorkloads.map(d => d.itemsAssigned));
  const minWorkload = Math.min(...driWorkloads.map(d => d.itemsAssigned));
  
  if (maxWorkload - minWorkload > 5) {
    improvements.push({
      type: 'assignment',
      description: 'Rebalance workload across team members',
      impact: 6,
      effort: 2,
      roi: 3.0,
      actionItems: [
        'Redistribute content assignments more evenly',
        'Consider hiring additional writers if capacity is limiting',
        'Cross-train team members on different content types'
      ]
    });
  }
  
  const currentScore = calculateRoadmapScore(roadmap);
  const optimizedScore = Math.min(10, currentScore + improvements.reduce((sum, imp) => sum + (imp.impact * 0.1), 0));
  
  return {
    runId: roadmap.runId,
    currentScore,
    optimizedScore,
    improvements: improvements.sort((a, b) => b.roi - a.roi),
    rebalancing: {
      pillarContentIncrease: Math.max(0, 0.3 - currentPillarRatio),
      quickWinFocus: quickWinRatio > 0.5,
      timelineAdjustments: [],
      teamReassignments: []
    }
  };
};

const calculateRoadmapScore = (roadmap: EditorialRoadmap): number => {
  const { analytics } = roadmap;
  
  // Score components (0-10 each)
  const trafficScore = Math.min(10, Math.log10(analytics.totalEstimatedTraffic + 1));
  const quickWinScore = (analytics.quickWinCount / roadmap.totalItems) * 10;
  const difficultyScore = Math.max(0, 10 - (analytics.avgDifficulty / 10));
  const balanceScore = 10 - Math.abs(0.3 - (analytics.stageDistribution.pillar / roadmap.totalItems)) * 20;
  
  return (
    trafficScore * 0.3 +
    quickWinScore * 0.3 +
    difficultyScore * 0.2 +
    balanceScore * 0.2
  );
};

export const getRoadmapStageColor = (stage: RoadmapStage): string => {
  switch (stage) {
    case 'pillar': return 'purple';
    case 'supporting': return 'blue';
    default: return 'gray';
  }
};

export const getRoadmapStageDisplayName = (stage: RoadmapStage): string => {
  const displayNames: Record<RoadmapStage, string> = {
    'pillar': 'Pillar Content',
    'supporting': 'Supporting Content'
  };
  
  return displayNames[stage] || stage;
};