/**
 * LLM Provider Factory
 * 
 * Creates and manages LLM provider instances based on environment configuration.
 */

import { ILLMProvider, LLMProviderType } from '../types/llm-provider';
import { AnthropicClient } from '../integrations/anthropic';
import { GeminiClient } from '../integrations/gemini';

export { ILLMProvider, LLMProviderType } from '../types/llm-provider';

// Lazy imports for OpenAI (will be created next)
// import { OpenAIClient } from '../integrations/openai';

/**
 * Get the configured LLM provider from environment variables
 */
export function getLLMProvider(redis?: any): ILLMProvider {
  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase() as LLMProviderType;
  
  // Validate provider type
  if (!['anthropic', 'openai', 'gemini'].includes(provider)) {
    console.warn(`Invalid LLM_PROVIDER "${provider}", defaulting to "anthropic"`);
    return getAnthropicProvider(redis);
  }

  switch (provider) {
    case 'anthropic':
      return getAnthropicProvider(redis);
    case 'openai':
      return getOpenAIProvider(redis);
    case 'gemini':
      return getGeminiProvider(redis);
    default:
      console.warn(`Unknown LLM provider "${provider}", defaulting to "anthropic"`);
      return getAnthropicProvider(redis);
  }
}

/**
 * Get Anthropic provider
 */
function getAnthropicProvider(redis?: any): ILLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required when using Anthropic provider');
  }

  // For now, we'll create an adapter that wraps AnthropicClient
  // This will be replaced with a proper adapter that implements ILLMProvider
  const client = AnthropicClient.getInstance(apiKey, redis);
  
  // Return an adapter that implements ILLMProvider
  return new AnthropicLLMProviderAdapter(client);
}

/**
 * Get OpenAI provider
 */
function getOpenAIProvider(redis?: any): ILLMProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required when using OpenAI provider');
  }

  // TODO: Implement OpenAI client
  throw new Error('OpenAI provider not yet implemented');
  // return new OpenAIClient(apiKey, redis);
}

/**
 * Get Gemini provider
 */
function getGeminiProvider(redis?: any): ILLMProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required when using Gemini provider');
  }

  const client = GeminiClient.getInstance(apiKey, redis);
  
  // Return an adapter that implements ILLMProvider
  return new GeminiLLMProviderAdapter(client);
}

/**
 * Adapter to make AnthropicClient conform to ILLMProvider interface
 */
class AnthropicLLMProviderAdapter implements ILLMProvider {
  constructor(private client: AnthropicClient) {}

  getProviderType(): LLMProviderType {
    return 'anthropic';
  }

  getModel(): string {
    // Model can be overridden via ANTHROPIC_MODEL env var
    return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  }

  async expandKeywords(request: import('../types/llm-provider').LLMKeywordExpansion): Promise<import('../types/llm-provider').LLMResponse<import('../types/llm-provider').LLMExpansionResult>> {
    const response = await this.client.expandToDream100({
      seed_keywords: request.seed_keywords,
      target_count: request.target_count,
      industry: request.industry,
      intent_focus: request.intent_focus || 'mixed'
    });

    // Transform Anthropic response to unified format
    const keywords = Array.isArray(response.data) 
      ? response.data 
      : (response.data as any)?.keywords || [];

    return {
      data: {
        keywords: keywords.map((k: any) => ({
          keyword: k.keyword || k.keyword_name || '',
          intent: k.intent || 'informational',
          relevance_score: k.relevance_score || k.relevanceScore || 0.5,
          reasoning: k.reasoning || undefined
        })),
        total_generated: keywords.length,
        processing_time: response.processing_time,
        model_used: response.model || this.getModel()
      },
      usage: response.usage,
      model: response.model || this.getModel(),
      finish_reason: response.finish_reason || 'complete',
      request_id: response.request_id,
      processing_time: response.processing_time
    };
  }

  async classifyIntent(request: import('../types/llm-provider').LLMIntentClassification): Promise<import('../types/llm-provider').LLMResponse<import('../types/llm-provider').LLMIntentResult[]>> {
    const response = await this.client.classifyIntent({
      keywords: request.keywords,
      context: request.context
    });

    const results = Array.isArray(response.data) ? response.data : [];

    return {
      data: results.map((r: any) => ({
        keyword: r.keyword || '',
        intent: r.intent || 'informational',
        confidence: r.confidence || 0.5,
        reasoning: r.reasoning || undefined,
        suggested_content_type: r.suggested_content_type || undefined
      })),
      usage: response.usage,
      model: response.model || this.getModel(),
      finish_reason: response.finish_reason || 'complete',
      request_id: response.request_id,
      processing_time: response.processing_time
    };
  }

  async generateTitles(
    keyword: string,
    intent: string,
    options?: {
      content_type?: string;
      tone?: string;
      max_length?: number;
    }
  ): Promise<import('../types/llm-provider').LLMResponse<{ titles: Array<{ title: string; reasoning?: string; seo_score?: number }> }>> {
    const response = await this.client.generateTitles({
      keyword,
      intent,
      content_type: (options?.content_type as any) || 'blog_post',
      tone: (options?.tone as any) || 'professional',
      max_length: options?.max_length || 60,
      include_keyword: true
    });

    const titles = response.data?.titles || [];

    return {
      data: {
        titles: titles.map((t: any) => ({
          title: t.title || '',
          reasoning: t.reasoning || undefined,
          seo_score: t.seo_score || t.seoScore || 0.5
        }))
      },
      usage: response.usage,
      model: response.model || this.getModel(),
      finish_reason: response.finish_reason || 'complete',
      request_id: response.request_id,
      processing_time: response.processing_time
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; issues: string[]; metrics: any }> {
    return this.client.healthCheck();
  }

  getMetrics(): any {
    return this.client.getMetrics();
  }

  estimateCost(operation: 'expand' | 'classify' | 'titles', itemCount: number): {
    estimatedTokens: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  } {
    return this.client.estimateCost(operation, itemCount);
  }
}

/**
 * Adapter to make GeminiClient conform to ILLMProvider interface
 */
class GeminiLLMProviderAdapter implements ILLMProvider {
  constructor(private client: GeminiClient) {}

  getProviderType(): LLMProviderType {
    return 'gemini';
  }

  getModel(): string {
    // Model can be overridden via GEMINI_MODEL env var
    return process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  }

  async expandKeywords(request: import('../types/llm-provider').LLMKeywordExpansion): Promise<import('../types/llm-provider').LLMResponse<import('../types/llm-provider').LLMExpansionResult>> {
    const response = await this.client.expandToDream100({
      seed_keywords: request.seed_keywords,
      target_count: request.target_count,
      industry: request.industry,
      intent_focus: request.intent_focus || 'mixed'
    });

    // Log response structure for debugging
    console.log(`🔍 Gemini adapter - response.data type: ${typeof response.data}, isArray: ${Array.isArray(response.data)}`);
    if (typeof response.data === 'string') {
      console.log(`🔍 Gemini adapter - response.data (first 500 chars): ${(response.data as string).substring(0, 500)}`);
    }

    // Transform Gemini response to unified format
    let keywords: any[] = [];
    
    if (Array.isArray(response.data)) {
      // Direct array of keywords
      keywords = response.data;
    } else if (response.data && typeof response.data === 'object' && (response.data as any).keywords) {
      // Object with keywords property
      keywords = (response.data as any).keywords;
    } else if (typeof response.data === 'string') {
      // String response - try to parse JSON from it
      try {
        // Helper function to find balanced JSON brackets
        const findBalancedJSON = (str: string, startChar: string, endChar: string): string | null => {
          let depth = 0;
          let startIdx = -1;
          
          for (let i = 0; i < str.length; i++) {
            if (str[i] === startChar) {
              if (depth === 0) startIdx = i;
              depth++;
            } else if (str[i] === endChar) {
              depth--;
              if (depth === 0 && startIdx !== -1) {
                return str.substring(startIdx, i + 1);
              }
            }
          }
          return null;
        };
        
        // Try to extract JSON array from string (most common)
        const jsonArray = findBalancedJSON(response.data as string, '[', ']');
        if (jsonArray) {
          const parsed = JSON.parse(jsonArray);
          keywords = Array.isArray(parsed) ? parsed : [];
        } else {
          // Try to extract JSON object with keywords property
          const jsonObject = findBalancedJSON(response.data as string, '{', '}');
          if (jsonObject) {
            const parsed = JSON.parse(jsonObject);
            keywords = parsed.keywords || (Array.isArray(parsed) ? parsed : []);
          }
        }
      } catch (parseError) {
        console.error('⚠️ Failed to parse keywords from string response:', parseError);
        keywords = [];
      }
    }

    console.log(`🔍 Gemini adapter - extracted ${keywords.length} keywords`);
    if (keywords.length > 0) {
      console.log(`🔍 Gemini adapter - first raw keyword:`, JSON.stringify(keywords[0], null, 2));
    }

    const mappedKeywords = keywords.map((k: any) => ({
      keyword: k.keyword || k.keyword_name || '',
      intent: k.intent || 'informational',
      relevance_score: k.relevance_score || k.relevanceScore || 0.5,
      reasoning: k.reasoning || undefined
    }));

    console.log(`🔍 Gemini adapter - mapped ${mappedKeywords.length} keywords`);
    if (mappedKeywords.length > 0) {
      console.log(`🔍 Gemini adapter - first mapped keyword:`, JSON.stringify(mappedKeywords[0], null, 2));
    }

    return {
      data: {
        keywords: mappedKeywords,
        total_generated: keywords.length,
        processing_time: response.processing_time,
        model_used: response.model || this.getModel()
      },
      usage: response.usage,
      model: response.model || this.getModel(),
      finish_reason: response.finish_reason || 'complete',
      request_id: response.request_id,
      processing_time: response.processing_time
    };
  }

  async classifyIntent(request: import('../types/llm-provider').LLMIntentClassification): Promise<import('../types/llm-provider').LLMResponse<import('../types/llm-provider').LLMIntentResult[]>> {
    const response = await this.client.classifyIntent({
      keywords: request.keywords,
      context: request.context
    });

    const results = Array.isArray(response.data) ? response.data : [];

    return {
      data: results.map((r: any) => ({
        keyword: r.keyword || '',
        intent: r.intent || 'informational',
        confidence: r.confidence || 0.5,
        reasoning: r.reasoning || undefined,
        suggested_content_type: r.suggested_content_type || undefined
      })),
      usage: response.usage,
      model: response.model || this.getModel(),
      finish_reason: response.finish_reason || 'complete',
      request_id: response.request_id,
      processing_time: response.processing_time
    };
  }

  async generateTitles(
    keyword: string,
    intent: string,
    options?: {
      content_type?: string;
      tone?: string;
      max_length?: number;
    }
  ): Promise<import('../types/llm-provider').LLMResponse<{ titles: Array<{ title: string; reasoning?: string; seo_score?: number }> }>> {
    const response = await this.client.generateTitles({
      keyword,
      intent,
      content_type: (options?.content_type as any) || 'blog_post',
      tone: (options?.tone as any) || 'professional',
      max_length: options?.max_length || 60,
      include_keyword: true
    });

    const titles = response.data?.titles || [];

    return {
      data: {
        titles: titles.map((t: any) => ({
          title: t.title || '',
          reasoning: t.reasoning || undefined,
          seo_score: t.seo_score || t.seoScore || 0.5
        }))
      },
      usage: response.usage,
      model: response.model || this.getModel(),
      finish_reason: response.finish_reason || 'complete',
      request_id: response.request_id,
      processing_time: response.processing_time
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; issues: string[]; metrics: any }> {
    return this.client.healthCheck();
  }

  getMetrics(): any {
    return this.client.getMetrics();
  }

  estimateCost(operation: 'expand' | 'classify' | 'titles', itemCount: number): {
    estimatedTokens: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  } {
    return this.client.estimateCost(operation, itemCount);
  }
}