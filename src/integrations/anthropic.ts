import { BaseApiClient } from './base-client';
import Anthropic from '@anthropic-ai/sdk';
import { 
  AnthropicKeywordExpansion,
  AnthropicExpansionResult,
  AnthropicIntentClassification,
  AnthropicIntentResult,
  AnthropicTitleGeneration,
  AnthropicTitleResult,
  AnthropicClusterAnalysis,
  AnthropicClusterResult,
  AnthropicCompetitorAnalysis,
  AnthropicCompetitorResult,
  AnthropicResponse,
  AnthropicUsage,
  ANTHROPIC_PROMPTS
} from '../types/anthropic';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

// Default Anthropic model - can be overridden via ANTHROPIC_MODEL env var
// Available models: claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307
export const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

export class AnthropicClient extends BaseApiClient {
  private static instance: AnthropicClient | null = null;
  private anthropic: Anthropic;
  private readonly costPerToken = 0.000008; // Claude 3.5 Sonnet input cost per token
  private readonly outputCostPerToken = 0.000024; // Output cost per token
  
  constructor(apiKey: string, redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: 'https://api.anthropic.com',
      apiKey,
      timeout: 600000, // 10 minutes for LLM requests (Dream 100 generation can take a while)
      retries: 2, // Fewer retries for expensive LLM calls
      rateLimiter: {
        capacity: 50,
        refillRate: 10,
        refillPeriod: 60000 // 1 minute
      },
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 30000,
        monitoringPeriod: 180000,
        expectedFailureRate: 0.05
      },
      cache: {
        ttl: 24 * 60 * 60 * 1000, // 1 day - shorter for LLM responses
        maxSize: 5000
      }
    };
    
    super(config, 'anthropic');
    
    this.anthropic = new Anthropic({
      apiKey,
      timeout: config.timeout,
      maxRetries: 0 // We handle retries ourselves
    });
    
    // Override with factory-created instances
    this.rateLimiter = RateLimiterFactory.createAnthropicLimiter(redis);
    this.circuitBreaker = CircuitBreakerFactory.createAnthropicBreaker();
  }
  
  public static getInstance(apiKey?: string, redis?: any): AnthropicClient {
    if (!this.instance) {
      if (!apiKey) {
        throw new Error('API key is required to create AnthropicClient instance');
      }
      this.instance = new AnthropicClient(apiKey, redis);
    }
    return this.instance;
  }
  
  protected getDefaultHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-beta': 'messages-2023-12-15'
    };
  }
  
  protected async executeRequest<T>(
    endpoint: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: any;
      timeout: number;
    }
  ): Promise<ApiResponse<T>> {
    // We use the official Anthropic SDK instead of raw fetch
    // This method is overridden to work with our SDK-based approach
    throw new Error('Use SDK-based methods instead of executeRequest');
  }
  
  /**
   * Generate Dream 100 keywords from seed terms
   */
  async expandToDream100(
    request: AnthropicKeywordExpansion
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    const { seed_keywords, target_count, industry, intent_focus } = request;
    
    if (seed_keywords.length === 0) {
      throw new Error('At least one seed keyword is required');
    }
    
    if (target_count > 150) {
      throw new Error('Maximum 150 keywords per expansion to maintain quality and avoid token limits');
    }
    
    const cacheKey = `expansion:${target_count}:${intent_focus}:${seed_keywords.sort().join(',')}`;
    
    const prompt = ANTHROPIC_PROMPTS.DREAM_100_EXPANSION;
    const userPrompt = prompt.user
      .replace('{target_count}', target_count.toString())
      .replace('{seed_keywords}', seed_keywords.join(', '))
      .replace('{industry}', industry || 'general business')
      .replace('{intent_focus}', intent_focus || 'mixed');
    
    return await RetryHandler.withRetry(
      () => this.makeLLMRequest<AnthropicExpansionResult>(
        prompt.system,
        userPrompt,
        {
          temperature: prompt.temperature,
          maxTokens: prompt.max_tokens,
          cacheKey,
          operation: 'keyword_expansion'
        }
      ),
      {
        maxAttempts: 2,
        provider: 'anthropic',
        onRetry: (error, attempt) => {
          Sentry.addBreadcrumb({
            message: `Retrying Anthropic keyword expansion (attempt ${attempt})`,
            level: 'warning',
            data: { seedCount: seed_keywords.length, targetCount: target_count, error: error.message }
          });
        }
      }
    );
  }
  
  /**
   * Classify search intent for keywords
   */
  async classifyIntent(
    request: AnthropicIntentClassification
  ): Promise<AnthropicResponse<AnthropicIntentResult[]>> {
    const { keywords, context } = request;
    
    if (keywords.length === 0) {
      throw new Error('At least one keyword is required');
    }
    
    if (keywords.length > 500) {
      throw new Error('Maximum 500 keywords per classification request');
    }
    
    const cacheKey = `intent:${keywords.sort().join(',')}:${JSON.stringify(context || {})}`;
    
    const prompt = ANTHROPIC_PROMPTS.INTENT_CLASSIFICATION;
    const userPrompt = prompt.user
      .replace('{keywords}', keywords.join(', '))
      .replace('{context}', JSON.stringify(context || {}));
    
    return await this.makeLLMRequest<AnthropicIntentResult[]>(
      prompt.system,
      userPrompt,
      {
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
        cacheKey,
        operation: 'intent_classification'
      }
    );
  }
  
  /**
   * Generate compelling titles for keywords
   */
  async generateTitles(
    request: AnthropicTitleGeneration
  ): Promise<AnthropicResponse<AnthropicTitleResult>> {
    const { keyword, intent, content_type, tone, max_length = 60, include_keyword = true } = request;
    
    const cacheKey = `titles:${keyword}:${intent}:${content_type}:${tone}`;
    
    const prompt = ANTHROPIC_PROMPTS.TITLE_GENERATION;
    const userPrompt = prompt.user
      .replace('{keyword}', keyword)
      .replace('{intent}', intent)
      .replace('{content_type}', content_type)
      .replace('{tone}', tone)
      .replace('{max_length}', max_length.toString());
    
    return await this.makeLLMRequest<AnthropicTitleResult>(
      prompt.system,
      userPrompt,
      {
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
        cacheKey,
        operation: 'title_generation'
      }
    );
  }
  
  /**
   * Perform semantic clustering of keywords
   */
  async clusterKeywords(
    request: AnthropicClusterAnalysis
  ): Promise<AnthropicResponse<AnthropicClusterResult>> {
    const { keywords, cluster_method, target_clusters, industry_context } = request;
    
    if (keywords.length < 10) {
      throw new Error('At least 10 keywords required for meaningful clustering');
    }
    
    if (keywords.length > 1000) {
      throw new Error('Maximum 1000 keywords per clustering request');
    }
    
    const cacheKey = `cluster:${cluster_method}:${target_clusters}:${keywords.sort().join(',')}`;
    
    const systemPrompt = `You are an expert SEO strategist specializing in semantic keyword clustering. Analyze keywords and group them into meaningful clusters based on ${cluster_method} similarity.
    
Consider:
- Search intent alignment
- Topic similarity  
- Content pillar potential
- User journey stages
- Commercial value

Create ${target_clusters} distinct clusters with clear, descriptive labels. Each cluster should represent a coherent content theme.`;
    
    const userPrompt = `Analyze and cluster these keywords using ${cluster_method} method:

Keywords: ${keywords.join(', ')}

Industry context: ${industry_context || 'general business'}
Target clusters: ${target_clusters}

Format as JSON:
{
  "clusters": [
    {
      "id": "cluster_1",
      "label": "descriptive cluster name",
      "keywords": ["keyword1", "keyword2"],
      "primary_intent": "informational/commercial/transactional",
      "confidence": 0.85,
      "suggested_content_pillar": "content strategy recommendation"
    }
  ],
  "outliers": ["keywords that don't fit well"],
  "confidence_score": 0.90
}`;
    
    return await this.makeLLMRequest<AnthropicClusterResult>(
      systemPrompt,
      userPrompt,
      {
        temperature: 0.2,
        maxTokens: 2000,
        cacheKey,
        operation: 'keyword_clustering'
      }
    );
  }
  
  /**
   * Analyze competitor content for opportunities
   */
  async analyzeCompetitors(
    request: AnthropicCompetitorAnalysis
  ): Promise<AnthropicResponse<AnthropicCompetitorResult>> {
    const { competitor_titles, our_keywords, analysis_type } = request;
    
    if (competitor_titles.length === 0) {
      throw new Error('At least one competitor title is required');
    }
    
    const cacheKey = `competitor:${analysis_type}:${our_keywords.sort().join(',')}:${competitor_titles.length}`;
    
    const systemPrompt = `You are a competitive intelligence analyst specializing in SEO and content strategy. Analyze competitor content to identify opportunities and gaps.
    
Focus on:
- Content gaps we can fill
- Better targeting opportunities  
- Unique positioning angles
- Difficulty assessments
- Strategic recommendations

Provide actionable insights that can drive content strategy decisions.`;
    
    const userPrompt = `Perform ${analysis_type} analysis:

Our target keywords: ${our_keywords.join(', ')}

Competitor titles:
${competitor_titles.map((title, i) => `${i + 1}. ${title}`).join('\n')}

Analysis type: ${analysis_type}

Format as JSON:
{
  "opportunities": [
    {
      "keyword": "target keyword",
      "opportunity_type": "content_gap|better_targeting|different_angle",
      "reasoning": "why this is an opportunity",
      "suggested_approach": "content strategy recommendation",
      "difficulty_estimate": "low|medium|high"
    }
  ],
  "content_themes": ["overarching themes to explore"],
  "positioning_insights": ["strategic positioning recommendations"]
}`;
    
    return await this.makeLLMRequest<AnthropicCompetitorResult>(
      systemPrompt,
      userPrompt,
      {
        temperature: 0.3,
        maxTokens: 1500,
        cacheKey,
        operation: 'competitor_analysis'
      }
    );
  }
  
  /**
   * Core LLM request method using Anthropic SDK
   */
  private async makeLLMRequest<T>(
    systemPrompt: string,
    userPrompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      cacheKey?: string;
      operation?: string;
    } = {}
  ): Promise<AnthropicResponse<T>> {
    const {
      temperature = 0.2,
      maxTokens = 1500,
      cacheKey,
      operation = 'llm_request'
    } = options;
    
    // Check cache first
    if (cacheKey) {
      const cached = this.getLLMCache(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          usage: cached.usage,
          model: cached.model,
          finish_reason: 'cached',
          request_id: `cached_${Date.now()}`,
          processing_time: 0
        };
      }
    }
    
    // Rate limiting - use tryConsume directly
    const canProceed = this.checkAnthropicRateLimit();
    if (!canProceed) {
      this.metrics.rateLimitHits++;
      const rateLimitInfo = {
        limit: (this.rateLimiter as any).config?.capacity || 0,
        remaining: this.rateLimiter.getRemainingTokens(),
        reset: Math.ceil(this.rateLimiter.getNextRefillTime() / 1000),
        retryAfter: Math.ceil((this.rateLimiter.getNextRefillTime() - Date.now()) / 1000)
      };
      
      const error = new Error('Rate limit exceeded') as any;
      error.code = 'RATE_LIMIT_ERROR';
      error.statusCode = 429;
      error.retryable = true;
      error.rateLimit = rateLimitInfo;
      throw error;
    }
    
    const startTime = Date.now();
    
    try {
      const response = await this.circuitBreaker.execute(async () => {
        return await this.anthropic.messages.create({
          model: DEFAULT_ANTHROPIC_MODEL,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature,
          max_tokens: maxTokens
        });
      });
      
      const processingTime = Date.now() - startTime;
      
      // Parse the response content
      let parsedData: T;
      const content = response.content[0];
      
      if (content.type === 'text') {
        try {
          // Try to parse as JSON first
          parsedData = JSON.parse(content.text) as T;
        } catch (parseError) {
          // If direct JSON parse fails, try to extract JSON from the text
          try {
            const jsonMatch = content.text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              parsedData = JSON.parse(jsonMatch[0]) as T;
            } else {
              // If no JSON array found, return as text
              parsedData = content.text as any as T;
            }
          } catch (extractError) {
            // If JSON extraction also fails, return as text
            parsedData = content.text as any as T;
          }
        }
      } else {
        throw new Error('Unexpected response content type');
      }
      
      // Calculate usage and cost
      const usage: AnthropicUsage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        model: response.model,
        cost_estimate: this.calculateCost(response.usage.input_tokens, response.usage.output_tokens),
        request_id: response.id
      };
      
      const result: AnthropicResponse<T> = {
        data: parsedData,
        usage,
        model: response.model,
        finish_reason: response.stop_reason || 'complete',
        request_id: response.id,
        processing_time: processingTime
      };
      
      // Cache successful responses
      if (cacheKey) {
        this.setLLMCache(cacheKey, result);
      }
      
      // Update metrics
      this.updateLLMMetrics(true, processingTime, usage.cost_estimate);
      this.trackLLMUsage(operation, 'POST', 200, processingTime, usage.cost_estimate, false);
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Circuit breaker tracking
      if ((error as Error).message?.includes('Circuit breaker')) {
        this.metrics.circuitBreakerTrips++;
      }
      
      this.updateLLMMetrics(false, processingTime, 0);
      this.trackLLMUsage(operation, 'POST', 500, processingTime, 0, false);
      
      const enhancedError = error as any;
      enhancedError.provider = 'anthropic';
      enhancedError.operation = operation;
      enhancedError.context = {
        systemPrompt: systemPrompt.substring(0, 100) + '...',
        userPrompt: userPrompt.substring(0, 100) + '...'
      };
      throw enhancedError;
    }
  }
  
  private calculateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * this.costPerToken) + (outputTokens * this.outputCostPerToken);
  }
  
  private checkAnthropicRateLimit(): boolean {
    return this.rateLimiter.tryConsume();
  }
  
  private getLLMCache(key: string): any | null {
    const cached = (this.cache as any).get(key);
    if (cached && Date.now() < cached.timestamp + cached.ttl) {
      return cached.data;
    }
    return null;
  }
  
  private setLLMCache(key: string, data: any): void {
    (this.cache as any).set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.config.cache?.ttl || 24 * 60 * 60 * 1000
    });
  }
  
  private updateLLMMetrics(success: boolean, responseTime: number, cost: number): void {
    this.metrics.requests++;
    this.metrics.lastRequest = Date.now();
    this.metrics.totalCost += cost;
    
    if (success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
    }
    
    // Update average response time (exponential moving average)
    const alpha = 0.1;
    this.metrics.avgResponseTime = 
      this.metrics.avgResponseTime * (1 - alpha) + responseTime * alpha;
  }
  
  private trackLLMUsage(
    endpoint: string,
    method: string,
    status: number,
    responseTime: number,
    cost: number,
    cached: boolean
  ): void {
    // Implementation matches base class pattern
    const event = {
      provider: 'anthropic' as const,
      endpoint,
      method,
      status,
      responseTime,
      cost,
      cached,
      timestamp: Date.now()
    };
    
    // Track via Sentry (implementation in base class handles this)
  }
  
  /**
   * Process large keyword lists in batches
   */
  async processKeywordsBatch<T>(
    keywords: string[],
    operation: 'classify' | 'expand' | 'cluster',
    options: {
      batchSize?: number;
      onProgress?: (processed: number, total: number) => void;
      onBatchComplete?: (result: any, batchIndex: number) => void;
      context?: any;
    } = {}
  ): Promise<T[]> {
    const {
      batchSize = operation === 'classify' ? 100 : 50,
      onProgress,
      onBatchComplete,
      context = {}
    } = options;
    
    const results: T[] = [];
    const batches = this.chunkArray(keywords, batchSize);
    
    Sentry.addBreadcrumb({
      message: `Processing ${keywords.length} keywords with ${operation} in ${batches.length} batches`,
      level: 'info',
      category: 'anthropic-batch',
      data: { total: keywords.length, batches: batches.length, operation }
    });
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        let batchResult;
        
        switch (operation) {
          case 'classify':
            const classifyResponse = await this.classifyIntent({
              keywords: batch,
              context
            });
            batchResult = classifyResponse.data;
            break;
          
          case 'cluster':
            if (batch.length < 10) {
              console.warn(`Skipping cluster batch ${i + 1} - insufficient keywords (${batch.length})`);
              continue;
            }
            const clusterResponse = await this.clusterKeywords({
              keywords: batch,
              cluster_method: 'semantic',
              target_clusters: Math.min(Math.ceil(batch.length / 10), 10),
              industry_context: context.industry
            });
            batchResult = clusterResponse.data;
            break;
            
          default:
            throw new Error(`Unsupported batch operation: ${operation}`);
        }
        
        if (batchResult) {
          results.push(batchResult as T);
          
          if (onBatchComplete) {
            onBatchComplete(batchResult, i);
          }
        }
        
        if (onProgress) {
          onProgress(i + 1, batches.length);
        }
        
        // Add delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
        
      } catch (error) {
        Sentry.captureException(error, {
          tags: { operation, batchIndex: i, batchSize: batch.length },
          extra: { keywords: batch.slice(0, 5) } // Only log first 5 keywords for privacy
        });
        
        console.warn(`Batch ${i + 1}/${batches.length} failed for ${operation}:`, (error as Error).message);
        // Continue with other batches
      }
    }
    
    return results;
  }
  
  /**
   * Estimate cost for operations
   */
  estimateCost(
    operation: 'expand' | 'classify' | 'cluster' | 'titles' | 'competitor',
    itemCount: number
  ): {
    estimatedTokens: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  } {
    const tokenEstimates = {
      expand: itemCount * 150,      // ~150 tokens per keyword expansion
      classify: itemCount * 50,     // ~50 tokens per keyword classification
      cluster: itemCount * 100,     // ~100 tokens per keyword clustering
      titles: itemCount * 80,       // ~80 tokens per title generation
      competitor: itemCount * 200   // ~200 tokens per competitor analysis
    };
    
    const inputTokens = tokenEstimates[operation] || itemCount * 100;
    const outputTokens = inputTokens * 0.3; // Estimate 30% output ratio
    
    const cost = this.calculateCost(inputTokens, outputTokens);
    
    return {
      estimatedTokens: inputTokens + outputTokens,
      estimatedDollars: cost,
      breakdown: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        input_cost: inputTokens * this.costPerToken,
        output_cost: outputTokens * this.outputCostPerToken
      }
    };
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Backward compatibility aliases for cache adapters
  async generateDream100(
    seedKeywords: string[],
    industry?: string,
    targetAudience?: string,
    market: string = 'US'
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    const request: AnthropicKeywordExpansion = {
      seed_keywords: seedKeywords,
      target_count: 100,
      industry: industry || 'general business',
      intent_focus: 'informational' as const
    };
    return this.expandToDream100(request);
  }

  async classifyKeywordIntents(
    keywords: string[]
  ): Promise<AnthropicResponse<AnthropicIntentResult[]>> {
    const request: AnthropicIntentClassification = {
      keywords,
      context: {
        industry: 'general business',
        business_type: 'B2B/B2C',
        target_audience: 'business decision makers'
      }
    };
    return this.classifyIntent(request);
  }

  async generateContentTitles(
    keywords: string[],
    intent: string,
    count: number = 5
  ): Promise<AnthropicResponse<AnthropicTitleResult>> {
    // Generate titles for the first keyword as representative
    const keyword = keywords[0] || '';
    const request: AnthropicTitleGeneration = {
      keyword,
      intent,
      content_type: 'blog_post',
      tone: 'professional',
      max_length: 60
    };
    return this.generateTitles(request);
  }

  async expandKeywordVariations(
    baseKeywords: string[],
    variationType: 'tier2' | 'tier3',
    count: number = 10,
    market: string = 'US'
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    const request: AnthropicKeywordExpansion = {
      seed_keywords: baseKeywords,
      target_count: count,
      industry: 'general business',
      intent_focus: 'informational' as const
    };
    return this.expandToDream100(request);
  }

  async processPrompt(
    prompt: string,
    model: string = DEFAULT_ANTHROPIC_MODEL,
    temperature: number = 0.1,
    maxTokens: number = 1000
  ): Promise<AnthropicResponse<string>> {
    return this.makeLLMRequest<string>(
      'You are a helpful assistant.',
      prompt,
      {
        temperature,
        maxTokens,
        operation: 'process_prompt'
      }
    );
  }

  async createCompletionStream(
    prompt: string,
    options?: any
  ): Promise<any> {
    // Streaming not implemented in this version
    throw new Error('Streaming completions not implemented');
  }

  async createChatCompletion(
    messages: any[],
    options?: any
  ): Promise<AnthropicResponse<any>> {
    // Convert messages to single prompt for now
    const prompt = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
    return this.processPrompt(prompt, options?.model, options?.temperature, options?.max_tokens);
  }
  
  // Usage tracking method
  getUsage(): { tokens: number; cost: number } {
    return {
      tokens: this.metrics.requests,
      cost: this.metrics.totalCost
    };
  }
  
  /**
   * Expand keywords using semantic variations - universe service compatibility
   */
  async expandKeywords(
    request: AnthropicKeywordExpansion
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    return this.expandToDream100(request);
  }
}