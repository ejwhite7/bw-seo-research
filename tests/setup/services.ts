/**
 * Mock Services Setup for Tests
 * 
 * Creates proper mock implementations of services used throughout the test suite.
 */

import { jest } from '@jest/globals';

// Mock types for services
export interface MockIngestionService {
  getInstance(): MockIngestionService;
  processIngestion(request: any): Promise<any>;
  validateRequest(request: any): boolean;
  estimateCost(request: any): number;
}

export interface MockScoringService {
  calculateBlendedScore(keyword: any): any;
  batchCalculateScores(keywords: any[]): Promise<any[]>;
  detectQuickWins(keywords: any[]): any[];
}

export interface MockExpansionService {
  expandSeedKeywords(keywords: any[]): Promise<any>;
  generateDream100(seeds: any[]): Promise<any[]>;
}

export interface MockClusteringService {
  clusterKeywords(keywords: any[]): Promise<any>;
  assignKeywordsToClusters(keywords: any[], clusters: any[]): Promise<any>;
}

export interface MockRoadmapService {
  generateRoadmap(data: any): Promise<any>;
  scheduleContent(items: any[]): Promise<any>;
}

export interface MockUniverseService {
  buildUniverse(data: any): Promise<any>;
  expandTiers(keywords: any[]): Promise<any>;
}

// Mock service implementations
export const mockIngestionService: MockIngestionService = {
  getInstance: jest.fn().mockReturnValue({
    processIngestion: jest.fn().mockResolvedValue({
      success: true,
      data: { runId: 'test-run-id', status: 'processing' }
    }),
    validateRequest: jest.fn().mockReturnValue(true),
    estimateCost: jest.fn().mockReturnValue(50)
  }),
  processIngestion: jest.fn().mockResolvedValue({
    success: true,
    data: { runId: 'test-run-id', status: 'processing' }
  }),
  validateRequest: jest.fn().mockReturnValue(true),
  estimateCost: jest.fn().mockReturnValue(50)
};

export const mockScoringService: MockScoringService = {
  calculateBlendedScore: jest.fn().mockReturnValue({
    blendedScore: 0.75,
    componentScores: {
      volumeScore: 0.8,
      intentScore: 0.7,
      relevanceScore: 0.9,
      trendScore: 0.6,
      easeScore: 0.5
    }
  }),
  batchCalculateScores: jest.fn().mockResolvedValue([]),
  detectQuickWins: jest.fn().mockReturnValue([])
};

export const mockExpansionService: MockExpansionService = {
  expandSeedKeywords: jest.fn().mockResolvedValue({
    dream100: [],
    tier2: [],
    tier3: [],
    totalCount: 0,
    expansionTime: 1000
  }),
  generateDream100: jest.fn().mockResolvedValue([])
};

export const mockClusteringService: MockClusteringService = {
  clusterKeywords: jest.fn().mockResolvedValue({
    clusters: [],
    unassignedKeywords: [],
    metrics: { silhouetteScore: 0.7 }
  }),
  assignKeywordsToClusters: jest.fn().mockResolvedValue([])
};

export const mockRoadmapService: MockRoadmapService = {
  generateRoadmap: jest.fn().mockResolvedValue({
    roadmap: [],
    schedule: [],
    metrics: { totalPosts: 0 }
  }),
  scheduleContent: jest.fn().mockResolvedValue([])
};

export const mockUniverseService: MockUniverseService = {
  buildUniverse: jest.fn().mockResolvedValue({
    keywords: [],
    totalCount: 0,
    stages: { dream100: 0, tier2: 0, tier3: 0 }
  }),
  expandTiers: jest.fn().mockResolvedValue([])
};

// Export factory functions for creating mock instances
export const createMockIngestionService = () => mockIngestionService;
export const createMockScoringService = () => mockScoringService;
export const createMockExpansionService = () => mockExpansionService;
export const createMockClusteringService = () => mockClusteringService;
export const createMockRoadmapService = () => mockRoadmapService;
export const createMockUniverseService = () => mockUniverseService;

// Mock constructors for dynamic imports
export const IngestionService = {
  getInstance: jest.fn().mockReturnValue(mockIngestionService)
};

export const ScoringService = {
  getInstance: jest.fn().mockReturnValue(mockScoringService)
};

export const ExpansionService = {
  getInstance: jest.fn().mockReturnValue(mockExpansionService)
};

export const ClusteringService = {
  getInstance: jest.fn().mockReturnValue(mockClusteringService)
};

export const RoadmapService = {
  getInstance: jest.fn().mockReturnValue(mockRoadmapService)
};

export const UniverseService = {
  getInstance: jest.fn().mockReturnValue(mockUniverseService)
};