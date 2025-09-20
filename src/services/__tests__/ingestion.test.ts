/**
 * Comprehensive Unit Tests for Ingestion Service
 * 
 * Tests all aspects of the ingestion service including validation,
 * API key management, cost estimation, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, jest, beforeAll } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';
import { IngestionService } from '../ingestion';
import { DatabaseService } from '../../lib/database-service';
import { IntegrationFactory } from '../../integrations';

// Mock external dependencies first
jest.mock('../../lib/supabase');
jest.mock('../../integrations');
jest.mock('../../utils/error-handler');
jest.mock('@sentry/nextjs');
jest.mock('../../lib/database-service');

// Define processIngestion helper function
const processIngestion = (request: any) => {
  return IngestionService.getInstance().processIngestion(request);
};

// Type definitions for tests
interface IngestionRequest {
  userId: string;
  seedKeywords: string[];
  market: string;
  budgetLimit?: number;
}

interface IngestionResponse {
  success: boolean;
  data: any;
  error?: string;
}

describe('IngestionService', () => {
  let ingestionService: IngestionService;
  let mockDatabaseService: jest.Mocked<typeof DatabaseService>;
  let mockIntegrationFactory: jest.Mocked<IntegrationFactory>;

  const testUserId = '12345678-1234-5678-9012-123456789012';
  const validRequest: IngestionRequest = {
    userId: testUserId,
    seedKeywords: ['test keyword', 'another keyword'],
    market: 'US',
    budgetLimit: 100
  };

  beforeAll(() => {
    ingestionService = IngestionService.getInstance();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
    mockIntegrationFactory = IntegrationFactory.getInstance() as jest.Mocked<IntegrationFactory>;

    // Mock database responses
    mockDatabaseService.getUserSettings.mockResolvedValue({
      data: {
        id: testUserId,
        userId: testUserId,
        ahrefsApiKeyEncrypted: 'encrypted-ahrefs-key',
        anthropicApiKeyEncrypted: 'encrypted-anthropic-key',
        defaultWeights: {
          volume: 0.4,
          intent: 0.3,
          relevance: 0.15,
          trend: 0.1,
          ease: 0.05
        },
        otherPreferences: {
          notifications: true,
          autoExport: false
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      },
      error: null
    });

    mockDatabaseService.decryptApiKey.mockResolvedValue({
      data: 'decrypted-api-key',
      error: null
    });

    // Mock integration health checks
    mockIntegrationFactory.isAvailable.mockReturnValue(true);
    mockIntegrationFactory.getAhrefs.mockReturnValue({
      healthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        issues: [],
        metrics: { rateLimitHits: 0 },
        rateLimit: { remaining: 1000 }
      })
    } as any);

    mockIntegrationFactory.getAnthropic.mockReturnValue({
      healthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        issues: []
      })
    } as any);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = IngestionService.getInstance();
      const instance2 = IngestionService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Input Validation', () => {
    it('should accept valid ingestion request', async () => {
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.success).toBe(true);
      expect(response.validation.isValid).toBe(true);
      expect(response.validation.seedKeywords.valid).toEqual(validRequest.seedKeywords);
    });

    it('should reject invalid user ID', async () => {
      const invalidRequest = {
        ...validRequest,
        userId: 'invalid-uuid'
      };

      await expect(ingestionService.processIngestion(invalidRequest))
        .rejects
        .toThrow('Input validation failed');
    });

    it('should reject empty seed keywords', async () => {
      const invalidRequest = {
        ...validRequest,
        seedKeywords: []
      };

      await expect(ingestionService.processIngestion(invalidRequest))
        .rejects
        .toThrow('At least one seed keyword required');
    });

    it('should reject too many seed keywords', async () => {
      const invalidRequest = {
        ...validRequest,
        seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']
      };

      await expect(ingestionService.processIngestion(invalidRequest))
        .rejects
        .toThrow('Maximum 5 seed keywords allowed');
    });

    it('should filter out invalid keywords', async () => {
      const mixedRequest = {
        ...validRequest,
        seedKeywords: ['valid keyword', '', '   ', '12345', 'another valid']
      };

      const response = await ingestionService.processIngestion(mixedRequest);
      
      expect(response.validation.seedKeywords.valid).toEqual(['valid keyword', 'another valid']);
      expect(response.validation.seedKeywords.invalid).toHaveLength(3);
    });

    it('should remove duplicate keywords', async () => {
      const duplicateRequest = {
        ...validRequest,
        seedKeywords: ['keyword', 'KEYWORD', 'keyword ', 'other']
      };

      const response = await ingestionService.processIngestion(duplicateRequest);
      
      expect(response.validation.seedKeywords.valid).toEqual(['keyword', 'other']);
      expect(response.validation.seedKeywords.duplicatesRemoved).toContain('KEYWORD');
    });

    it('should validate market codes', async () => {
      const invalidMarketRequest = {
        ...validRequest,
        market: 'INVALID'
      };

      const response = await ingestionService.processIngestion(invalidMarketRequest);
      
      expect(response.validation.market.isValid).toBe(false);
      expect(response.validation.market.supported).toBe(false);
    });

    it('should validate budget limits', async () => {
      const highBudgetRequest = {
        ...validRequest,
        budgetLimit: 2000
      };

      await expect(ingestionService.processIngestion(highBudgetRequest))
        .rejects
        .toThrow('Budget exceeds maximum');
    });
  });

  describe('API Key Validation', () => {
    it('should validate existing API keys', async () => {
      const validation = await ingestionService.validateApiKeys(testUserId);
      
      expect(validation.ahrefs.isValid).toBe(true);
      expect(validation.anthropic.isValid).toBe(true);
      expect(mockDatabaseService.decryptApiKey).toHaveBeenCalledTimes(2);
    });

    it('should handle missing user settings', async () => {
      mockDatabaseService.getUserSettings.mockResolvedValue({
        data: null,
        error: null
      });

      const validation = await ingestionService.validateApiKeys(testUserId);
      
      expect(validation.ahrefs.isConfigured).toBe(false);
      expect(validation.anthropic.isConfigured).toBe(false);
    });

    it('should handle decryption failures', async () => {
      mockDatabaseService.decryptApiKey.mockResolvedValue({
        data: null,
        error: new Error('Decryption failed')
      });

      const validation = await ingestionService.validateApiKeys(testUserId);
      
      expect(validation.ahrefs.isValid).toBe(false);
      expect(validation.ahrefs.errorMessage).toContain('Failed to decrypt');
    });

    it('should handle API service failures', async () => {
      mockIntegrationFactory.getAhrefs.mockReturnValue({
        healthCheck: jest.fn().mockResolvedValue({
          healthy: false,
          issues: ['API quota exceeded'],
          metrics: { rateLimitHits: 100 }
        })
      } as any);

      const validation = await ingestionService.validateApiKeys(testUserId);
      
      expect(validation.ahrefs.isValid).toBe(false);
      expect(validation.ahrefs.errorMessage).toContain('API quota exceeded');
    });

    it('should check quota remaining', async () => {
      mockIntegrationFactory.getAhrefs.mockReturnValue({
        healthCheck: jest.fn().mockResolvedValue({
          healthy: true,
          issues: [],
          metrics: { rateLimitHits: 0 },
          rateLimit: { remaining: 50 }
        })
      } as any);

      const validation = await ingestionService.validateApiKeys(testUserId);
      
      expect(validation.ahrefs.quotaRemaining).toBe(50);
      expect(validation.ahrefs.hasQuota).toBe(true);
    });
  });

  describe('Cost Estimation', () => {
    it('should calculate accurate cost estimates', async () => {
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.costEstimate.total).toBeGreaterThan(0);
      expect(response.costEstimate.breakdown.ahrefs).toBeGreaterThan(0);
      expect(response.costEstimate.breakdown.anthropic).toBeGreaterThan(0);
      expect(response.costEstimate.estimatedKeywords).toBeGreaterThan(0);
      expect(response.costEstimate.withinBudget).toBe(true);
    });

    it('should respect budget limits', async () => {
      const lowBudgetRequest = {
        ...validRequest,
        budgetLimit: 0.01 // Very low budget
      };

      const response = await ingestionService.processIngestion(lowBudgetRequest);
      
      expect(response.costEstimate.withinBudget).toBe(false);
      expect(response.errors).toContainEqual(
        expect.objectContaining({
          type: 'budget',
          code: 'BUDGET_EXCEEDED'
        })
      );
    });

    it('should calculate processing time estimates', async () => {
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.costEstimate.projectedDuration).toBeGreaterThan(0);
      expect(response.costEstimate.budgetUtilization).toBeGreaterThan(0);
    });
  });

  describe('Run Creation', () => {
    beforeEach(() => {
      // Mock AdminTables for run creation
      (global as any).AdminTables = {
        runs: () => ({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'new-run-id' },
                error: null
              })
            })
          })
        })
      };
    });

    it('should create run successfully', async () => {
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.success).toBe(true);
      expect(response.runId).toBe('new-run-id');
    });

    it('should not create run in validation-only mode', async () => {
      const validationOnlyRequest = {
        ...validRequest,
        validateOnly: true
      };

      const response = await ingestionService.processIngestion(validationOnlyRequest);
      
      expect(response.success).toBe(true);
      expect(response.runId).toBeUndefined();
    });

    it('should not create run with critical errors', async () => {
      mockIntegrationFactory.getAhrefs.mockReturnValue({
        healthCheck: jest.fn().mockResolvedValue({
          healthy: false,
          issues: ['Critical API error'],
          metrics: { rateLimitHits: 0 }
        })
      } as any);

      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.success).toBe(false);
      expect(response.runId).toBeUndefined();
      expect(response.errors).toContainEqual(
        expect.objectContaining({
          type: 'api_key',
          retryable: true
        })
      );
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect identical keyword sets', async () => {
      // First request
      await ingestionService.processIngestion(validRequest);
      
      // Second identical request
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.warnings).toContainEqual(
        expect.objectContaining({
          type: 'configuration',
          message: expect.stringContaining('Similar keyword set detected')
        })
      );
    });

    it('should calculate similarity scores', async () => {
      const firstRequest = {
        ...validRequest,
        seedKeywords: ['keyword one', 'keyword two']
      };
      
      const similarRequest = {
        ...validRequest,
        seedKeywords: ['keyword one', 'different keyword']
      };

      await ingestionService.processIngestion(firstRequest);
      const response = await ingestionService.processIngestion(similarRequest);
      
      // Should detect partial similarity
      const duplicateWarning = response.warnings.find(w => 
        w.type === 'configuration' && w.message.includes('similarity')
      );
      expect(duplicateWarning).toBeDefined();
    });
  });

  describe('Warning Generation', () => {
    it('should generate budget warnings', async () => {
      const highCostRequest = {
        ...validRequest,
        budgetLimit: 5 // Low budget that will trigger warning
      };

      const response = await ingestionService.processIngestion(highCostRequest);
      
      expect(response.warnings).toContainEqual(
        expect.objectContaining({
          type: 'cost',
          severity: expect.stringMatching(/medium|high/)
        })
      );
    });

    it('should generate quota warnings', async () => {
      mockIntegrationFactory.getAhrefs.mockReturnValue({
        healthCheck: jest.fn().mockResolvedValue({
          healthy: true,
          issues: [],
          metrics: { rateLimitHits: 0 },
          rateLimit: { remaining: 10 } // Low quota
        })
      } as any);

      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.warnings).toContainEqual(
        expect.objectContaining({
          type: 'quota',
          severity: 'high'
        })
      );
    });

    it('should generate performance warnings for large estimates', async () => {
      const largeRequest = {
        ...validRequest,
        settings: {
          maxKeywords: 10000,
          maxDream100: 100
        }
      };

      const response = await ingestionService.processIngestion(largeRequest);
      
      if (response.costEstimate.projectedDuration > 30) {
        expect(response.warnings).toContainEqual(
          expect.objectContaining({
            type: 'performance'
          })
        );
      }
    });
  });

  describe('Settings Management', () => {
    it('should update user settings with API keys', async () => {
      const updateInput = {
        ahrefsApiKey: 'new-ahrefs-key',
        anthropicApiKey: 'new-anthropic-key',
        defaultWeights: {
          volume: 0.5,
          intent: 0.3,
          relevance: 0.2
        }
      };

      mockDatabaseService.encryptApiKey.mockResolvedValue({
        data: 'encrypted-new-key',
        error: null
      });

      const updateSpy = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: testUserId, ...updateInput },
              error: null
            })
          })
        })
      });

      (global as any).AdminTables = {
        settings: () => ({ update: updateSpy })
      };

      const result = await ingestionService.updateSettings(testUserId, updateInput);
      
      expect(mockDatabaseService.encryptApiKey).toHaveBeenCalledTimes(2);
      expect(result.id).toBe(testUserId);
    });

    it('should create new settings if none exist', async () => {
      mockDatabaseService.getUserSettings.mockResolvedValue({
        data: null,
        error: null
      });

      const insertSpy = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'new-settings-id' },
            error: null
          })
        })
      });

      (global as any).AdminTables = {
        settings: () => ({ insert: insertSpy })
      };

      const result = await ingestionService.updateSettings(testUserId, {
        ahrefsApiKey: 'new-key'
      });
      
      expect(insertSpy).toHaveBeenCalled();
      expect(result.id).toBe('new-settings-id');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDatabaseService.getUserSettings.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.success).toBe(false);
      expect(response.errors).toContainEqual(
        expect.objectContaining({
          type: 'system'
        })
      );
    });

    it('should handle integration service failures', async () => {
      mockIntegrationFactory.getAhrefs.mockImplementation(() => {
        throw new Error('Integration service unavailable');
      });

      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.success).toBe(false);
    });

    it('should handle rate limiting', async () => {
      // Simulate rapid requests to trigger rate limiting
      const promises = Array.from({ length: 15 }, () =>
        ingestionService.processIngestion(validRequest)
      );

      const responses = await Promise.allSettled(promises);
      const rateLimitedResponses = responses.filter(
        (result): result is PromiseRejectedResult => 
          result.status === 'rejected' && 
          result.reason.message?.includes('rate limit')
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Processing', () => {
    it('should merge user settings with request settings', async () => {
      const customSettings = {
        maxDream100: 50,
        scoringWeights: {
          volume: 0.3,
          intent: 0.4,
          relevance: 0.2,
          trend: 0.05,
          ease: 0.05
        }
      };

      const requestWithSettings = {
        ...validRequest,
        settings: customSettings
      };

      const response = await ingestionService.processIngestion(requestWithSettings);
      
      expect(response.configuration.finalSettings.maxDream100).toBe(50);
      expect(response.configuration.finalSettings.scoringWeights.volume).toBe(0.3);
    });

    it('should calculate processing plan correctly', async () => {
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.configuration.processingPlan.dream100Count).toBeGreaterThan(0);
      expect(response.configuration.processingPlan.tier2Count).toBeGreaterThan(0);
      expect(response.configuration.processingPlan.totalExpected).toBeGreaterThan(0);
    });

    it('should set feature flags correctly', async () => {
      const response = await ingestionService.processIngestion(validRequest);
      
      expect(response.configuration.enabledFeatures.clustering).toBe(true);
      expect(response.configuration.enabledFeatures.roadmapGeneration).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete ingestion within timeout', async () => {
      const startTime = Date.now();
      
      await ingestionService.processIngestion(validRequest);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        ingestionService.processIngestion({
          ...validRequest,
          seedKeywords: [`keyword${i}`, `test${i}`]
        })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(typeof response.success).toBe('boolean');
      });
    });
  });

  describe('Integration with External Services', () => {
    it('should use convenience functions', async () => {
      const response = await processIngestion(validRequest);
      expect(response).toBeDefined();
      
      const validation = await ingestionService.validateApiKeys(testUserId);
      expect(validation).toBeDefined();
    });

    it('should handle service unavailability gracefully', async () => {
      mockIntegrationFactory.isAvailable.mockReturnValue(false);

      const validation = await ingestionService.validateApiKeys(testUserId);
      
      expect(validation.ahrefs.isValid).toBe(false);
      expect(validation.ahrefs.errorMessage).toContain('integration not initialized');
    });
  });
});