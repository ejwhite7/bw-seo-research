/**
 * Editorial Roadmap Generation Service Tests
 * 
 * Comprehensive test suite covering roadmap generation, scheduling,
 * team assignments, content planning, and export functionality.
 */

import { RoadmapGenerationService } from '../roadmap';
import { AnthropicClient } from '../../integrations/anthropic';
import type {
  RoadmapGenerationConfig,
  EditorialRoadmap,
  RoadmapItemWithCluster,
  TeamMember,
  ContentTypeConfig,
  RoadmapServiceConfig
} from '../../models/roadmap';
import type {
  ClusterWithKeywords,
  ClusterAnalytics
} from '../../models/cluster';
import type {
  Keyword
} from '../../models/keyword';
import type { UUID } from '../../models';

// Mock dependencies
jest.mock('../../integrations/anthropic');
jest.mock('../../utils/error-handler');
jest.mock('@sentry/nextjs');

const MockedAnthropicClient = AnthropicClient as jest.MockedClass<typeof AnthropicClient>;

describe('RoadmapGenerationService', () => {
  let service: RoadmapGenerationService;
  let mockAnthropicClient: jest.Mocked<AnthropicClient>;
  let config: RoadmapServiceConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      anthropicApiKey: 'test-key',
      defaultPostsPerMonth: 20,
      defaultDuration: 6,
      maxConcurrentTitleGeneration: 5,
      bufferDays: 2,
      holidayDates: ['2024-12-25', '2024-01-01'],
      workingDays: [1, 2, 3, 4] // Mon-Thu
    };

    mockAnthropicClient = {
      generateTitles: jest.fn(),
      classifyIntent: jest.fn(),
      expandKeywords: jest.fn()
    } as any;

    MockedAnthropicClient.mockImplementation(() => mockAnthropicClient);
    
    service = new RoadmapGenerationService(config, mockAnthropicClient);
  });

  describe('generateRoadmap', () => {
    it('should generate a complete editorial roadmap', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: {
          titles: [
            'Ultimate Guide to Test Keyword',
            'Complete Test Keyword Handbook',
            'Mastering Test Keyword: Expert Tips',
            'Test Keyword Best Practices',
            'Advanced Test Keyword Strategies'
          ],
          confidence: 0.9
        }
      });

      const progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig, onProgress);

      // Assert
      expect(roadmap).toBeDefined();
      expect(roadmap.runId).toBe(runId);
      expect(roadmap.items).toHaveLength(expect.any(Number));
      expect(roadmap.items.length).toBeGreaterThan(0);
      expect(roadmap.items.length).toBeLessThanOrEqual(generationConfig.postsPerMonth * generationConfig.duration);

      // Check content mix ratios
      const quickWinItems = roadmap.items.filter(item => item.quickWin);
      const pillarItems = roadmap.items.filter(item => item.stage === 'pillar');
      const supportingItems = roadmap.items.filter(item => item.stage === 'supporting');

      expect(quickWinItems.length).toBeGreaterThan(0);
      expect(pillarItems.length).toBeGreaterThan(0);
      expect(supportingItems.length).toBeGreaterThan(0);

      // Validate content mix ratios (40% quick wins, 40% strategic, 20% pillar)
      const quickWinRatio = quickWinItems.length / roadmap.items.length;
      const pillarRatio = pillarItems.length / roadmap.items.length;
      
      expect(quickWinRatio).toBeLessThanOrEqual(0.5); // Allow some flexibility
      expect(pillarRatio).toBeGreaterThan(0.1);

      // Check scheduling
      const scheduledItems = roadmap.items.filter(item => item.dueDate);
      expect(scheduledItems.length).toBe(roadmap.items.length);

      // Check assignments
      const assignedItems = roadmap.items.filter(item => item.dri);
      expect(assignedItems.length).toBe(roadmap.items.length);

      // Check titles
      const titledItems = roadmap.items.filter(item => item.suggestedTitle);
      expect(titledItems.length).toBe(roadmap.items.length);

      // Validate analytics
      expect(roadmap.analytics).toBeDefined();
      expect(roadmap.analytics.totalEstimatedTraffic).toBeGreaterThan(0);
      expect(roadmap.analytics.quickWinCount).toBe(quickWinItems.length);
      expect(roadmap.analytics.avgDifficulty).toBeGreaterThan(0);
      expect(roadmap.analytics.monthlyDistribution).toHaveLength(expect.any(Number));
      expect(roadmap.analytics.driWorkload).toHaveLength(generationConfig.teamMembers.length);

      // Check progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].stage).toBe('complete');
      expect(progressUpdates[progressUpdates.length - 1].completedSteps).toBe(8);
    });

    it('should respect team capacity constraints', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();
      
      // Set team capacity lower than posts per month
      generationConfig.teamMembers = [
        {
          name: 'Writer 1',
          email: 'writer1@test.com',
          role: 'writer',
          capacity: 5, // Low capacity
          specialties: ['tech'],
          unavailable: []
        }
      ];

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: {
          titles: ['Test Title'],
          confidence: 0.8
        }
      });

      // Act & Assert
      await expect(service.generateRoadmap(runId, clusters, generationConfig))
        .rejects
        .toThrow('Team capacity must be at least equal to posts per month');
    });

    it('should handle title generation failures gracefully', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: false,
        error: { message: 'API Error', code: 'RATE_LIMIT' }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      expect(roadmap.items).toHaveLength(expect.any(Number));
      
      // Should have fallback titles
      const titledItems = roadmap.items.filter(item => item.suggestedTitle);
      expect(titledItems.length).toBe(roadmap.items.length);
      
      // Check for fallback title patterns
      const hasFallbackTitles = roadmap.items.some(item => 
        item.suggestedTitle?.includes('Complete Guide') || 
        item.suggestedTitle?.includes('How to') ||
        item.suggestedTitle?.includes('Top 10')
      );
      expect(hasFallbackTitles).toBe(true);
    });

    it('should apply publishing rules correctly', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();
      
      // Set specific start date and holidays
      generationConfig.startDate = '2024-03-01'; // Friday
      
      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const scheduledDates = roadmap.items
        .filter(item => item.dueDate)
        .map(item => new Date(item.dueDate!));

      // Check that no posts are scheduled on holidays
      const holidayDates = config.holidayDates.map(date => new Date(date).getTime());
      const scheduledOnHolidays = scheduledDates.some(date => 
        holidayDates.includes(date.getTime())
      );
      expect(scheduledOnHolidays).toBe(false);

      // Check that posts are scheduled on working days (Mon-Thu)
      const workingDaySchedules = scheduledDates.filter(date => {
        const dayOfWeek = date.getDay();
        return config.workingDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek);
      });
      expect(workingDaySchedules.length).toBe(scheduledDates.length);
    });

    it('should balance workload across team members', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const workloadDistribution = roadmap.analytics.driWorkload;
      
      // Check that all team members are assigned work
      expect(workloadDistribution.length).toBe(generationConfig.teamMembers.length);
      
      // Check that workload is reasonably balanced
      const assignments = workloadDistribution.map(w => w.itemsAssigned);
      const maxAssignments = Math.max(...assignments);
      const minAssignments = Math.min(...assignments);
      const imbalance = maxAssignments - minAssignments;
      
      // Allow some imbalance but not excessive
      expect(imbalance).toBeLessThanOrEqual(Math.ceil(roadmap.items.length / generationConfig.teamMembers.length));
    });
  });

  describe('content planning features', () => {
    it('should generate appropriate content types based on intent', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClustersWithVariedIntents();
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const contentTypes = roadmap.analytics.contentTypes;
      expect(contentTypes.length).toBeGreaterThan(1);

      // Should have different content types for different intents
      const typeNames = contentTypes.map(ct => ct.type);
      expect(typeNames).toContain(expect.stringMatching(/Guide|Post|Comparison|Listicle/));
    });

    it('should create pillar-supporting content relationships', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const pillarItems = roadmap.items.filter(item => item.stage === 'pillar');
      const supportingItems = roadmap.items.filter(item => item.stage === 'supporting');

      expect(pillarItems.length).toBeGreaterThan(0);
      expect(supportingItems.length).toBeGreaterThan(0);

      // Check that supporting content often has secondary keywords from same cluster
      const supportingWithSecondary = supportingItems.filter(item => 
        item.secondaryKeywords && item.secondaryKeywords.length > 0
      );
      expect(supportingWithSecondary.length).toBeGreaterThan(0);
    });

    it('should generate content briefs for complex content', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClustersWithHighVolume();
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const pillarItems = roadmap.items.filter(item => item.stage === 'pillar');
      const highVolumeItems = roadmap.items.filter(item => item.volume >= 5000);
      
      // Pillar content and high-volume items should have content briefs (notes)
      const itemsWithBriefs = [...pillarItems, ...highVolumeItems].filter(item => 
        item.notes && item.notes.includes('CONTENT BRIEF')
      );
      
      expect(itemsWithBriefs.length).toBeGreaterThan(0);
    });
  });

  describe('export functionality', () => {
    it('should export roadmap to CSV format', async () => {
      // Arrange
      const roadmap = await createMockRoadmap();
      const exportOptions = {
        includeMetadata: true,
        includeAnalytics: false,
        sortBy: 'dueDate' as const,
        sortDirection: 'asc' as const,
        formatting: {
          dateFormat: 'US' as const,
          numberFormat: 'US' as const,
          currencySymbol: '$',
          booleanFormat: 'true_false' as const
        }
      };

      // Act
      const csvData = service.exportToCsv(roadmap, exportOptions);

      // Assert
      expect(csvData).toHaveLength(roadmap.items.length);
      expect(csvData[0]).toHaveProperty('post_id');
      expect(csvData[0]).toHaveProperty('cluster_label');
      expect(csvData[0]).toHaveProperty('primary_keyword');
      expect(csvData[0]).toHaveProperty('suggested_title');
      expect(csvData[0]).toHaveProperty('dri');
      expect(csvData[0]).toHaveProperty('due_date');
      expect(csvData[0]).toHaveProperty('run_id');
      
      // Check sorting
      const dueDates = csvData.map(item => item.due_date).filter(date => date);
      const sortedDates = [...dueDates].sort();
      expect(dueDates).toEqual(sortedDates);
    });

    it('should create content calendar view', async () => {
      // Arrange
      const roadmap = await createMockRoadmap();

      // Act
      const calendar = service.createContentCalendar(roadmap, 'month');

      // Assert
      expect(calendar.runId).toBe(roadmap.runId);
      expect(calendar.view).toBe('month');
      expect(calendar.periods).toHaveLength(expect.any(Number));
      
      // Each period should have metrics
      calendar.periods.forEach(period => {
        expect(period.metrics).toBeDefined();
        expect(period.metrics.totalItems).toBeGreaterThanOrEqual(0);
        expect(period.workloadByDri).toBeDefined();
      });
    });
  });

  describe('optimization features', () => {
    it('should provide roadmap optimization suggestions', async () => {
      // Arrange
      const roadmap = await createMockRoadmap();

      // Act
      const optimization = await service.optimizeRoadmap(roadmap);

      // Assert
      expect(optimization.runId).toBe(roadmap.runId);
      expect(optimization.currentScore).toBeGreaterThan(0);
      expect(optimization.optimizedScore).toBeGreaterThanOrEqual(optimization.currentScore);
      expect(optimization.improvements).toHaveLength(expect.any(Number));
      
      if (optimization.improvements.length > 0) {
        optimization.improvements.forEach(improvement => {
          expect(improvement.impact).toBeGreaterThan(0);
          expect(improvement.effort).toBeGreaterThan(0);
          expect(improvement.roi).toBeGreaterThan(0);
          expect(improvement.actionItems).toHaveLength(expect.any(Number));
        });
      }
    });
  });

  describe('error handling', () => {
    it('should handle empty cluster list gracefully', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters: ClusterWithKeywords[] = [];
      const generationConfig = createMockGenerationConfig();

      // Act & Assert
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);
      expect(roadmap.items).toHaveLength(0);
      expect(roadmap.analytics.totalEstimatedTraffic).toBe(0);
    });

    it('should handle invalid generation config', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const invalidConfig = {
        ...createMockGenerationConfig(),
        postsPerMonth: -1 // Invalid value
      };

      // Act & Assert
      await expect(service.generateRoadmap(runId, clusters, invalidConfig))
        .rejects
        .toThrow();
    });

    it('should handle team member assignment failures', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = {
        ...createMockGenerationConfig(),
        teamMembers: [] // No team members
      };

      // Act & Assert
      await expect(service.generateRoadmap(runId, clusters, generationConfig))
        .rejects
        .toThrow();
    });
  });

  describe('scheduling logic', () => {
    it('should respect maximum posts per day limit', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClusters();
      const generationConfig = createMockGenerationConfig();
      generationConfig.postsPerMonth = 60; // High volume to test daily limits

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const dateGroups = new Map<string, number>();
      roadmap.items.forEach(item => {
        if (item.dueDate) {
          dateGroups.set(item.dueDate, (dateGroups.get(item.dueDate) || 0) + 1);
        }
      });

      // No day should have more than 2 posts (maxPostsPerDay)
      Array.from(dateGroups.values()).forEach(count => {
        expect(count).toBeLessThanOrEqual(2);
      });
    });

    it('should maintain minimum spacing between pillar content', async () => {
      // Arrange
      const runId = 'test-run-id' as UUID;
      const clusters = createMockClustersWithHighVolume(); // Creates pillar-worthy content
      const generationConfig = createMockGenerationConfig();

      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: true,
        data: { titles: ['Test Title'], confidence: 0.8 }
      });

      // Act
      const roadmap = await service.generateRoadmap(runId, clusters, generationConfig);

      // Assert
      const pillarDates = roadmap.items
        .filter(item => item.stage === 'pillar' && item.dueDate)
        .map(item => new Date(item.dueDate!))
        .sort((a, b) => a.getTime() - b.getTime());

      if (pillarDates.length > 1) {
        for (let i = 1; i < pillarDates.length; i++) {
          const daysDifference = Math.ceil(
            (pillarDates[i].getTime() - pillarDates[i - 1].getTime()) / (24 * 60 * 60 * 1000)
          );
          expect(daysDifference).toBeGreaterThanOrEqual(14); // 2 weeks minimum
        }
      }
    });
  });
});

// Helper functions for creating test data

function createMockClusters(): ClusterWithKeywords[] {
  const baseCluster = {
    id: 'cluster-1' as UUID,
    runId: 'run-1' as UUID,
    label: 'test cluster',
    size: 10,
    score: 0.8,
    intentMix: {
      transactional: 0.2,
      commercial: 0.3,
      informational: 0.4,
      navigational: 0.1
    },
    representativeKeywords: ['test keyword 1', 'test keyword 2'],
    similarityThreshold: 0.7,
    embedding: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    keywords: [],
    analytics: {
      actualKeywordCount: 10,
      avgVolume: 2500,
      avgDifficulty: 45,
      avgBlendedScore: 0.6,
      quickWinCount: 3,
      medianVolume: 2000,
      totalVolume: 25000,
      difficultyRange: { min: 20, max: 70, spread: 50 },
      topKeywords: [
        { keyword: 'test keyword 1' as any, volume: 5000, score: 0.8 },
        { keyword: 'test keyword 2' as any, volume: 3000, score: 0.7 }
      ],
      contentOpportunities: []
    } as ClusterAnalytics
  };

  // Create keywords for the cluster
  const keywords: Keyword[] = [];
  for (let i = 1; i <= 10; i++) {
    keywords.push({
      id: `keyword-${i}` as UUID,
      runId: 'run-1' as UUID,
      clusterId: baseCluster.id,
      keyword: `test keyword ${i}` as any,
      stage: i <= 3 ? 'dream100' : i <= 7 ? 'tier2' : 'tier3',
      volume: Math.max(100, 3000 - (i * 200)),
      difficulty: Math.min(80, 20 + (i * 5)),
      intent: ['informational', 'commercial', 'transactional'][i % 3] as any,
      relevance: Math.max(0.3, 0.9 - (i * 0.05)),
      trend: 0.1,
      blendedScore: Math.max(0.2, 0.8 - (i * 0.05)),
      quickWin: i <= 3,
      canonicalKeyword: null,
      topSerpUrls: [`https://example${i}.com`],
      embedding: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return [{ ...baseCluster, keywords }];
}

function createMockClustersWithVariedIntents(): ClusterWithKeywords[] {
  const clusters = createMockClusters();
  
  // Add clusters with different intent distributions
  clusters.push({
    ...clusters[0],
    id: 'cluster-2' as UUID,
    label: 'commercial cluster',
    intentMix: {
      transactional: 0.6,
      commercial: 0.3,
      informational: 0.1,
      navigational: 0.0
    },
    keywords: clusters[0].keywords.map(k => ({
      ...k,
      id: `keyword-commercial-${k.id}` as UUID,
      intent: 'commercial' as any,
      keyword: `buy ${k.keyword}` as any
    }))
  });

  return clusters;
}

function createMockClustersWithHighVolume(): ClusterWithKeywords[] {
  const clusters = createMockClusters();
  
  clusters[0].keywords = clusters[0].keywords.map(k => ({
    ...k,
    volume: Math.max(k.volume, 8000), // Ensure high volume
    stage: 'dream100' as any
  }));

  clusters[0].analytics.avgVolume = 8000;
  clusters[0].analytics.totalVolume = 80000;

  return clusters;
}

function createMockGenerationConfig(): RoadmapGenerationConfig {
  const teamMembers: TeamMember[] = [
    {
      name: 'Writer 1',
      email: 'writer1@test.com',
      role: 'writer',
      capacity: 10,
      specialties: ['tech', 'marketing'],
      unavailable: []
    },
    {
      name: 'Writer 2',
      email: 'writer2@test.com',
      role: 'writer',
      capacity: 8,
      specialties: ['business', 'finance'],
      unavailable: ['2024-03-15']
    },
    {
      name: 'Editor 1',
      email: 'editor1@test.com',
      role: 'editor',
      capacity: 12,
      specialties: [],
      unavailable: []
    }
  ];

  const contentTypes: ContentTypeConfig[] = [
    {
      type: 'blog_post',
      intents: ['informational'],
      minVolume: 0,
      maxDifficulty: 100,
      estimatedHours: 4,
      template: {
        titleFormat: 'How to {keyword}',
        structure: ['intro', 'main_content', 'conclusion'],
        wordCount: 1500,
        requiredSections: ['introduction', 'conclusion']
      }
    },
    {
      type: 'pillar_page',
      intents: ['informational', 'commercial'],
      minVolume: 5000,
      maxDifficulty: 100,
      estimatedHours: 8,
      template: {
        titleFormat: 'Complete Guide to {keyword}',
        structure: ['intro', 'sections', 'resources', 'conclusion'],
        wordCount: 3000,
        requiredSections: ['introduction', 'table_of_contents', 'resources', 'conclusion']
      }
    }
  ];

  return {
    postsPerMonth: 20,
    startDate: '2024-03-01',
    duration: 6,
    pillarRatio: 0.3,
    quickWinPriority: true,
    teamMembers,
    contentTypes
  };
}

async function createMockRoadmap(): Promise<EditorialRoadmap> {
  const runId = 'test-run-id' as UUID;
  const items: RoadmapItemWithCluster[] = [
    {
      id: 'item-1' as UUID,
      runId,
      clusterId: 'cluster-1' as UUID,
      postId: 'post-1',
      stage: 'pillar',
      primaryKeyword: 'test keyword 1' as any,
      secondaryKeywords: ['related keyword 1', 'related keyword 2'] as any[],
      intent: 'informational',
      volume: 5000,
      difficulty: 45,
      blendedScore: 0.8,
      quickWin: false,
      suggestedTitle: 'Complete Guide to Test Keyword 1',
      dri: 'Writer 1',
      dueDate: '2024-03-15',
      notes: 'Content brief created',
      sourceUrls: ['https://example1.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cluster: {
        id: 'cluster-1' as UUID,
        label: 'test cluster',
        score: 0.8,
        size: 10,
        intentMix: {
          transactional: 0.2,
          commercial: 0.3,
          informational: 0.4,
          navigational: 0.1
        }
      }
    },
    {
      id: 'item-2' as UUID,
      runId,
      clusterId: 'cluster-1' as UUID,
      postId: 'post-2',
      stage: 'supporting',
      primaryKeyword: 'test keyword 2' as any,
      secondaryKeywords: [] as any[],
      intent: 'commercial',
      volume: 2000,
      difficulty: 30,
      blendedScore: 0.7,
      quickWin: true,
      suggestedTitle: 'Best Test Keyword 2 Solutions',
      dri: 'Writer 2',
      dueDate: '2024-03-08',
      notes: null,
      sourceUrls: ['https://example2.com'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cluster: {
        id: 'cluster-1' as UUID,
        label: 'test cluster',
        score: 0.8,
        size: 10,
        intentMix: {
          transactional: 0.2,
          commercial: 0.3,
          informational: 0.4,
          navigational: 0.1
        }
      }
    }
  ];

  return {
    runId,
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    pillarItems: items.filter(item => item.stage === 'pillar').length,
    supportingItems: items.filter(item => item.stage === 'supporting').length,
    timeframe: {
      startDate: '2024-03-01',
      endDate: '2024-09-01',
      totalWeeks: 26,
      postsPerWeek: 5
    },
    items,
    analytics: {
      totalEstimatedTraffic: 2100, // 30% of total volume
      quickWinCount: 1,
      avgDifficulty: 37.5,
      intentDistribution: {
        transactional: 0,
        commercial: 1,
        informational: 1,
        navigational: 0
      },
      stageDistribution: {
        pillar: 1,
        supporting: 1
      },
      monthlyDistribution: [
        { month: '2024-03', items: 2, estimatedTraffic: 2100, quickWins: 1 }
      ],
      driWorkload: [
        { dri: 'Writer 1', itemsAssigned: 1, estimatedHours: 8, quickWins: 0 },
        { dri: 'Writer 2', itemsAssigned: 1, estimatedHours: 4, quickWins: 1 }
      ],
      contentTypes: [
        { type: 'Comprehensive Guide', count: 1, avgDifficulty: 45 },
        { type: 'Listicle', count: 1, avgDifficulty: 30 }
      ]
    },
    recommendations: [
      'High quick-win potential - prioritize early publishing for immediate traffic gains',
      'Balanced content mix between pillar and supporting content'
    ]
  };
}