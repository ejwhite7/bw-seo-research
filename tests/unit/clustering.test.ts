/**
 * Unit Tests for Clustering Service
 * 
 * Tests semantic clustering of keywords using embeddings,
 * hierarchical clustering, and cluster validation.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock data types
interface Keyword {
  id: string;
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  volume: number;
  difficulty: number;
  intent: string;
  relevanceScore: number;
  blendedScore: number;
  runId: string;
  clusterId?: string | null;
}

interface Cluster {
  id: string;
  runId: string;
  label: string;
  keywords: string[];
  size: number;
  score: number;
  intentMix: Record<string, number>;
  avgVolume: number;
  avgDifficulty: number;
  centroid: number[];
  createdAt: string;
  updatedAt: string;
}

interface ClusteringConfig {
  maxClusters: number;
  minClusterSize: number;
  maxClusterSize: number;
  similarityThreshold: number;
  embeddingDimensions: number;
}

// Mock clustering service
class MockClusteringService {
  private config: ClusteringConfig;

  constructor(config: ClusteringConfig) {
    this.config = config;
  }

  async generateEmbeddings(keywords: string[]): Promise<number[][]> {
    // Mock embedding generation - simulate vector embeddings
    return keywords.map((keyword, index) => {
      const embedding = new Array(this.config.embeddingDimensions).fill(0);
      
      // Create pseudo-realistic embeddings based on keyword characteristics
      const keywordLength = keyword.length;
      const hasDigital = keyword.includes('digital') ? 1 : 0;
      const hasMarketing = keyword.includes('marketing') ? 1 : 0;
      const hasTools = keyword.includes('tools') ? 1 : 0;
      
      // Generate deterministic but varied embeddings
      for (let i = 0; i < this.config.embeddingDimensions; i++) {
        const seed = (keyword.charCodeAt(i % keyword.length) + i + index) / 1000;
        embedding[i] = Math.sin(seed) * (1 + hasDigital * 0.5 + hasMarketing * 0.3 + hasTools * 0.2);
      }
      
      return embedding;
    });
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    // Cosine similarity calculation
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return Math.max(-1, Math.min(1, similarity)); // Clamp to [-1, 1]
  }

  async performClustering(keywords: Keyword[]): Promise<Cluster[]> {
    if (keywords.length === 0) return [];
    
    const embeddings = await this.generateEmbeddings(keywords.map(k => k.keyword));
    const clusters: Cluster[] = [];
    const used = new Set<number>();
    
    // Simple agglomerative clustering algorithm
    for (let i = 0; i < keywords.length; i++) {
      if (used.has(i)) continue;
      
      const cluster: string[] = [keywords[i].keyword];
      used.add(i);
      
      // Find similar keywords
      for (let j = i + 1; j < keywords.length; j++) {
        if (used.has(j)) continue;
        
        const similarity = this.calculateSimilarity(embeddings[i], embeddings[j]);
        if (similarity >= this.config.similarityThreshold) {
          cluster.push(keywords[j].keyword);
          used.add(j);
        }
      }
      
      // Only create cluster if it meets size requirements
      if (cluster.length >= this.config.minClusterSize && 
          cluster.length <= this.config.maxClusterSize) {
        
        const clusterKeywords = keywords.filter(k => cluster.includes(k.keyword));
        clusters.push(this.createCluster(keywords[i].runId, cluster, clusterKeywords, embeddings[i]));
      }
    }
    
    return clusters.slice(0, this.config.maxClusters);
  }

  private createCluster(runId: string, keywordList: string[], keywordObjects: Keyword[], centroid: number[]): Cluster {
    const intentCounts: Record<string, number> = {};
    let totalVolume = 0;
    let totalDifficulty = 0;
    let totalScore = 0;
    
    keywordObjects.forEach(keyword => {
      intentCounts[keyword.intent] = (intentCounts[keyword.intent] || 0) + 1;
      totalVolume += keyword.volume;
      totalDifficulty += keyword.difficulty;
      totalScore += keyword.blendedScore;
    });
    
    // Calculate intent mix percentages
    const intentMix: Record<string, number> = {};
    Object.keys(intentCounts).forEach(intent => {
      intentMix[intent] = (intentCounts[intent] / keywordObjects.length) * 100;
    });
    
    return {
      id: `cluster-${Math.random().toString(36).substring(7)}`,
      runId,
      label: this.generateClusterLabel(keywordList),
      keywords: keywordList,
      size: keywordList.length,
      score: totalScore / keywordObjects.length,
      intentMix,
      avgVolume: Math.round(totalVolume / keywordObjects.length),
      avgDifficulty: Math.round(totalDifficulty / keywordObjects.length),
      centroid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private generateClusterLabel(keywords: string[]): string {
    // Simple label generation based on common words
    const words = keywords.flatMap(k => k.split(' '));
    const wordCounts: Record<string, number> = {};
    
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
      if (cleanWord.length > 2) {
        wordCounts[cleanWord] = (wordCounts[cleanWord] || 0) + 1;
      }
    });
    
    const sortedWords = Object.entries(wordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2)
      .map(([word]) => word);
    
    return sortedWords.join(' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Keyword Cluster';
  }

  validateClusters(clusters: Cluster[]): boolean {
    // Check cluster validity
    for (const cluster of clusters) {
      if (cluster.size < this.config.minClusterSize || 
          cluster.size > this.config.maxClusterSize) {
        return false;
      }
      
      if (cluster.keywords.length !== cluster.size) {
        return false;
      }
    }
    
    return true;
  }

  optimizeClusters(clusters: Cluster[]): Cluster[] {
    // Simple optimization: merge small clusters with similar ones
    const optimized = [...clusters];
    
    for (let i = 0; i < optimized.length; i++) {
      if (optimized[i].size < this.config.minClusterSize) {
        // Find most similar cluster to merge with
        let bestMatch = -1;
        let bestSimilarity = -1;
        
        for (let j = 0; j < optimized.length; j++) {
          if (i === j) continue;
          
          const similarity = this.calculateClusterSimilarity(optimized[i], optimized[j]);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = j;
          }
        }
        
        // Merge if similarity is above threshold and result won't be too large
        if (bestMatch !== -1 && 
            bestSimilarity > this.config.similarityThreshold &&
            optimized[i].size + optimized[bestMatch].size <= this.config.maxClusterSize) {
          
          optimized[bestMatch] = this.mergeClusters(optimized[i], optimized[bestMatch]);
          optimized.splice(i, 1);
          i--; // Adjust index after removal
        }
      }
    }
    
    return optimized;
  }

  private calculateClusterSimilarity(cluster1: Cluster, cluster2: Cluster): number {
    return this.calculateSimilarity(cluster1.centroid, cluster2.centroid);
  }

  private mergeClusters(cluster1: Cluster, cluster2: Cluster): Cluster {
    const mergedKeywords = [...cluster1.keywords, ...cluster2.keywords];
    const mergedIntentMix: Record<string, number> = {};
    
    // Weighted average of intent mixes
    Object.keys({...cluster1.intentMix, ...cluster2.intentMix}).forEach(intent => {
      const weight1 = cluster1.size / (cluster1.size + cluster2.size);
      const weight2 = cluster2.size / (cluster1.size + cluster2.size);
      
      mergedIntentMix[intent] = 
        (cluster1.intentMix[intent] || 0) * weight1 + 
        (cluster2.intentMix[intent] || 0) * weight2;
    });
    
    // Weighted average of centroids
    const mergedCentroid = cluster1.centroid.map((val, i) => {
      const weight1 = cluster1.size / (cluster1.size + cluster2.size);
      const weight2 = cluster2.size / (cluster1.size + cluster2.size);
      return val * weight1 + cluster2.centroid[i] * weight2;
    });
    
    return {
      id: cluster2.id, // Keep the target cluster's ID
      runId: cluster1.runId,
      label: this.generateClusterLabel(mergedKeywords),
      keywords: mergedKeywords,
      size: mergedKeywords.length,
      score: (cluster1.score * cluster1.size + cluster2.score * cluster2.size) / mergedKeywords.length,
      intentMix: mergedIntentMix,
      avgVolume: Math.round((cluster1.avgVolume * cluster1.size + cluster2.avgVolume * cluster2.size) / mergedKeywords.length),
      avgDifficulty: Math.round((cluster1.avgDifficulty * cluster1.size + cluster2.avgDifficulty * cluster2.size) / mergedKeywords.length),
      centroid: mergedCentroid,
      createdAt: cluster1.createdAt,
      updatedAt: new Date().toISOString()
    };
  }
}

describe('ClusteringService', () => {
  let clusteringService: MockClusteringService;
  let mockKeywords: Keyword[];
  let defaultConfig: ClusteringConfig;

  beforeEach(() => {
    defaultConfig = {
      maxClusters: 50,
      minClusterSize: 3,
      maxClusterSize: 20,
      similarityThreshold: 0.7,
      embeddingDimensions: 384
    };

    clusteringService = new MockClusteringService(defaultConfig);

    // Create diverse test keywords
    mockKeywords = [
      {
        id: 'kw-1',
        keyword: 'digital marketing tools',
        stage: 'dream100',
        volume: 12000,
        difficulty: 45,
        intent: 'commercial',
        relevanceScore: 0.9,
        blendedScore: 0.8,
        runId: 'test-run',
        clusterId: null
      },
      {
        id: 'kw-2',
        keyword: 'marketing automation tools',
        stage: 'tier2',
        volume: 8500,
        difficulty: 35,
        intent: 'commercial',
        relevanceScore: 0.85,
        blendedScore: 0.75,
        runId: 'test-run',
        clusterId: null
      },
      {
        id: 'kw-3',
        keyword: 'email marketing software',
        stage: 'tier2',
        volume: 6500,
        difficulty: 40,
        intent: 'commercial',
        relevanceScore: 0.8,
        blendedScore: 0.7,
        runId: 'test-run',
        clusterId: null
      },
      {
        id: 'kw-4',
        keyword: 'seo optimization tips',
        stage: 'tier3',
        volume: 3500,
        difficulty: 25,
        intent: 'informational',
        relevanceScore: 0.75,
        blendedScore: 0.65,
        runId: 'test-run',
        clusterId: null
      },
      {
        id: 'kw-5',
        keyword: 'content marketing strategy',
        stage: 'tier2',
        volume: 4500,
        difficulty: 30,
        intent: 'informational',
        relevanceScore: 0.8,
        blendedScore: 0.7,
        runId: 'test-run',
        clusterId: null
      }
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for all keywords', async () => {
      const keywords = mockKeywords.map(k => k.keyword);
      const embeddings = await clusteringService.generateEmbeddings(keywords);

      expect(embeddings).toHaveLength(keywords.length);
      embeddings.forEach(embedding => {
        expect(embedding).toHaveLength(defaultConfig.embeddingDimensions);
        expect(embedding.every(val => typeof val === 'number')).toBe(true);
      });
    });

    it('should generate different embeddings for different keywords', async () => {
      const keywords = ['digital marketing', 'seo optimization'];
      const embeddings = await clusteringService.generateEmbeddings(keywords);

      expect(embeddings[0]).not.toEqual(embeddings[1]);
    });

    it('should generate consistent embeddings for same keywords', async () => {
      const keywords = ['digital marketing'];
      const embeddings1 = await clusteringService.generateEmbeddings(keywords);
      const embeddings2 = await clusteringService.generateEmbeddings(keywords);

      expect(embeddings1[0]).toEqual(embeddings2[0]);
    });

    it('should handle empty keyword array', async () => {
      const embeddings = await clusteringService.generateEmbeddings([]);
      expect(embeddings).toEqual([]);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate cosine similarity correctly', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];
      const vec3 = [0, 1, 0];

      const similarity1 = clusteringService.calculateSimilarity(vec1, vec2);
      const similarity2 = clusteringService.calculateSimilarity(vec1, vec3);

      expect(similarity1).toBeCloseTo(1.0, 5);
      expect(similarity2).toBeCloseTo(0.0, 5);
    });

    it('should return values between -1 and 1', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];

      const similarity = clusteringService.calculateSimilarity(vec1, vec2);
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should handle zero vectors gracefully', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];

      expect(() => {
        clusteringService.calculateSimilarity(vec1, vec2);
      }).not.toThrow();
    });
  });

  describe('performClustering', () => {
    it('should cluster similar keywords together', async () => {
      const clusters = await clusteringService.performClustering(mockKeywords);

      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(defaultConfig.maxClusters);

      clusters.forEach(cluster => {
        expect(cluster.size).toBeGreaterThanOrEqual(defaultConfig.minClusterSize);
        expect(cluster.size).toBeLessThanOrEqual(defaultConfig.maxClusterSize);
        expect(cluster.keywords).toHaveLength(cluster.size);
        expect(cluster.label).toBeTruthy();
        expect(cluster.runId).toBe('test-run');
      });
    });

    it('should calculate cluster statistics correctly', async () => {
      const clusters = await clusteringService.performClustering(mockKeywords);

      clusters.forEach(cluster => {
        expect(cluster.avgVolume).toBeGreaterThan(0);
        expect(cluster.avgDifficulty).toBeGreaterThan(0);
        expect(cluster.score).toBeGreaterThan(0);
        expect(cluster.intentMix).toBeDefined();
        expect(Object.values(cluster.intentMix).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
      });
    });

    it('should handle empty keyword array', async () => {
      const clusters = await clusteringService.performClustering([]);
      expect(clusters).toEqual([]);
    });

    it('should respect maximum cluster limit', async () => {
      const manyKeywords = Array.from({ length: 200 }, (_, i) => ({
        ...mockKeywords[0],
        id: `kw-${i}`,
        keyword: `keyword ${i}`
      }));

      const clusters = await clusteringService.performClustering(manyKeywords);
      expect(clusters.length).toBeLessThanOrEqual(defaultConfig.maxClusters);
    });
  });

  describe('validateClusters', () => {
    it('should validate correct cluster structure', async () => {
      const clusters = await clusteringService.performClustering(mockKeywords);
      const isValid = clusteringService.validateClusters(clusters);
      expect(isValid).toBe(true);
    });

    it('should detect invalid cluster sizes', () => {
      const invalidCluster: Cluster = {
        id: 'invalid',
        runId: 'test',
        label: 'Invalid',
        keywords: ['kw1'], // Too small
        size: 1,
        score: 0.5,
        intentMix: { commercial: 100 },
        avgVolume: 1000,
        avgDifficulty: 50,
        centroid: [1, 2, 3],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const isValid = clusteringService.validateClusters([invalidCluster]);
      expect(isValid).toBe(false);
    });

    it('should detect size mismatch', () => {
      const invalidCluster: Cluster = {
        id: 'invalid',
        runId: 'test',
        label: 'Invalid',
        keywords: ['kw1', 'kw2', 'kw3'],
        size: 5, // Mismatch with keywords array length
        score: 0.5,
        intentMix: { commercial: 100 },
        avgVolume: 1000,
        avgDifficulty: 50,
        centroid: [1, 2, 3],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const isValid = clusteringService.validateClusters([invalidCluster]);
      expect(isValid).toBe(false);
    });
  });

  describe('optimizeClusters', () => {
    it('should merge small clusters when appropriate', async () => {
      // Create clusters with some small ones
      const initialClusters = await clusteringService.performClustering(mockKeywords);
      const optimized = clusteringService.optimizeClusters(initialClusters);

      // Should maintain or reduce cluster count
      expect(optimized.length).toBeLessThanOrEqual(initialClusters.length);

      // All clusters should meet minimum size requirement
      optimized.forEach(cluster => {
        expect(cluster.size).toBeGreaterThanOrEqual(defaultConfig.minClusterSize);
      });
    });

    it('should preserve large clusters', () => {
      const largeClusters: Cluster[] = [
        {
          id: 'large1',
          runId: 'test',
          label: 'Large Cluster',
          keywords: Array.from({ length: 10 }, (_, i) => `keyword${i}`),
          size: 10,
          score: 0.8,
          intentMix: { commercial: 100 },
          avgVolume: 5000,
          avgDifficulty: 40,
          centroid: Array.from({ length: defaultConfig.embeddingDimensions }, () => Math.random()),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      const optimized = clusteringService.optimizeClusters(largeClusters);
      expect(optimized).toHaveLength(1);
      expect(optimized[0].size).toBe(10);
    });
  });

  describe('cluster labeling', () => {
    it('should generate meaningful cluster labels', async () => {
      const marketingKeywords: Keyword[] = [
        { ...mockKeywords[0], keyword: 'digital marketing tools' },
        { ...mockKeywords[1], keyword: 'marketing automation tools' },
        { ...mockKeywords[2], keyword: 'email marketing software' }
      ];

      const clusters = await clusteringService.performClustering(marketingKeywords);
      
      if (clusters.length > 0) {
        const label = clusters[0].label.toLowerCase();
        expect(label).toMatch(/marketing|tools|digital/);
      }
    });
  });

  describe('performance and scalability', () => {
    it('should handle large keyword sets efficiently', async () => {
      const startTime = Date.now();
      const largeKeywordSet = Array.from({ length: 500 }, (_, i) => ({
        ...mockKeywords[0],
        id: `kw-${i}`,
        keyword: `test keyword ${i % 50}` // Create some similarity patterns
      }));

      const clusters = await clusteringService.performClustering(largeKeywordSet);
      const duration = Date.now() - startTime;

      expect(clusters.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should maintain performance with many clusters', () => {
      const startTime = Date.now();
      const manyClusters = Array.from({ length: 100 }, (_, i) => ({
        id: `cluster-${i}`,
        runId: 'test',
        label: `Cluster ${i}`,
        keywords: [`keyword${i}`, `term${i}`, `phrase${i}`],
        size: 3,
        score: Math.random(),
        intentMix: { commercial: 100 },
        avgVolume: 1000,
        avgDifficulty: 50,
        centroid: Array.from({ length: defaultConfig.embeddingDimensions }, () => Math.random()),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const isValid = clusteringService.validateClusters(manyClusters);
      const duration = Date.now() - startTime;

      expect(isValid).toBe(true);
      expect(duration).toBeLessThan(1000); // Should validate quickly
    });
  });
});