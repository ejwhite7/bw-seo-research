/**
 * Ingestion Service Helper Utilities
 * 
 * Utility functions to support the ingestion service with common operations
 * like keyword normalization, validation, and formatting.
 */

// Types
type KeywordString = string;

/**
 * Normalize a keyword string for consistency
 */
export function normalizeKeyword(keyword: string): KeywordString {
  return keyword
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s-]/g, ''); // Remove special characters except hyphens
}

/**
 * Validate keyword quality and format
 */
export function validateKeywordQuality(keyword: string): {
  isValid: boolean;
  reasons: string[];
  score: number;
} {
  const reasons: string[] = [];
  const normalized = keyword.trim();
  
  // Length checks
  if (normalized.length === 0) {
    reasons.push('Keyword cannot be empty');
  } else if (normalized.length < 2) {
    reasons.push('Keyword too short (minimum 2 characters)');
  } else if (normalized.length > 100) {
    reasons.push('Keyword too long (maximum 100 characters)');
  }
  
  // Content quality checks
  if (/^[\d\s]*$/.test(normalized)) {
    reasons.push('Keyword cannot be only numbers');
  }
  
  if (/^[\W\s]*$/.test(normalized)) {
    reasons.push('Keyword cannot be only special characters');
  }
  
  // Word count check
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount > 10) {
    reasons.push('Keyword has too many words (maximum 10)');
  }
  
  // Common spam patterns
  const spamPatterns = [
    /^(buy|sale|cheap|free|best|top)\s*\d*$/i,
    /^\w{1,2}$/,
    /^\d+$/
  ];
  
  for (const pattern of spamPatterns) {
    if (pattern.test(normalized)) {
      reasons.push('Keyword appears to be spam or low quality');
      break;
    }
  }
  
  // Calculate score based on validity and quality factors
  let score = 0.5; // Base score
  
  if (reasons.length === 0) {
    score = 0.9; // High score for valid keywords
  } else {
    // Reduce score based on number of issues
    score = Math.max(0.1, 0.9 - (reasons.length * 0.2));
  }
  
  // Bonus for good length
  if (normalized.length >= 10 && normalized.length <= 50) {
    score += 0.05;
  }
  
  // Bonus for multiple words (reuse wordCount from above)
  // const wordCount = normalized.split(/\s+/).length; // Already calculated above
  if (wordCount >= 2 && wordCount <= 5) {
    score += 0.05;
  }
  
  return {
    isValid: reasons.length === 0,
    reasons,
    score: Math.min(1.0, Math.max(0.0, score))
  };
}

/**
 * Calculate similarity between two keyword arrays using Jaccard index
 */
export function calculateKeywordSimilarity(
  keywords1: string[],
  keywords2: string[]
): number {
  const set1 = new Set(keywords1.map(k => normalizeKeyword(k)));
  const set2 = new Set(keywords2.map(k => normalizeKeyword(k)));
  
  const intersection = new Set([...set1].filter(k => set2.has(k)));
  const union = new Set([...set1, ...set2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Extract variations and related terms from a base keyword
 */
export function generateKeywordVariations(baseKeyword: string): string[] {
  const variations: string[] = [];
  const base = normalizeKeyword(baseKeyword);
  
  // Question variations
  variations.push(
    `what is ${base}`,
    `how to ${base}`,
    `${base} guide`,
    `${base} tutorial`,
    `${base} tips`,
    `${base} examples`
  );
  
  // Commercial variations
  variations.push(
    `best ${base}`,
    `${base} tools`,
    `${base} software`,
    `${base} services`,
    `${base} solutions`
  );
  
  // Comparison variations
  variations.push(
    `${base} vs`,
    `${base} comparison`,
    `${base} alternatives`,
    `${base} reviews`
  );
  
  // Problem-solution variations
  variations.push(
    `${base} problems`,
    `${base} challenges`,
    `${base} benefits`,
    `${base} advantages`
  );
  
  return variations.map(v => normalizeKeyword(v));
}

/**
 * Estimate keyword difficulty based on characteristics
 */
export function estimateKeywordDifficulty(keyword: string): {
  estimatedDifficulty: number; // 0-100
  factors: Array<{ factor: string; impact: number; reasoning: string }>;
} {
  const factors: Array<{ factor: string; impact: number; reasoning: string }> = [];
  let difficulty = 50; // Start with medium difficulty
  
  const normalized = normalizeKeyword(keyword);
  const wordCount = normalized.split(' ').length;
  
  // Word count impact
  if (wordCount === 1) {
    difficulty += 30;
    factors.push({
      factor: 'Short tail',
      impact: 30,
      reasoning: 'Single word keywords are typically more competitive'
    });
  } else if (wordCount === 2) {
    difficulty += 10;
    factors.push({
      factor: 'Medium tail',
      impact: 10,
      reasoning: 'Two word keywords have moderate competition'
    });
  } else if (wordCount >= 4) {
    difficulty -= 20;
    factors.push({
      factor: 'Long tail',
      impact: -20,
      reasoning: 'Long tail keywords are typically less competitive'
    });
  }
  
  // Commercial intent indicators
  const commercialTerms = ['buy', 'purchase', 'price', 'cost', 'cheap', 'best', 'top', 'review'];
  const hasCommercialIntent = commercialTerms.some(term => normalized.includes(term));
  
  if (hasCommercialIntent) {
    difficulty += 15;
    factors.push({
      factor: 'Commercial intent',
      impact: 15,
      reasoning: 'Commercial keywords face more advertiser competition'
    });
  }
  
  // Brand terms
  const brandIndicators = ['vs', 'alternative', 'competitor'];
  const hasBrandTerms = brandIndicators.some(term => normalized.includes(term));
  
  if (hasBrandTerms) {
    difficulty += 10;
    factors.push({
      factor: 'Brand comparison',
      impact: 10,
      reasoning: 'Brand comparison keywords are often competitive'
    });
  }
  
  // Question terms (easier to rank for)
  const questionTerms = ['what', 'how', 'why', 'when', 'where', 'which'];
  const hasQuestionTerms = questionTerms.some(term => normalized.includes(term));
  
  if (hasQuestionTerms) {
    difficulty -= 10;
    factors.push({
      factor: 'Informational query',
      impact: -10,
      reasoning: 'Question-based keywords often have lower competition'
    });
  }
  
  // Ensure difficulty stays within bounds
  difficulty = Math.max(10, Math.min(90, difficulty));
  
  return {
    estimatedDifficulty: difficulty,
    factors
  };
}

/**
 * Format budget and cost estimates for display
 */
export function formatCostEstimate(amount: number, currency: string = 'USD'): string {
  if (amount < 0.01) return `< $0.01`;
  if (amount < 1) return `$${amount.toFixed(2)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount)}`;
}

/**
 * Calculate budget utilization percentage with color coding
 */
export function getBudgetUtilizationStatus(utilization: number): {
  status: 'safe' | 'warning' | 'critical' | 'exceeded';
  color: string;
  message: string;
} {
  if (utilization <= 50) {
    return {
      status: 'safe',
      color: 'green',
      message: 'Budget utilization is healthy'
    };
  } else if (utilization <= 80) {
    return {
      status: 'warning',
      color: 'yellow',
      message: 'Monitor budget usage closely'
    };
  } else if (utilization <= 100) {
    return {
      status: 'critical',
      color: 'orange',
      message: 'Budget utilization is very high'
    };
  } else {
    return {
      status: 'exceeded',
      color: 'red',
      message: 'Estimated cost exceeds budget'
    };
  }
}

/**
 * Generate processing time estimates with confidence intervals
 */
export function estimateProcessingTime(
  keywordCount: number,
  competitorScraping: boolean = true,
  clustering: boolean = true
): {
  estimatedMinutes: number;
  range: { min: number; max: number };
  confidence: number; // 0-1
  factors: string[];
} {
  const factors: string[] = [];
  let baseTime = keywordCount * 0.02; // 0.02 minutes (1.2 seconds) per keyword
  
  // Add time for additional processing steps
  if (competitorScraping) {
    baseTime *= 1.5;
    factors.push('Competitor scraping enabled');
  }
  
  if (clustering) {
    baseTime *= 1.2;
    factors.push('Semantic clustering enabled');
  }
  
  // Add base overhead for API calls and processing
  baseTime += Math.log(keywordCount) * 2;
  
  // Confidence decreases with larger keyword counts
  const confidence = Math.max(0.7, 1 - (keywordCount / 20000));
  
  // Calculate range based on confidence
  const variance = baseTime * (1 - confidence);
  
  return {
    estimatedMinutes: Math.round(baseTime),
    range: {
      min: Math.round(baseTime - variance),
      max: Math.round(baseTime + variance)
    },
    confidence,
    factors
  };
}

/**
 * Validate market code and return market information
 */
export function validateMarketCode(marketCode: string): {
  isValid: boolean;
  normalized: string;
  marketName?: string;
  language?: string;
  currency?: string;
  supported: boolean;
} {
  const supportedMarkets = {
    US: { name: 'United States', language: 'en', currency: 'USD' },
    UK: { name: 'United Kingdom', language: 'en', currency: 'GBP' },
    CA: { name: 'Canada', language: 'en', currency: 'CAD' },
    AU: { name: 'Australia', language: 'en', currency: 'AUD' },
    DE: { name: 'Germany', language: 'de', currency: 'EUR' },
    FR: { name: 'France', language: 'fr', currency: 'EUR' },
    ES: { name: 'Spain', language: 'es', currency: 'EUR' },
    IT: { name: 'Italy', language: 'it', currency: 'EUR' },
    BR: { name: 'Brazil', language: 'pt', currency: 'BRL' },
    MX: { name: 'Mexico', language: 'es', currency: 'MXN' }
  };
  
  const normalized = marketCode.toUpperCase();
  const market = supportedMarkets[normalized as keyof typeof supportedMarkets];
  
  return {
    isValid: /^[A-Z]{2,3}$/.test(normalized),
    normalized,
    marketName: market?.name,
    language: market?.language,
    currency: market?.currency,
    supported: !!market
  };
}

/**
 * Create a cache key for duplicate detection
 */
export function createDuplicateDetectionKey(
  userId: string,
  keywords: string[],
  market?: string
): string {
  const sortedKeywords = keywords
    .map(k => normalizeKeyword(k))
    .sort()
    .join('|');
  
  return `${userId}:${market || 'US'}:${sortedKeywords}`;
}

/**
 * Format validation errors for user-friendly display
 */
export function formatValidationError(
  field: string,
  errors: string[]
): string {
  if (errors.length === 0) return '';
  if (errors.length === 1) return `${field}: ${errors[0]}`;
  
  return `${field}: ${errors.slice(0, -1).join(', ')} and ${errors[errors.length - 1]}`;
}

/**
 * Extract domain from URL for competitor analysis
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * Generate a human-readable processing summary
 */
export function createProcessingSummary(
  keywordCount: number,
  clustersExpected: number,
  competitorScraping: boolean,
  estimatedCost: number,
  estimatedTime: number
): string {
  const parts = [
    `Process ${keywordCount.toLocaleString()} keywords`,
    `Generate ${clustersExpected} semantic clusters`
  ];
  
  if (competitorScraping) {
    parts.push('Analyze competitor content');
  }
  
  parts.push(`Complete in ~${estimatedTime} minutes`);
  parts.push(`Estimated cost: ${formatCostEstimate(estimatedCost)}`);
  
  return parts.join(' • ');
}