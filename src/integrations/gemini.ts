import { BaseApiClient } from './base-client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  AnthropicKeywordExpansion,
  AnthropicExpansionResult,
  AnthropicIntentClassification,
  AnthropicIntentResult,
  AnthropicTitleGeneration,
  AnthropicTitleResult,
  AnthropicResponse,
  AnthropicUsage,
  ANTHROPIC_PROMPTS
} from '../types/anthropic';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

// Default Gemini model - can be overridden via GEMINI_MODEL env var
// Available models: gemini-1.5-pro, gemini-1.5-flash, gemini-pro
export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

export class GeminiClient extends BaseApiClient {
  private static instance: GeminiClient | null = null;
  private genAI: GoogleGenerativeAI;
  private model: any;
  private readonly costPerToken = 0.000000125; // Gemini 1.5 Pro input cost per token (approximate)
  private readonly outputCostPerToken = 0.0000005; // Output cost per token (approximate)
  
  constructor(apiKey: string, redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey,
      timeout: 600000, // 10 minutes for LLM requests
      retries: 2,
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
        ttl: 24 * 60 * 60 * 1000, // 1 day
        maxSize: 5000
      }
    };
    
    super(config, 'gemini');
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: DEFAULT_GEMINI_MODEL,
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 16384, // Increased to handle large keyword lists without truncation
      }
    });
    
    // Override with factory-created instances
    this.rateLimiter = RateLimiterFactory.createAnthropicLimiter(redis); // Reuse Anthropic limiter config
    this.circuitBreaker = CircuitBreakerFactory.createAnthropicBreaker(); // Reuse Anthropic breaker config
  }
  
  public static getInstance(apiKey?: string, redis?: any): GeminiClient {
    if (!this.instance) {
      if (!apiKey) {
        throw new Error('API key is required to create GeminiClient instance');
      }
      this.instance = new GeminiClient(apiKey, redis);
    }
    return this.instance;
  }
  
  protected getDefaultHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
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
    // We use the official Gemini SDK instead of raw fetch
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
    
    // Combine system and user prompt for Gemini (it doesn't have separate system messages)
    const fullPrompt = `${prompt.system}\n\n${userPrompt}`;
    
    return await RetryHandler.withRetry(
      () => this.makeLLMRequest<AnthropicExpansionResult>(
        fullPrompt,
        {
          temperature: prompt.temperature,
          maxTokens: prompt.max_tokens,
          cacheKey,
          operation: 'keyword_expansion'
        }
      ),
      {
        maxAttempts: 2,
        provider: 'gemini',
        onRetry: (error, attempt) => {
          Sentry.addBreadcrumb({
            message: `Retrying Gemini keyword expansion (attempt ${attempt})`,
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
    
    const fullPrompt = `${prompt.system}\n\n${userPrompt}`;
    
    return await this.makeLLMRequest<AnthropicIntentResult[]>(
      fullPrompt,
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
    
    const fullPrompt = `${prompt.system}\n\n${userPrompt}`;
    
    return await this.makeLLMRequest<AnthropicTitleResult>(
      fullPrompt,
      {
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
        cacheKey,
        operation: 'title_generation'
      }
    );
  }
  
  /**
   * Core LLM request method using Gemini SDK
   */
  private async makeLLMRequest<T>(
    prompt: string,
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
    
    // Rate limiting
    const canProceed = this.checkGeminiRateLimit();
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
      // Update model generation config for this request
      // Ensure maxOutputTokens is at least 16384 for keyword expansion to avoid truncation
      const effectiveMaxTokens = Math.max(maxTokens, 16384);
      const requestModel = this.genAI.getGenerativeModel({ 
        model: DEFAULT_GEMINI_MODEL,
        generationConfig: {
          temperature,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: effectiveMaxTokens,
        }
      });
      
      const response = await this.circuitBreaker.execute(async () => {
        const result = await requestModel.generateContent(prompt);
        return result.response;
      });
      
      const processingTime = Date.now() - startTime;
      
      // Parse the response content
      let parsedData: T;
      const text = response.text();
      
      // Log raw response for debugging (first 500 chars)
      console.log(`🔍 Gemini raw response (first 500 chars): ${text.substring(0, 500)}`);
      
      try {
        // First, try to extract JSON from markdown code blocks (Gemini often wraps JSON in ```json)
        let jsonText = text.trim();
        
        // Remove markdown code blocks if present - use greedy match to get everything
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*)/);
        if (codeBlockMatch) {
          // Extract everything after ```json, then remove trailing ```
          jsonText = codeBlockMatch[1].replace(/```\s*$/, '').trim();
        }
        
        // Try to parse as JSON first
        parsedData = JSON.parse(jsonText) as T;
        console.log(`✅ Successfully parsed JSON from code block: type=${typeof parsedData}, isArray=${Array.isArray(parsedData)}`);
      } catch (parseError) {
        console.log(`⚠️ Direct JSON parse failed (${(parseError as Error).message}), trying balanced bracket matching...`);
        // If direct JSON parse fails, try to extract JSON from the text using balanced bracket matching
        try {
          // Helper function to find balanced JSON array/object (handles incomplete JSON)
          const findBalancedJSON = (str: string, startChar: string, endChar: string, allowIncomplete: boolean = false): string | null => {
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
            
            // If incomplete JSON is allowed and we found a start, return what we have
            if (allowIncomplete && startIdx !== -1 && depth > 0) {
              // Try to complete the JSON by adding closing brackets
              let result = str.substring(startIdx);
              for (let i = 0; i < depth; i++) {
                result += endChar;
              }
              return result;
            }
            
            return null;
          };
          
          // Try to find JSON array first (most common for keyword expansion)
          // Look for array in the raw text (might be in code block or not)
          let jsonArray = findBalancedJSON(text, '[', ']', false);
          if (!jsonArray) {
            // Try with incomplete JSON handling (for MAX_TOKENS truncation)
            jsonArray = findBalancedJSON(text, '[', ']', true);
          }
          
          if (jsonArray) {
            try {
              parsedData = JSON.parse(jsonArray) as T;
              console.log(`✅ Successfully parsed JSON array: length=${Array.isArray(parsedData) ? (parsedData as any[]).length : 'N/A'}`);
            } catch (arrayParseError) {
              // If array parse fails (likely due to truncation), try to extract complete objects from incomplete array
              console.log(`⚠️ Array parse failed (${(arrayParseError as Error).message}), trying to extract complete objects from incomplete JSON...`);
              
              // Better regex to match complete JSON objects (handles nested objects)
              const objectMatches: string[] = [];
              let currentObject = '';
              let braceDepth = 0;
              let inString = false;
              let escapeNext = false;
              
              for (let i = 0; i < jsonArray.length; i++) {
                const char = jsonArray[i];
                
                if (escapeNext) {
                  currentObject += char;
                  escapeNext = false;
                  continue;
                }
                
                if (char === '\\') {
                  escapeNext = true;
                  currentObject += char;
                  continue;
                }
                
                if (char === '"' && !escapeNext) {
                  inString = !inString;
                  currentObject += char;
                  continue;
                }
                
                if (!inString) {
                  if (char === '{') {
                    if (braceDepth === 0) {
                      currentObject = '{';
                    } else {
                      currentObject += char;
                    }
                    braceDepth++;
                  } else if (char === '}') {
                    currentObject += char;
                    braceDepth--;
                    if (braceDepth === 0) {
                      objectMatches.push(currentObject);
                      currentObject = '';
                    }
                  } else {
                    if (braceDepth > 0) {
                      currentObject += char;
                    }
                  }
                } else {
                  currentObject += char;
                }
              }
              
              if (objectMatches.length > 0) {
                const completeObjects = objectMatches
                  .map(match => {
                    try {
                      return JSON.parse(match);
                    } catch {
                      return null;
                    }
                  })
                  .filter(obj => obj !== null && obj.keyword);
                
                if (completeObjects.length > 0) {
                  parsedData = completeObjects as any as T;
                  console.log(`✅ Extracted ${completeObjects.length} complete objects from incomplete JSON array`);
                } else {
                  throw arrayParseError;
                }
              } else {
                throw arrayParseError;
              }
            }
          } else {
            // Try to find JSON object
            const jsonObject = findBalancedJSON(text, '{', '}');
            if (jsonObject) {
              parsedData = JSON.parse(jsonObject) as T;
            } else {
              // If no JSON found, return as text (will be handled by adapter)
              console.warn('⚠️ Gemini response is not valid JSON, returning as text');
              parsedData = text as any as T;
            }
          }
        } catch (extractError) {
          // If JSON extraction also fails, return as text
          console.warn('⚠️ Failed to extract JSON from Gemini response:', extractError);
          parsedData = text as any as T;
        }
      }
      
      // Log parsed data type for debugging
      console.log(`🔍 Gemini parsed data type: ${typeof parsedData}, isArray: ${Array.isArray(parsedData)}`);
      
      // Calculate usage and cost
      // Gemini provides usage info in response.candidates[0].tokenCount or we estimate
      const candidate = response.candidates?.[0];
      const usageMetadata = (response as any).usageMetadata;
      
      let inputTokens = 0;
      let outputTokens = 0;
      
      if (usageMetadata) {
        inputTokens = usageMetadata.promptTokenCount || 0;
        outputTokens = usageMetadata.candidatesTokenCount || 0;
      } else {
        // Fallback estimation if usage metadata not available
        inputTokens = Math.ceil(prompt.length / 4); // Rough estimate: 4 chars per token
        outputTokens = Math.ceil(text.length / 4);
      }
      
      const usage: AnthropicUsage = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        model: DEFAULT_GEMINI_MODEL,
        cost_estimate: this.calculateCost(inputTokens, outputTokens),
        request_id: `gemini_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      };
      
      const finishReason = candidate?.finishReason || 
                          (candidate?.finishMessage ? 'stop' : 'complete');
      
      const result: AnthropicResponse<T> = {
        data: parsedData,
        usage,
        model: DEFAULT_GEMINI_MODEL,
        finish_reason: finishReason,
        request_id: usage.request_id,
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
      enhancedError.provider = 'gemini';
      enhancedError.operation = operation;
      enhancedError.context = {
        prompt: prompt.substring(0, 100) + '...'
      };
      throw enhancedError;
    }
  }
  
  private calculateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * this.costPerToken) + (outputTokens * this.outputCostPerToken);
  }
  
  private checkGeminiRateLimit(): boolean {
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
    const event = {
      provider: 'gemini' as any,
      endpoint,
      method,
      status,
      responseTime,
      cost,
      cached,
      timestamp: Date.now()
    };
    
    // Track via Sentry
  }
  
  /**
   * Expand keywords using semantic variations - universe service compatibility
   */
  async expandKeywords(
    request: AnthropicKeywordExpansion
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    return this.expandToDream100(request);
  }
  
  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; issues: string[]; metrics: any }> {
    const baseHealth = await super.healthCheck();
    return {
      healthy: baseHealth.healthy,
      issues: baseHealth.issues,
      metrics: baseHealth.metrics
    };
  }
  
  /**
   * Estimate cost for an operation
   */
  estimateCost(operation: 'expand' | 'classify' | 'titles', itemCount: number): {
    estimatedTokens: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  } {
    // Rough estimates based on operation type
    let inputTokens = 0;
    let outputTokens = 0;
    
    switch (operation) {
      case 'expand':
        inputTokens = 500 + (itemCount * 10);
        outputTokens = itemCount * 50;
        break;
      case 'classify':
        inputTokens = 200 + (itemCount * 5);
        outputTokens = itemCount * 10;
        break;
      case 'titles':
        inputTokens = 100 + (itemCount * 5);
        outputTokens = itemCount * 30;
        break;
    }
    
    const estimatedDollars = this.calculateCost(inputTokens, outputTokens);
    
    return {
      estimatedTokens: inputTokens + outputTokens,
      estimatedDollars,
      breakdown: {
        inputTokens,
        outputTokens,
        inputCost: inputTokens * this.costPerToken,
        outputCost: outputTokens * this.outputCostPerToken
      }
    };
  }
}
