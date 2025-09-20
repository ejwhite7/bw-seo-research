/**
 * Competitor Data Models
 * 
 * Competitor domain tracking, content scraping results,
 * and competitive analysis data structures.
 */

import { z } from 'zod';
import type { UUID, Timestamp, DomainString, URLString, KeywordString } from './index';

/**
 * Core competitor interface matching database schema
 */
export interface Competitor {
  readonly id: UUID;
  readonly runId: UUID;
  readonly domain: DomainString;
  readonly titles: string[] | null;
  readonly urls: URLString[] | null;
  readonly discoveredFromKeyword: KeywordString | null;
  readonly scrapeStatus: ScrapeStatus;
  readonly scrapeError: string | null;
  readonly scrapedAt: Timestamp | null;
  readonly createdAt: Timestamp;
}

/**
 * Scraping status enumeration
 */
export type ScrapeStatus = 
  | 'pending'
  | 'processing' 
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'robots_blocked'
  | 'rate_limited'
  | 'timeout'
  | 'skipped';

/**
 * Competitor creation input
 */
export interface CreateCompetitorInput {
  readonly runId: UUID;
  readonly domain: string;
  readonly discoveredFromKeyword?: string;
  readonly priority?: number;
}

/**
 * Competitor update input
 */
export interface UpdateCompetitorInput {
  readonly titles?: string[];
  readonly urls?: string[];
  readonly scrapeStatus?: ScrapeStatus;
  readonly scrapeError?: string | null;
  readonly scrapedAt?: Timestamp;
}

/**
 * Enhanced competitor with analysis data
 */
export interface EnrichedCompetitor extends Competitor {
  readonly analysis: CompetitorAnalysis;
  readonly metrics: CompetitorMetrics;
  readonly rankings: KeywordRanking[];
  readonly contentThemes: ContentTheme[];
}

/**
 * Competitor analysis results
 */
export interface CompetitorAnalysis {
  readonly domainAuthority: number | null;
  readonly estimatedTraffic: number | null;
  readonly keywordCount: number;
  readonly contentGaps: ContentGap[];
  readonly strengths: string[];
  readonly opportunities: string[];
  readonly contentStrategy: {
    readonly primaryTopics: string[];
    readonly contentTypes: string[];
    readonly publicationFrequency: number; // posts per month
    readonly avgContentLength: number; // words
  };
}

/**
 * Competitor performance metrics
 */
export interface CompetitorMetrics {
  readonly totalPages: number;
  readonly successfulScrapes: number;
  readonly failedScrapes: number;
  readonly uniqueTitles: number;
  readonly duplicateTitles: number;
  readonly avgTitleLength: number;
  readonly avgWordsPerTitle: number;
  readonly scrapingDuration: number; // seconds
  readonly lastUpdated: Timestamp;
}

/**
 * Keyword ranking data for competitors
 */
export interface KeywordRanking {
  readonly keyword: KeywordString;
  readonly position: number;
  readonly url: URLString;
  readonly title: string;
  readonly snippet: string | null;
  readonly traffic: number | null;
  readonly volume: number;
  readonly difficulty: number;
  readonly lastChecked: Timestamp;
}

/**
 * Content themes identified from competitor analysis
 */
export interface ContentTheme {
  readonly theme: string;
  readonly frequency: number;
  readonly keywords: KeywordString[];
  readonly sampleTitles: string[];
  readonly contentTypes: string[];
  readonly avgPosition: number;
  readonly opportunity: 'high' | 'medium' | 'low';
}

/**
 * Content gaps identified through competitive analysis
 */
export interface ContentGap {
  readonly keyword: KeywordString;
  readonly volume: number;
  readonly difficulty: number;
  readonly competitorCount: number;
  readonly topCompetitors: Array<{
    readonly domain: DomainString;
    readonly position: number;
    readonly title: string;
    readonly url: URLString;
  }>;
  readonly opportunity: {
    readonly score: number; // 0-1
    readonly reasoning: string;
    readonly contentSuggestion: string;
    readonly estimatedTraffic: number;
  };
}

/**
 * Scraping configuration and rules
 */
export interface ScrapeConfig {
  readonly respectRobotsTxt: boolean;
  readonly crawlDelay: number; // seconds
  readonly maxPages: number;
  readonly maxDepth: number;
  readonly allowedPaths: string[];
  readonly excludedPaths: string[];
  readonly userAgent: string;
  readonly timeout: number; // seconds
  readonly retryAttempts: number;
  readonly rateLimitPerMinute: number;
}

/**
 * Scraping result with detailed information
 */
export interface ScrapeResult {
  readonly competitorId: UUID;
  readonly domain: DomainString;
  readonly startTime: Timestamp;
  readonly endTime: Timestamp;
  readonly success: boolean;
  readonly pagesScraped: number;
  readonly titlesExtracted: number;
  readonly urlsCollected: number;
  readonly errors: ScrapeError[];
  readonly robotsTxt: RobotsTxtInfo;
  readonly metadata: ScrapeMetadata;
}

/**
 * Scraping error information
 */
export interface ScrapeError {
  readonly url: URLString;
  readonly error: string;
  readonly statusCode: number | null;
  readonly retryCount: number;
  readonly timestamp: Timestamp;
}

/**
 * Robots.txt parsing information
 */
export interface RobotsTxtInfo {
  readonly exists: boolean;
  readonly crawlDelay: number | null;
  readonly allowedPaths: string[];
  readonly disallowedPaths: string[];
  readonly sitemapUrls: URLString[];
  readonly lastModified: Timestamp | null;
}

/**
 * Scraping metadata and insights
 */
export interface ScrapeMetadata {
  readonly contentManagementSystem: string | null;
  readonly avgPageLoadTime: number;
  readonly commonUrlPatterns: string[];
  readonly titlePatterns: string[];
  readonly sitemap: {
    readonly found: boolean;
    readonly urlCount: number | null;
    readonly lastModified: Timestamp | null;
  };
  readonly socialMediaLinks: Array<{
    readonly platform: string;
    readonly url: URLString;
  }>;
}

/**
 * Competitor search and filtering parameters
 */
export interface CompetitorSearchParams {
  readonly runId?: UUID;
  readonly scrapeStatus?: ScrapeStatus | ScrapeStatus[];
  readonly hasTitles?: boolean;
  readonly minTitles?: number;
  readonly maxTitles?: number;
  readonly domainSearch?: string;
  readonly discoveredFromKeyword?: string;
  readonly scrapedAfter?: string;
  readonly scrapedBefore?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'domain' | 'scrapedAt' | 'titleCount' | 'createdAt';
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Competitor batch processing
 */
export interface CompetitorBatch {
  readonly batchId: UUID;
  readonly runId: UUID;
  readonly competitors: CreateCompetitorInput[];
  readonly config: ScrapeConfig;
  readonly priority: number;
  readonly scheduledFor: Timestamp;
}

/**
 * Competitive landscape analysis
 */
export interface CompetitiveLandscape {
  readonly runId: UUID;
  readonly totalCompetitors: number;
  readonly topCompetitors: Array<{
    readonly domain: DomainString;
    readonly strength: number; // 0-1
    readonly keywordOverlap: number;
    readonly contentGaps: number;
    readonly opportunities: number;
  }>;
  readonly industryInsights: {
    readonly commonTopics: string[];
    readonly contentFormats: string[];
    readonly avgCompetitionLevel: number;
    readonly marketSaturation: 'low' | 'medium' | 'high';
  };
  readonly recommendations: string[];
}

/**
 * Validation schemas using Zod
 */
export const ScrapeStatusSchema = z.enum([
  'pending', 'processing', 'completed', 'failed', 'blocked', 
  'robots_blocked', 'rate_limited', 'timeout', 'skipped'
]);

export const CreateCompetitorInputSchema = z.object({
  runId: z.string().uuid(),
  domain: z.string()
    .min(4)
    .max(255)
    .refine(val => {
      try {
        // Basic domain validation
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
        return domainRegex.test(val);
      } catch {
        return false;
      }
    }, {
      message: "Invalid domain format"
    })
    .transform(val => val.toLowerCase()),
  discoveredFromKeyword: z.string().min(1).max(255).optional(),
  priority: z.number().int().min(1).max(10).default(5)
});

export const UpdateCompetitorInputSchema = z.object({
  titles: z.array(z.string().min(1).max(500)).max(1000).optional(),
  urls: z.array(z.string().url()).max(1000).optional(),
  scrapeStatus: ScrapeStatusSchema.optional(),
  scrapeError: z.string().max(1000).nullable().optional(),
  scrapedAt: z.string().datetime().optional()
});

export const ScrapeConfigSchema = z.object({
  respectRobotsTxt: z.boolean().default(true),
  crawlDelay: z.number().min(0.5).max(60).default(1),
  maxPages: z.number().int().min(1).max(10000).default(1000),
  maxDepth: z.number().int().min(1).max(10).default(3),
  allowedPaths: z.array(z.string().max(500)).default([]),
  excludedPaths: z.array(z.string().max(500)).default([]),
  userAgent: z.string().min(10).max(200).default('Dream100Bot/1.0 (SEO Research Tool)'),
  timeout: z.number().int().min(5).max(120).default(30),
  retryAttempts: z.number().int().min(0).max(5).default(3),
  rateLimitPerMinute: z.number().int().min(1).max(120).default(30)
});

export const CompetitorSearchParamsSchema = z.object({
  runId: z.string().uuid().optional(),
  scrapeStatus: z.union([
    ScrapeStatusSchema,
    z.array(ScrapeStatusSchema)
  ]).optional(),
  hasTitles: z.boolean().optional(),
  minTitles: z.number().int().min(0).optional(),
  maxTitles: z.number().int().min(0).optional(),
  domainSearch: z.string().min(1).max(100).optional(),
  discoveredFromKeyword: z.string().min(1).max(255).optional(),
  scrapedAfter: z.string().datetime().optional(),
  scrapedBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['domain', 'scrapedAt', 'titleCount', 'createdAt']).default('createdAt'),
  orderDirection: z.enum(['asc', 'desc']).default('desc')
}).refine(data => {
  if (data.minTitles !== undefined && data.maxTitles !== undefined) {
    return data.minTitles <= data.maxTitles;
  }
  return true;
}, {
  message: "minTitles must be less than or equal to maxTitles"
}).refine(data => {
  if (data.scrapedAfter && data.scrapedBefore) {
    return new Date(data.scrapedAfter) <= new Date(data.scrapedBefore);
  }
  return true;
}, {
  message: "scrapedAfter must be before or equal to scrapedBefore"
});

/**
 * Type guards for runtime type checking
 */
export const isScrapeStatus = (value: unknown): value is ScrapeStatus => {
  return typeof value === 'string' && [
    'pending', 'processing', 'completed', 'failed', 'blocked',
    'robots_blocked', 'rate_limited', 'timeout', 'skipped'
  ].includes(value);
};

export const isCompetitor = (value: unknown): value is Competitor => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.runId === 'string' &&
    typeof obj.domain === 'string' &&
    isScrapeStatus(obj.scrapeStatus) &&
    typeof obj.createdAt === 'string'
  );
};

export const isDomainValid = (domain: string): boolean => {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
};

/**
 * Utility functions for competitor operations
 */
export const extractDomainFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

export const generateScrapeConfig = (domain: DomainString, customConfig?: Partial<ScrapeConfig>): ScrapeConfig => {
  const defaultConfig: ScrapeConfig = {
    respectRobotsTxt: true,
    crawlDelay: 1,
    maxPages: 1000,
    maxDepth: 3,
    allowedPaths: ['/blog/', '/articles/', '/resources/', '/guides/'],
    excludedPaths: ['/admin/', '/login/', '/cart/', '/checkout/', '/api/'],
    userAgent: 'Dream100Bot/1.0 (SEO Research Tool; Contact: support@olli.social)',
    timeout: 30,
    retryAttempts: 3,
    rateLimitPerMinute: 30
  };
  
  return { ...defaultConfig, ...customConfig };
};

export const calculateCompetitorStrength = (competitor: EnrichedCompetitor): number => {
  const { analysis, metrics, rankings } = competitor;
  
  let strength = 0;
  
  // Domain authority weight (40%)
  if (analysis.domainAuthority) {
    strength += (analysis.domainAuthority / 100) * 0.4;
  }
  
  // Keyword count weight (30%)
  const normalizedKeywordCount = Math.min(1, analysis.keywordCount / 10000);
  strength += normalizedKeywordCount * 0.3;
  
  // Average ranking position weight (20%)
  if (rankings.length > 0) {
    const avgPosition = rankings.reduce((sum, r) => sum + r.position, 0) / rankings.length;
    const normalizedPosition = Math.max(0, (100 - avgPosition) / 100);
    strength += normalizedPosition * 0.2;
  }
  
  // Content volume weight (10%)
  const normalizedContentVolume = Math.min(1, metrics.totalPages / 10000);
  strength += normalizedContentVolume * 0.1;
  
  return Math.min(1, strength);
};

export const identifyContentGaps = (
  ourKeywords: KeywordString[],
  competitorRankings: KeywordRanking[]
): ContentGap[] => {
  const ourKeywordSet = new Set(ourKeywords.map(k => k.toString().toLowerCase()));
  const gaps: ContentGap[] = [];
  
  // Group competitor rankings by keyword
  const keywordMap = new Map<string, KeywordRanking[]>();
  competitorRankings.forEach(ranking => {
    const keyword = ranking.keyword.toString().toLowerCase();
    if (!keywordMap.has(keyword)) {
      keywordMap.set(keyword, []);
    }
    keywordMap.get(keyword)!.push(ranking);
  });
  
  // Identify keywords where competitors rank but we don't target
  keywordMap.forEach((rankings, keyword) => {
    if (!ourKeywordSet.has(keyword) && rankings.length >= 2) {
      const topRankings = rankings
        .sort((a, b) => a.position - b.position)
        .slice(0, 5);
      
      const avgVolume = rankings.reduce((sum, r) => sum + r.volume, 0) / rankings.length;
      const avgDifficulty = rankings.reduce((sum, r) => sum + r.difficulty, 0) / rankings.length;
      
      // Calculate opportunity score
      const volumeScore = Math.min(1, Math.log10(avgVolume + 1) / 5);
      const competitionScore = Math.max(0, (100 - avgDifficulty) / 100);
      const opportunityScore = (volumeScore * 0.6) + (competitionScore * 0.4);
      
      gaps.push({
        keyword: keyword as KeywordString,
        volume: Math.round(avgVolume),
        difficulty: Math.round(avgDifficulty),
        competitorCount: rankings.length,
        topCompetitors: topRankings.map(r => ({
          domain: extractDomainFromUrl(r.url.toString()) as DomainString,
          position: r.position,
          title: r.title,
          url: r.url
        })),
        opportunity: {
          score: opportunityScore,
          reasoning: `${rankings.length} competitors ranking with avg difficulty ${Math.round(avgDifficulty)}`,
          contentSuggestion: generateContentSuggestion(keyword, topRankings),
          estimatedTraffic: Math.round(avgVolume * 0.3) // Rough CTR estimate
        }
      });
    }
  });
  
  return gaps.sort((a, b) => b.opportunity.score - a.opportunity.score);
};

const generateContentSuggestion = (keyword: string, rankings: KeywordRanking[]): string => {
  const titles = rankings.map(r => r.title);
  const commonFormats = ['guide', 'how to', 'tips', 'best', 'vs', 'complete'];
  
  let suggestion = `Create comprehensive content targeting "${keyword}".`;
  
  // Analyze competitor title patterns
  const formatMatches = commonFormats.filter(format => 
    titles.some(title => title.toLowerCase().includes(format))
  );
  
  if (formatMatches.length > 0) {
    suggestion += ` Consider ${formatMatches[0]} format based on competitor analysis.`;
  }
  
  return suggestion;
};

export const getScrapeStatusColor = (status: ScrapeStatus): string => {
  switch (status) {
    case 'pending': return 'gray';
    case 'processing': return 'blue';
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'blocked': return 'orange';
    case 'robots_blocked': return 'yellow';
    case 'rate_limited': return 'purple';
    case 'timeout': return 'pink';
    case 'skipped': return 'gray';
    default: return 'gray';
  }
};

export const getScrapeStatusDisplayName = (status: ScrapeStatus): string => {
  const displayNames: Record<ScrapeStatus, string> = {
    'pending': 'Pending',
    'processing': 'Processing',
    'completed': 'Completed',
    'failed': 'Failed',
    'blocked': 'Blocked',
    'robots_blocked': 'Robots.txt Blocked',
    'rate_limited': 'Rate Limited',
    'timeout': 'Timeout',
    'skipped': 'Skipped'
  };
  
  return displayNames[status] || status;
};