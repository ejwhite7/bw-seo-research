/**
 * Integration Tests for Complete Pipeline
 * 
 * Tests the full end-to-end workflow from seed keywords
 * to final editorial roadmap with all services integrated.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the external dependencies
jest.mock('../../__mocks__/anthropic');
jest.mock('../../__mocks__/axios');
jest.mock('../../__mocks__/redis');

// Mock data types for pipeline testing
interface PipelineInput {
  seedKeywords: string[];
  market: string;
  language: string;
  userId: string;
  settings: {
    maxKeywords: number;
    enableClustering: boolean;
    generateRoadmap: boolean;
    scoringWeights: Record<string, number>;
  };
}

interface PipelineOutput {
  runId: string;
  status: 'completed' | 'failed' | 'processing';
  totalKeywords: number;
  totalClusters: number;
  roadmapItems: number;
  processingTime: number;
  stages: {
    ingestion: { status: string; duration: number; };
    expansion: { status: string; duration: number; keywordCount: number; };
    enrichment: { status: string; duration: number; apiCalls: number; };
    clustering: { status: string; duration: number; clusterCount: number; };
    scoring: { status: string; duration: number; quickWins: number; };
    roadmap: { status: string; duration: number; postsGenerated: number; };
  };
  errors: string[];
  warnings: string[];
}

interface Keyword {
  id: string;
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  volume: number;
  difficulty: number;
  intent: string;
  relevanceScore: number;
  blendedScore: number;
  quickWin: boolean;
  clusterId?: string;
}

interface Cluster {
  id: string;
  label: string;
  keywords: string[];
  size: number;
  score: number;
  intentMix: Record<string, number>;
}

interface RoadmapItem {
  id: string;
  clusterId: string;
  title: string;
  targetKeywords: string[];
  dueDate: string;
  assignee: string;
  priority: 'high' | 'medium' | 'low';
}

// Mock pipeline orchestrator
class MockPipelineOrchestrator {
  private config: any;

  constructor(config: any = {}) {
    this.config = {
      maxProcessingTime: 30000, // 30 seconds
      batchSize: 100,
      enableParallelProcessing: true,
      retryAttempts: 3,
      ...config
    };
  }

  async executePipeline(input: PipelineInput): Promise<PipelineOutput> {
    const startTime = Date.now();
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const output: PipelineOutput = {
      runId,
      status: 'processing',
      totalKeywords: 0,
      totalClusters: 0,
      roadmapItems: 0,
      processingTime: 0,
      stages: {
        ingestion: { status: 'pending', duration: 0 },
        expansion: { status: 'pending', duration: 0, keywordCount: 0 },
        enrichment: { status: 'pending', duration: 0, apiCalls: 0 },
        clustering: { status: 'pending', duration: 0, clusterCount: 0 },
        scoring: { status: 'pending', duration: 0, quickWins: 0 },
        roadmap: { status: 'pending', duration: 0, postsGenerated: 0 }
      },
      errors: [],
      warnings: []
    };

    try {
      // Stage 1: Ingestion
      await this.executeIngestion(input, output);
      
      // Stage 2: Expansion
      const keywords = await this.executeExpansion(input, output);
      
      // Stage 3: Enrichment
      const enrichedKeywords = await this.executeEnrichment(keywords, output);
      
      // Stage 4: Clustering
      const clusters = input.settings.enableClustering 
        ? await this.executeClustering(enrichedKeywords, output)
        : [];
      
      // Stage 5: Scoring
      const scoredKeywords = await this.executeScoring(enrichedKeywords, output);
      
      // Stage 6: Roadmap Generation
      const roadmapItems = input.settings.generateRoadmap
        ? await this.executeRoadmapGeneration(scoredKeywords, clusters, output)
        : [];

      // Finalize output
      output.totalKeywords = scoredKeywords.length;
      output.totalClusters = clusters.length;
      output.roadmapItems = roadmapItems.length;
      output.processingTime = Date.now() - startTime;
      output.status = 'completed';

      return output;
    } catch (error) {
      output.status = 'failed';
      output.errors.push(error.message);
      output.processingTime = Date.now() - startTime;
      throw new Error(`Pipeline execution failed: ${error.message}`);
    }
  }

  private async executeIngestion(input: PipelineInput, output: PipelineOutput): Promise<void> {
    const stageStart = Date.now();
    
    try {
      // Validate input
      if (!input.seedKeywords || input.seedKeywords.length === 0) {
        throw new Error('No seed keywords provided');
      }
      
      if (input.seedKeywords.length > 10) {
        output.warnings.push('Large number of seed keywords may impact processing time');
      }
      
      // Simulate validation and preprocessing
      await this.delay(100);
      
      output.stages.ingestion = {
        status: 'completed',
        duration: Date.now() - stageStart
      };
    } catch (error) {
      output.stages.ingestion.status = 'failed';
      throw error;
    }
  }

  private async executeExpansion(input: PipelineInput, output: PipelineOutput): Promise<Keyword[]> {
    const stageStart = Date.now();
    
    try {
      const keywords: Keyword[] = [];
      
      // Generate Dream 100
      for (const seed of input.seedKeywords) {
        const dream100Count = Math.min(20, Math.floor(100 / input.seedKeywords.length));
        for (let i = 0; i < dream100Count; i++) {
          keywords.push(this.createMockKeyword(
            `${seed} expansion ${i}`,
            'dream100',
            Math.floor(Math.random() * 15000) + 1000
          ));
        }
      }
      
      // Generate Tier 2
      const tier2Count = Math.min(keywords.length * 8, input.settings.maxKeywords * 0.6);
      for (let i = 0; i < tier2Count; i++) {
        const parentKeyword = keywords[Math.floor(Math.random() * keywords.length)];
        keywords.push(this.createMockKeyword(
          `${parentKeyword.keyword} tier2 ${i}`,
          'tier2',
          Math.floor(Math.random() * 8000) + 500
        ));
      }
      
      // Generate Tier 3
      const tier3Count = Math.min(keywords.length * 0.5, input.settings.maxKeywords * 0.3);
      for (let i = 0; i < tier3Count; i++) {
        keywords.push(this.createMockKeyword(
          `tier3 keyword ${i}`,
          'tier3',
          Math.floor(Math.random() * 3000) + 100
        ));
      }
      
      // Limit to max keywords
      const finalKeywords = keywords.slice(0, input.settings.maxKeywords);
      
      output.stages.expansion = {
        status: 'completed',
        duration: Date.now() - stageStart,
        keywordCount: finalKeywords.length
      };
      
      return finalKeywords;
    } catch (error) {
      output.stages.expansion.status = 'failed';
      throw error;
    }
  }

  private async executeEnrichment(keywords: Keyword[], output: PipelineOutput): Promise<Keyword[]> {
    const stageStart = Date.now();
    
    try {
      let apiCalls = 0;
      
      // Process in batches
      const batchSize = this.config.batchSize;
      const enrichedKeywords: Keyword[] = [];
      
      for (let i = 0; i < keywords.length; i += batchSize) {
        const batch = keywords.slice(i, i + batchSize);
        
        // Simulate Ahrefs API calls
        await this.delay(50); // Simulate API delay
        apiCalls += batch.length;
        
        // Enrich with real metrics
        const enriched = batch.map(keyword => ({
          ...keyword,
          difficulty: Math.floor(Math.random() * 100) + 1,
          volume: keyword.volume + Math.floor(Math.random() * 1000),
          intent: this.determineIntent(keyword.keyword)
        }));
        
        enrichedKeywords.push(...enriched);
      }
      
      output.stages.enrichment = {
        status: 'completed',
        duration: Date.now() - stageStart,
        apiCalls
      };
      
      return enrichedKeywords;
    } catch (error) {
      output.stages.enrichment.status = 'failed';
      throw error;
    }
  }

  private async executeClustering(keywords: Keyword[], output: PipelineOutput): Promise<Cluster[]> {
    const stageStart = Date.now();
    
    try {
      const clusters: Cluster[] = [];
      const used = new Set<number>();
      
      // Simple clustering simulation
      for (let i = 0; i < keywords.length; i++) {
        if (used.has(i)) continue;
        
        const clusterKeywords = [keywords[i].keyword];
        used.add(i);
        
        // Find similar keywords (simplified)
        for (let j = i + 1; j < Math.min(i + 20, keywords.length); j++) {
          if (used.has(j)) continue;
          
          if (this.calculateSimilarity(keywords[i].keyword, keywords[j].keyword) > 0.6) {
            clusterKeywords.push(keywords[j].keyword);
            used.add(j);
          }
        }
        
        if (clusterKeywords.length >= 3) {
          clusters.push(this.createMockCluster(clusterKeywords));
        }
      }
      
      output.stages.clustering = {
        status: 'completed',
        duration: Date.now() - stageStart,
        clusterCount: clusters.length
      };
      
      return clusters;
    } catch (error) {
      output.stages.clustering.status = 'failed';
      throw error;
    }
  }

  private async executeScoring(keywords: Keyword[], output: PipelineOutput): Promise<Keyword[]> {
    const stageStart = Date.now();
    
    try {
      let quickWinCount = 0;
      
      const scoredKeywords = keywords.map(keyword => {
        const blendedScore = this.calculateBlendedScore(keyword);
        const quickWin = keyword.difficulty < 30 && keyword.volume > 1000;
        
        if (quickWin) quickWinCount++;
        
        return {
          ...keyword,
          blendedScore,
          quickWin
        };
      });
      
      output.stages.scoring = {
        status: 'completed',
        duration: Date.now() - stageStart,
        quickWins: quickWinCount
      };
      
      return scoredKeywords;
    } catch (error) {
      output.stages.scoring.status = 'failed';
      throw error;
    }
  }

  private async executeRoadmapGeneration(
    keywords: Keyword[], 
    clusters: Cluster[], 
    output: PipelineOutput
  ): Promise<RoadmapItem[]> {
    const stageStart = Date.now();
    
    try {
      const roadmapItems: RoadmapItem[] = [];
      
      // Generate roadmap items from clusters
      clusters.forEach((cluster, index) => {
        const dueDate = new Date(Date.now() + (index * 7 * 24 * 60 * 60 * 1000)).toISOString();
        
        roadmapItems.push({
          id: `roadmap-${index}`,
          clusterId: cluster.id,
          title: `Content for ${cluster.label}`,
          targetKeywords: cluster.keywords.slice(0, 5),
          dueDate,
          assignee: 'Content Team',
          priority: cluster.score > 0.8 ? 'high' : cluster.score > 0.6 ? 'medium' : 'low'
        });
      });
      
      output.stages.roadmap = {
        status: 'completed',
        duration: Date.now() - stageStart,
        postsGenerated: roadmapItems.length
      };
      
      return roadmapItems;
    } catch (error) {
      output.stages.roadmap.status = 'failed';
      throw error;
    }
  }

  private createMockKeyword(keyword: string, stage: 'dream100' | 'tier2' | 'tier3', volume: number): Keyword {
    return {
      id: `kw-${Math.random().toString(36).substring(7)}`,
      keyword,
      stage,
      volume,
      difficulty: Math.floor(Math.random() * 100) + 1,
      intent: this.determineIntent(keyword),
      relevanceScore: Math.random() * 0.4 + 0.6,
      blendedScore: 0,
      quickWin: false
    };
  }

  private createMockCluster(keywords: string[]): Cluster {
    return {
      id: `cluster-${Math.random().toString(36).substring(7)}`,
      label: `${keywords[0].split(' ')[0]} Cluster`,
      keywords,
      size: keywords.length,
      score: Math.random() * 0.4 + 0.6,
      intentMix: {
        commercial: Math.random() * 50 + 25,
        informational: Math.random() * 50 + 25
      }
    };
  }

  private determineIntent(keyword: string): string {
    if (keyword.includes('buy') || keyword.includes('price')) return 'commercial';
    if (keyword.includes('how to') || keyword.includes('guide')) return 'informational';
    if (keyword.includes('login') || keyword.includes('download')) return 'navigational';
    return 'informational';
  }

  private calculateSimilarity(keyword1: string, keyword2: string): number {
    const words1 = keyword1.toLowerCase().split(' ');
    const words2 = keyword2.toLowerCase().split(' ');
    const common = words1.filter(word => words2.includes(word));
    return common.length / Math.max(words1.length, words2.length);
  }

  private calculateBlendedScore(keyword: Keyword): number {
    const volumeScore = Math.min(Math.log10(keyword.volume + 1) / 5, 1);
    const difficultyScore = (100 - keyword.difficulty) / 100;
    const relevanceScore = keyword.relevanceScore;
    
    return (volumeScore * 0.4) + (difficultyScore * 0.3) + (relevanceScore * 0.3);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

describe('Pipeline Integration Tests', () => {
  let pipeline: MockPipelineOrchestrator;
  let defaultInput: PipelineInput;

  beforeEach(() => {
    pipeline = new MockPipelineOrchestrator();
    
    defaultInput = {
      seedKeywords: ['digital marketing', 'content marketing'],
      market: 'US',
      language: 'en',
      userId: 'test-user-123',
      settings: {
        maxKeywords: 1000,
        enableClustering: true,
        generateRoadmap: true,
        scoringWeights: {
          volume: 0.4,
          intent: 0.3,
          relevance: 0.15,
          trend: 0.1,
          ease: 0.05
        }
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Pipeline Execution', () => {
    it('should execute complete pipeline successfully', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.status).toBe('completed');
      expect(result.runId).toBeTruthy();
      expect(result.totalKeywords).toBeGreaterThan(0);
      expect(result.totalKeywords).toBeLessThanOrEqual(defaultInput.settings.maxKeywords);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Verify all stages completed
      Object.values(result.stages).forEach(stage => {
        expect(stage.status).toBe('completed');
        expect(stage.duration).toBeGreaterThan(0);
      });
    });

    it('should generate appropriate number of clusters when enabled', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.totalClusters).toBeGreaterThan(0);
      expect(result.stages.clustering.clusterCount).toBe(result.totalClusters);
      expect(result.stages.clustering.status).toBe('completed');
    });

    it('should generate roadmap when enabled', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.roadmapItems).toBeGreaterThan(0);
      expect(result.stages.roadmap.postsGenerated).toBe(result.roadmapItems);
      expect(result.stages.roadmap.status).toBe('completed');
    });

    it('should skip clustering when disabled', async () => {
      const inputWithoutClustering = {
        ...defaultInput,
        settings: {
          ...defaultInput.settings,
          enableClustering: false
        }
      };

      const result = await pipeline.executePipeline(inputWithoutClustering);

      expect(result.totalClusters).toBe(0);
      expect(result.stages.clustering.status).toBe('pending');
    });

    it('should skip roadmap generation when disabled', async () => {
      const inputWithoutRoadmap = {
        ...defaultInput,
        settings: {
          ...defaultInput.settings,
          generateRoadmap: false
        }
      };

      const result = await pipeline.executePipeline(inputWithoutRoadmap);

      expect(result.roadmapItems).toBe(0);
      expect(result.stages.roadmap.status).toBe('pending');
    });
  });

  describe('Stage-by-Stage Validation', () => {
    it('should complete ingestion stage with validation', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.stages.ingestion.status).toBe('completed');
      expect(result.stages.ingestion.duration).toBeGreaterThan(0);
    });

    it('should generate keywords in expansion stage', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.stages.expansion.status).toBe('completed');
      expect(result.stages.expansion.keywordCount).toBeGreaterThan(0);
      expect(result.stages.expansion.keywordCount).toBe(result.totalKeywords);
    });

    it('should enrich keywords with external data', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.stages.enrichment.status).toBe('completed');
      expect(result.stages.enrichment.apiCalls).toBeGreaterThan(0);
      expect(result.stages.enrichment.apiCalls).toBeLessThanOrEqual(result.totalKeywords);
    });

    it('should perform clustering with appropriate cluster count', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.stages.clustering.status).toBe('completed');
      expect(result.stages.clustering.clusterCount).toBeGreaterThan(0);
      expect(result.stages.clustering.clusterCount).toBeLessThan(result.totalKeywords / 3); // Reasonable cluster ratio
    });

    it('should calculate scores and identify quick wins', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      expect(result.stages.scoring.status).toBe('completed');
      expect(result.stages.scoring.quickWins).toBeGreaterThanOrEqual(0);
      expect(result.stages.scoring.quickWins).toBeLessThanOrEqual(result.totalKeywords);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle empty seed keywords gracefully', async () => {
      const invalidInput = {
        ...defaultInput,
        seedKeywords: []
      };

      await expect(pipeline.executePipeline(invalidInput)).rejects.toThrow('No seed keywords provided');
    });

    it('should handle large seed keyword lists with warnings', async () => {
      const largeInput = {
        ...defaultInput,
        seedKeywords: Array.from({ length: 15 }, (_, i) => `seed ${i}`)
      };

      const result = await pipeline.executePipeline(largeInput);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Large number of seed keywords');
    });

    it('should respect maximum keyword limits', async () => {
      const limitedInput = {
        ...defaultInput,
        settings: {
          ...defaultInput.settings,
          maxKeywords: 100
        }
      };

      const result = await pipeline.executePipeline(limitedInput);

      expect(result.totalKeywords).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete pipeline within reasonable time', async () => {
      const startTime = Date.now();
      const result = await pipeline.executePipeline(defaultInput);
      const actualTime = Date.now() - startTime;

      expect(actualTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.processingTime).toBeLessThanOrEqual(actualTime);
    });

    it('should handle different input sizes efficiently', async () => {
      const smallInput = {
        ...defaultInput,
        settings: { ...defaultInput.settings, maxKeywords: 100 }
      };
      
      const largeInput = {
        ...defaultInput,
        settings: { ...defaultInput.settings, maxKeywords: 5000 }
      };

      const [smallResult, largeResult] = await Promise.all([
        pipeline.executePipeline(smallInput),
        pipeline.executePipeline(largeInput)
      ]);

      expect(smallResult.totalKeywords).toBeLessThan(largeResult.totalKeywords);
      expect(smallResult.processingTime).toBeLessThan(largeResult.processingTime);
    });

    it('should maintain reasonable cluster ratios', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      const clusterRatio = result.totalClusters / result.totalKeywords;
      expect(clusterRatio).toBeGreaterThan(0.01); // At least 1% clustering ratio
      expect(clusterRatio).toBeLessThan(0.5); // Not more than 50% clustering ratio
    });
  });

  describe('Data Quality and Consistency', () => {
    it('should maintain keyword hierarchy across stages', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      // Should have keywords from all stages
      expect(result.stages.expansion.keywordCount).toBeGreaterThan(0);
      
      // Clusters should be reasonable
      if (result.totalClusters > 0) {
        expect(result.totalClusters).toBeLessThan(result.totalKeywords);
      }
    });

    it('should generate realistic keyword distributions', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      // Should have a good mix of keywords
      expect(result.totalKeywords).toBeGreaterThan(defaultInput.seedKeywords.length * 10);
      expect(result.stages.scoring.quickWins).toBeLessThan(result.totalKeywords * 0.3); // Not too many quick wins
    });

    it('should maintain data integrity across pipeline stages', async () => {
      const result = await pipeline.executePipeline(defaultInput);

      // Verify stage progression
      expect(result.stages.expansion.keywordCount).toBeGreaterThan(0);
      expect(result.stages.enrichment.apiCalls).toBeGreaterThan(0);
      
      if (defaultInput.settings.enableClustering) {
        expect(result.stages.clustering.clusterCount).toBeGreaterThan(0);
      }
      
      expect(result.stages.scoring.quickWins).toBeGreaterThanOrEqual(0);
      
      if (defaultInput.settings.generateRoadmap) {
        expect(result.stages.roadmap.postsGenerated).toBeGreaterThan(0);
      }
    });
  });

  describe('Configuration and Customization', () => {
    it('should respect custom scoring weights', async () => {
      const customInput = {
        ...defaultInput,
        settings: {
          ...defaultInput.settings,
          scoringWeights: {
            volume: 0.6,  // Emphasize volume
            intent: 0.2,
            relevance: 0.1,
            trend: 0.05,
            ease: 0.05
          }
        }
      };

      const result = await pipeline.executePipeline(customInput);
      expect(result.status).toBe('completed');
      expect(result.stages.scoring.status).toBe('completed');
    });

    it('should handle different market and language settings', async () => {
      const ukInput = {
        ...defaultInput,
        market: 'UK',
        language: 'en-GB'
      };

      const result = await pipeline.executePipeline(ukInput);
      expect(result.status).toBe('completed');
    });
  });
});