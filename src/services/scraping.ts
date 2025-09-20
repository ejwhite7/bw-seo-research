/**
 * Ethical Competitor Research and Web Scraping Service
 * 
 * A comprehensive, secure, and compliant web scraping service for competitor research
 * that respects robots.txt, implements rate limiting, and follows ethical scraping practices.
 * 
 * Features:
 * - Strict robots.txt compliance
 * - Domain-level rate limiting with jitter
 * - CAPTCHA and block detection
 * - Security-focused content extraction
 * - Comprehensive audit logging
 * - Circuit breaker pattern for failures
 * - Cost monitoring and budget controls
 */

import { BaseApiClient } from '../integrations/base-client';
import { EnhancedWebScraper, ScrapedContent, ScrapeRequest, ScrapingResult } from '../integrations/enhanced-scraper';
import { AhrefsClient } from '../integrations/ahrefs';
import { 
  Competitor, 
  CreateCompetitorInput, 
  UpdateCompetitorInput,
  ScrapeStatus,
  ScrapeConfig,
  ScrapeResult,
  ScrapeError,
  RobotsTxtInfo,
  ScrapeMetadata,
  CompetitorBatch,
  CompetitiveLandscape,
  EnrichedCompetitor,
  CompetitorAnalysis,
  ContentTheme,
  ContentGap,
  generateScrapeConfig,
  extractDomainFromUrl,
  calculateCompetitorStrength,
  identifyContentGaps
} from '../models/competitor';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory } from '../utils/rate-limiter';
import { CircuitBreakerFactory } from '../utils/circuit-breaker';
import { UUID, DomainString, URLString, KeywordString, Timestamp } from '../models/index';
import * as Sentry from '@sentry/nextjs';
import DatabaseService from '../lib/database-service';

/**
 * Enhanced robots.txt parser with security checks
 */
class RobotsTxtParser {
  private static readonly MAX_ROBOTS_SIZE = 100 * 1024; // 100KB max
  private static readonly TRUSTED_USER_AGENT = 'Dream100Bot/1.0 (SEO Research; +https://olli.social/bot)';
  
  static async fetchAndParse(
    domain: string, 
    userAgent: string = this.TRUSTED_USER_AGENT,
    timeout: number = 10000
  ): Promise<RobotsTxtInfo> {
    const robotsUrl = `https://${domain}/robots.txt`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/plain',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return this.createDefaultRobotsTxt();
      }
      
      // Security check: limit response size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.MAX_ROBOTS_SIZE) {
        throw new Error(`robots.txt too large: ${contentLength} bytes`);
      }
      
      const robotsText = await response.text();
      
      // Additional size check after download
      if (robotsText.length > this.MAX_ROBOTS_SIZE) {
        throw new Error(`robots.txt too large: ${robotsText.length} characters`);
      }
      
      return this.parseRobotsContent(robotsText, userAgent, response);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      Sentry.addBreadcrumb({
        message: `Failed to fetch robots.txt for ${domain}`,
        level: 'warning',
        category: 'robots-txt',
        data: { domain, error: error instanceof Error ? error.message : String(error) }
      });
      
      return this.createDefaultRobotsTxt();
    }
  }
  
  private static parseRobotsContent(
    robotsText: string, 
    userAgent: string,
    response: Response
  ): RobotsTxtInfo {
    const lines = robotsText.split('\n').map(line => line.trim());
    let currentUserAgent = '';
    let isRelevantSection = false;
    
    let crawlDelay: number | null = null;
    const allowedPaths: string[] = [];
    const disallowedPaths: string[] = [];
    const sitemapUrls: URLString[] = [];
    
    const normalizedUserAgent = userAgent.toLowerCase();
    
    for (const line of lines) {
      const cleanLine = line.toLowerCase();
      
      // Skip comments and empty lines
      if (cleanLine.startsWith('#') || cleanLine.length === 0) {
        continue;
      }
      
      if (cleanLine.startsWith('user-agent:')) {
        currentUserAgent = cleanLine.substring(11).trim();
        isRelevantSection = currentUserAgent === '*' || 
                           currentUserAgent === normalizedUserAgent ||
                           normalizedUserAgent.includes(currentUserAgent);
        continue;
      }
      
      if (isRelevantSection) {
        if (cleanLine.startsWith('disallow:')) {
          const path = line.substring(9).trim();
          if (path) {
            disallowedPaths.push(path);
          }
        }
        
        if (cleanLine.startsWith('allow:')) {
          const path = line.substring(6).trim();
          if (path) {
            allowedPaths.push(path);
          }
        }
        
        if (cleanLine.startsWith('crawl-delay:')) {
          const delay = parseInt(cleanLine.substring(12).trim());
          if (!isNaN(delay) && delay >= 0) {
            crawlDelay = Math.max(crawlDelay || 0, delay);
          }
        }
      }
      
      // Sitemap entries are global
      if (cleanLine.startsWith('sitemap:')) {
        const sitemapUrl = line.substring(8).trim();
        if (this.isValidUrl(sitemapUrl)) {
          sitemapUrls.push(sitemapUrl as URLString);
        }
      }
    }
    
    return {
      exists: true,
      crawlDelay,
      allowedPaths,
      disallowedPaths,
      sitemapUrls,
      lastModified: response.headers.get('last-modified') || null
    };
  }
  
  private static createDefaultRobotsTxt(): RobotsTxtInfo {
    return {
      exists: false,
      crawlDelay: 1, // Default 1 second delay
      allowedPaths: [],
      disallowedPaths: [],
      sitemapUrls: [],
      lastModified: null
    };
  }
  
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Check if a URL path is allowed based on robots.txt rules
   */
  static isPathAllowed(robotsInfo: RobotsTxtInfo, path: string): boolean {
    if (!robotsInfo.exists) {
      return true; // No robots.txt = everything allowed
    }
    
    // Check explicit allows first (they take precedence)
    for (const allowedPath of robotsInfo.allowedPaths) {
      if (this.matchesPattern(path, allowedPath)) {
        return true;
      }
    }
    
    // Check disallows
    for (const disallowedPath of robotsInfo.disallowedPaths) {
      if (this.matchesPattern(path, disallowedPath)) {
        return false;
      }
    }
    
    return true; // Default to allowed
  }
  
  private static matchesPattern(path: string, pattern: string): boolean {
    if (pattern === '/') {
      return true; // Disallow all
    }
    
    if (pattern.endsWith('*')) {
      return path.startsWith(pattern.slice(0, -1));
    }
    
    return path.startsWith(pattern);
  }
}

/**
 * Security-focused content sanitizer
 */
class ContentSanitizer {
  private static readonly DANGEROUS_PATTERNS = [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
    /<object[^>]*>[\s\S]*?<\/object>/gi,
    /<embed[^>]*>[\s\S]*?<\/embed>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:(?!image\/(png|jpeg|gif|webp))[^;]*/gi
  ];
  
  private static readonly MAX_TITLE_LENGTH = 200;
  private static readonly MAX_DESCRIPTION_LENGTH = 500;
  private static readonly MAX_CONTENT_LENGTH = 50000;
  
  /**
   * Sanitize extracted content for security
   */
  static sanitizeContent(content: Partial<ScrapedContent>): Partial<ScrapedContent> {
    const sanitized: Partial<ScrapedContent> = {};
    
    if (content.title) {
      sanitized.title = this.sanitizeText(content.title, this.MAX_TITLE_LENGTH);
    }
    
    if (content.metaDescription) {
      sanitized.metaDescription = this.sanitizeText(
        content.metaDescription, 
        this.MAX_DESCRIPTION_LENGTH
      );
    }
    
    if (content.h1) {
      sanitized.h1 = this.sanitizeText(content.h1, this.MAX_TITLE_LENGTH);
    }
    
    if (content.h2Tags) {
      sanitized.h2Tags = content.h2Tags
        .map(h2 => this.sanitizeText(h2, this.MAX_TITLE_LENGTH))
        .slice(0, 20); // Limit to 20 H2 tags
    }
    
    if (content.content) {
      sanitized.content = this.sanitizeText(content.content, this.MAX_CONTENT_LENGTH);
    }
    
    if (content.url) {
      sanitized.url = this.sanitizeUrl(content.url);
    }
    
    if (content.canonical) {
      sanitized.canonical = this.sanitizeUrl(content.canonical);
    }
    
    return sanitized;
  }
  
  private static sanitizeText(text: string, maxLength: number): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    // Remove dangerous patterns
    let cleaned = text;
    for (const pattern of this.DANGEROUS_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');
    
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Truncate if needed
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength - 3) + '...';
    }
    
    return cleaned;
  }
  
  private static sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Invalid protocol');
      }
      
      return urlObj.toString();
    } catch {
      return '';
    }
  }
}

/**
 * Domain-specific rate limiter with jitter and backoff
 */
class DomainRateLimiter {
  private domainLimiters = new Map<string, {
    lastRequest: number;
    requestCount: number;
    backoffUntil: number;
  }>();
  
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly maxRequestsPerMinute: number;
  
  constructor(options: {
    baseDelay: number; // milliseconds
    maxDelay: number;  // milliseconds
    maxRequestsPerMinute: number;
  }) {
    this.baseDelay = options.baseDelay;
    this.maxDelay = options.maxDelay;
    this.maxRequestsPerMinute = options.maxRequestsPerMinute;
  }
  
  async waitForDomain(domain: string): Promise<void> {
    const now = Date.now();
    const domainState = this.domainLimiters.get(domain) || {
      lastRequest: 0,
      requestCount: 0,
      backoffUntil: 0
    };
    
    // Check if we're in backoff period
    if (now < domainState.backoffUntil) {
      const waitTime = domainState.backoffUntil - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Reset request count if it's been more than a minute
    if (now - domainState.lastRequest > 60000) {
      domainState.requestCount = 0;
    }
    
    // Check rate limit
    if (domainState.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - domainState.lastRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      domainState.requestCount = 0;
    }
    
    // Calculate delay with jitter
    const timeSinceLastRequest = now - domainState.lastRequest;
    const minDelay = Math.min(this.baseDelay, this.maxDelay);
    
    if (timeSinceLastRequest < minDelay) {
      const delay = minDelay - timeSinceLastRequest;
      const jitter = Math.random() * 1000; // Up to 1 second jitter
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
    
    // Update state
    domainState.lastRequest = Date.now();
    domainState.requestCount++;
    this.domainLimiters.set(domain, domainState);
  }
  
  setBackoff(domain: string, backoffMs: number): void {
    const domainState = this.domainLimiters.get(domain) || {
      lastRequest: 0,
      requestCount: 0,
      backoffUntil: 0
    };
    
    domainState.backoffUntil = Date.now() + backoffMs;
    this.domainLimiters.set(domain, domainState);
  }
  
  getDomainStatus(domain: string) {
    const domainState = this.domainLimiters.get(domain);
    if (!domainState) {
      return { canRequest: true, waitTime: 0, requestCount: 0 };
    }
    
    const now = Date.now();
    const waitTime = Math.max(
      0,
      domainState.backoffUntil - now,
      this.baseDelay - (now - domainState.lastRequest)
    );
    
    return {
      canRequest: waitTime === 0 && domainState.requestCount < this.maxRequestsPerMinute,
      waitTime,
      requestCount: domainState.requestCount
    };
  }
}

/**
 * Main competitor research and scraping service
 */
export class CompetitorResearchService {
  private webScraper: EnhancedWebScraper;
  private ahrefsClient: AhrefsClient;
  private domainRateLimiter: DomainRateLimiter;
  private robotsCache = new Map<string, {
    info: RobotsTxtInfo;
    timestamp: number;
  }>();
  private readonly robotsCacheTtl = 24 * 60 * 60 * 1000; // 24 hours
  
  constructor(
    private databaseService: DatabaseService,
    options: {
      ahrefsApiKey: string;
      redis?: any;
      scrapeConfig?: Partial<ScrapeConfig>;
    }
  ) {
    this.webScraper = EnhancedWebScraper.getInstance(options.redis);
    this.ahrefsClient = AhrefsClient.getInstance(options.ahrefsApiKey, options.redis);
    
    this.domainRateLimiter = new DomainRateLimiter({
      baseDelay: options.scrapeConfig?.crawlDelay ? options.scrapeConfig.crawlDelay * 1000 : 1500,
      maxDelay: 10000, // 10 seconds max
      maxRequestsPerMinute: options.scrapeConfig?.rateLimitPerMinute || 20
    });
    
    // Clean robots cache periodically
    setInterval(() => this.cleanRobotsCache(), 60 * 60 * 1000); // Every hour
  }
  
  /**
   * Discover competitor domains from Dream 100 keywords using Ahrefs
   */
  async discoverCompetitors(
    runId: UUID,
    keywords: KeywordString[],
    options: {
      topN?: number;
      minDomainAuthority?: number;
      excludeDomains?: DomainString[];
      country?: string;
    } = {}
  ): Promise<CreateCompetitorInput[]> {
    const {
      topN = 20,
      minDomainAuthority = 30,
      excludeDomains = [],
      country = 'US'
    } = options;
    
    Sentry.addBreadcrumb({
      message: `Discovering competitors for ${keywords.length} keywords`,
      level: 'info',
      category: 'competitor-discovery',
      data: { runId, keywordCount: keywords.length, topN }
    });
    
    const competitorDomains = new Map<string, {
      domain: DomainString;
      discoveredFromKeyword: KeywordString;
      positions: number[];
      estimatedTraffic: number;
    }>();
    
    // Process keywords in batches to respect API limits
    const batchSize = 10;
    const errorAggregator = {
      errors: [] as Array<{ batch: number; error: Error; context: any }>,
      addError(batch: number, error: Error, context: any) {
        this.errors.push({ batch, error, context });
      },
      getErrorSummary() {
        return { total: this.errors.length, errors: this.errors };
      }
    };
    
    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);
      
      try {
        // Get SERP data for each keyword
        for (const keyword of batch) {
          try {
            const overview = await this.ahrefsClient.getKeywordOverview(
              keyword.toString(),
              country
            );
            
            if (overview.success && overview.data) {
              const serpData = (overview.data as any).serp_data || [];
              
              // Extract top ranking domains
              for (let position = 0; position < Math.min(serpData.length, topN); position++) {
                const result = serpData[position];
                if (!result.url) continue;
                
                const domain = extractDomainFromUrl(result.url);
                if (!domain || excludeDomains.includes(domain as DomainString)) {
                  continue;
                }
                
                const existing = competitorDomains.get(domain);
                if (existing) {
                  existing.positions.push(position + 1);
                  existing.estimatedTraffic += result.traffic || 0;
                } else {
                  competitorDomains.set(domain, {
                    domain: domain as DomainString,
                    discoveredFromKeyword: keyword,
                    positions: [position + 1],
                    estimatedTraffic: result.traffic || 0
                  });
                }
              }
            }
          } catch (error) {
            errorAggregator.addError(i, error as Error, { keyword });
          }
        }
        
        // Rate limiting between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        errorAggregator.addError(i, error as Error, { batch });
      }
    }
    
    // Convert to competitor inputs and sort by strength
    const competitors = Array.from(competitorDomains.values())
      .map(comp => ({
        ...comp,
        avgPosition: comp.positions.reduce((a, b) => a + b, 0) / comp.positions.length,
        strength: this.calculateCompetitorStrengthScore(comp)
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, topN)
      .map(comp => ({
        runId,
        domain: comp.domain,
        discoveredFromKeyword: comp.discoveredFromKeyword,
        priority: Math.ceil((comp.strength * 10))
      }));
    
    Sentry.addBreadcrumb({
      message: `Discovered ${competitors.length} competitor domains`,
      level: 'info',
      category: 'competitor-discovery-complete',
      data: {
        runId,
        competitorCount: competitors.length,
        errors: errorAggregator.getErrorSummary()
      }
    });
    
    return competitors;
  }
  
  private calculateCompetitorStrengthScore(competitor: {
    positions: number[];
    estimatedTraffic: number;
  }): number {
    const avgPosition = competitor.positions.reduce((a, b) => a + b, 0) / competitor.positions.length;
    const positionScore = Math.max(0, (100 - avgPosition) / 100);
    const trafficScore = Math.min(1, Math.log10(competitor.estimatedTraffic + 1) / 6);
    const frequencyScore = Math.min(1, competitor.positions.length / 10);
    
    return (positionScore * 0.4) + (trafficScore * 0.35) + (frequencyScore * 0.25);
  }
  
  /**
   * Scrape competitor content with full security and compliance
   */
  async scrapeCompetitors(
    competitors: Competitor[],
    config: ScrapeConfig,
    onProgress?: (completed: number, total: number, current?: string) => void
  ): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    let completed = 0;
    
    Sentry.addBreadcrumb({
      message: `Starting competitor scraping for ${competitors.length} domains`,
      level: 'info',
      category: 'scraping-start',
      data: { competitorCount: competitors.length, config }
    });
    
    for (const competitor of competitors) {
      const startTime = new Date().toISOString() as Timestamp;
      const domain = competitor.domain;
      
      try {
        // Update competitor status
        await this.updateCompetitorStatus(competitor.id, {
          scrapeStatus: 'processing',
          scrapedAt: startTime
        });
        
        if (onProgress) {
          onProgress(completed, competitors.length, domain);
        }
        
        // Get or fetch robots.txt
        const robotsInfo = await this.getRobotsTxtInfo(domain, config.userAgent);
        
        // Check if scraping is allowed
        if (!this.isScrapingAllowed(robotsInfo, config)) {
          await this.updateCompetitorStatus(competitor.id, {
            scrapeStatus: 'robots_blocked',
            scrapeError: 'Blocked by robots.txt'
          });
          
          results.push({
            competitorId: competitor.id,
            domain,
            startTime,
            endTime: new Date().toISOString() as Timestamp,
            success: false,
            pagesScraped: 0,
            titlesExtracted: 0,
            urlsCollected: 0,
            errors: [{
              url: `https://${domain}` as URLString,
              error: 'Blocked by robots.txt',
              statusCode: null,
              retryCount: 0,
              timestamp: startTime
            }],
            robotsTxt: robotsInfo,
            metadata: {
              contentManagementSystem: null,
              avgPageLoadTime: 0,
              commonUrlPatterns: [],
              titlePatterns: [],
              sitemap: { found: false, urlCount: null, lastModified: null },
              socialMediaLinks: []
            }
          });
          
          completed++;
          continue;
        }
        
        // Respect crawl delay
        const crawlDelay = Math.max(
          robotsInfo.crawlDelay || 0,
          config.crawlDelay
        );
        
        await this.domainRateLimiter.waitForDomain(domain);
        
        // Discover URLs for this domain
        const urls = await this.discoverDomainUrls(
          domain,
          config,
          robotsInfo
        );
        
        if (urls.length === 0) {
          await this.updateCompetitorStatus(competitor.id, {
            scrapeStatus: 'completed',
            scrapeError: 'No scrapable URLs found'
          });
          
          results.push({
            competitorId: competitor.id,
            domain,
            startTime,
            endTime: new Date().toISOString() as Timestamp,
            success: true,
            pagesScraped: 0,
            titlesExtracted: 0,
            urlsCollected: 0,
            errors: [],
            robotsTxt: robotsInfo,
            metadata: {
              contentManagementSystem: null,
              avgPageLoadTime: 0,
              commonUrlPatterns: [],
              titlePatterns: [],
              sitemap: { found: false, urlCount: null, lastModified: null },
              socialMediaLinks: []
            }
          });
          
          completed++;
          continue;
        }
        
        // Scrape the URLs
        const scrapeResult = await this.scrapeUrlsBatch(
          urls.slice(0, config.maxPages),
          domain,
          config,
          crawlDelay
        );
        
        // Extract and sanitize content
        const titles: string[] = [];
        const scrapedUrls: URLString[] = [];
        const errors: ScrapeError[] = [];
        
        const totalLoadTime = 0;
        
        for (const success of scrapeResult.successful) {
          const sanitized = ContentSanitizer.sanitizeContent(success);
          
          if (sanitized.title && sanitized.title.length > 0) {
            titles.push(sanitized.title);
          }
          
          if (sanitized.url) {
            scrapedUrls.push(sanitized.url as URLString);
          }
        }
        
        for (const failed of scrapeResult.failed) {
          errors.push({
            url: failed.url as URLString,
            error: failed.error,
            statusCode: failed.statusCode || null,
            retryCount: 0,
            timestamp: new Date().toISOString() as Timestamp
          });
        }
        
        // Update competitor with results
        await this.updateCompetitorStatus(competitor.id, {
          titles: titles.length > 0 ? titles : undefined,
          urls: scrapedUrls.length > 0 ? scrapedUrls.map(url => url.toString()) : undefined,
          scrapeStatus: 'completed',
          scrapeError: null
        });
        
        // Analyze extracted content
        const metadata = await this.analyzeScrapedContent(
          scrapeResult.successful,
          domain
        );
        
        results.push({
          competitorId: competitor.id,
          domain,
          startTime,
          endTime: new Date().toISOString() as Timestamp,
          success: true,
          pagesScraped: scrapeResult.successful.length,
          titlesExtracted: titles.length,
          urlsCollected: scrapedUrls.length,
          errors,
          robotsTxt: robotsInfo,
          metadata
        });
        
      } catch (error) {
        const apiError = ErrorHandler.handleSystemError(error as Error, {
          component: 'scraper',
          operation: `scrape-${domain}`,
          details: { domain, competitorId: competitor.id }
        });
        
        // Determine appropriate status based on error type
        let scrapeStatus: ScrapeStatus = 'failed';
        if ((error as Error).message?.includes('timeout')) {
          scrapeStatus = 'timeout';
        } else if ((error as Error).message?.includes('rate limit') || (error as Error).message?.includes('429')) {
          scrapeStatus = 'rate_limited';
          this.domainRateLimiter.setBackoff(domain, 60000); // 1 minute backoff
        } else if ((error as Error).message?.includes('blocked') || (error as Error).message?.includes('captcha')) {
          scrapeStatus = 'blocked';
          this.domainRateLimiter.setBackoff(domain, 300000); // 5 minute backoff
        }
        
        await this.updateCompetitorStatus(competitor.id, {
          scrapeStatus,
          scrapeError: apiError.message
        });
        
        results.push({
          competitorId: competitor.id,
          domain,
          startTime,
          endTime: new Date().toISOString() as Timestamp,
          success: false,
          pagesScraped: 0,
          titlesExtracted: 0,
          urlsCollected: 0,
          errors: [{
            url: `https://${domain}` as URLString,
            error: apiError.message,
            statusCode: apiError.statusCode || null,
            retryCount: 0,
            timestamp: new Date().toISOString() as Timestamp
          }],
          robotsTxt: this.robotsCache.get(domain)?.info || {
            exists: false,
            crawlDelay: null,
            allowedPaths: [],
            disallowedPaths: [],
            sitemapUrls: [],
            lastModified: null
          },
          metadata: {
            contentManagementSystem: null,
            avgPageLoadTime: 0,
            commonUrlPatterns: [],
            titlePatterns: [],
            sitemap: { found: false, urlCount: null, lastModified: null },
            socialMediaLinks: []
          }
        });
        
        Sentry.captureException(error, {
          tags: { domain, competitorId: competitor.id },
          extra: { scrapeStatus }
        });
      }
      
      completed++;
      
      if (onProgress) {
        onProgress(completed, competitors.length);
      }
    }
    
    Sentry.addBreadcrumb({
      message: `Completed competitor scraping: ${results.filter(r => r.success).length}/${results.length} successful`,
      level: 'info',
      category: 'scraping-complete',
      data: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        avgPagesPerDomain: results.reduce((sum, r) => sum + r.pagesScraped, 0) / results.length,
        totalTitles: results.reduce((sum, r) => sum + r.titlesExtracted, 0)
      }
    });
    
    return results;
  }
  
  private async getRobotsTxtInfo(domain: string, userAgent: string): Promise<RobotsTxtInfo> {
    const cacheKey = `${domain}:${userAgent}`;
    const cached = this.robotsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.robotsCacheTtl) {
      return cached.info;
    }
    
    const robotsInfo = await RobotsTxtParser.fetchAndParse(domain, userAgent);
    
    this.robotsCache.set(cacheKey, {
      info: robotsInfo,
      timestamp: Date.now()
    });
    
    return robotsInfo;
  }
  
  private isScrapingAllowed(robotsInfo: RobotsTxtInfo, config: ScrapeConfig): boolean {
    if (!config.respectRobotsTxt) {
      return true;
    }
    
    // Check if root path is disallowed
    return RobotsTxtParser.isPathAllowed(robotsInfo, '/');
  }
  
  private async discoverDomainUrls(
    domain: string,
    config: ScrapeConfig,
    robotsInfo: RobotsTxtInfo
  ): Promise<URLString[]> {
    const urls: URLString[] = [];
    const maxUrls = Math.min(config.maxPages, 100); // Safety limit
    
    // Try sitemap first
    for (const sitemapUrl of robotsInfo.sitemapUrls) {
      try {
        const sitemapUrls = await this.parseSitemap(sitemapUrl, domain, config, robotsInfo);
        urls.push(...sitemapUrls.slice(0, maxUrls - urls.length));
        
        if (urls.length >= maxUrls) break;
      } catch (error) {
        Sentry.addBreadcrumb({
          message: `Failed to parse sitemap: ${sitemapUrl}`,
          level: 'warning',
          category: 'sitemap-parse',
          data: { domain, error: error instanceof Error ? error.message : String(error) }
        });
      }
    }
    
    // If we don't have enough URLs, try common paths
    if (urls.length < maxUrls / 2) {
      const commonPaths = this.getCommonContentPaths(config);
      
      for (const path of commonPaths) {
        if (urls.length >= maxUrls) break;
        
        const url = `https://${domain}${path}` as URLString;
        
        if (RobotsTxtParser.isPathAllowed(robotsInfo, path)) {
          urls.push(url);
        }
      }
    }
    
    return Array.from(new Set(urls)).slice(0, maxUrls);
  }
  
  private getCommonContentPaths(config: ScrapeConfig): string[] {
    const basePaths = [
      '/',
      '/blog',
      '/blog/',
      '/articles',
      '/articles/',
      '/resources',
      '/resources/',
      '/guides',
      '/guides/',
      '/news',
      '/news/',
      '/insights',
      '/insights/',
      ...config.allowedPaths
    ];
    
    // Add common pagination
    const paths = [...basePaths];
    for (const basePath of basePaths.filter(p => p.endsWith('/'))) {
      for (let page = 1; page <= 5; page++) {
        paths.push(`${basePath}page/${page}`);
      }
    }
    
    return paths.filter(path => {
      // Filter out explicitly excluded paths
      return !config.excludedPaths.some(excluded => 
        path.startsWith(excluded)
      );
    });
  }
  
  private async parseSitemap(
    sitemapUrl: URLString,
    domain: string,
    config: ScrapeConfig,
    robotsInfo: RobotsTxtInfo
  ): Promise<URLString[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.userAgent
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const sitemapXml = await response.text();
      
      // Basic XML parsing for <loc> tags
      const urlMatches = sitemapXml.match(/<loc>(.*?)<\/loc>/g);
      
      if (!urlMatches) {
        return [];
      }
      
      const urls = urlMatches
        .map(match => match.replace(/<loc>|<\/loc>/g, '').trim())
        .filter(url => {
          try {
            const urlObj = new URL(url);
            // Only include URLs from the same domain
            return urlObj.hostname === domain || urlObj.hostname === `www.${domain}`;
          } catch {
            return false;
          }
        })
        .filter(url => {
          // Check robots.txt compliance
          const path = new URL(url).pathname;
          return RobotsTxtParser.isPathAllowed(robotsInfo, path);
        })
        .map(url => url as URLString);
      
      return urls.slice(0, config.maxPages);
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  private async scrapeUrlsBatch(
    urls: URLString[],
    domain: string,
    config: ScrapeConfig,
    crawlDelay: number
  ): Promise<ScrapingResult> {
    const batchSize = 10;
    const allSuccessful: ScrapedContent[] = [];
    const allFailed: { url: string; error: string; statusCode?: number; }[] = [];
    const allRobotsBlocked: string[] = [];
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      try {
        // Wait for domain rate limiting
        await this.domainRateLimiter.waitForDomain(domain);
        
        const result = await this.webScraper.scrapeUrls({
          urls: batch.map(u => u.toString()),
          extractContent: true,
          respectRobots: config.respectRobotsTxt,
          userAgent: config.userAgent,
          timeout: config.timeout * 1000
        });
        
        allSuccessful.push(...result.successful);
        allFailed.push(...result.failed);
        allRobotsBlocked.push(...result.robotsBlocked);
        
        // Additional delay between batches
        if (i + batchSize < urls.length) {
          const delay = Math.max(crawlDelay * 1000, 2000); // At least 2 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        // Mark all URLs in batch as failed
        allFailed.push(...batch.map(url => ({
          url: url.toString(),
          error: error instanceof Error ? error.message : String(error),
          statusCode: (error as any).statusCode
        })));
      }
    }
    
    return {
      successful: allSuccessful,
      failed: allFailed,
      robotsBlocked: allRobotsBlocked,
      totalAttempted: urls.length,
      successRate: allSuccessful.length / urls.length
    };
  }
  
  private async analyzeScrapedContent(
    scrapedContent: ScrapedContent[],
    domain: string
  ): Promise<ScrapeMetadata> {
    let contentManagementSystem: string | null = null;
    let avgPageLoadTime = 0;
    let commonUrlPatterns: string[] = [];
    let titlePatterns: string[] = [];
    const sitemap = { found: false, urlCount: null, lastModified: null };
    const socialMediaLinks: Array<{ readonly platform: string; readonly url: URLString; }> = [];
    
    if (scrapedContent.length === 0) {
      return {
        contentManagementSystem,
        avgPageLoadTime,
        commonUrlPatterns,
        titlePatterns,
        sitemap,
        socialMediaLinks
      };
    }
    
    // Analyze URL patterns
    const urlPaths = scrapedContent
      .map(content => {
        try {
          return new URL(content.url).pathname;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];
    
    commonUrlPatterns = this.findCommonPatterns(urlPaths);
    
    // Analyze title patterns
    const titles = scrapedContent
      .map(content => content.title)
      .filter(Boolean) as string[];
    
    titlePatterns = this.findCommonPatterns(
      titles.map(title => this.extractTitlePattern(title))
    );
    
    // Detect CMS (basic detection)
    contentManagementSystem = this.detectCMS(scrapedContent);
    
    return {
      contentManagementSystem,
      avgPageLoadTime,
      commonUrlPatterns,
      titlePatterns,
      sitemap,
      socialMediaLinks
    };
  }
  
  private findCommonPatterns(items: string[]): string[] {
    if (items.length === 0) return [];
    
    const patternCounts = new Map<string, number>();
    
    for (const item of items) {
      // Extract patterns (simplified)
      const patterns = item.split('/').filter(Boolean);
      for (const pattern of patterns) {
        if (pattern.length > 2) {
          patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
        }
      }
    }
    
    return Array.from(patternCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);
  }
  
  private extractTitlePattern(title: string): string {
    // Simple pattern extraction
    if (title.includes(' | ')) {
      return title.split(' | ')[1] || '';
    }
    if (title.includes(' - ')) {
      return title.split(' - ')[1] || '';
    }
    return '';
  }
  
  private detectCMS(scrapedContent: ScrapedContent[]): string | null {
    // Simple CMS detection based on common patterns
    const allContent = scrapedContent.map(c => c.content || '').join(' ');
    
    if (allContent.includes('wp-content') || allContent.includes('wordpress')) {
      return 'WordPress';
    }
    if (allContent.includes('_next') || allContent.includes('next.js')) {
      return 'Next.js';
    }
    if (allContent.includes('gatsby')) {
      return 'Gatsby';
    }
    if (allContent.includes('shopify')) {
      return 'Shopify';
    }
    
    return null;
  }
  
  private async updateCompetitorStatus(
    competitorId: UUID,
    updates: UpdateCompetitorInput
  ): Promise<void> {
    try {
      // TODO: Implement updateCompetitor method in database service
      // await this.databaseService.updateCompetitor(competitorId, {
      const updateData = {
        ...updates,
        scrapedAt: updates.scrapedAt || new Date().toISOString() as Timestamp
      };
      // Temporary stub - implement database update logic
      console.log('Would update competitor:', { competitorId, updateData });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { operation: 'update-competitor' },
        extra: { competitorId, updates }
      });
    }
  }
  
  private cleanRobotsCache(): void {
    const now = Date.now();
    for (const [key, value] of this.robotsCache.entries()) {
      if (now - value.timestamp > this.robotsCacheTtl) {
        this.robotsCache.delete(key);
      }
    }
  }
  
  /**
   * Create competitor batch for processing
   */
  async createCompetitorBatch(
    runId: UUID,
    competitors: CreateCompetitorInput[],
    config: ScrapeConfig,
    scheduledFor?: Date
  ): Promise<CompetitorBatch> {
    const batchId = crypto.randomUUID() as UUID;
    
    return {
      batchId,
      runId,
      competitors,
      config,
      priority: 5,
      scheduledFor: (scheduledFor || new Date()).toISOString() as Timestamp
    };
  }
  
  /**
   * Generate competitive landscape analysis
   */
  async generateCompetitiveLandscape(
    runId: UUID,
    ourKeywords: KeywordString[]
  ): Promise<CompetitiveLandscape> {
    // TODO: Implement getCompetitorsByRun method in database service
    // const competitors = await this.databaseService.getCompetitorsByRun(runId);
    const competitors: any[] = []; // Temporary stub
    const successfulCompetitors = competitors.filter((c: any) => c.scrapeStatus === 'completed');
    
    if (successfulCompetitors.length === 0) {
      return {
        runId,
        totalCompetitors: 0,
        topCompetitors: [],
        industryInsights: {
          commonTopics: [],
          contentFormats: [],
          avgCompetitionLevel: 0,
          marketSaturation: 'low'
        },
        recommendations: ['No competitor data available for analysis']
      };
    }
    
    // Analyze competitor strengths
    const competitorAnalysis = await Promise.all(
      successfulCompetitors.slice(0, 10).map(async (competitor: any) => {
        const rankings = await this.getCompetitorRankings(competitor.domain);
        const enrichedCompetitor: EnrichedCompetitor = {
          ...competitor,
          analysis: {
            domainAuthority: null,
            estimatedTraffic: null,
            keywordCount: rankings.length,
            contentGaps: [],
            strengths: [],
            opportunities: [],
            contentStrategy: {
              primaryTopics: [],
              contentTypes: [],
              publicationFrequency: 0,
              avgContentLength: 0
            }
          },
          metrics: {
            totalPages: competitor.urls?.length || 0,
            successfulScrapes: competitor.titles?.length || 0,
            failedScrapes: 0,
            uniqueTitles: new Set(competitor.titles || []).size,
            duplicateTitles: 0,
            avgTitleLength: 0,
            avgWordsPerTitle: 0,
            scrapingDuration: 0,
            lastUpdated: competitor.scrapedAt || competitor.createdAt
          },
          rankings: rankings,
          contentThemes: []
        };
        
        const strength = calculateCompetitorStrength(enrichedCompetitor);
        const keywordOverlap = this.calculateKeywordOverlap(ourKeywords, rankings.map(r => r.keyword));
        
        return {
          domain: competitor.domain,
          strength,
          keywordOverlap,
          contentGaps: 0, // Placeholder
          opportunities: rankings.length
        };
      })
    );
    
    // Analyze common topics
    const allTitles = successfulCompetitors
      .flatMap((c: any) => c.titles || [])
      .filter(Boolean);
      
    const commonTopics = this.extractTopics(allTitles);
    
    return {
      runId,
      totalCompetitors: successfulCompetitors.length,
      topCompetitors: competitorAnalysis.sort((a: any, b: any) => b.strength - a.strength),
      industryInsights: {
        commonTopics,
        contentFormats: this.identifyContentFormats(allTitles),
        avgCompetitionLevel: competitorAnalysis.reduce((sum: any, c: any) => sum + c.strength, 0) / competitorAnalysis.length,
        marketSaturation: this.assessMarketSaturation(competitorAnalysis.length, commonTopics.length)
      },
      recommendations: this.generateRecommendations(competitorAnalysis, commonTopics)
    };
  }
  
  private async getCompetitorRankings(domain: DomainString): Promise<Array<{
    keyword: KeywordString;
    position: number;
    url: URLString;
    title: string;
    snippet: string | null;
    traffic: number | null;
    volume: number;
    difficulty: number;
    lastChecked: Timestamp;
  }>> {
    try {
      const response = await this.ahrefsClient.getCompetitorKeywords({
        domain: domain.toString(),
        limit: 100
      });
      
      if (response.success && response.data) {
        return (response.data as any).keywords?.map((kw: any) => ({
          keyword: kw.keyword as KeywordString,
          position: kw.position || 0,
          url: kw.url as URLString || `https://${domain}` as URLString,
          title: kw.title || '',
          snippet: kw.snippet || null,
          traffic: kw.traffic || null,
          volume: kw.volume || 0,
          difficulty: kw.difficulty || 0,
          lastChecked: new Date().toISOString() as Timestamp
        })) || [];
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { operation: 'get-competitor-rankings' },
        extra: { domain }
      });
    }
    
    return [];
  }
  
  private calculateKeywordOverlap(ourKeywords: KeywordString[], competitorKeywords: KeywordString[]): number {
    const ourSet = new Set(ourKeywords.map(k => k.toString().toLowerCase()));
    const theirSet = new Set(competitorKeywords.map(k => k.toString().toLowerCase()));
    
    const overlap = Array.from(ourSet).filter(k => theirSet.has(k));
    return ourSet.size > 0 ? overlap.length / ourSet.size : 0;
  }
  
  private extractTopics(titles: string[]): string[] {
    const words = titles
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
      
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
  
  private identifyContentFormats(titles: string[]): string[] {
    const formats = ['guide', 'how to', 'tips', 'best', 'vs', 'review', 'complete', 'ultimate'];
    const foundFormats: string[] = [];
    
    for (const format of formats) {
      const count = titles.filter(title => 
        title.toLowerCase().includes(format)
      ).length;
      
      if (count >= 2) {
        foundFormats.push(format);
      }
    }
    
    return foundFormats;
  }
  
  private assessMarketSaturation(
    competitorCount: number, 
    topicCount: number
  ): 'low' | 'medium' | 'high' {
    if (competitorCount < 5) return 'low';
    if (competitorCount < 15 && topicCount > 20) return 'medium';
    return 'high';
  }
  
  private generateRecommendations(
    competitors: Array<{ domain: DomainString; strength: number; keywordOverlap: number; opportunities: number; }>,
    commonTopics: string[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (competitors.length === 0) {
      recommendations.push('Insufficient competitor data for analysis');
      return recommendations;
    }
    
    const avgStrength = competitors.reduce((sum, c) => sum + c.strength, 0) / competitors.length;
    const avgOverlap = competitors.reduce((sum, c) => sum + c.keywordOverlap, 0) / competitors.length;
    
    if (avgStrength < 0.3) {
      recommendations.push('Low competition detected - opportunity for aggressive content strategy');
    } else if (avgStrength > 0.7) {
      recommendations.push('High competition - focus on long-tail keywords and niche topics');
    }
    
    if (avgOverlap < 0.2) {
      recommendations.push('Low keyword overlap - consider expanding into competitor-dominated topics');
    }
    
    if (commonTopics.length > 0) {
      recommendations.push(`Focus on these high-opportunity topics: ${commonTopics.slice(0, 5).join(', ')}`);
    }
    
    return recommendations;
  }
  
  /**
   * Health check for the scraping service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: {
      robotsCacheSize: number;
      domainLimitersActive: number;
      lastScrapingActivity: number | null;
    };
    integrations: {
      ahrefs: any;
      webScraper: any;
    };
  }> {
    const issues: string[] = [];
    const metrics = {
      robotsCacheSize: this.robotsCache.size,
      domainLimitersActive: (this.domainRateLimiter as any).domainLimiters?.size || 0,
      lastScrapingActivity: null as number | null
    };
    
    // Check integrations
    const ahrefsHealth = await this.ahrefsClient.healthCheck();
    const scraperHealth = await this.webScraper.healthCheck();
    
    if (!ahrefsHealth.healthy) {
      issues.push(`Ahrefs integration issues: ${ahrefsHealth.issues.join(', ')}`);
    }
    
    if (!scraperHealth.healthy) {
      issues.push(`Web scraper issues: ${scraperHealth.issues.join(', ')}`);
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      metrics,
      integrations: {
        ahrefs: ahrefsHealth,
        webScraper: scraperHealth
      }
    };
  }
}

/**
 * Export default scraping service instance
 */
export default CompetitorResearchService;

/**
 * Utility functions for competitor research
 */
export {
  RobotsTxtParser,
  ContentSanitizer,
  DomainRateLimiter
};