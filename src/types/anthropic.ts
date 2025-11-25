// Anthropic API types for keyword research
export interface AnthropicPromptTemplate {
  name: string;
  system: string;
  user: string;
  temperature: number;
  max_tokens: number;
  stop_sequences?: string[];
}

export interface AnthropicKeywordExpansion {
  seed_keywords: string[];
  target_count: number;
  industry?: string;
  intent_focus?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  difficulty_preference?: 'easy' | 'medium' | 'hard' | 'mixed';
}

export interface AnthropicExpansionResult {
  keywords: Array<{
    keyword: string;
    intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
    relevance_score: number;
    reasoning: string;
  }>;
  total_generated: number;
  processing_time: number;
  model_used: string;
}

export interface AnthropicIntentClassification {
  keywords: string[];
  context?: {
    industry: string;
    business_type: string;
    target_audience: string;
  };
}

export interface AnthropicIntentResult {
  keyword: string;
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  confidence: number;
  reasoning: string;
  suggested_content_type: string[];
}

export interface AnthropicTitleGeneration {
  keyword: string;
  intent: string;
  content_type: 'blog_post' | 'landing_page' | 'product_page' | 'guide' | 'comparison';
  tone: 'professional' | 'casual' | 'authoritative' | 'friendly';
  max_length?: number;
  include_keyword?: boolean;
}

export interface AnthropicTitleResult {
  titles: Array<{
    title: string;
    reasoning: string;
    seo_score: number;
    click_appeal: number;
  }>;
  primary_recommendation: string;
}

export interface AnthropicClusterAnalysis {
  keywords: string[];
  cluster_method: 'semantic' | 'intent' | 'topic';
  target_clusters: number;
  industry_context?: string;
}

export interface AnthropicClusterResult {
  clusters: Array<{
    id: string;
    label: string;
    keywords: string[];
    primary_intent: string;
    confidence: number;
    suggested_content_pillar: string;
  }>;
  outliers: string[];
  confidence_score: number;
}

export interface AnthropicCompetitorAnalysis {
  competitor_titles: string[];
  our_keywords: string[];
  analysis_type: 'gap_analysis' | 'content_opportunities' | 'positioning';
}

export interface AnthropicCompetitorResult {
  opportunities: Array<{
    keyword: string;
    opportunity_type: 'content_gap' | 'better_targeting' | 'different_angle';
    reasoning: string;
    suggested_approach: string;
    difficulty_estimate: 'low' | 'medium' | 'high';
  }>;
  content_themes: string[];
  positioning_insights: string[];
}

// Usage tracking
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
  cost_estimate: number;
  request_id: string;
}

// Response wrapper
export interface AnthropicResponse<T> {
  data: T;
  usage: AnthropicUsage;
  model: string;
  finish_reason: string;
  request_id: string;
  processing_time: number;
}

// Prompt templates for different tasks
export const ANTHROPIC_PROMPTS = {
  DREAM_100_EXPANSION: {
    name: 'dream_100_expansion',
    system: `You are an expert SEO strategist generating "Dream 100" head terms - the core, high-volume keywords that anchor a content strategy.

CRITICAL REQUIREMENTS:
1. KEYWORD LENGTH: Each keyword MUST be 1-3 words maximum. No long-tail phrases.
2. HEAD TERMS ONLY: Focus on broad, foundational keywords with high search volume potential
3. COMMERCIAL VALUE: Prioritize keywords with business/buying intent

Examples of GOOD Dream 100 keywords:
- "private equity" (2 words, high volume head term)
- "PE software" (2 words, commercial intent)
- "deal sourcing" (2 words, industry specific)
- "portfolio management" (2 words, broad term)

Examples of BAD keywords (too long/specific):
- "best private equity software for small firms" (too long)
- "how to source deals in private equity" (too long, long-tail)
- "private equity portfolio management best practices" (too long)

Intent distribution for Dream 100:
- 40% transactional (ready to buy/act)
- 35% commercial (researching solutions)
- 20% informational (learning about topic)
- 5% navigational (brand/tool names)

Return exactly {target_count} keywords. Every keyword must be 1-3 words.`,
    user: `Generate {target_count} Dream 100 HEAD TERMS (1-3 words each) related to: {seed_keywords}

Industry: {industry}
Intent focus: {intent_focus}

REMEMBER: Maximum 3 words per keyword. These are foundational head terms, not long-tail phrases.

Format as JSON array:
[{"keyword": "example term", "intent": "commercial", "relevance_score": 0.85, "reasoning": "brief reason"}]`,
    temperature: 0.2,
    max_tokens: 8000
  },
  
  INTENT_CLASSIFICATION: {
    name: 'intent_classification',
    system: `You are an expert at classifying search intent. Analyze keywords and determine their primary search intent:
    
- Informational: Users seeking information, answers, how-tos
- Commercial: Users researching products/services before buying  
- Transactional: Users ready to purchase or take action
- Navigational: Users looking for specific websites/brands

Consider the business context and typical user behavior.`,
    user: `Classify the search intent for these keywords: {keywords}

Business context: {context}

Format as JSON array:
[{"keyword": "example", "intent": "commercial", "confidence": 0.9, "reasoning": "why", "suggested_content_type": ["landing page", "comparison"]}]`,
    temperature: 0.1,
    max_tokens: 1500
  },
  
  TITLE_GENERATION: {
    name: 'title_generation',
    system: `You are an expert copywriter creating compelling, SEO-optimized titles. Generate titles that:
    
- Include the target keyword naturally
- Match the search intent
- Encourage clicks while being accurate
- Follow SEO best practices
- Fit the specified content type and tone

Balance SEO optimization with user appeal.`,
    user: `Generate 5 compelling titles for:
Keyword: {keyword}
Intent: {intent}
Content type: {content_type}
Tone: {tone}
Max length: {max_length} characters

Format as JSON:
{"titles": [{"title": "example", "reasoning": "why effective", "seo_score": 8, "click_appeal": 9}], "primary_recommendation": "best title"}`,
    temperature: 0.3,
    max_tokens: 1000
  }
} as const;