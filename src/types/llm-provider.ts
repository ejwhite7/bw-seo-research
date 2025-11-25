/**
 * Unified LLM Provider Interface
 * 
 * This interface allows the application to work with multiple LLM providers
 * (Anthropic, OpenAI, Gemini) through a common interface.
 */

// Provider types
export type LLMProviderType = 'anthropic' | 'openai' | 'gemini';

// Unified request/response types that work across all providers
export interface LLMKeywordExpansion {
  seed_keywords: string[];
  target_count: number;
  industry?: string;
  intent_focus?: 'informational' | 'commercial' | 'transactional' | 'mixed';
}

export interface LLMExpansionResult {
  keywords: Array<{
    keyword: string;
    intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
    relevance_score: number;
    reasoning?: string;
  }>;
  total_generated: number;
  processing_time?: number;
  model_used: string;
}

export interface LLMIntentClassification {
  keywords: string[];
  context?: {
    industry?: string;
    business_type?: string;
    target_audience?: string;
  };
}

export interface LLMIntentResult {
  keyword: string;
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  confidence: number;
  reasoning?: string;
  suggested_content_type?: string[];
}

export interface LLMResponse<T> {
  data: T;
  usage: {
    input_tokens: number;
    output_tokens: number;
    model: string;
    cost_estimate: number;
    request_id?: string;
  };
  model: string;
  finish_reason: string;
  request_id?: string;
  processing_time: number;
}

/**
 * Unified LLM Provider Interface
 */
export interface ILLMProvider {
  /**
   * Get the provider type
   */
  getProviderType(): LLMProviderType;

  /**
   * Get the model being used
   */
  getModel(): string;

  /**
   * Expand keywords from seed terms
   */
  expandKeywords(request: LLMKeywordExpansion): Promise<LLMResponse<LLMExpansionResult>>;

  /**
   * Classify intent for keywords
   */
  classifyIntent(request: LLMIntentClassification): Promise<LLMResponse<LLMIntentResult[]>>;

  /**
   * Generate titles for keywords
   */
  generateTitles(keyword: string, intent: string, options?: {
    content_type?: string;
    tone?: string;
    max_length?: number;
  }): Promise<LLMResponse<{ titles: Array<{ title: string; reasoning?: string; seo_score?: number }> }>>;

  /**
   * Health check
   */
  healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: any;
  }>;

  /**
   * Get metrics
   */
  getMetrics(): any;

  /**
   * Estimate cost for an operation
   */
  estimateCost(operation: 'expand' | 'classify' | 'titles', itemCount: number): {
    estimatedTokens: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  };
}