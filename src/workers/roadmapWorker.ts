/**
 * Roadmap Worker
 * 
 * Background worker for processing editorial roadmap generation jobs.
 * Handles calendar generation, team assignments, and export preparation.
 * 
 * Features:
 * - Editorial calendar generation with optimal scheduling
 * - Team member assignment and workload balancing
 * - Content strategy optimization
 * - Export preparation for multiple formats
 * - Progress tracking with detailed planning metrics
 * - Integration with external calendar systems
 * 
 * @fileoverview Editorial roadmap generation background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import { addDays, format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import type { UUID, Cluster, RoadmapItem } from '../models';
import type { KeywordStage, KeywordIntent, RoadmapStage } from '../types/database';
import { RoadmapGenerationService, type RoadmapServiceConfig } from '../services/roadmap';
import type { RoadmapGenerationConfig, TeamMember } from '../models/roadmap';
import type { ClusterWithKeywords } from '../models/cluster';

/**
 * Worker-specific job progress interface
 */
interface WorkerJobProgress {
  stage: string;
  stepName: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
  estimatedTimeRemaining?: number;
  metadata?: Record<string, any>;
}
import { supabase } from '../lib/supabase';

/**
 * Roadmap job data structure
 */
export interface RoadmapJobData {
  runId: UUID;
  clusters: Cluster[];
  settings: {
    startDate?: string;
    endDate?: string;
    postsPerMonth?: number;
    teamMembers?: string[];
    contentStrategy?: 'pillar-supporting' | 'cluster-based' | 'intent-driven';
    prioritizeQuickWins?: boolean;
    enableSeasonality?: boolean;
    workloadDistribution?: 'equal' | 'expertise-based' | 'availability-based';
  };
  userId?: string;
}

/**
 * Roadmap job result structure
 */
export interface RoadmapJobResult {
  roadmapItems: RoadmapItem[];
  calendarData: {
    totalPosts: number;
    monthlyBreakdown: Record<string, number>;
    teamAssignments: Record<string, number>;
    contentMix: {
      pillar: number;
      supporting: number;
    };
  };
  metrics: {
    clustersProcessed: number;
    postsGenerated: number;
    quickWinPosts: number;
    avgPostsPerMonth: number;
    teamUtilization: Record<string, number>;
    contentStrategyEffectiveness: number;
    processingTime: number;
  };
  qualityMetrics: {
    scheduleOptimization: number;
    workloadBalance: number;
    keywordCoverage: number;
    intentDistribution: Record<KeywordIntent, number>;
  };
}

/**
 * Process roadmap generation job
 */
export async function processRoadmapJob(
  job: Job<RoadmapJobData>
): Promise<RoadmapJobResult> {
  const startTime = Date.now();
  const { runId, clusters, settings, userId } = job.data;
  
  console.log(`Processing roadmap job ${job.id} for run ${runId} with ${clusters.length} clusters`);
  
  try {
    // Initialize roadmap service
    // Calculate planning parameters first
    const postsPerMonth = settings.postsPerMonth || 20;
    
    const config: RoadmapServiceConfig = {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      defaultPostsPerMonth: postsPerMonth,
      defaultDuration: 3, // 3 months
      maxConcurrentTitleGeneration: 5,
      bufferDays: 2,
      holidayDates: [],
      workingDays: [1, 2, 3, 4, 5] // Monday to Friday
    };
    const roadmapService = new RoadmapGenerationService(config);
    
    // Calculate planning parameters
    const startDate = settings.startDate ? parseISO(settings.startDate) : new Date();
    const endDate = settings.endDate ? parseISO(settings.endDate) : addDays(startDate, 90); // Default 3 months
    const teamMembers = settings.teamMembers || ['Content Team'];
    
    // Update initial progress
    await job.updateProgress({
      stage: 'roadmap',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting editorial roadmap generation',
      metadata: {
        clusterCount: clusters.length,
        runId,
        postsPerMonth,
        teamMembers: teamMembers.length,
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      },
    } satisfies WorkerJobProgress);

    // Update run status
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        progress: {
          current_stage: 'roadmap',
          stages_completed: ['expansion', 'universe', 'clustering', 'scoring'],
          clusters_created: clusters.length,
          percent_complete: 95,
        },
      })
      .eq('id', runId);

    // Process roadmap generation with progress tracking
    let currentStep = 0;
    const totalSteps = 5; // Content strategy, Calendar planning, Team assignment, Post generation, Quality validation
    
    const roadmapConfig: RoadmapGenerationConfig = {
      startDate: format(startDate, 'yyyy-MM-dd'),
      postsPerMonth,
      duration: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)),
      pillarRatio: 0.3,
      quickWinPriority: settings.prioritizeQuickWins ?? true,
      teamMembers: teamMembers.map(name => ({
        name,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@company.com`,
        role: 'writer' as const,
        capacity: 10, // posts per month
        specialties: [] as string[],
        unavailable: [] as string[]
      } satisfies TeamMember)),
      contentTypes: [
        {
          type: 'blog_post',
          intents: ['informational' as const, 'commercial' as const],
          minVolume: 100,
          maxDifficulty: 80,
          estimatedHours: 4,
          template: {
            titleFormat: 'How to {keyword}',
            structure: ['introduction', 'main_content', 'conclusion'],
            wordCount: 1500,
            requiredSections: ['introduction', 'conclusion']
          }
        }
      ]
    };
    
    const result = await roadmapService.generateRoadmap(
      runId,
      clusters as ClusterWithKeywords[],
      roadmapConfig,
      async (progress: any) => {
        const progressPercent = ((progress.completedSteps || 0) / (progress.totalSteps || 1)) * 100;
        const overallProgress = (currentStep / totalSteps) * 100 + (progressPercent / totalSteps);
        
        await job.updateProgress({
          stage: 'roadmap',
          stepName: progress.currentStep || '',
          current: progress.completedSteps || 0,
          total: progress.totalSteps || 0,
          percentage: Math.min(overallProgress, 100),
          message: progress.message,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          metadata: {
            currentStep: currentStep + 1,
            totalSteps,
            clusterCount: clusters.length,
            postsGenerated: progress.completedSteps || 0,
            runId,
          },
        } satisfies WorkerJobProgress);
        
        // Update database progress
        await supabase
          .from('runs')
          .update({
            progress: {
              current_stage: 'roadmap',
              stages_completed: ['expansion', 'universe', 'clustering', 'scoring'],
              clusters_created: clusters.length,
              percent_complete: 95 + Math.min(overallProgress * 0.05, 5), // Roadmap is final 5% of pipeline
              estimated_time_remaining: 0,
            },
          })
          .eq('id', runId);
      }
    );

    // Calculate comprehensive metrics
    const roadmapItems = result.items || [];
    const calendarData = calculateCalendarData(roadmapItems, teamMembers);
    const metrics = calculateRoadmapMetrics(roadmapItems, clusters, startTime);
    const qualityMetrics = calculateRoadmapQualityMetrics(roadmapItems, clusters);
    
    // Bulk insert roadmap items to database
    if (roadmapItems.length > 0) {
      await supabase
        .from('roadmap_items')
        .insert(
          roadmapItems.map((item: RoadmapItem) => ({
            id: item.id,
            run_id: runId,
            cluster_id: item.clusterId,
            post_id: item.postId,
            stage: item.stage,
            primary_keyword: item.primaryKeyword,
            secondary_keywords: item.secondaryKeywords,
            intent: item.intent,
            volume: item.volume,
            difficulty: item.difficulty,
            blended_score: item.blendedScore,
            quick_win: item.quickWin,
            suggested_title: item.suggestedTitle,
            dri: item.dri,
            due_date: item.dueDate,
            notes: item.notes,
            source_urls: item.sourceUrls,
          }))
        );
    }
    
    // Update final progress
    await job.updateProgress({
      stage: 'roadmap',
      stepName: 'Completed',
      current: roadmapItems.length,
      total: roadmapItems.length,
      percentage: 100,
      message: `Editorial roadmap completed with ${roadmapItems.length} posts`,
      metadata: {
        postsGenerated: roadmapItems.length,
        quickWinPosts: roadmapItems.filter((p: RoadmapItem) => p.quickWin).length,
        monthlyBreakdown: calendarData.monthlyBreakdown,
        teamAssignments: calendarData.teamAssignments,
        runId,
      },
    } satisfies WorkerJobProgress);

    // Update run with completed roadmap stage
    await supabase
      .from('runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          current_stage: 'roadmap',
          stages_completed: ['expansion', 'universe', 'clustering', 'scoring', 'roadmap'],
          clusters_created: clusters.length,
          percent_complete: 100,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const totalProcessingTime = Date.now() - startTime;
    console.log(`Roadmap job ${job.id} completed in ${totalProcessingTime}ms with ${roadmapItems.length} posts`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Roadmap job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        clusterCount: clusters.length,
        postsGenerated: roadmapItems.length,
        processingTime: totalProcessingTime,
      },
    });

    return {
      roadmapItems: roadmapItems,
      calendarData,
      metrics: {
        ...metrics,
        processingTime: totalProcessingTime,
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Roadmap job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'roadmap',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'roadmap',
        jobId: job.id,
        runId,
      },
      extra: {
        jobData: job.data,
        attemptsMade: job.attemptsMade,
        clusterCount: clusters.length,
      },
    });

    throw error;
  }
}

/**
 * Calculate calendar data for roadmap items
 */
function calculateCalendarData(
  roadmapItems: RoadmapItem[],
  teamMembers: string[]
): {
  totalPosts: number;
  monthlyBreakdown: Record<string, number>;
  teamAssignments: Record<string, number>;
  contentMix: { pillar: number; supporting: number };
} {
  // Monthly breakdown
  const monthlyBreakdown: Record<string, number> = {};
  roadmapItems.forEach(item => {
    if (item.dueDate) {
      const monthKey = format(parseISO(item.dueDate), 'yyyy-MM');
      monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
    }
  });

  // Team assignments
  const teamAssignments: Record<string, number> = {};
  teamMembers.forEach(member => {
    teamAssignments[member] = 0;
  });
  roadmapItems.forEach(item => {
    if (item.dri && teamAssignments.hasOwnProperty(item.dri)) {
      teamAssignments[item.dri]++;
    }
  });

  // Content mix
  const pillarCount = roadmapItems.filter(item => item.stage === 'pillar').length;
  const supportingCount = roadmapItems.filter(item => item.stage === 'supporting').length;

  return {
    totalPosts: roadmapItems.length,
    monthlyBreakdown,
    teamAssignments,
    contentMix: {
      pillar: pillarCount,
      supporting: supportingCount,
    },
  };
}

/**
 * Calculate comprehensive roadmap metrics
 */
function calculateRoadmapMetrics(
  roadmapItems: RoadmapItem[],
  clusters: Cluster[],
  startTime: number
): {
  clustersProcessed: number;
  postsGenerated: number;
  quickWinPosts: number;
  avgPostsPerMonth: number;
  teamUtilization: Record<string, number>;
  contentStrategyEffectiveness: number;
} {
  const quickWinPosts = roadmapItems.filter(item => item.quickWin).length;
  
  // Calculate average posts per month
  const monthsSpanned = new Set(
    roadmapItems
      .filter(item => item.dueDate)
      .map(item => format(parseISO(item.dueDate!), 'yyyy-MM'))
  ).size;
  const avgPostsPerMonth = monthsSpanned > 0 ? roadmapItems.length / monthsSpanned : 0;

  // Team utilization (placeholder - would need actual team capacity data)
  const teamUtilization: Record<string, number> = {};
  const driCounts: Record<string, number> = {};
  roadmapItems.forEach(item => {
    if (item.dri) {
      driCounts[item.dri] = (driCounts[item.dri] || 0) + 1;
    }
  });
  Object.keys(driCounts).forEach(dri => {
    teamUtilization[dri] = Math.min(driCounts[dri] / 10, 1); // Assume 10 posts per person is 100% utilization
  });

  // Content strategy effectiveness (based on keyword coverage and quick wins)
  const keywordsCovered = new Set(roadmapItems.map(item => item.primaryKeyword)).size;
  const totalKeywords = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
  const keywordCoverage = totalKeywords > 0 ? keywordsCovered / totalKeywords : 0;
  const quickWinRatio = roadmapItems.length > 0 ? quickWinPosts / roadmapItems.length : 0;
  const contentStrategyEffectiveness = (keywordCoverage + quickWinRatio) / 2;

  return {
    clustersProcessed: clusters.length,
    postsGenerated: roadmapItems.length,
    quickWinPosts,
    avgPostsPerMonth: Math.round(avgPostsPerMonth * 100) / 100,
    teamUtilization,
    contentStrategyEffectiveness: Math.round(contentStrategyEffectiveness * 100) / 100,
  };
}

/**
 * Calculate roadmap quality metrics
 */
function calculateRoadmapQualityMetrics(
  roadmapItems: RoadmapItem[],
  clusters: Cluster[]
): {
  scheduleOptimization: number;
  workloadBalance: number;
  keywordCoverage: number;
  intentDistribution: Record<KeywordIntent, number>;
} {
  if (roadmapItems.length === 0) {
    return {
      scheduleOptimization: 0,
      workloadBalance: 0,
      keywordCoverage: 0,
      intentDistribution: { transactional: 0, commercial: 0, informational: 0, navigational: 0 },
    };
  }

  // Schedule optimization (how evenly distributed posts are over time)
  const monthlyDistribution = Object.values(
    roadmapItems
      .filter(item => item.dueDate)
      .reduce((acc, item) => {
        const monthKey = format(parseISO(item.dueDate!), 'yyyy-MM');
        acc[monthKey] = (acc[monthKey] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
  );
  
  const avgPostsPerMonth = monthlyDistribution.reduce((sum, count) => sum + count, 0) / monthlyDistribution.length;
  const monthlyVariance = monthlyDistribution.reduce((sum, count) => sum + Math.pow(count - avgPostsPerMonth, 2), 0) / monthlyDistribution.length;
  const scheduleOptimization = Math.max(0, 1 - (monthlyVariance / avgPostsPerMonth));

  // Workload balance (variance in team assignments)
  const teamAssignments = Object.values(
    roadmapItems
      .filter(item => item.dri)
      .reduce((acc, item) => {
        acc[item.dri!] = (acc[item.dri!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
  );
  
  let workloadBalance: number;
  if (teamAssignments.length <= 1) {
    // Only one team member, perfect balance by definition
    workloadBalance = 1;
  } else {
    const avgAssignments = teamAssignments.reduce((sum, count) => sum + count, 0) / teamAssignments.length;
    const assignmentVariance = teamAssignments.reduce((sum, count) => sum + Math.pow(count - avgAssignments, 2), 0) / teamAssignments.length;
    workloadBalance = Math.max(0, 1 - (assignmentVariance / avgAssignments));
  }

  // Keyword coverage
  const coveredKeywords = new Set(roadmapItems.map(item => item.primaryKeyword));
  const totalKeywords = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
  const keywordCoverage = totalKeywords > 0 ? coveredKeywords.size / totalKeywords : 0;

  // Intent distribution
  const intentCounts = { transactional: 0, commercial: 0, informational: 0, navigational: 0 };
  roadmapItems.forEach(item => {
    if (item.intent) {
      intentCounts[item.intent]++;
    }
  });
  
  const intentDistribution = Object.fromEntries(
    Object.entries(intentCounts).map(([intent, count]) => [
      intent,
      roadmapItems.length > 0 ? Math.round((count / roadmapItems.length) * 100) / 100 : 0
    ])
  ) as Record<KeywordIntent, number>;

  return {
    scheduleOptimization: Math.round(scheduleOptimization * 100) / 100,
    workloadBalance: Math.round(workloadBalance * 100) / 100,
    keywordCoverage: Math.round(keywordCoverage * 100) / 100,
    intentDistribution,
  };
}

/**
 * Validate roadmap job data
 */
export function validateRoadmapJobData(data: any): data is RoadmapJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.clusters) &&
    data.clusters.length > 0 &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate roadmap job duration
 */
export function estimateRoadmapJobDuration(data: RoadmapJobData): number {
  const clusterCount = data.clusters.length;
  const postsPerMonth = data.settings.postsPerMonth || 20;
  const teamMembers = data.settings.teamMembers?.length || 1;
  
  // Base time for planning and strategy
  const baseTime = 30000; // 30 seconds
  
  // Time per cluster for content planning
  const timePerCluster = 5000; // 5 seconds per cluster
  
  // Time for team assignment optimization
  const teamOptimizationTime = teamMembers * 2000; // 2 seconds per team member
  
  // Time for post generation
  const postGenerationTime = Math.min(clusterCount * postsPerMonth * 0.1, 60000); // Max 1 minute
  
  return baseTime + (clusterCount * timePerCluster) + teamOptimizationTime + postGenerationTime;
}

/**
 * Calculate roadmap complexity score
 */
export function calculateRoadmapComplexity(data: RoadmapJobData): {
  score: number;
  factors: {
    clusterCount: number;
    postsPerMonth: number;
    teamMembers: number;
    contentStrategy: string;
    seasonality: boolean;
  };
} {
  const clusterCount = data.clusters.length;
  const postsPerMonth = data.settings.postsPerMonth || 20;
  const teamMembers = data.settings.teamMembers?.length || 1;
  
  let score = Math.log(clusterCount) * 10; // Base complexity from cluster count
  score += Math.log(postsPerMonth) * 5; // Complexity from posting frequency
  score += teamMembers * 3; // Complexity from team coordination
  
  if (data.settings.contentStrategy === 'intent-driven') score += 10;
  if (data.settings.enableSeasonality) score += 15;
  if (data.settings.workloadDistribution === 'expertise-based') score += 10;
  
  score = Math.min(score, 100); // Cap at 100
  
  return {
    score,
    factors: {
      clusterCount,
      postsPerMonth,
      teamMembers,
      contentStrategy: data.settings.contentStrategy || 'pillar-supporting',
      seasonality: data.settings.enableSeasonality ?? false,
    },
  };
}

export default processRoadmapJob;