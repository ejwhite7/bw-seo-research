/**
 * Dream 100 Keyword Engine - Ingestion Service
 * 
 * Comprehensive ingestion service that handles seed keyword input processing,
 * API key management, run configuration, and validation for the keyword research pipeline.
 * 
 * Features:
 * - Seed keyword validation and normalization
 * - Secure API key management with encryption
 * - Run configuration with defaults and validation
 * - Input sanitization and duplicate detection
 * - Rate limiting and cost estimation
 * - Comprehensive error handling
 * 
 * @fileoverview Core ingestion service for pipeline initialization
 * @version 1.0.0
 * @author Dream 100 Team
 */

import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import type {
  CreateRunInput,
  Run,
  RunSettings,
  UUID,
  Timestamp,
  Settings,
  CreateSettingsInput,
  UpdateSettingsInput,
  UserPreferences,
  ApiKeyInfo,
  SettingsValidation
} from '../models';
import {
  CreateRunInputSchema,
  getDefaultRunSettings,
  getDefaultUserPreferences
} from '../models';
import { DatabaseService, AdminTables } from '../lib/supabase';
import { TokenBucket } from '../utils/rate-limiter';
import { ErrorHandler, CustomApiError } from '../utils/error-handler';
import { IntegrationFactory } from '../integrations';
import type { Database } from '../types/database';

/**
 * Ingestion request with comprehensive validation
 */
export interface IngestionRequest {
  readonly userId: UUID;
  readonly seedKeywords: string[];
  readonly market?: string;
  readonly settings?: Partial<RunSettings>;
  readonly budgetLimit?: number;
  readonly validateOnly?: boolean; // For validation without creating run
}

/**
 * Ingestion response with detailed feedback
 */
export interface IngestionResponse {
  readonly success: boolean;
  readonly runId?: UUID;
  readonly validation: IngestionValidation;
  readonly costEstimate: CostEstimate;
  readonly configuration: RunConfiguration;
  readonly warnings: IngestionWarning[];
  readonly errors: IngestionError[];
}

/**
 * Comprehensive validation result
 */
export interface IngestionValidation {
  readonly isValid: boolean;
  readonly seedKeywords: {
    readonly valid: string[];
    readonly invalid: Array<{ keyword: string; reason: string }>;
    readonly normalized: string[];
    readonly duplicatesRemoved: string[];
  };
  readonly settings: {
    readonly isValid: boolean;
    readonly errors: string[];
    readonly warnings: string[];
  };
  readonly apiKeys: {
    readonly ahrefs: ApiKeyValidation;
    readonly anthropic: ApiKeyValidation;
  };
  readonly market: {
    readonly isValid: boolean;
    readonly normalized: string;
    readonly supported: boolean;
  };
}

/**
 * API key validation result
 */
export interface ApiKeyValidation {
  readonly isConfigured: boolean;
  readonly isValid: boolean;
  readonly hasQuota: boolean;
  readonly quotaRemaining?: number;
  readonly errorMessage?: string;
  readonly warningMessage?: string;
}

/**
 * Cost estimation for the run
 */
export interface CostEstimate {
  readonly total: number;
  readonly breakdown: {
    readonly ahrefs: number;
    readonly anthropic: number;
    readonly infrastructure: number;
  };
  readonly estimatedKeywords: number;
  readonly budgetUtilization: number; // Percentage of budget
  readonly withinBudget: boolean;
  readonly projectedDuration: number; // Minutes
}

/**
 * Run configuration after processing
 */
export interface RunConfiguration {
  readonly finalSettings: RunSettings;
  readonly processingPlan: {
    readonly dream100Count: number;
    readonly tier2Count: number;
    readonly tier3Count: number;
    readonly totalExpected: number;
  };
  readonly enabledFeatures: {
    readonly competitorScraping: boolean;
    readonly clustering: boolean;
    readonly roadmapGeneration: boolean;
  };
}

/**
 * Ingestion warning
 */
export interface IngestionWarning {
  readonly type: 'quota' | 'cost' | 'performance' | 'configuration';
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly actionRequired: boolean;
}

/**
 * Ingestion error
 */
export interface IngestionError {
  readonly type: 'validation' | 'api_key' | 'budget' | 'rate_limit' | 'system';
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly retryable: boolean;
}

/**
 * Input validation schemas
 */
const SeedKeywordSchema = z
  .string()
  .min(1, 'Keyword cannot be empty')
  .max(100, 'Keyword too long (max 100 characters)')
  .refine(keyword => {
    // Check for basic keyword quality
    const trimmed = keyword.trim();
    if (trimmed.length < 2) return false;
    if (/^[\s\d\W]*$/.test(trimmed)) return false; // Only numbers/symbols
    if (trimmed.split(/\s+/).length > 10) return false; // Too many words
    return true;
  }, {
    message: 'Invalid keyword format or quality'
  });

const IngestionRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  seedKeywords: z.array(SeedKeywordSchema)
    .min(1, 'At least one seed keyword required')
    .max(5, 'Maximum 5 seed keywords allowed')
    .refine(keywords => {
      const normalized = keywords.map(k => k.trim().toLowerCase());
      return new Set(normalized).size === keywords.length;
    }, {
      message: 'Seed keywords must be unique'
    }),
  market: z.string()
    .min(2, 'Market code too short')
    .max(10, 'Market code too long')
    .regex(/^[A-Z]{2,3}$/, 'Invalid market code format')
    .default('US'),
  budgetLimit: z.number()
    .min(1, 'Budget must be at least $1')
    .max(1000, 'Budget exceeds maximum ($1000)')
    .default(100),
  validateOnly: z.boolean().default(false)
});

/**
 * Rate limiter for ingestion requests
 */
const ingestionRateLimit = new TokenBucket({
  capacity: 10, // 10 requests
  refillRate: 2, // 2 per period
  refillPeriod: 60000 // 1 minute
});

/**
 * Main ingestion service class
 */
export class IngestionService {
  private static instance: IngestionService | null = null;
  private integrations: IntegrationFactory;
  private duplicateDetectionCache = new Map<string, { runId: UUID; timestamp: number }>();

  private constructor() {
    this.integrations = IntegrationFactory.getInstance();
    
    // Clean duplicate detection cache every hour
    setInterval(() => this.cleanDuplicateCache(), 60 * 60 * 1000);
  }

  public static getInstance(): IngestionService {
    if (!this.instance) {
      this.instance = new IngestionService();
    }
    return this.instance;
  }

  /**
   * Process ingestion request with comprehensive validation
   */
  public async processIngestion(
    request: IngestionRequest
  ): Promise<IngestionResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      // Rate limiting
      if (!ingestionRateLimit.tryConsume()) {
        throw new CustomApiError(
          'Too many ingestion requests. Please wait before trying again.',
          'RATE_LIMIT_EXCEEDED',
          429,
          true
        );
      }

      Sentry.addBreadcrumb({
        message: 'Starting ingestion process',
        level: 'info',
        category: 'ingestion',
        data: {
          requestId,
          userId: request.userId,
          seedKeywordCount: request.seedKeywords.length,
          market: request.market
        }
      });

      // Input validation
      const validatedRequest = await this.validateInput(request);
      
      // User settings and API key validation
      const [userSettings, apiValidation] = await Promise.all([
        this.getUserSettings(request.userId),
        this.validateApiKeys(request.userId)
      ]);

      // Duplicate detection
      const duplicateCheck = this.checkForDuplicates(
        request.userId,
        validatedRequest.seedKeywords
      );

      // Cost estimation
      const costEstimate = await this.estimateCosts(
        validatedRequest.seedKeywords,
        validatedRequest.settings,
        validatedRequest.budgetLimit
      );

      // Build comprehensive validation result
      const validation = await this.buildValidationResult(
        validatedRequest,
        apiValidation,
        duplicateCheck
      );

      // Configuration processing
      const configuration = this.buildRunConfiguration(
        validatedRequest.settings,
        userSettings
      );

      // Collect warnings
      const warnings = this.collectWarnings(
        validation,
        costEstimate,
        duplicateCheck,
        userSettings
      );

      // Collect errors
      const errors = this.collectErrors(validation, apiValidation, costEstimate);

      // Create run if not validation-only and no critical errors
      let runId: UUID | undefined;
      if (!request.validateOnly && errors.every(e => e.retryable)) {
        runId = await this.createRun(
          validatedRequest,
          configuration.finalSettings,
          costEstimate
        );
        
        // Add to duplicate detection cache
        if (runId) {
          this.addToDuplicateCache(request.userId, validatedRequest.seedKeywords, runId);
        }
      }

      const response: IngestionResponse = {
        success: errors.length === 0,
        runId,
        validation,
        costEstimate,
        configuration,
        warnings,
        errors
      };

      // Log successful ingestion
      const processingTime = Date.now() - startTime;
      Sentry.addBreadcrumb({
        message: 'Ingestion completed',
        level: 'info',
        category: 'ingestion',
        data: {
          requestId,
          success: response.success,
          runId,
          processingTime,
          warningCount: warnings.length,
          errorCount: errors.length
        }
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      Sentry.withScope(scope => {
        scope.setTag('operation', 'ingestion');
        scope.setContext('request', {
          requestId,
          userId: request.userId,
          processingTime
        });
        Sentry.captureException(error);
      });

      const apiError = new Error(`Ingestion failed: ${error instanceof Error ? error.message : String(error)}`);

      // Return error response
      return {
        success: false,
        validation: {
          isValid: false,
          seedKeywords: {
            valid: [],
            invalid: [],
            normalized: [],
            duplicatesRemoved: []
          },
          settings: {
            isValid: false,
            errors: [apiError.message],
            warnings: []
          },
          apiKeys: {
            ahrefs: { isConfigured: false, isValid: false, hasQuota: false },
            anthropic: { isConfigured: false, isValid: false, hasQuota: false }
          },
          market: {
            isValid: false,
            normalized: request.market || 'US',
            supported: false
          }
        },
        costEstimate: {
          total: 0,
          breakdown: { ahrefs: 0, anthropic: 0, infrastructure: 0 },
          estimatedKeywords: 0,
          budgetUtilization: 0,
          withinBudget: false,
          projectedDuration: 0
        },
        configuration: {
          finalSettings: getDefaultRunSettings(),
          processingPlan: {
            dream100Count: 0,
            tier2Count: 0,
            tier3Count: 0,
            totalExpected: 0
          },
          enabledFeatures: {
            competitorScraping: false,
            clustering: false,
            roadmapGeneration: false
          }
        },
        warnings: [],
        errors: [{
          type: 'system',
          code: 'INGESTION_ERROR',
          message: apiError.message,
          retryable: false
        }]
      };
    }
  }

  /**
   * Validate API keys for a user
   */
  public async validateApiKeys(userId: UUID): Promise<{
    ahrefs: ApiKeyValidation;
    anthropic: ApiKeyValidation;
  }> {
    try {
      const { data: settings } = await DatabaseService.getUserSettings(userId);
      
      if (!settings) {
        return {
          ahrefs: {
            isConfigured: false,
            isValid: false,
            hasQuota: false,
            errorMessage: 'No settings found for user'
          },
          anthropic: {
            isConfigured: false,
            isValid: false,
            hasQuota: false,
            errorMessage: 'No settings found for user'
          }
        };
      }

      const [ahrefsValidation, anthropicValidation] = await Promise.all([
        this.validateSingleApiKey('ahrefs', settings.ahrefsApiKeyEncrypted),
        this.validateSingleApiKey('anthropic', settings.anthropicApiKeyEncrypted)
      ]);

      return {
        ahrefs: ahrefsValidation,
        anthropic: anthropicValidation
      };
      
    } catch (error) {
      console.error('API key validation error:', error);
      
      return {
        ahrefs: {
          isConfigured: false,
          isValid: false,
          hasQuota: false,
          errorMessage: 'Failed to validate API keys'
        },
        anthropic: {
          isConfigured: false,
          isValid: false,
          hasQuota: false,
          errorMessage: 'Failed to validate API keys'
        }
      };
    }
  }

  /**
   * Update user settings with API keys
   */
  public async updateSettings(
    userId: UUID,
    input: UpdateSettingsInput
  ): Promise<Settings> {
    try {
      // Get current settings or create defaults
      const { data: currentSettings } = await DatabaseService.getUserSettings(userId);
      
      const updateData: any = {};

      // Handle API key encryption
      if (input.ahrefsApiKey !== undefined) {
        if (input.ahrefsApiKey === null) {
          updateData.ahrefs_api_key_encrypted = null;
        } else {
          const { data: encrypted } = await DatabaseService.encryptApiKey(
            input.ahrefsApiKey
          );
          updateData.ahrefs_api_key_encrypted = encrypted;
        }
      }

      if (input.anthropicApiKey !== undefined) {
        if (input.anthropicApiKey === null) {
          updateData.anthropic_api_key_encrypted = null;
        } else {
          const { data: encrypted } = await DatabaseService.encryptApiKey(
            input.anthropicApiKey
          );
          updateData.anthropic_api_key_encrypted = encrypted;
        }
      }

      // Handle other settings
      if (input.defaultWeights) {
        updateData.default_weights = {
          ...(currentSettings?.defaultWeights || getDefaultRunSettings().scoringWeights),
          ...input.defaultWeights
        };
      }

      if (input.preferences) {
        const defaultPrefs = getDefaultUserPreferences();
        updateData.other_preferences = {
          ...defaultPrefs,
          ...(currentSettings?.otherPreferences || {}),
          ...input.preferences,
          // Ensure notifications has required fields
          notifications: {
            ...defaultPrefs.notifications,
            ...(currentSettings?.otherPreferences?.notifications || {}),
            ...(input.preferences.notifications || {})
          }
        };
      }

      // Update in database
      if (currentSettings) {
        const { data, error } = await AdminTables.settings()
          .update(updateData)
          .eq('user_id', userId)
          .select()
          .single();
          
        if (error) throw error;
        return this.mapSettingsFromDb(data);
      } else {
        // Create new settings
        const { data, error } = await AdminTables.settings()
          .insert({
            user_id: userId,
            default_weights: updateData.default_weights || getDefaultRunSettings().scoringWeights,
            other_preferences: updateData.other_preferences || getDefaultUserPreferences(),
            ...updateData
          })
          .select()
          .single();
          
        if (error) throw error;
        return this.mapSettingsFromDb(data);
      }
      
    } catch (error) {
      throw new Error(`Settings update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get comprehensive settings validation for a user
   */
  public async getSettingsValidation(userId: UUID): Promise<SettingsValidation> {
    try {
      const apiValidation = await this.validateApiKeys(userId);
      const warnings: Array<{
        type: 'quota' | 'cost' | 'configuration';
        message: string;
        severity: 'low' | 'medium' | 'high';
      }> = [];
      
      // Check for potential issues
      if (apiValidation.ahrefs.quotaRemaining !== undefined && 
          apiValidation.ahrefs.quotaRemaining < 100) {
        warnings.push({
          type: 'quota',
          message: `Ahrefs quota low: ${apiValidation.ahrefs.quotaRemaining} requests remaining`,
          severity: apiValidation.ahrefs.quotaRemaining < 50 ? 'high' : 'medium'
        });
      }

      const isValid = apiValidation.ahrefs.isValid && apiValidation.anthropic.isValid;
      
      const recommendations: string[] = [];
      if (!apiValidation.ahrefs.isValid) {
        recommendations.push('Configure a valid Ahrefs API key to access keyword metrics');
      }
      if (!apiValidation.anthropic.isValid) {
        recommendations.push('Configure a valid Anthropic API key for AI-powered expansions');
      }
      if (warnings.some(w => w.type === 'quota')) {
        recommendations.push('Consider upgrading your API plan to increase quotas');
      }

      // Transform ApiKeyValidation to ApiKeyInfo format
      const apiKeyInfo: {
        readonly ahrefs: ApiKeyInfo;
        readonly anthropic: ApiKeyInfo;
      } = {
        ahrefs: {
          provider: 'ahrefs' as const,
          isConfigured: apiValidation.ahrefs.isConfigured,
          lastValidated: null, // This would need to be tracked separately
          isValid: apiValidation.ahrefs.isValid,
          quotaRemaining: apiValidation.ahrefs.quotaRemaining || null,
          nextResetDate: null, // This would need to be tracked separately
          errorMessage: apiValidation.ahrefs.errorMessage || null
        },
        anthropic: {
          provider: 'anthropic' as const,
          isConfigured: apiValidation.anthropic.isConfigured,
          lastValidated: null, // This would need to be tracked separately
          isValid: apiValidation.anthropic.isValid,
          quotaRemaining: apiValidation.anthropic.quotaRemaining || null,
          nextResetDate: null, // This would need to be tracked separately
          errorMessage: apiValidation.anthropic.errorMessage || null
        }
      };

      return {
        isValid,
        apiKeys: apiKeyInfo,
        warnings,
        recommendations
      };
      
    } catch (error) {
      throw new Error(`Settings validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate cost estimate for processing
   */
  private async estimateCosts(
    seedKeywords: string[],
    settings?: Partial<RunSettings>,
    budgetLimit: number = 100
  ): Promise<CostEstimate> {
    const finalSettings = {
      ...getDefaultRunSettings(),
      ...settings
    };
    
    // Estimate keyword counts
    const dream100Count = Math.min(finalSettings.maxDream100, seedKeywords.length * 20);
    const tier2Count = dream100Count * finalSettings.maxTier2PerDream;
    const tier3Count = tier2Count * finalSettings.maxTier3PerTier2;
    const totalKeywords = Math.min(
      finalSettings.maxKeywords,
      dream100Count + tier2Count + tier3Count
    );

    // Cost calculations (estimates based on API pricing)
    const ahrefs = totalKeywords * 0.01; // $0.01 per keyword
    const anthropic = (seedKeywords.length * 20 + dream100Count * 2) * 0.0001; // Token estimates
    const infrastructure = totalKeywords * 0.001; // Processing costs
    const total = ahrefs + anthropic + infrastructure;

    // Processing duration estimate
    const projectedDuration = Math.ceil(totalKeywords / 50); // ~50 keywords per minute

    return {
      total,
      breakdown: { ahrefs, anthropic, infrastructure },
      estimatedKeywords: totalKeywords,
      budgetUtilization: (total / budgetLimit) * 100,
      withinBudget: total <= budgetLimit,
      projectedDuration
    };
  }

  // Private helper methods
  private async validateInput(request: IngestionRequest): Promise<IngestionRequest> {
    try {
      return IngestionRequestSchema.parse(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new CustomApiError(
          `Input validation failed: ${messages}`,
          'VALIDATION_ERROR',
          400
        );
      }
      throw error;
    }
  }

  private async getUserSettings(userId: UUID): Promise<Settings> {
    const { data: settings, error } = await DatabaseService.getUserSettings(userId);
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return settings || this.createDefaultSettings(userId);
  }

  private async createDefaultSettings(userId: UUID): Promise<Settings> {
    const now = new Date().toISOString();
    return {
      id: this.generateId(),
      userId,
      ahrefsApiKeyEncrypted: null,
      anthropicApiKeyEncrypted: null,
      defaultWeights: getDefaultRunSettings().scoringWeights,
      otherPreferences: getDefaultUserPreferences(),
      createdAt: now,
      updatedAt: now
    };
  }

  private async validateSingleApiKey(
    provider: 'ahrefs' | 'anthropic',
    encryptedKey: string | null
  ): Promise<ApiKeyValidation> {
    if (!encryptedKey) {
      return {
        isConfigured: false,
        isValid: false,
        hasQuota: false,
        warningMessage: `${provider} API key not configured`
      };
    }

    try {
      // Decrypt the API key
      const { data: decryptedKey, error } = await DatabaseService.decryptApiKey(encryptedKey);
      if (error || !decryptedKey) {
        return {
          isConfigured: true,
          isValid: false,
          hasQuota: false,
          errorMessage: 'Failed to decrypt API key'
        };
      }

      // Initialize the appropriate client for validation
      if (provider === 'ahrefs' && this.integrations.isAvailable('ahrefs')) {
        const client = this.integrations.getAhrefs();
        const health = await client.healthCheck();
        
        return {
          isConfigured: true,
          isValid: health.healthy,
          hasQuota: health.metrics.rateLimitHits === 0,
          quotaRemaining: health.rateLimit?.remaining,
          errorMessage: health.healthy ? undefined : health.issues.join(', '),
          warningMessage: health.issues.length > 0 ? health.issues.join(', ') : undefined
        };
      }

      if (provider === 'anthropic' && this.integrations.isAvailable('anthropic')) {
        const client = this.integrations.getAnthropic();
        const health = await client.healthCheck();
        
        return {
          isConfigured: true,
          isValid: health.healthy,
          hasQuota: true, // Anthropic doesn't have hard quotas like Ahrefs
          errorMessage: health.healthy ? undefined : health.issues.join(', '),
          warningMessage: health.issues.length > 0 ? health.issues.join(', ') : undefined
        };
      }

      // Integration not available
      return {
        isConfigured: true,
        isValid: false,
        hasQuota: false,
        errorMessage: `${provider} integration not initialized`
      };
      
    } catch (error) {
      return {
        isConfigured: true,
        isValid: false,
        hasQuota: false,
        errorMessage: `API key validation failed: ${(error as Error).message}`
      };
    }
  }

  private checkForDuplicates(
    userId: UUID,
    seedKeywords: string[]
  ): { isDuplicate: boolean; existingRunId?: UUID; similarity: number } {
    const keywordSignature = seedKeywords
      .map(k => k.toLowerCase().trim())
      .sort()
      .join('|');
    
    const cacheKey = `${userId}:${keywordSignature}`;
    const cached = this.duplicateDetectionCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
      return {
        isDuplicate: true,
        existingRunId: cached.runId,
        similarity: 1.0
      };
    }
    
    // Check for similar keyword sets
    for (const [key, value] of this.duplicateDetectionCache.entries()) {
      if (key.startsWith(`${userId}:`)) {
        const existingKeywords = key.split(':')[1].split('|');
        const similarity = this.calculateSimilarity(seedKeywords, existingKeywords);
        
        if (similarity > 0.8) {
          return {
            isDuplicate: true,
            existingRunId: value.runId,
            similarity
          };
        }
      }
    }
    
    return { isDuplicate: false, similarity: 0 };
  }

  private calculateSimilarity(keywords1: string[], keywords2: string[]): number {
    const set1 = new Set(keywords1.map(k => k.toLowerCase().trim()));
    const set2 = new Set(keywords2.map(k => k.toLowerCase().trim()));
    
    const intersection = new Set([...set1].filter(k => set2.has(k)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private async buildValidationResult(
    request: IngestionRequest,
    apiValidation: { ahrefs: ApiKeyValidation; anthropic: ApiKeyValidation },
    duplicateCheck: { isDuplicate: boolean; existingRunId?: UUID; similarity: number }
  ): Promise<IngestionValidation> {
    // Seed keyword processing
    const normalizedKeywords: string[] = [];
    const validKeywords: string[] = [];
    const invalidKeywords: Array<{ keyword: string; reason: string }> = [];
    const duplicatesRemoved: string[] = [];
    
    const seenKeywords = new Set<string>();
    
    for (const keyword of request.seedKeywords) {
      const normalized = keyword.trim().toLowerCase();
      
      if (seenKeywords.has(normalized)) {
        duplicatesRemoved.push(keyword);
        continue;
      }
      
      try {
        SeedKeywordSchema.parse(keyword);
        normalizedKeywords.push(normalized);
        validKeywords.push(keyword);
        seenKeywords.add(normalized);
      } catch (error) {
        if (error instanceof z.ZodError) {
          invalidKeywords.push({
            keyword,
            reason: error.errors[0]?.message || 'Invalid format'
          });
        }
      }
    }

    // Market validation
    const supportedMarkets = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'BR', 'MX'];
    const normalizedMarket = (request.market || 'US').toUpperCase();
    
    return {
      isValid: validKeywords.length > 0 && 
               apiValidation.ahrefs.isValid && 
               apiValidation.anthropic.isValid &&
               supportedMarkets.includes(normalizedMarket),
      seedKeywords: {
        valid: validKeywords,
        invalid: invalidKeywords,
        normalized: normalizedKeywords,
        duplicatesRemoved
      },
      settings: {
        isValid: true, // Settings are validated during merge
        errors: [],
        warnings: []
      },
      apiKeys: apiValidation,
      market: {
        isValid: supportedMarkets.includes(normalizedMarket),
        normalized: normalizedMarket,
        supported: supportedMarkets.includes(normalizedMarket)
      }
    };
  }

  private buildRunConfiguration(
    requestSettings?: Partial<RunSettings>,
    userSettings?: Settings
  ): RunConfiguration {
    const finalSettings: RunSettings = {
      ...getDefaultRunSettings(),
      ...(userSettings?.defaultWeights ? { scoringWeights: userSettings.defaultWeights } : {}),
      ...requestSettings
    };

    // Calculate processing plan
    const dream100Count = finalSettings.maxDream100;
    const tier2Count = dream100Count * finalSettings.maxTier2PerDream;
    const tier3Count = tier2Count * finalSettings.maxTier3PerTier2;
    const totalExpected = Math.min(
      finalSettings.maxKeywords,
      dream100Count + tier2Count + tier3Count
    );

    return {
      finalSettings,
      processingPlan: {
        dream100Count,
        tier2Count,
        tier3Count,
        totalExpected
      },
      enabledFeatures: {
        competitorScraping: finalSettings.enableCompetitorScraping,
        clustering: true, // Always enabled
        roadmapGeneration: true // Always enabled
      }
    };
  }

  private collectWarnings(
    validation: IngestionValidation,
    costEstimate: CostEstimate,
    duplicateCheck: { isDuplicate: boolean; existingRunId?: UUID; similarity: number },
    userSettings?: Settings
  ): IngestionWarning[] {
    const warnings: IngestionWarning[] = [];

    // Duplicate detection warning
    if (duplicateCheck.isDuplicate) {
      warnings.push({
        type: 'configuration',
        message: `Similar keyword set detected (${Math.round(duplicateCheck.similarity * 100)}% similarity). Consider reusing existing run ${duplicateCheck.existingRunId}`,
        severity: duplicateCheck.similarity > 0.9 ? 'high' : 'medium',
        actionRequired: false
      });
    }

    // Budget warnings
    if (costEstimate.budgetUtilization > 80) {
      warnings.push({
        type: 'cost',
        message: `Estimated cost ($${costEstimate.total.toFixed(2)}) uses ${costEstimate.budgetUtilization.toFixed(0)}% of budget`,
        severity: costEstimate.budgetUtilization > 95 ? 'high' : 'medium',
        actionRequired: costEstimate.budgetUtilization > 100
      });
    }

    // API quota warnings
    if (validation.apiKeys.ahrefs.quotaRemaining !== undefined && 
        validation.apiKeys.ahrefs.quotaRemaining < costEstimate.estimatedKeywords) {
      warnings.push({
        type: 'quota',
        message: `Ahrefs quota may be insufficient (${validation.apiKeys.ahrefs.quotaRemaining} remaining vs ${costEstimate.estimatedKeywords} needed)`,
        severity: 'high',
        actionRequired: true
      });
    }

    // Performance warnings
    if (costEstimate.projectedDuration > 30) {
      warnings.push({
        type: 'performance',
        message: `Estimated processing time: ${costEstimate.projectedDuration} minutes. Consider reducing keyword limits for faster results.`,
        severity: 'medium',
        actionRequired: false
      });
    }

    // Configuration warnings
    if (validation.seedKeywords.duplicatesRemoved.length > 0) {
      warnings.push({
        type: 'configuration',
        message: `${validation.seedKeywords.duplicatesRemoved.length} duplicate seed keywords were removed`,
        severity: 'low',
        actionRequired: false
      });
    }

    return warnings;
  }

  private collectErrors(
    validation: IngestionValidation,
    apiValidation: { ahrefs: ApiKeyValidation; anthropic: ApiKeyValidation },
    costEstimate: CostEstimate
  ): IngestionError[] {
    const errors: IngestionError[] = [];

    // Validation errors
    if (validation.seedKeywords.valid.length === 0) {
      errors.push({
        type: 'validation',
        code: 'NO_VALID_KEYWORDS',
        message: 'No valid seed keywords provided',
        field: 'seedKeywords',
        retryable: false
      });
    }

    // API key errors
    if (!apiValidation.ahrefs.isValid) {
      errors.push({
        type: 'api_key',
        code: 'INVALID_AHREFS_KEY',
        message: apiValidation.ahrefs.errorMessage || 'Ahrefs API key is invalid or not configured',
        retryable: true
      });
    }

    if (!apiValidation.anthropic.isValid) {
      errors.push({
        type: 'api_key',
        code: 'INVALID_ANTHROPIC_KEY',
        message: apiValidation.anthropic.errorMessage || 'Anthropic API key is invalid or not configured',
        retryable: true
      });
    }

    // Budget errors
    if (!costEstimate.withinBudget) {
      errors.push({
        type: 'budget',
        code: 'BUDGET_EXCEEDED',
        message: `Estimated cost ($${costEstimate.total.toFixed(2)}) exceeds budget limit`,
        retryable: false
      });
    }

    return errors;
  }

  private async createRun(
    request: IngestionRequest,
    settings: RunSettings,
    costEstimate: CostEstimate
  ): Promise<UUID> {
    const runInput: CreateRunInput = {
      userId: request.userId,
      seedKeywords: request.seedKeywords,
      market: request.market || 'US',
      settings,
      budgetLimit: request.budgetLimit
    };

    // Validate with Zod schema
    const validated = CreateRunInputSchema.parse(runInput);

    // Create in database
    const { data, error } = await AdminTables.runs()
      .insert({
        user_id: validated.userId,
        seed_keywords: validated.seedKeywords,
        market: validated.market,
        status: 'pending',
        settings: validated.settings,
        api_usage: {
          ahrefs: { requests: 0, cost: 0, remainingQuota: 0, quotaResetAt: new Date().toISOString(), errors: 0 },
          anthropic: { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, errors: 0 },
          scraper: { requests: 0, successfulScrapes: 0, failedScrapes: 0, blockedRequests: 0, totalPages: 0 },
          totalCost: 0,
          budgetLimit: validated.budgetLimit || 100,
          budgetRemaining: (validated.budgetLimit || 100) - costEstimate.total
        },
        error_logs: [],
        progress: {
          currentStage: 'initialization',
          stagesCompleted: [],
          keywordsDiscovered: 0,
          clustersCreated: 0,
          competitorsFound: 0,
          estimatedTimeRemaining: costEstimate.projectedDuration,
          percentComplete: 0,
          stageProgress: {},
          throughput: { keywordsPerMinute: 0, apiRequestsPerMinute: 0 }
        },
        total_keywords: 0,
        total_clusters: 0
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Run creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return data.id;
  }

  private addToDuplicateCache(userId: UUID, seedKeywords: string[], runId: UUID): void {
    const keywordSignature = seedKeywords
      .map(k => k.toLowerCase().trim())
      .sort()
      .join('|');
    
    const cacheKey = `${userId}:${keywordSignature}`;
    this.duplicateDetectionCache.set(cacheKey, {
      runId,
      timestamp: Date.now()
    });
  }

  private cleanDuplicateCache(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (const [key, value] of this.duplicateDetectionCache.entries()) {
      if (value.timestamp < cutoff) {
        this.duplicateDetectionCache.delete(key);
      }
    }
  }

  private mapSettingsFromDb(dbData: any): Settings {
    return {
      id: dbData.id,
      userId: dbData.user_id,
      ahrefsApiKeyEncrypted: dbData.ahrefs_api_key_encrypted,
      anthropicApiKeyEncrypted: dbData.anthropic_api_key_encrypted,
      defaultWeights: dbData.default_weights,
      otherPreferences: dbData.other_preferences,
      createdAt: dbData.created_at,
      updatedAt: dbData.updated_at
    };
  }

  private generateRequestId(): string {
    return `ing_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateId(): UUID {
    return crypto.randomUUID();
  }
}

// Singleton instance
export const ingestionService = IngestionService.getInstance();

// Convenience functions
export const processIngestion = (request: IngestionRequest): Promise<IngestionResponse> =>
  ingestionService.processIngestion(request);

export const validateApiKeys = (userId: UUID) =>
  ingestionService.validateApiKeys(userId);

export const updateUserSettings = (userId: UUID, input: UpdateSettingsInput): Promise<Settings> =>
  ingestionService.updateSettings(userId, input);

export const getSettingsValidation = (userId: UUID): Promise<SettingsValidation> =>
  ingestionService.getSettingsValidation(userId);