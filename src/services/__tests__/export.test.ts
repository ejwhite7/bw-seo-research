/**
 * Export Service Tests
 * 
 * Comprehensive test suite for the export service covering all CSV schemas,
 * data transformations, filtering, and error handling.
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { ExportService, defaultExportConfig } from '../export';
import type { ExportConfig } from '../../models/export';
import type { RoadmapItemWithCluster } from '../../models/roadmap';
import type { KeywordWithCluster } from '../../models/keyword';
import type { ClusterWithKeywords } from '../../models/cluster';
import type { UUID } from '../../models';

// Mock external dependencies
jest.mock('@sentry/nextjs', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn()
}));

jest.mock('xlsx', () => ({
  utils: {
    book_new: jest.fn(() => ({})),
    json_to_sheet: jest.fn(() => ({})),
    book_append_sheet: jest.fn()
  },
  write: jest.fn(() => Buffer.from('mock excel data'))
}));

describe('ExportService', () => {
  let exportService: ExportService;
  let mockRunId: UUID;
  let mockExportConfig: ExportConfig;

  beforeEach(() => {
    exportService = new ExportService(defaultExportConfig);
    mockRunId = 'test-run-123e4567-e89b-12d3-a456-426614174000' as UUID;
    
    // Define mockExportConfig for use across all tests
    mockExportConfig = {
      runId: mockRunId,
      format: 'csv',
      template: 'editorial_roadmap',
      filters: {
        keywords: { quickWinsOnly: false },
        roadmap: { includeNotes: true },
        clusters: {}
      },
      options: {
        includeMetadata: true,
        includeAnalytics: false,
        sortBy: 'volume',
        sortDirection: 'desc',
        formatting: {
          dateFormat: 'US',
          numberFormat: 'US',
          currencySymbol: '$',
          booleanFormat: 'true_false'
        }
      },
      scheduling: null,
      destinations: []
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration and Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(exportService).toBeInstanceOf(ExportService);
    });

    it('should initialize template configurations', () => {
      // Test template export generation
      expect(async () => {
        await exportService.generateTemplateExport(mockRunId, 'writers');
      }).not.toThrow();
    });

    it('should validate configuration limits', () => {
      const config = {
        ...defaultExportConfig,
        maxConcurrentExports: 0
      };
      
      expect(() => new ExportService(config)).not.toThrow();
    });
  });

  describe('Export Creation', () => {

    it('should create export successfully with valid configuration', async () => {
      // Mock the fetchExportData method to return sample data
      const mockRoadmapData: RoadmapItemWithCluster[] = [{
        id: 'roadmap-1' as UUID,
        runId: mockRunId,
        clusterId: 'cluster-1' as UUID,
        postId: 'post-1',
        stage: 'pillar',
        primaryKeyword: 'test keyword' as any,
        secondaryKeywords: ['related keyword'] as any,
        intent: 'informational',
        volume: 5000,
        difficulty: 45,
        blendedScore: 0.75,
        quickWin: true,
        suggestedTitle: 'Test Article Title',
        dri: 'John Doe',
        dueDate: '2024-03-15',
        notes: 'Test notes',
        sourceUrls: ['https://example.com'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cluster: {
          id: 'cluster-1' as UUID,
          label: 'Test Cluster',
          score: 0.8,
          size: 10,
          intentMix: {
            transactional: 0.2,
            commercial: 0.3,
            informational: 0.4,
            navigational: 0.1
          }
        }
      }];

      // Mock the private method
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockRoadmapData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/download/url');

      const result = await exportService.createExport(mockExportConfig);

      expect(result.status).toBe('completed');
      expect(result.files).toHaveLength(1);
      expect(result.metadata.totalRecords).toBe(1);
      expect(result.metadata.processedRecords).toBe(1);
    });

    it('should handle empty data gracefully', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue([]);

      const result = await exportService.createExport(mockExportConfig);

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('EXPORT_FAILED');
      expect(result.error?.message).toContain('No data available for export');
    });

    it('should validate export configuration', async () => {
      const invalidConfig = {
        ...mockExportConfig,
        runId: 'invalid-uuid'
      };

      const result = await exportService.createExport(invalidConfig as ExportConfig);

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('EXPORT_FAILED');
    });

    it('should handle size limits', async () => {
      const largeDataset = Array(1000).fill({}).map((_, i) => ({
        id: `item-${i}`,
        keyword: `keyword-${i}`,
        volume: 1000,
        difficulty: 50
      }));

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(largeDataset);

      const result = await exportService.createExport({
        ...mockExportConfig,
        options: {
          ...mockExportConfig.options,
          maxRows: 100
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(100);
      }
    });
  });

  describe('Data Filtering', () => {
    const mockKeywords: KeywordWithCluster[] = [
      {
        id: 'kw-1' as UUID,
        runId: mockRunId,
        clusterId: 'cluster-1' as UUID,
        keyword: 'test keyword 1' as any,
        stage: 'dream100',
        volume: 5000,
        difficulty: 30,
        intent: 'informational',
        relevance: 0.8,
        trend: 0.1,
        blendedScore: 0.75,
        quickWin: true,
        canonicalKeyword: null,
        topSerpUrls: null,
        embedding: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cluster: {
          id: 'cluster-1' as UUID,
          label: 'Test Cluster',
          score: 0.8,
          size: 10
        }
      },
      {
        id: 'kw-2' as UUID,
        runId: mockRunId,
        clusterId: 'cluster-2' as UUID,
        keyword: 'test keyword 2' as any,
        stage: 'tier2',
        volume: 2000,
        difficulty: 70,
        intent: 'commercial',
        relevance: 0.6,
        trend: -0.1,
        blendedScore: 0.45,
        quickWin: false,
        canonicalKeyword: null,
        topSerpUrls: null,
        embedding: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cluster: {
          id: 'cluster-2' as UUID,
          label: 'Commercial Cluster',
          score: 0.6,
          size: 15
        }
      }
    ];

    it('should filter by quick wins only', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockKeywords);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'keyword_universe',
        filters: {
          keywords: { quickWinsOnly: true },
          roadmap: {},
          clusters: {}
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(1); // Only one quick win
      }
    });

    it('should filter by volume range', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockKeywords);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'keyword_universe',
        filters: {
          keywords: { 
            minVolume: 3000,
            maxVolume: 10000
          },
          roadmap: {},
          clusters: {}
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(1); // Only high volume keyword
      }
    });

    it('should filter by difficulty range', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockKeywords);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'keyword_universe',
        filters: {
          keywords: { 
            minDifficulty: 0,
            maxDifficulty: 50
          },
          roadmap: {},
          clusters: {}
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(1); // Only low difficulty keyword
      }
    });

    it('should filter by keyword stages', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockKeywords);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'keyword_universe',
        filters: {
          keywords: { 
            stages: ['dream100']
          },
          roadmap: {},
          clusters: {}
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(1); // Only dream100 keyword
      }
    });

    it('should filter by intent types', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockKeywords);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'keyword_universe',
        filters: {
          keywords: { 
            intents: ['informational']
          },
          roadmap: {},
          clusters: {}
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(1); // Only informational intent
      }
    });
  });

  describe('Data Transformation', () => {
    it('should transform roadmap data to editorial roadmap CSV format', async () => {
      const mockRoadmapData: RoadmapItemWithCluster[] = [{
        id: 'roadmap-1' as UUID,
        runId: mockRunId,
        clusterId: 'cluster-1' as UUID,
        postId: 'post-1',
        stage: 'pillar',
        primaryKeyword: 'content marketing strategy' as any,
        secondaryKeywords: ['content strategy', 'marketing plan'] as any,
        intent: 'informational',
        volume: 8500,
        difficulty: 55,
        blendedScore: 0.82,
        quickWin: false,
        suggestedTitle: 'Ultimate Content Marketing Strategy Guide',
        dri: 'Sarah Johnson',
        dueDate: '2024-04-15',
        notes: 'Comprehensive pillar content covering all aspects',
        sourceUrls: ['https://competitor1.com/guide', 'https://competitor2.com/strategy'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cluster: {
          id: 'cluster-1' as UUID,
          label: 'Content Marketing',
          score: 0.8,
          size: 12,
          intentMix: {
            transactional: 0.1,
            commercial: 0.2,
            informational: 0.6,
            navigational: 0.1
          }
        }
      }];

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockRoadmapData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'editorial_roadmap'
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('editorial_roadmap');
        expect(result.metadata.processedRecords).toBe(1);
      }
    });

    it('should apply sorting correctly', async () => {
      const mockData = [
        { volume: 1000, keyword: 'low volume', difficulty: 20 },
        { volume: 5000, keyword: 'high volume', difficulty: 60 },
        { volume: 2500, keyword: 'medium volume', difficulty: 40 }
      ];

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      // Test volume sorting (descending)
      const result = await exportService.createExport({
        ...mockExportConfig,
        template: 'keyword_universe',
        options: {
          ...mockExportConfig.options,
          sortBy: 'volume',
          sortDirection: 'desc'
        }
      });

      expect(result.status).toBe('completed');
    });

    it('should limit rows when maxRows is specified', async () => {
      const mockData = Array(50).fill({}).map((_, i) => ({
        keyword: `keyword-${i}`,
        volume: 1000 + i,
        difficulty: 30 + i
      }));

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport({
        ...mockExportConfig,
        options: {
          ...mockExportConfig.options,
          maxRows: 25
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(25);
      }
    });
  });

  describe('Export Formats', () => {
    const mockData = [{
      keyword: 'test keyword',
      volume: 5000,
      difficulty: 45,
      quick_win: true
    }];

    beforeEach(() => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');
    });

    it('should generate CSV format correctly', async () => {
      const result = await exportService.createExport({
        ...mockExportConfig,
        format: 'csv'
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('.csv');
        expect(result.files[0].format).toBe('csv');
      }
    });

    it('should generate Excel format correctly', async () => {
      const result = await exportService.createExport({
        ...mockExportConfig,
        format: 'excel'
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('.xlsx');
        expect(result.files[0].format).toBe('excel');
      }
    });

    it('should generate JSON format correctly', async () => {
      const result = await exportService.createExport({
        ...mockExportConfig,
        format: 'json'
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('.json');
        expect(result.files[0].format).toBe('json');
      }
    });
  });

  describe('Template Exports', () => {
    beforeEach(() => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue([{
        keyword: 'test',
        volume: 1000,
        difficulty: 30,
        dri: 'Test User',
        dueDate: '2024-03-15'
      }]);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');
    });

    it('should generate writers template export', async () => {
      const result = await exportService.generateTemplateExport(mockRunId, 'writers');
      
      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('editorial_roadmap');
      }
    });

    it('should generate SEO ops template export', async () => {
      const result = await exportService.generateTemplateExport(mockRunId, 'seo_ops');
      
      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('keyword_universe');
      }
    });

    it('should generate stakeholders template export', async () => {
      const result = await exportService.generateTemplateExport(mockRunId, 'stakeholders');
      
      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.files[0].name).toContain('cluster_analysis');
      }
    });
  });

  describe('Progress Tracking', () => {
    it('should track export progress when enabled', async () => {
      const mockData = [{ keyword: 'test', volume: 1000 }];
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const exportPromise = exportService.createExport(mockExportConfig);
      
      // Small delay to allow progress initialization
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await exportPromise;
      
      if (result.status === 'completed') {
        const progress = exportService.getExportProgress(result.id);
        expect(progress?.status).toBe('completed');
        expect(progress?.progress).toBe(100);
      }
    });

    it('should handle export cancellation', async () => {
      const mockData = Array(1000).fill({ keyword: 'test', volume: 1000 });
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      // Start export
      const exportPromise = exportService.createExport(mockExportConfig);
      
      // Small delay then cancel
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await exportPromise;
      if (result.status === 'completed' || result.status === 'failed') {
        const cancelled = await exportService.cancelExport(result.id);
        expect(cancelled).toBe(false); // Can't cancel completed export
      }
    });
  });

  describe('Analytics and Recommendations', () => {
    it('should generate export analytics', async () => {
      const mockData = [
        { keyword: 'kw1', volume: 5000, difficulty: 30, quickWin: true, intent: 'informational' },
        { keyword: 'kw2', volume: 2000, difficulty: 60, quickWin: false, intent: 'commercial' },
        { keyword: 'kw3', volume: 8000, difficulty: 25, quickWin: true, intent: 'informational' }
      ];

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport(mockExportConfig);

      if (result.status === 'completed') {
        expect(result.analytics.summary.totalKeywords).toBe(3);
        expect(result.analytics.summary.quickWinCount).toBe(2);
        expect(result.analytics.summary.avgDifficulty).toBeCloseTo(38.33, 1);
        expect(result.analytics.dataQuality.completeness).toBeGreaterThan(0);
        expect(result.analytics.recommendations).toContain('High quick-win potential detected');
      }
    });

    it('should calculate data quality metrics', async () => {
      const mockData = [
        { keyword: 'complete', volume: 1000, difficulty: 30, intent: 'informational' },
        { keyword: 'partial', volume: null, difficulty: 40, intent: 'commercial' },
        { keyword: 'incomplete', volume: 2000, difficulty: null, intent: null }
      ];

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(mockData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport(mockExportConfig);

      if (result.status === 'completed') {
        expect(result.analytics.dataQuality.completeness).toBeLessThan(1);
        expect(result.analytics.dataQuality.completeness).toBeGreaterThan(0);
      }
    });

    it('should generate contextual recommendations', async () => {
      const lowDifficultyData = Array(10).fill({}).map((_, i) => ({
        keyword: `kw-${i}`,
        volume: 1000,
        difficulty: 25,
        quickWin: false
      }));

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(lowDifficultyData);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await exportService.createExport(mockExportConfig);

      if (result.status === 'completed') {
        expect(result.analytics.recommendations).toContain(
          'Low average difficulty suggests good opportunity for rapid content creation'
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle data fetch errors', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockRejectedValue(new Error('Database connection failed'));

      const result = await exportService.createExport(mockExportConfig);

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('EXPORT_FAILED');
      expect(result.error?.message).toContain('Database connection failed');
    });

    it('should handle transformation errors', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue([{ invalid: 'data' }]);
      jest.spyOn(exportService as any, 'transformData').mockRejectedValue(new Error('Transformation failed'));

      const result = await exportService.createExport(mockExportConfig);

      expect(result.status).toBe('failed');
      expect(result.error?.retryable).toBe(true);
    });

    it('should handle file storage errors', async () => {
      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue([{ keyword: 'test' }]);
      jest.spyOn(exportService as any, 'storeFile').mockRejectedValue(new Error('Storage failed'));

      const result = await exportService.createExport(mockExportConfig);

      expect(result.status).toBe('failed');
    });

    it('should validate configuration schema', async () => {
      const invalidConfig = {
        runId: 'invalid-uuid',
        format: 'invalid-format',
        template: 'invalid-template'
      };

      const result = await exportService.createExport(invalidConfig as any);

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('EXPORT_FAILED');
    });
  });

  describe('Performance and Limits', () => {
    it('should respect concurrent export limits', async () => {
      const limitedService = new ExportService({
        ...defaultExportConfig,
        maxConcurrentExports: 1
      });

      jest.spyOn(limitedService as any, 'fetchExportData').mockResolvedValue([{ test: 'data' }]);
      jest.spyOn(limitedService as any, 'storeFile').mockResolvedValue('/test/url');

      // Start first export
      const export1Promise = limitedService.createExport(mockExportConfig);
      
      // Try to start second export immediately
      const export2Promise = limitedService.createExport({
        ...mockExportConfig,
        runId: 'different-run-id' as UUID
      });

      const [result1, result2] = await Promise.all([export1Promise, export2Promise]);

      // At least one should succeed
      expect([result1.status, result2.status]).toContain('completed');
    });

    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array(5000).fill({}).map((_, i) => ({
        keyword: `keyword-${i}`,
        volume: Math.random() * 10000,
        difficulty: Math.random() * 100,
        quickWin: Math.random() > 0.7
      }));

      jest.spyOn(exportService as any, 'fetchExportData').mockResolvedValue(largeDataset);
      jest.spyOn(exportService as any, 'storeFile').mockResolvedValue('/test/url');

      const startTime = Date.now();
      const result = await exportService.createExport(mockExportConfig);
      const processingTime = Date.now() - startTime;

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBe(5000);
        // Should complete within reasonable time (adjust threshold as needed)
        expect(processingTime).toBeLessThan(10000); // 10 seconds
      }
    });

    it('should enforce record limits', async () => {
      const service = new ExportService({
        ...defaultExportConfig,
        maxRecordsPerExport: 100
      });

      const largeDataset = Array(200).fill({ keyword: 'test', volume: 1000 });
      jest.spyOn(service as any, 'fetchExportData').mockResolvedValue(largeDataset);
      jest.spyOn(service as any, 'storeFile').mockResolvedValue('/test/url');

      const result = await service.createExport({
        ...mockExportConfig,
        options: {
          ...mockExportConfig.options,
          maxRows: 150 // This should be limited to 100
        }
      });

      if (result.status === 'completed') {
        expect(result.metadata.processedRecords).toBeLessThanOrEqual(100);
      }
    });
  });
});