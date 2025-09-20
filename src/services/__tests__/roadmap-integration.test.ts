/**
 * Editorial Roadmap Integration Tests
 * 
 * End-to-end tests covering the complete roadmap generation workflow
 * including clustering integration, API endpoints, and export functionality.
 */

import { RoadmapGenerationService } from '../roadmap';
import type {
  RoadmapGenerationConfig,
  RoadmapServiceConfig,
  EditorialRoadmap,
  ContentCalendar
} from '../../models/roadmap';
import type { ClusterWithKeywords } from '../../models/cluster';

describe('Roadmap Generation Integration Tests', () => {
  let service: RoadmapGenerationService;
  let mockAnthropicClient: any;
  let serviceConfig: RoadmapServiceConfig;

  beforeEach(() => {
    serviceConfig = {
      anthropicApiKey: 'test-key',
      defaultPostsPerMonth: 20,
      defaultDuration: 6,
      maxConcurrentTitleGeneration: 5,
      bufferDays: 2,
      holidayDates: ['2024-12-25', '2024-01-01', '2024-07-04'],
      workingDays: [1, 2, 3, 4] // Mon-Thu
    };

    mockAnthropicClient = {
      generateTitles: jest.fn().mockResolvedValue({
        success: true,
        data: {
          titles: [
            'Ultimate Guide to {keyword}',
            'Complete {keyword} Handbook',
            'Master {keyword}: Expert Tips',
            '{keyword} Best Practices',
            'Advanced {keyword} Strategies'
          ],
          confidence: 0.85
        }
      })
    };

    service = new RoadmapGenerationService(serviceConfig, mockAnthropicClient);
  });

  describe('End-to-End Roadmap Generation', () => {
    it('should generate a complete roadmap from realistic cluster data', async () => {
      // Arrange - Create realistic marketing automation cluster data
      const clusters = createRealisticMarketingClusters();
      const generationConfig = createRealisticGenerationConfig();

      const progressSteps: string[] = [];
      const onProgress = (progress: any) => {
        progressSteps.push(progress.stage);
      };

      // Act
      const roadmap = await service.generateRoadmap(
        'test-run-123' as any,
        clusters,
        generationConfig,
        onProgress
      );

      // Assert - Comprehensive roadmap validation
      expect(roadmap).toMatchObject({
        runId: 'test-run-123',
        totalItems: expect.any(Number),
        pillarItems: expect.any(Number),
        supportingItems: expect.any(Number)
      });

      // Validate content mix ratios
      const totalItems = roadmap.totalItems;
      const quickWinItems = roadmap.items.filter(item => item.quickWin);
      const pillarItems = roadmap.items.filter(item => item.stage === 'pillar');
      
      // Should have reasonable content distribution
      expect(quickWinItems.length).toBeGreaterThan(0);
      expect(pillarItems.length).toBeGreaterThan(0);
      expect(quickWinItems.length / totalItems).toBeLessThanOrEqual(0.6); // Max 60% quick wins
      expect(pillarItems.length / totalItems).toBeGreaterThan(0.15); // Min 15% pillar

      // Validate scheduling adherence
      const workingDaySchedules = roadmap.items.filter(item => {
        if (!item.dueDate) return false;
        const dayOfWeek = new Date(item.dueDate).getDay();
        return serviceConfig.workingDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek);
      });
      expect(workingDaySchedules.length).toBe(roadmap.items.filter(item => item.dueDate).length);

      // Validate team assignment balance
      const workloadByDri = roadmap.analytics.driWorkload;
      const assignments = workloadByDri.map(w => w.itemsAssigned);
      const maxAssignments = Math.max(...assignments);
      const minAssignments = Math.min(...assignments);
      expect(maxAssignments - minAssignments).toBeLessThanOrEqual(3); // Reasonable balance

      // Validate progress tracking
      expect(progressSteps).toContain('clustering');
      expect(progressSteps).toContain('scheduling');
      expect(progressSteps).toContain('complete');

      // Validate analytics completeness
      expect(roadmap.analytics).toMatchObject({
        totalEstimatedTraffic: expect.any(Number),
        quickWinCount: quickWinItems.length,
        avgDifficulty: expect.any(Number),
        monthlyDistribution: expect.arrayContaining([
          expect.objectContaining({
            month: expect.any(String),
            items: expect.any(Number),
            estimatedTraffic: expect.any(Number),
            quickWins: expect.any(Number)
          })
        ]),
        driWorkload: expect.arrayContaining([
          expect.objectContaining({
            dri: expect.any(String),
            itemsAssigned: expect.any(Number),
            estimatedHours: expect.any(Number)
          })
        ])
      });
    });

    it('should handle large-scale roadmap generation (50+ clusters, 6-month timeline)', async () => {
      // Arrange - Large scale test data
      const largeClusters = Array.from({ length: 50 }, (_, i) => 
        createMockCluster(`Marketing Topic ${i + 1}`, 8 + (i % 5))
      );
      
      const generationConfig = {
        postsPerMonth: 30,
        startDate: '2024-03-01',
        duration: 6,
        pillarRatio: 0.25,
        quickWinPriority: true,
        teamMembers: Array.from({ length: 8 }, (_, i) => ({
          name: `Writer ${i + 1}`,
          email: `writer${i + 1}@company.com`,
          role: 'writer' as const,
          capacity: 25,
          specialties: [`topic${i % 3}`, `niche${i % 4}`],
          unavailable: []
        })),
        contentTypes: []
      };

      // Act
      const startTime = Date.now();
      const roadmap = await service.generateRoadmap(
        'large-run-456' as any,
        largeClusters,
        generationConfig
      );
      const processingTime = Date.now() - startTime;

      // Assert - Performance and scalability
      expect(roadmap.totalItems).toBeLessThanOrEqual(180); // 30 posts/month * 6 months
      expect(roadmap.totalItems).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(30000); // Under 30 seconds
      
      // Validate distribution across large team
      const teamUtilization = roadmap.analytics.driWorkload;
      expect(teamUtilization).toHaveLength(8);
      teamUtilization.forEach(member => {
        expect(member.itemsAssigned).toBeGreaterThan(0);
        expect(member.itemsAssigned).toBeLessThanOrEqual(30); // Reasonable load
      });
    });

    it('should maintain quality with rapid AI title generation', async () => {
      // Arrange
      const clusters = createRealisticMarketingClusters();
      const config = createRealisticGenerationConfig();
      
      // Mock rapid but sometimes failing AI responses
      let callCount = 0;
      mockAnthropicClient.generateTitles.mockImplementation(() => {
        callCount++;
        // Simulate occasional failures (10% failure rate)
        if (callCount % 10 === 0) {
          return Promise.resolve({
            success: false,
            error: { message: 'Rate limit exceeded', code: 'RATE_LIMIT' }
          });
        }
        
        return Promise.resolve({
          success: true,
          data: {
            titles: [
              `How to Master ${callCount}`,
              `Complete Guide to Topic ${callCount}`,
              `${callCount} Best Practices`,
              `Advanced ${callCount} Strategies`,
              `Ultimate ${callCount} Tips`
            ],
            confidence: 0.8 + (Math.random() * 0.2)
          }
        });
      });

      // Act
      const roadmap = await service.generateRoadmap(
        'ai-test-789' as any,
        clusters,
        config
      );

      // Assert - AI integration quality
      const itemsWithTitles = roadmap.items.filter(item => item.suggestedTitle);
      expect(itemsWithTitles.length).toBe(roadmap.totalItems); // All items should have titles
      
      // Should have both AI-generated and fallback titles
      const aiTitles = roadmap.items.filter(item => 
        item.suggestedTitle && !item.suggestedTitle.includes('Complete Guide')
      );
      const fallbackTitles = roadmap.items.filter(item =>
        item.suggestedTitle && item.suggestedTitle.includes('Complete Guide')
      );
      
      expect(aiTitles.length).toBeGreaterThan(0); // Some AI success
      expect(fallbackTitles.length).toBeGreaterThan(0); // Some fallbacks used
    });
  });

  describe('Content Calendar Integration', () => {
    it('should create accurate monthly calendar view', async () => {
      // Arrange
      const roadmap = await generateSampleRoadmap();

      // Act
      const calendar = service.createContentCalendar(roadmap, 'month');

      // Assert
      expect(calendar.view).toBe('month');
      expect(calendar.periods).toHaveLength(expect.any(Number));
      
      // Each period should have proper metrics
      calendar.periods.forEach(period => {
        expect(period).toMatchObject({
          startDate: expect.any(String),
          endDate: expect.any(String),
          label: expect.any(String),
          items: expect.any(Array),
          metrics: expect.objectContaining({
            totalItems: expect.any(Number),
            quickWins: expect.any(Number),
            estimatedTraffic: expect.any(Number),
            avgDifficulty: expect.any(Number)
          }),
          workloadByDri: expect.any(Object)
        });
      });

      // Validate no overlapping items
      const allItemsInCalendar = calendar.periods.flatMap(p => p.items);
      const originalItems = roadmap.items.filter(item => item.dueDate);
      expect(allItemsInCalendar.length).toBe(originalItems.length);
    });

    it('should handle weekly and quarterly views correctly', async () => {
      // Arrange
      const roadmap = await generateSampleRoadmap();

      // Act
      const weeklyCalendar = service.createContentCalendar(roadmap, 'week');
      const quarterlyCalendar = service.createContentCalendar(roadmap, 'quarter');

      // Assert
      expect(weeklyCalendar.view).toBe('week');
      expect(quarterlyCalendar.view).toBe('quarter');
      
      // Weekly should have more periods than quarterly
      expect(weeklyCalendar.periods.length).toBeGreaterThan(quarterlyCalendar.periods.length);
      
      // All views should account for all scheduled items
      const weeklyItemCount = weeklyCalendar.periods.reduce((sum, p) => sum + p.items.length, 0);
      const quarterlyItemCount = quarterlyCalendar.periods.reduce((sum, p) => sum + p.items.length, 0);
      const scheduledItemCount = roadmap.items.filter(item => item.dueDate).length;
      
      expect(weeklyItemCount).toBe(scheduledItemCount);
      expect(quarterlyItemCount).toBe(scheduledItemCount);
    });
  });

  describe('Export Functionality Integration', () => {
    it('should export complete CSV with all required columns', async () => {
      // Arrange
      const roadmap = await generateSampleRoadmap();
      const exportOptions = {
        includeMetadata: true,
        includeAnalytics: true,
        sortBy: 'dueDate' as const,
        sortDirection: 'asc' as const,
        formatting: {
          dateFormat: 'US' as const,
          numberFormat: 'US' as const,
          currencySymbol: '$',
          booleanFormat: 'yes_no' as const
        }
      };

      // Act
      const csvData = service.exportToCsv(roadmap, exportOptions);

      // Assert - Complete CSV structure
      expect(csvData).toHaveLength(roadmap.totalItems);
      
      // Validate all required columns present
      const requiredColumns = [
        'post_id', 'cluster_label', 'stage', 'primary_keyword', 'secondary_keywords',
        'intent', 'volume', 'difficulty', 'blended_score', 'quick_win',
        'suggested_title', 'dri', 'due_date', 'notes', 'source_urls', 'run_id'
      ];
      
      if (csvData.length > 0) {
        const csvColumns = Object.keys(csvData[0]);
        requiredColumns.forEach(column => {
          expect(csvColumns).toContain(column);
        });
      }

      // Validate data integrity
      csvData.forEach(row => {
        expect(row.post_id).toBeTruthy();
        expect(row.primary_keyword).toBeTruthy();
        expect(row.volume).toBeGreaterThanOrEqual(0);
        expect(row.difficulty).toBeGreaterThanOrEqual(0);
        expect(row.difficulty).toBeLessThanOrEqual(100);
        expect(row.blended_score).toBeGreaterThanOrEqual(0);
        expect(row.blended_score).toBeLessThanOrEqual(1);
        expect(['pillar', 'supporting']).toContain(row.stage);
      });

      // Validate sorting
      const dueDates = csvData
        .map(row => row.due_date)
        .filter(date => date);
      const sortedDates = [...dueDates].sort();
      expect(dueDates).toEqual(sortedDates);

      // Validate boolean formatting
      csvData.forEach(row => {
        if (typeof row.quick_win === 'string') {
          expect(['Yes', 'No']).toContain(row.quick_win);
        }
      });
    });

    it('should handle different export filtering scenarios', async () => {
      // Arrange
      const roadmap = await generateSampleRoadmap();

      // Act - Test various filter combinations
      const quickWinExport = service.exportToCsv(roadmap, {
        includeMetadata: true,
        includeAnalytics: false,
        sortBy: 'volume',
        sortDirection: 'desc',
        formatting: {
          dateFormat: 'ISO',
          numberFormat: 'US',
          currencySymbol: '$',
          booleanFormat: 'true_false'
        }
      });

      // Assert
      expect(quickWinExport.length).toBeGreaterThan(0);
      expect(quickWinExport.length).toBeLessThanOrEqual(roadmap.totalItems);

      // Volume should be in descending order
      const volumes = quickWinExport.map(row => row.volume);
      const sortedVolumes = [...volumes].sort((a, b) => b - a);
      expect(volumes).toEqual(sortedVolumes);
    });
  });

  describe('Optimization and Recommendations', () => {
    it('should provide actionable roadmap optimization suggestions', async () => {
      // Arrange - Create roadmap with known optimization opportunities
      const roadmap = await generateSuboptimalRoadmap();

      // Act
      const optimization = await service.optimizeRoadmap(roadmap);

      // Assert
      expect(optimization).toMatchObject({
        runId: roadmap.runId,
        currentScore: expect.any(Number),
        optimizedScore: expect.any(Number),
        improvements: expect.any(Array),
        rebalancing: expect.objectContaining({
          pillarContentIncrease: expect.any(Number),
          quickWinFocus: expect.any(Boolean),
          timelineAdjustments: expect.any(Array),
          teamReassignments: expect.any(Array)
        })
      });

      expect(optimization.optimizedScore).toBeGreaterThanOrEqual(optimization.currentScore);
      
      // Should have actionable improvements
      if (optimization.improvements.length > 0) {
        optimization.improvements.forEach(improvement => {
          expect(improvement).toMatchObject({
            type: expect.any(String),
            description: expect.any(String),
            impact: expect.any(Number),
            effort: expect.any(Number),
            roi: expect.any(Number),
            actionItems: expect.arrayContaining([expect.any(String)])
          });
          
          expect(improvement.impact).toBeGreaterThan(0);
          expect(improvement.effort).toBeGreaterThan(0);
          expect(improvement.actionItems.length).toBeGreaterThan(0);
        });

        // Should be sorted by ROI
        const rois = optimization.improvements.map(imp => imp.roi);
        const sortedRois = [...rois].sort((a, b) => b - a);
        expect(rois).toEqual(sortedRois);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should gracefully handle empty cluster input', async () => {
      // Arrange
      const emptyClusters: ClusterWithKeywords[] = [];
      const config = createRealisticGenerationConfig();

      // Act
      const roadmap = await service.generateRoadmap(
        'empty-test' as any,
        emptyClusters,
        config
      );

      // Assert
      expect(roadmap.totalItems).toBe(0);
      expect(roadmap.pillarItems).toBe(0);
      expect(roadmap.supportingItems).toBe(0);
      expect(roadmap.analytics.totalEstimatedTraffic).toBe(0);
      expect(roadmap.items).toHaveLength(0);
    });

    it('should handle team capacity constraints properly', async () => {
      // Arrange
      const clusters = createRealisticMarketingClusters();
      const limitedTeamConfig = {
        ...createRealisticGenerationConfig(),
        postsPerMonth: 50, // High demand
        teamMembers: [{
          name: 'Solo Writer',
          email: 'solo@company.com',
          role: 'writer' as const,
          capacity: 20, // Limited capacity
          specialties: [],
          unavailable: []
        }]
      };

      // Act & Assert
      await expect(
        service.generateRoadmap('capacity-test' as any, clusters, limitedTeamConfig)
      ).rejects.toThrow('Team capacity must be at least equal to posts per month');
    });

    it('should handle API failures and fallback gracefully', async () => {
      // Arrange
      const clusters = createRealisticMarketingClusters();
      const config = createRealisticGenerationConfig();
      
      // Mock complete API failure
      mockAnthropicClient.generateTitles.mockResolvedValue({
        success: false,
        error: { message: 'Service unavailable', code: 'SERVICE_ERROR' }
      });

      // Act
      const roadmap = await service.generateRoadmap(
        'failure-test' as any,
        clusters,
        config
      );

      // Assert - Should complete with fallback titles
      expect(roadmap.totalItems).toBeGreaterThan(0);
      expect(roadmap.items.every(item => item.suggestedTitle)).toBe(true);
      
      // All titles should be fallbacks
      const fallbackTitles = roadmap.items.filter(item =>
        item.suggestedTitle && (
          item.suggestedTitle.includes('Complete Guide') ||
          item.suggestedTitle.includes('How to') ||
          item.suggestedTitle.includes('Top 10')
        )
      );
      expect(fallbackTitles.length).toBe(roadmap.totalItems);
    });
  });
});

// Helper functions for creating test data

function createRealisticMarketingClusters(): ClusterWithKeywords[] {
  return [
    createMockCluster('Marketing Automation', 12, {
      avgVolume: 4500,
      totalVolume: 54000,
      quickWinCount: 4,
      avgDifficulty: 52,
      intentMix: { commercial: 0.5, informational: 0.4, transactional: 0.1, navigational: 0.0 }
    }),
    createMockCluster('Email Marketing', 10, {
      avgVolume: 3200,
      totalVolume: 32000,
      quickWinCount: 3,
      avgDifficulty: 48,
      intentMix: { commercial: 0.3, informational: 0.6, transactional: 0.1, navigational: 0.0 }
    }),
    createMockCluster('Content Marketing', 15, {
      avgVolume: 2800,
      totalVolume: 42000,
      quickWinCount: 5,
      avgDifficulty: 44,
      intentMix: { informational: 0.7, commercial: 0.2, transactional: 0.05, navigational: 0.05 }
    }),
    createMockCluster('Social Media Marketing', 8, {
      avgVolume: 5200,
      totalVolume: 41600,
      quickWinCount: 2,
      avgDifficulty: 58,
      intentMix: { informational: 0.5, commercial: 0.3, transactional: 0.1, navigational: 0.1 }
    })
  ];
}

function createMockCluster(
  label: string, 
  keywordCount: number, 
  customAnalytics?: Partial<any>
): ClusterWithKeywords {
  const keywords = Array.from({ length: keywordCount }, (_, i) => ({
    id: `${label.toLowerCase().replace(/\s/g, '-')}-kw-${i + 1}` as any,
    runId: 'test-run' as any,
    clusterId: `${label.toLowerCase().replace(/\s/g, '-')}-cluster` as any,
    keyword: `${label.toLowerCase()} ${i + 1}` as any,
    stage: i < 3 ? 'dream100' : i < 8 ? 'tier2' : 'tier3' as any,
    volume: Math.max(200, (customAnalytics?.avgVolume || 3000) - (i * 150)),
    difficulty: Math.min(85, (customAnalytics?.avgDifficulty || 45) + (i * 2)),
    intent: (['informational', 'commercial', 'transactional', 'navigational'] as const)[i % 4],
    relevance: Math.max(0.4, 0.95 - (i * 0.04)),
    trend: -0.1 + (Math.random() * 0.3),
    blendedScore: Math.max(0.25, 0.9 - (i * 0.04)),
    quickWin: i < (customAnalytics?.quickWinCount || 3),
    canonicalKeyword: i === 0 ? null : label.toLowerCase() as any,
    topSerpUrls: [`https://competitor${i % 3 + 1}.com/${label.toLowerCase().replace(/\s/g, '-')}`],
    embedding: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  return {
    id: `${label.toLowerCase().replace(/\s/g, '-')}-cluster` as any,
    runId: 'test-run' as any,
    label,
    size: keywordCount,
    score: 0.75 + (Math.random() * 0.2),
    intentMix: customAnalytics?.intentMix || {
      transactional: 0.2,
      commercial: 0.3,
      informational: 0.4,
      navigational: 0.1
    },
    representativeKeywords: keywords.slice(0, 3).map(k => k.keyword),
    similarityThreshold: 0.72,
    embedding: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    keywords,
    analytics: {
      actualKeywordCount: keywordCount,
      avgVolume: customAnalytics?.avgVolume || 3000,
      avgDifficulty: customAnalytics?.avgDifficulty || 45,
      avgBlendedScore: 0.65,
      quickWinCount: customAnalytics?.quickWinCount || 3,
      medianVolume: (customAnalytics?.avgVolume || 3000) * 0.85,
      totalVolume: customAnalytics?.totalVolume || (keywordCount * 3000),
      difficultyRange: { min: 25, max: 75, spread: 50 },
      topKeywords: keywords.slice(0, 3).map(k => ({
        keyword: k.keyword,
        volume: k.volume,
        score: k.blendedScore
      })),
      contentOpportunities: []
    }
  };
}

function createRealisticGenerationConfig(): RoadmapGenerationConfig {
  return {
    postsPerMonth: 22,
    startDate: '2024-03-01',
    duration: 6,
    pillarRatio: 0.28,
    quickWinPriority: true,
    teamMembers: [
      {
        name: 'Sarah Chen',
        email: 'sarah.chen@company.com',
        role: 'writer',
        capacity: 8,
        specialties: ['marketing automation', 'saas', 'b2b'],
        unavailable: ['2024-04-15', '2024-07-04']
      },
      {
        name: 'Mike Rodriguez',
        email: 'mike.rodriguez@company.com',
        role: 'writer',
        capacity: 7,
        specialties: ['content marketing', 'seo', 'analytics'],
        unavailable: []
      },
      {
        name: 'Emily Johnson',
        email: 'emily.johnson@company.com',
        role: 'editor',
        capacity: 12,
        specialties: ['editing', 'strategy', 'optimization'],
        unavailable: ['2024-06-01', '2024-06-02']
      }
    ],
    contentTypes: [
      {
        type: 'blog_post',
        intents: ['informational'],
        minVolume: 0,
        maxDifficulty: 100,
        estimatedHours: 4,
        template: {
          titleFormat: 'How to {keyword}',
          structure: ['intro', 'main_content', 'conclusion'],
          wordCount: 1800,
          requiredSections: ['introduction', 'conclusion']
        }
      },
      {
        type: 'pillar_guide',
        intents: ['informational', 'commercial'],
        minVolume: 3000,
        maxDifficulty: 100,
        estimatedHours: 10,
        template: {
          titleFormat: 'The Complete {keyword} Guide',
          structure: ['intro', 'chapters', 'resources', 'conclusion'],
          wordCount: 4000,
          requiredSections: ['toc', 'introduction', 'resources', 'conclusion']
        }
      }
    ]
  };
}

async function generateSampleRoadmap(): Promise<EditorialRoadmap> {
  const service = new RoadmapGenerationService({
    anthropicApiKey: 'test',
    defaultPostsPerMonth: 20,
    defaultDuration: 6,
    maxConcurrentTitleGeneration: 5,
    bufferDays: 2,
    holidayDates: [],
    workingDays: [1, 2, 3, 4]
  });

  const mockClient = {
    generateTitles: jest.fn().mockResolvedValue({
      success: true,
      data: { titles: ['Test Title'], confidence: 0.8 }
    })
  };

  const serviceWithMock = new RoadmapGenerationService({
    anthropicApiKey: 'test',
    defaultPostsPerMonth: 20,
    defaultDuration: 6,
    maxConcurrentTitleGeneration: 5,
    bufferDays: 2,
    holidayDates: [],
    workingDays: [1, 2, 3, 4]
  }, mockClient as any);

  return serviceWithMock.generateRoadmap(
    'sample-run' as any,
    createRealisticMarketingClusters().slice(0, 2),
    createRealisticGenerationConfig()
  );
}

async function generateSuboptimalRoadmap(): Promise<EditorialRoadmap> {
  // Create a roadmap with known optimization opportunities
  const roadmap = await generateSampleRoadmap();
  
  // Artificially create optimization opportunities
  const modifiedItems = roadmap.items.map((item, i) => ({
    ...item,
    stage: i < 2 ? 'pillar' : 'supporting', // Low pillar ratio
    quickWin: i < Math.floor(roadmap.items.length * 0.8), // High quick win ratio
    dri: i < Math.floor(roadmap.items.length / 2) ? 'Sarah Chen' : 'Mike Rodriguez' // Uneven distribution
  }));

  return {
    ...roadmap,
    items: modifiedItems,
    pillarItems: 2,
    supportingItems: roadmap.totalItems - 2,
    analytics: {
      ...roadmap.analytics,
      stageDistribution: {
        pillar: 2,
        supporting: roadmap.totalItems - 2
      },
      quickWinCount: Math.floor(roadmap.items.length * 0.8)
    }
  };
}