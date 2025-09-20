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
    system: `You are an expert SEO keyword researcher. Generate high-quality, relevant keywords based on seed terms. Focus on commercial and informational intent keywords that a content marketing team could realistically target.
    
Consider:
- Search volume potential
- Commercial viability  
- Content creation feasibility
- Semantic relationship to seeds
- Intent diversity (70% informational, 20% commercial, 10% transactional)

Return exactly the requested number of keywords. Be specific and avoid generic terms.`,
    user: `Generate {target_count} keywords related to these seed terms: {seed_keywords}
    
Industry context: {industry}
Intent focus: {intent_focus}

Format as JSON array:
[{"keyword": "example keyword", "intent": "informational", "relevance_score": 0.85, "reasoning": "why this keyword is valuable"}]`,
    temperature: 0.2,
    max_tokens: 2000
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