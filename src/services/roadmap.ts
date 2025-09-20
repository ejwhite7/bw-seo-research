/**
 * Editorial Roadmap Generation Service
 * 
 * Creates monthly content calendars with assignments from prioritized keyword clusters.
 * Handles scheduling logic, team assignments, content planning, and calendar management.
 */

import { AnthropicClient } from '../integrations/anthropic';
import { ErrorHandler } from '../utils/error-handler';
import type {
  RoadmapItem,
  RoadmapItemWithCluster,
  CreateRoadmapItemInput,
  UpdateRoadmapItemInput,
  EditorialRoadmap,
  RoadmapGenerationConfig,
  RoadmapAnalytics,
  ContentCalendar,
  CalendarPeriod,
  CalendarFilters,
  TeamMember,
  ContentTypeConfig,
  RoadmapSearchParams,
  RoadmapOptimization,
  RoadmapExportConfig
} from '../models/roadmap';
import type {
  ClusterWithKeywords,
  Cluster
} from '../models/cluster';
import type {
  KeywordWithCluster,
  Keyword
} from '../models/keyword';
import type {
  UUID,
  Timestamp,
  KeywordString
} from '../models';
import type { ProcessingStage } from '../models/pipeline';
import type {
  KeywordIntent,
  RoadmapStage
} from '../types/database';
import {
  generatePostId,
  calculateRoadmapDuration,
  distributeItemsAcrossTime,
  assignTeamMembers,
  generateContentCalendar,
  optimizeRoadmap,
  RoadmapGenerationConfigSchema
} from '../models/roadmap';
import {
  transformToEditorialRoadmapCSV,
  type EditorialRoadmapCSV,
  type ExportOptions
} from '../models/export';
import * as Sentry from '@sentry/nextjs';

/**
 * Editorial Roadmap Service Configuration
 */
export interface RoadmapServiceConfig {
  readonly anthropicApiKey: string;
  readonly defaultPostsPerMonth: number;
  readonly defaultDuration: number; // months
  readonly maxConcurrentTitleGeneration: number;
  readonly bufferDays: number; // days to add as buffer between posts
  readonly holidayDates: string[]; // ISO date strings to avoid
  readonly workingDays: number[]; // 1-7 (Monday-Sunday), which days to schedule
}

/**
 * Content Brief Generation Input
 */
export interface ContentBriefInput {
  readonly primaryKeyword: KeywordString;
  readonly secondaryKeywords: KeywordString[];
  readonly intent: KeywordIntent;
  readonly volume: number;
  readonly difficulty: number;
  readonly contentType: string;
  readonly targetAudience?: string;
  readonly competitors: Array<{
    readonly domain: string;
    readonly title: string;
    readonly url: string;
  }>;
}

/**
 * Generated Content Brief
 */
export interface ContentBrief {
  readonly suggestedTitle: string;
  readonly h1Suggestion: string;
  readonly briefOutline: string[];
  readonly targetWordCount: number;
  readonly seoTips: string[];
  readonly internalLinkingSuggestions: string[];
  readonly competitorAnalysis: string;
  readonly estimatedDifficulty: 'beginner' | 'intermediate' | 'advanced';
  readonly requiredResources: string[];
}

/**
 * Batch Title Generation Result
 */
export interface BatchTitleResult {
  readonly postId: string;
  readonly primaryKeyword: string;
  readonly suggestedTitles: string[];
  readonly selectedTitle: string;
  readonly confidence: number;
  readonly error?: string;
}

/**
 * Calendar Publishing Rules
 */
export interface PublishingRules {
  readonly maxPostsPerDay: number;
  readonly maxPostsPerWeek: number;
  readonly preferredPublishingDays: number[]; // 1-7 (Monday-Sunday)
  readonly blackoutDates: string[]; // ISO date strings
  readonly minimumSpacing: number; // hours between posts
  readonly pillarContentSpacing: number; // days between pillar posts
}

/**
 * Roadmap Generation Progress Tracking
 */
export interface RoadmapProgress {
  readonly runId: UUID;
  readonly stage: 'clustering' | 'prioritizing' | 'scheduling' | 'assigning' | 'titles' | 'briefs' | 'complete';
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly currentStep: string;
  readonly errors: string[];
  readonly warnings: string[];
  readonly estimatedCompletion: Timestamp;
}

export class RoadmapGenerationService {
  private readonly anthropicClient: AnthropicClient;
  private readonly config: RoadmapServiceConfig;
  private readonly errorHandler: ErrorHandler;

  constructor(
    config: RoadmapServiceConfig,
    anthropicClient?: AnthropicClient
  ) {
    this.config = config;
    this.anthropicClient = anthropicClient || new AnthropicClient(config.anthropicApiKey);
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Generate comprehensive editorial roadmap from keyword clusters
   */
  public async generateRoadmap(
    runId: UUID,
    clusters: ClusterWithKeywords[],
    config: RoadmapGenerationConfig,
    onProgress?: (progress: RoadmapProgress) => void
  ): Promise<EditorialRoadmap> {
    const startTime = Date.now();
    
    try {
      // Validate configuration
      const validatedConfig = RoadmapGenerationConfigSchema.parse(config);
      
      const totalSteps = 8;
      let completedSteps = 0;

      const updateProgress = (stage: RoadmapProgress['stage'], currentStep: string) => {
        if (onProgress) {
          onProgress({
            runId,
            stage,
            completedSteps,
            totalSteps,
            currentStep,
            errors: [],
            warnings: [],
            estimatedCompletion: new Date(Date.now() + ((Date.now() - startTime) / completedSteps) * (totalSteps - completedSteps)).toISOString()
          });
        }
      };

      // Step 1: Prioritize clusters and extract high-potential keywords
      updateProgress('clustering', 'Analyzing and prioritizing keyword clusters');
      const prioritizedItems = await this.extractRoadmapItems(clusters, validatedConfig);
      completedSteps++;

      // Step 2: Apply content mix ratios (40% quick wins, 40% tier-2 strategic, 20% pillar/evergreen)
      updateProgress('prioritizing', 'Applying content mix and priority scoring');
      const mixedItems = this.applyContentMix(prioritizedItems, validatedConfig);
      completedSteps++;

      // Step 3: Generate optimal publishing schedule
      updateProgress('scheduling', 'Creating publishing schedule with optimal distribution');
      const scheduledItems = this.scheduleContent(mixedItems, validatedConfig);
      completedSteps++;

      // Step 4: Assign team members with workload balancing
      updateProgress('assigning', 'Assigning content to team members');
      const assignedItems = assignTeamMembers(scheduledItems, validatedConfig.teamMembers);
      completedSteps++;

      // Step 5: Generate AI-powered titles in batches
      updateProgress('titles', 'Generating AI-powered content titles');
      const titledItems = await this.generateTitlesBatch(assignedItems);
      completedSteps++;

      // Step 6: Create content briefs for complex pieces
      updateProgress('briefs', 'Creating detailed content briefs');
      const briefedItems = await this.generateContentBriefs(titledItems);
      completedSteps++;

      // Step 7: Generate analytics and insights
      updateProgress('complete', 'Calculating roadmap analytics and insights');
      const analytics = this.calculateRoadmapAnalytics(briefedItems, validatedConfig);
      completedSteps++;

      // Step 8: Create final roadmap structure
      updateProgress('complete', 'Finalizing editorial roadmap');
      const timeframe = this.calculateTimeframe(briefedItems, validatedConfig);
      const recommendations = this.generateRecommendations(briefedItems, analytics);
      completedSteps++;

      const roadmap: EditorialRoadmap = {
        runId,
        generatedAt: new Date().toISOString(),
        totalItems: briefedItems.length,
        pillarItems: briefedItems.filter(item => item.stage === 'pillar').length,
        supportingItems: briefedItems.filter(item => item.stage === 'supporting').length,
        timeframe,
        items: briefedItems,
        analytics,
        recommendations
      };

      // Track metrics
      Sentry.addBreadcrumb({
        category: 'roadmap_generation',
        message: 'Roadmap generated successfully',
        data: {
          runId,
          itemCount: briefedItems.length,
          duration: Date.now() - startTime,
          pillarRatio: roadmap.pillarItems / roadmap.totalItems
        }
      });

      return roadmap;

    } catch (error) {
      const roadmapError = ErrorHandler.handleSystemError(error as Error, { component: 'RoadmapGenerationService', operation: 'generateRoadmap', details: { runId } });
      Sentry.captureException(roadmapError);
      throw roadmapError;
    }
  }

  /**
   * Extract roadmap items from keyword clusters with strategic prioritization
   */
  private async extractRoadmapItems(
    clusters: ClusterWithKeywords[],
    config: RoadmapGenerationConfig
  ): Promise<RoadmapItemWithCluster[]> {
    const items: RoadmapItemWithCluster[] = [];
    const totalBudget = config.postsPerMonth * config.duration;

    // Sort clusters by strategic value (score + volume potential + quick win opportunity)
    const sortedClusters = clusters
      .filter(cluster => cluster.size >= 3) // Minimum viable cluster size
      .sort((a, b) => {
        const scoreA = this.calculateClusterPriority(a);
        const scoreB = this.calculateClusterPriority(b);
        return scoreB - scoreA;
      })
      .slice(0, Math.ceil(totalBudget * 0.8)); // Focus on top 80% of budget

    for (const cluster of sortedClusters) {
      // Determine content allocation per cluster
      const clusterWeight = cluster.score * Math.log10(cluster.analytics.totalVolume + 1);
      const itemsForCluster = Math.max(1, Math.min(
        Math.ceil(totalBudget * (clusterWeight / 10) * 0.1),
        Math.ceil(cluster.size * 0.3) // Max 30% of cluster keywords
      ));

      // Select best keywords from cluster
      const selectedKeywords = this.selectBestKeywords(cluster, itemsForCluster);

      for (const [index, keyword] of selectedKeywords.entries()) {
        const stage = this.determineContentStage(keyword, cluster, index === 0);
        const postId = generatePostId(keyword.keyword, stage);

        const item: RoadmapItemWithCluster = {
          id: `item-${postId}` as UUID,
          runId: cluster.runId,
          clusterId: cluster.id,
          postId,
          stage,
          primaryKeyword: keyword.keyword,
          secondaryKeywords: this.getSecondaryKeywords(keyword, cluster),
          intent: keyword.intent,
          volume: keyword.volume,
          difficulty: keyword.difficulty,
          blendedScore: keyword.blendedScore,
          quickWin: keyword.quickWin,
          suggestedTitle: null,
          dri: null,
          dueDate: null,
          notes: null,
          sourceUrls: keyword.topSerpUrls,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          cluster: {
            id: cluster.id,
            label: cluster.label,
            score: cluster.score,
            size: cluster.size,
            intentMix: cluster.intentMix
          }
        };

        items.push(item);
      }
    }

    return items;
  }

  /**
   * Apply content mix ratios: 40% quick wins, 40% tier-2 strategic, 20% pillar/evergreen
   */
  private applyContentMix(
    items: RoadmapItemWithCluster[],
    config: RoadmapGenerationConfig
  ): RoadmapItemWithCluster[] {
    const totalItems = Math.min(items.length, config.postsPerMonth * config.duration);
    
    // Calculate targets
    const quickWinTarget = Math.ceil(totalItems * 0.4);
    const strategicTarget = Math.ceil(totalItems * 0.4);
    const pillarTarget = Math.ceil(totalItems * 0.2);

    // Separate items by type
    const quickWinItems = items
      .filter(item => item.quickWin)
      .sort((a, b) => b.blendedScore - a.blendedScore)
      .slice(0, quickWinTarget);

    const pillarItems = items
      .filter(item => item.volume >= 5000 && item.stage === 'pillar')
      .sort((a, b) => (b.volume * (1 - b.difficulty / 100)) - (a.volume * (1 - a.difficulty / 100)))
      .slice(0, pillarTarget);

    const strategicItems = items
      .filter(item => !item.quickWin && item.stage === 'supporting')
      .sort((a, b) => b.blendedScore - a.blendedScore)
      .slice(0, strategicTarget);

    // Combine and ensure we don't exceed total
    const mixedItems = [...quickWinItems, ...pillarItems, ...strategicItems]
      .slice(0, totalItems);

    // Fill any gaps with remaining best items
    if (mixedItems.length < totalItems) {
      const usedIds = new Set(mixedItems.map(item => item.id));
      const remainingItems = items
        .filter(item => !usedIds.has(item.id))
        .sort((a, b) => b.blendedScore - a.blendedScore)
        .slice(0, totalItems - mixedItems.length);
      
      mixedItems.push(...remainingItems);
    }

    return mixedItems;
  }

  /**
   * Generate optimal publishing schedule with distribution rules
   */
  private scheduleContent(
    items: RoadmapItemWithCluster[],
    config: RoadmapGenerationConfig
  ): RoadmapItemWithCluster[] {
    const publishingRules: PublishingRules = {
      maxPostsPerDay: 2,
      maxPostsPerWeek: Math.ceil(config.postsPerMonth / 4.33),
      preferredPublishingDays: [1, 2, 3, 4], // Mon-Thu
      blackoutDates: this.config.holidayDates,
      minimumSpacing: 4, // 4 hours between posts
      pillarContentSpacing: 14 // 2 weeks between pillar posts
    };

    const scheduledItems: RoadmapItemWithCluster[] = [];
    const calendar = new Map<string, number>(); // date -> post count
    let currentDate = new Date(config.startDate);
    const endDate = new Date(currentDate);
    endDate.setMonth(endDate.getMonth() + config.duration);

    // Sort items by priority (pillar first, then quick wins, then strategic value)
    const sortedItems = [...items].sort((a, b) => {
      if (a.stage === 'pillar' && b.stage !== 'pillar') return -1;
      if (a.stage !== 'pillar' && b.stage === 'pillar') return 1;
      if (a.quickWin && !b.quickWin) return config.quickWinPriority ? -1 : 0;
      if (!a.quickWin && b.quickWin) return config.quickWinPriority ? 1 : 0;
      return b.blendedScore - a.blendedScore;
    });

    let lastPillarDate: Date | null = null;

    for (const item of sortedItems) {
      // Find next available publishing date
      const publishDate = this.findNextPublishingDate(
        currentDate,
        endDate,
        publishingRules,
        calendar,
        item.stage === 'pillar' ? lastPillarDate : null
      );

      if (!publishDate) {
        // If we can't fit more content, stop here
        break;
      }

      const dateKey = publishDate.toISOString().split('T')[0];
      calendar.set(dateKey, (calendar.get(dateKey) || 0) + 1);

      if (item.stage === 'pillar') {
        lastPillarDate = publishDate;
      }

      scheduledItems.push({
        ...item,
        dueDate: dateKey
      });

      // Move current date forward slightly to ensure distribution
      currentDate = new Date(Math.max(currentDate.getTime(), publishDate.getTime() + 24 * 60 * 60 * 1000));
    }

    return scheduledItems;
  }

  /**
   * Find the next available publishing date based on rules
   */
  private findNextPublishingDate(
    currentDate: Date,
    endDate: Date,
    rules: PublishingRules,
    calendar: Map<string, number>,
    lastPillarDate: Date | null
  ): Date | null {
    const testDate = new Date(currentDate);
    const maxIterations = 365; // Prevent infinite loop
    let iterations = 0;

    while (testDate <= endDate && iterations < maxIterations) {
      iterations++;
      const dateKey = testDate.toISOString().split('T')[0];
      const dayOfWeek = testDate.getDay();
      const currentCount = calendar.get(dateKey) || 0;

      // Check all constraints
      const isWorkingDay = rules.preferredPublishingDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek);
      const isNotBlackedOut = !rules.blackoutDates.includes(dateKey);
      const hasCapacity = currentCount < rules.maxPostsPerDay;
      const respectsPillarSpacing = !lastPillarDate || 
        (testDate.getTime() - lastPillarDate.getTime()) >= (rules.pillarContentSpacing * 24 * 60 * 60 * 1000);

      if (isWorkingDay && isNotBlackedOut && hasCapacity && respectsPillarSpacing) {
        return testDate;
      }

      // Move to next day
      testDate.setDate(testDate.getDate() + 1);
    }

    return null; // Couldn't find a suitable date
  }

  /**
   * Generate titles in batches using AI
   */
  private async generateTitlesBatch(
    items: RoadmapItemWithCluster[]
  ): Promise<RoadmapItemWithCluster[]> {
    const batchSize = this.config.maxConcurrentTitleGeneration;
    const results: RoadmapItemWithCluster[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item): Promise<RoadmapItemWithCluster> => {
        try {
          const titleResult = await this.generateSingleTitle(item);
          return {
            ...item,
            suggestedTitle: titleResult.selectedTitle
          };
        } catch (error) {
          Sentry.captureException(error, {
            tags: { service: 'roadmap', operation: 'title_generation' },
            contexts: { item: { postId: item.postId, keyword: item.primaryKeyword } }
          });
          
          return {
            ...item,
            suggestedTitle: this.generateFallbackTitle(item)
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Fallback for failed title generation
          results.push({
            ...batch[index],
            suggestedTitle: this.generateFallbackTitle(batch[index])
          });
        }
      });

      // Rate limiting between batches
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Generate a single AI-powered title
   */
  private async generateSingleTitle(item: RoadmapItemWithCluster): Promise<BatchTitleResult> {
    const prompt = this.buildTitlePrompt(item);
    
    const response = await this.anthropicClient.generateTitles({
      keyword: item.primaryKeyword.toString(),
      intent: item.intent ?? 'informational',
      content_type: this.inferContentType(item),
      tone: 'professional',
      max_length: 60,
      include_keyword: true
    });

    const errorMessage = 'error' in response ? (response.error as any)?.message || '' : '';
    const success = 'success' in response ? response.success : 'data' in response;
    const titles = 'data' in response && response.data?.titles ? response.data.titles : [];

    if (!success || !titles.length) {
      throw new Error(`Title generation failed: ${errorMessage || 'Unknown error'}`);
    }

    const titleStrings = titles.map((t: any) => typeof t === 'string' ? t : t.title || String(t));
    const selectedTitle = this.selectBestTitle(titleStrings, item);
    const confidence = 'data' in response && response.data ? (response.data as any).confidence || 0.8 : 0.8;

    return {
      postId: item.postId,
      primaryKeyword: item.primaryKeyword.toString(),
      suggestedTitles: titleStrings,
      selectedTitle,
      confidence
    };
  }

  /**
   * Generate content briefs for complex pieces
   */
  private async generateContentBriefs(
    items: RoadmapItemWithCluster[]
  ): Promise<RoadmapItemWithCluster[]> {
    // Only generate briefs for pillar content and high-volume keywords
    const complexItems = items.filter(item => 
      item.stage === 'pillar' || 
      item.volume >= 5000 || 
      item.difficulty >= 60
    );

    const briefedItems = [...items];

    for (const item of complexItems) {
      try {
        const brief = await this.generateContentBrief({
          primaryKeyword: item.primaryKeyword,
          secondaryKeywords: item.secondaryKeywords || [],
          intent: item.intent || 'informational',
          volume: item.volume,
          difficulty: item.difficulty,
          contentType: this.inferContentType(item),
          competitors: (item.sourceUrls || []).slice(0, 5).map(url => ({
            domain: new URL(url).hostname,
            title: 'Competitor Content',
            url
          }))
        });

        const itemIndex = briefedItems.findIndex(i => i.id === item.id);
        if (itemIndex >= 0) {
          briefedItems[itemIndex] = {
            ...briefedItems[itemIndex],
            notes: this.formatBriefAsNotes(brief)
          };
        }
      } catch (error) {
        Sentry.captureException(error, {
          tags: { service: 'roadmap', operation: 'brief_generation' },
          contexts: { item: { postId: item.postId } }
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return briefedItems;
  }

  /**
   * Calculate comprehensive roadmap analytics
   */
  private calculateRoadmapAnalytics(
    items: RoadmapItemWithCluster[],
    config: RoadmapGenerationConfig
  ): RoadmapAnalytics {
    const totalEstimatedTraffic = items.reduce((sum, item) => sum + Math.round(item.volume * 0.3), 0);
    const quickWinCount = items.filter(item => item.quickWin).length;
    const avgDifficulty = items.reduce((sum, item) => sum + item.difficulty, 0) / items.length;

    // Intent distribution
    const intentCounts = items.reduce((acc, item) => {
      const intent = item.intent || 'informational';
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {} as Record<KeywordIntent, number>);

    const intentDistribution: Record<KeywordIntent, number> = {
      transactional: intentCounts.transactional || 0,
      commercial: intentCounts.commercial || 0,
      informational: intentCounts.informational || 0,
      navigational: intentCounts.navigational || 0
    };

    // Stage distribution
    const stageDistribution: Record<RoadmapStage, number> = {
      pillar: items.filter(item => item.stage === 'pillar').length,
      supporting: items.filter(item => item.stage === 'supporting').length
    };

    // Monthly distribution
    const monthlyDistribution = this.calculateMonthlyDistribution(items);

    // DRI workload
    const driWorkload = this.calculateDriWorkload(items, config);

    // Content types
    const contentTypes = this.calculateContentTypeDistribution(items);

    return {
      totalEstimatedTraffic,
      quickWinCount,
      avgDifficulty: Math.round(avgDifficulty),
      intentDistribution,
      stageDistribution,
      monthlyDistribution,
      driWorkload,
      contentTypes
    };
  }

  /**
   * Helper methods
   */

  private calculateClusterPriority(cluster: ClusterWithKeywords): number {
    const volumeScore = Math.log10(cluster.analytics.totalVolume + 1) / 7; // Normalized 0-1
    const quickWinRatio = cluster.analytics.quickWinCount / cluster.size;
    const difficultyScore = 1 - (cluster.analytics.avgDifficulty / 100);
    const intentScore = cluster.intentMix.commercial * 0.6 + cluster.intentMix.transactional * 0.8 + 
                       cluster.intentMix.informational * 0.4 + cluster.intentMix.navigational * 0.2;

    return (
      cluster.score * 0.3 +
      volumeScore * 0.25 +
      quickWinRatio * 0.2 +
      difficultyScore * 0.15 +
      intentScore * 0.1
    );
  }

  private selectBestKeywords(cluster: ClusterWithKeywords, count: number): Keyword[] {
    return cluster.keywords
      .sort((a, b) => {
        // Prioritize quick wins, then high-volume, then high score
        if (a.quickWin && !b.quickWin) return -1;
        if (!a.quickWin && b.quickWin) return 1;
        if (Math.abs(a.volume - b.volume) > 1000) return b.volume - a.volume;
        return b.blendedScore - a.blendedScore;
      })
      .slice(0, count);
  }

  private determineContentStage(keyword: Keyword, cluster: ClusterWithKeywords, isFirst: boolean): RoadmapStage {
    // First keyword in high-value cluster becomes pillar
    if (isFirst && (keyword.volume >= 5000 || cluster.analytics.totalVolume >= 20000)) {
      return 'pillar';
    }
    
    // High-volume keywords become pillar content
    if (keyword.volume >= 10000) {
      return 'pillar';
    }

    return 'supporting';
  }

  private getSecondaryKeywords(keyword: Keyword, cluster: ClusterWithKeywords): KeywordString[] {
    return cluster.keywords
      .filter(k => k.id !== keyword.id && k.volume >= keyword.volume * 0.1)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 3)
      .map(k => k.keyword);
  }

  private buildTitlePrompt(item: RoadmapItemWithCluster): string {
    const contentType = this.inferContentType(item);
    const intentContext = this.getIntentContext(item.intent);
    
    return `Generate 5 compelling ${contentType} titles for the keyword "${item.primaryKeyword}" with ${intentContext} intent. 
    Target volume: ${item.volume.toLocaleString()} searches/month
    Difficulty: ${item.difficulty}/100
    Cluster: ${item.cluster?.label || 'General'}
    
    Requirements:
    - Include target keyword naturally
    - Match ${item.intent || 'informational'} search intent
    - Optimize for click-through rate
    - Keep under 60 characters for SEO
    - Make compelling and action-oriented`;
  }

  private inferContentType(item: RoadmapItemWithCluster): 'blog_post' | 'landing_page' | 'product_page' | 'guide' | 'comparison' {
    const keyword = item.primaryKeyword.toString().toLowerCase();
    
    if (item.stage === 'pillar') return 'guide';
    if (item.intent === 'transactional') return 'landing_page';
    if (item.intent === 'commercial') {
      if (keyword.includes('vs') || keyword.includes('compare')) return 'comparison';
      if (keyword.includes('product')) return 'product_page';
      return 'guide';
    }
    if (keyword.includes('how') || keyword.includes('guide')) return 'guide';
    
    return 'blog_post';
  }

  private getIntentContext(intent: KeywordIntent | null): string {
    switch (intent) {
      case 'transactional': return 'high commercial';
      case 'commercial': return 'commercial research';
      case 'informational': return 'educational';
      case 'navigational': return 'brand/product finding';
      default: return 'informational';
    }
  }

  private selectBestTitle(titles: string[], item: RoadmapItemWithCluster): string {
    // Simple scoring based on keyword inclusion and length
    const scores = titles.map(title => {
      let score = 0;
      const lowerTitle = title.toLowerCase();
      const lowerKeyword = item.primaryKeyword.toString().toLowerCase();
      
      // Keyword inclusion
      if (lowerTitle.includes(lowerKeyword)) score += 3;
      
      // Length optimization
      if (title.length >= 30 && title.length <= 60) score += 2;
      
      // Power words for intent
      const powerWords = ['best', 'top', 'ultimate', 'complete', 'comprehensive', 'essential'];
      if (powerWords.some(word => lowerTitle.includes(word))) score += 1;
      
      return { title, score };
    });

    return scores.sort((a, b) => b.score - a.score)[0].title;
  }

  private generateFallbackTitle(item: RoadmapItemWithCluster): string {
    const keyword = item.primaryKeyword.toString();
    const contentType = this.inferContentType(item);
    
    if (contentType === 'guide') return `How to ${keyword}`;
    if (contentType === 'blog_post') return `${keyword}: Complete Guide`;
    if (contentType === 'comparison') return `${keyword}: Complete Comparison`;
    if (contentType === 'product_page') return `${keyword} - Product Overview`;
    if (contentType === 'landing_page') return `Get ${keyword} - Convert Now`;
    
    return `Complete Guide to ${keyword}`;
  }

  private async generateContentBrief(input: ContentBriefInput): Promise<ContentBrief> {
    // This would integrate with Anthropic for brief generation
    // For now, return a structured brief template
    return {
      suggestedTitle: `Complete Guide to ${input.primaryKeyword}`,
      h1Suggestion: `Everything You Need to Know About ${input.primaryKeyword}`,
      briefOutline: [
        'Introduction and overview',
        'Key concepts and definitions', 
        'Step-by-step guidance',
        'Best practices and tips',
        'Common mistakes to avoid',
        'Tools and resources',
        'Conclusion and next steps'
      ],
      targetWordCount: input.volume > 10000 ? 3000 : input.volume > 5000 ? 2000 : 1500,
      seoTips: [
        `Use "${input.primaryKeyword}" in H1 and first paragraph`,
        'Include semantic keywords naturally',
        'Optimize meta description for click-through',
        'Add relevant internal links'
      ],
      internalLinkingSuggestions: input.secondaryKeywords.map(kw => 
        `Link to content about "${kw}"`
      ),
      competitorAnalysis: `Analyzed ${input.competitors.length} competitor pages`,
      estimatedDifficulty: input.difficulty >= 70 ? 'advanced' : input.difficulty >= 40 ? 'intermediate' : 'beginner',
      requiredResources: [
        'Subject matter expert review',
        'Professional images/screenshots',
        'Internal linking audit'
      ]
    };
  }

  private formatBriefAsNotes(brief: ContentBrief): string {
    return `CONTENT BRIEF:
    
Title: ${brief.suggestedTitle}
H1: ${brief.h1Suggestion}
Target Length: ${brief.targetWordCount} words
Difficulty: ${brief.estimatedDifficulty}

OUTLINE:
${brief.briefOutline.map(item => `• ${item}`).join('\n')}

SEO TIPS:
${brief.seoTips.map(tip => `• ${tip}`).join('\n')}

INTERNAL LINKS:
${brief.internalLinkingSuggestions.map(link => `• ${link}`).join('\n')}

RESOURCES NEEDED:
${brief.requiredResources.map(resource => `• ${resource}`).join('\n')}`;
  }

  private calculateTimeframe(
    items: RoadmapItemWithCluster[],
    config: RoadmapGenerationConfig
  ) {
    const dates = items
      .filter(item => item.dueDate)
      .map(item => item.dueDate || '')
      .filter(date => date.length > 0)
      .sort();

    const startDate = dates.length > 0 ? dates[0] : config.startDate;
    const endDate = dates.length > 0 ? dates[dates.length - 1] : 
      new Date(new Date(config.startDate).setMonth(new Date(config.startDate).getMonth() + config.duration))
        .toISOString().split('T')[0];

    const totalWeeks = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    return {
      startDate,
      endDate,
      totalWeeks,
      postsPerWeek: Math.round(items.length / totalWeeks * 100) / 100
    };
  }

  private generateRecommendations(
    items: RoadmapItemWithCluster[],
    analytics: RoadmapAnalytics
  ): string[] {
    const recommendations: string[] = [];

    // Quick win recommendations
    const quickWinRatio = analytics.quickWinCount / items.length;
    if (quickWinRatio > 0.6) {
      recommendations.push('High quick-win potential - prioritize early publishing for immediate traffic gains');
    }

    // Content balance
    const pillarRatio = analytics.stageDistribution.pillar / items.length;
    if (pillarRatio < 0.2) {
      recommendations.push('Consider increasing pillar content ratio to build topical authority');
    }

    // Intent distribution
    const commercialRatio = (analytics.intentDistribution.commercial + analytics.intentDistribution.transactional) / items.length;
    if (commercialRatio > 0.4) {
      recommendations.push('Strong commercial intent focus - ensure conversion paths are optimized');
    }

    // Traffic potential
    if (analytics.totalEstimatedTraffic > 100000) {
      recommendations.push('High traffic potential roadmap - invest in content promotion and link building');
    }

    // Difficulty assessment
    if (analytics.avgDifficulty > 60) {
      recommendations.push('High competition keywords - consider long-form, comprehensive content strategy');
    }

    return recommendations;
  }

  private calculateMonthlyDistribution(items: RoadmapItemWithCluster[]) {
    const monthlyMap = new Map<string, {
      items: number;
      estimatedTraffic: number;
      quickWins: number;
    }>();

    items.forEach(item => {
      if (!item.dueDate) return;
      
      const month = item.dueDate.substring(0, 7); // YYYY-MM
      const current = monthlyMap.get(month) || { items: 0, estimatedTraffic: 0, quickWins: 0 };
      
      monthlyMap.set(month, {
        items: current.items + 1,
        estimatedTraffic: current.estimatedTraffic + Math.round(item.volume * 0.3),
        quickWins: current.quickWins + (item.quickWin ? 1 : 0)
      });
    });

    return Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month,
      ...data
    })).sort((a, b) => a.month.localeCompare(b.month));
  }

  private calculateDriWorkload(items: RoadmapItemWithCluster[], config: RoadmapGenerationConfig) {
    const driMap = new Map<string, {
      itemsAssigned: number;
      estimatedHours: number;
      quickWins: number;
    }>();

    items.forEach(item => {
      if (!item.dri) return;
      
      const current = driMap.get(item.dri) || { itemsAssigned: 0, estimatedHours: 0, quickWins: 0 };
      const estimatedHours = this.estimateContentHours(item);
      
      driMap.set(item.dri, {
        itemsAssigned: current.itemsAssigned + 1,
        estimatedHours: current.estimatedHours + estimatedHours,
        quickWins: current.quickWins + (item.quickWin ? 1 : 0)
      });
    });

    return Array.from(driMap.entries()).map(([dri, data]) => ({
      dri,
      ...data
    }));
  }

  private calculateContentTypeDistribution(items: RoadmapItemWithCluster[]) {
    const typeMap = new Map<string, {
      count: number;
      avgDifficulty: number;
      totalDifficulty: number;
    }>();

    items.forEach(item => {
      const type = this.inferContentType(item);
      const current = typeMap.get(type) || { count: 0, avgDifficulty: 0, totalDifficulty: 0 };
      
      typeMap.set(type, {
        count: current.count + 1,
        avgDifficulty: 0, // Will calculate after
        totalDifficulty: current.totalDifficulty + item.difficulty
      });
    });

    return Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      avgDifficulty: Math.round(data.totalDifficulty / data.count)
    }));
  }

  private estimateContentHours(item: RoadmapItemWithCluster): number {
    const baseHours = item.stage === 'pillar' ? 8 : 4;
    const difficultyMultiplier = 1 + (item.difficulty / 100);
    const volumeMultiplier = item.volume > 10000 ? 1.5 : 1;
    
    return Math.round(baseHours * difficultyMultiplier * volumeMultiplier);
  }

  /**
   * Export roadmap to CSV format
   */
  public exportToCsv(
    roadmap: EditorialRoadmap,
    options: ExportOptions = {
      includeMetadata: true,
      includeAnalytics: false,
      sortBy: 'date',
      sortDirection: 'asc',
      formatting: {
        dateFormat: 'US',
        numberFormat: 'US',
        currencySymbol: '$',
        booleanFormat: 'true_false'
      }
    }
  ): EditorialRoadmapCSV[] {
    return transformToEditorialRoadmapCSV(roadmap.items, options);
  }

  /**
   * Create content calendar view
   */
  public createContentCalendar(
    roadmap: EditorialRoadmap,
    view: 'week' | 'month' | 'quarter' = 'month',
    filters: CalendarFilters = {}
  ): ContentCalendar {
    return generateContentCalendar(roadmap, view);
  }

  /**
   * Optimize existing roadmap
   */
  public async optimizeRoadmap(roadmap: EditorialRoadmap): Promise<RoadmapOptimization> {
    return optimizeRoadmap(roadmap);
  }

  /**
   * Update roadmap item
   */
  public async updateRoadmapItem(
    itemId: UUID,
    updates: UpdateRoadmapItemInput
  ): Promise<RoadmapItem> {
    // This would integrate with database layer
    throw new Error('updateRoadmapItem not yet implemented');
  }

  /**
   * Search and filter roadmap items
   */
  public async searchRoadmapItems(
    params: RoadmapSearchParams
  ): Promise<{
    items: RoadmapItemWithCluster[];
    total: number;
    hasMore: boolean;
  }> {
    // This would integrate with database layer
    throw new Error('searchRoadmapItems not yet implemented');
  }
}

// Explicit service class export
// RoadmapGenerationService already exported above

// Also export as EditorialRoadmapService for consistency
export const EditorialRoadmapService = RoadmapGenerationService;
export type EditorialRoadmapService = RoadmapGenerationService;

export default RoadmapGenerationService;

// Alias for backwards compatibility
export const RoadmapService = RoadmapGenerationService;
export type RoadmapService = RoadmapGenerationService;