import { BaseApiClient } from './base-client';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import { FirecrawlScraper, FirecrawlScrapedContent, isFirecrawlConfigured } from './firecrawl-scraper';
import * as Sentry from '@sentry/nextjs';

// Keep the existing interfaces for backward compatibility
export interface ScrapedContent {
  url: string;
  title: string;
  metaDescription?: string;
  h1?: string;
  h2Tags?: string[];
  content?: string;
  wordCount?: number;
  lastModified?: string;
  canonical?: string;
  schema?: any[];
  images?: Array<{
    src: string;
    alt: string;
    title?: string;
  }>;
  links?: Array<{
    href: string;
    text: string;
    rel?: string;
  }>;
  provider?: 'firecrawl' | 'http' | 'mock';
}

export interface ScrapeRequest {
  urls: string[];
  extractContent?: boolean;
  respectRobots?: boolean;
  userAgent?: string;
  timeout?: number;
  preferFirecrawl?: boolean;
}

export interface CompetitorDomainAnalysis {
  domain: string;
  pages: ScrapedContent[];
  totalPages: number;
  topicClusters?: Array<{
    topic: string;
    pages: string[];
    keywords: string[];
  }>;
  contentGaps?: string[];
}

export interface ScrapingResult {
  successful: ScrapedContent[];
  failed: Array<{
    url: string;
    error: string;
    statusCode?: number;
  }>;
  robotsBlocked: string[];
  totalAttempted: number;
  successRate: number;
  provider: 'firecrawl' | 'http' | 'mixed';
  creditsUsed?: number;
}

export class EnhancedWebScraper extends BaseApiClient {
  private static instance: EnhancedWebScraper | null = null;
  private readonly defaultUserAgent = 'Mozilla/5.0 (compatible; Olli-Social-SEO-Bot/1.0; +https://ollisocial.com/bot)';
  private robotsCache = new Map<string, { allowed: boolean; crawlDelay: number; timestamp: number }>();
  private firecrawlScraper?: FirecrawlScraper;
  private useFirecrawl: boolean = false;

  constructor(redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: '', // No base URL for scraping
      apiKey: '', // No API key needed for HTTP scraping
      timeout: 15000, // 15 seconds
      retries: 2,
      rateLimiter: {
        capacity: 30,
        refillRate: 5,
        refillPeriod: 10000 // 10 seconds - very conservative for scraping
      },
      circuitBreaker: {
        failureThreshold: 10,
        recoveryTimeout: 120000, // 2 minutes
        monitoringPeriod: 600000, // 10 minutes
        expectedFailureRate: 0.2 // 20% failure rate acceptable for scraping
      },
      cache: {
        ttl: 24 * 60 * 60 * 1000, // 1 day - pages change frequently
        maxSize: 2000
      }
    };

    super(config, 'enhanced-scraper');

    // Override with factory-created instances
    this.rateLimiter = RateLimiterFactory.createScraperLimiter(redis);
    this.circuitBreaker = CircuitBreakerFactory.createScraperBreaker();

    // Initialize Firecrawl if configured
    if (isFirecrawlConfigured() && process.env.FIRECRAWL_API_KEY) {
      try {
        this.firecrawlScraper = new FirecrawlScraper(process.env.FIRECRAWL_API_KEY, redis);
        this.useFirecrawl = true;
        console.log('✅ Firecrawl scraper initialized');
      } catch (error) {
        console.warn('Failed to initialize Firecrawl, falling back to HTTP scraping:', error);
        this.useFirecrawl = false;
      }
    } else {
      console.log('ℹ️ Firecrawl not configured, using HTTP scraping');
    }

    // Clean robots cache periodically (every hour)
    setInterval(() => this.cleanRobotsCache(), 60 * 60 * 1000);
  }

  public static getInstance(redis?: any): EnhancedWebScraper {
    if (!this.instance) {
      this.instance = new EnhancedWebScraper(redis);
    }
    return this.instance;
  }

  /**
   * Main scraping method that chooses the best provider
   */
  async scrapeUrls(request: ScrapeRequest): Promise<ScrapingResult> {
    const {
      urls,
      extractContent = true,
      respectRobots = true,
      userAgent = this.defaultUserAgent,
      timeout = 30000,
      preferFirecrawl = true
    } = request;

    const results: ScrapingResult = {
      successful: [],
      failed: [],
      robotsBlocked: [],
      totalAttempted: urls.length,
      successRate: 0,
      provider: 'mixed',
      creditsUsed: 0
    };

    console.log(`🕷️ Starting enhanced scraping for ${urls.length} URLs`);

    // Decide which provider to use
    const shouldUseFirecrawl = this.useFirecrawl && preferFirecrawl && this.firecrawlScraper;

    if (shouldUseFirecrawl) {
      console.log('🔥 Using Firecrawl for enhanced scraping');
      return await this.scrapeWithFirecrawl(urls, request);
    } else {
      console.log('🌐 Using HTTP scraping (fallback)');
      return await this.scrapeWithHttp(urls, request);
    }
  }

  /**
   * Scrape using Firecrawl (primary method)
   */
  private async scrapeWithFirecrawl(urls: string[], request: ScrapeRequest): Promise<ScrapingResult> {
    if (!this.firecrawlScraper) {
      throw new Error('Firecrawl scraper not initialized');
    }

    const firecrawlRequest = {
      urls,
      formats: ['markdown', 'html'] as const,
      onlyMainContent: request.extractContent ?? true,
      timeout: request.timeout || 30000
    };

    const firecrawlResult = await this.firecrawlScraper.scrapeBatch(urls, firecrawlRequest);

    // Convert Firecrawl results to our standard format
    const successful: ScrapedContent[] = firecrawlResult.successful.map(this.convertFirecrawlToStandard);
    const failed = firecrawlResult.failed;

    return {
      successful,
      failed,
      robotsBlocked: [], // Firecrawl handles robots.txt automatically
      totalAttempted: urls.length,
      successRate: firecrawlResult.successRate,
      provider: 'firecrawl',
      creditsUsed: firecrawlResult.creditsUsed
    };
  }

  /**
   * Scrape using HTTP method (fallback)
   */
  private async scrapeWithHttp(urls: string[], request: ScrapeRequest): Promise<ScrapingResult> {
    const results: ScrapingResult = {
      successful: [],
      failed: [],
      robotsBlocked: [],
      totalAttempted: urls.length,
      successRate: 0,
      provider: 'http'
    };

    const {
      extractContent = true,
      respectRobots = true,
      userAgent = this.defaultUserAgent,
      timeout = 15000
    } = request;

    // Group URLs by domain for efficient processing
    const urlsByDomain = urls.reduce((acc, url) => {
      try {
        const domain = new URL(url).hostname;
        if (!acc[domain]) acc[domain] = [];
        acc[domain].push(url);
      } catch (error) {
        results.failed.push({
          url,
          error: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
      return acc;
    }, {} as Record<string, string[]>);

    for (const [domain, domainUrls] of Object.entries(urlsByDomain)) {
      try {
        // Check robots.txt if required
        if (respectRobots) {
          const robotsCheck = await this.checkRobotsTxt(domain, userAgent);
          if (!robotsCheck.allowed) {
            results.robotsBlocked.push(...domainUrls);
            continue;
          }

          // Respect crawl delay
          if (robotsCheck.crawlDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, robotsCheck.crawlDelay * 1000));
          }
        }

        // Process URLs for this domain with rate limiting
        for (const url of domainUrls) {
          try {
            const cacheKey = `scrape:${url}:${extractContent}`;

            const response = await RetryHandler.withRetry(
              () => this.makeRequest<ScrapedContent>(url, {
                method: 'GET',
                headers: {
                  ...this.getDefaultHeaders(),
                  'User-Agent': userAgent
                },
                cacheKey,
                timeout,
                cost: 0.001 // Minimal cost for HTTP scraping
              }),
              {
                maxAttempts: 2,
                provider: 'http-scraper',
                onRetry: (error, attempt) => {
                  console.warn(`Retrying HTTP scrape for ${url} (attempt ${attempt}):`, error.message);
                }
              }
            );

            if (response.success && response.data) {
              // Enhance content if requested
              if (extractContent && response.data.content) {
                response.data.wordCount = this.countWords(response.data.content);
              }

              response.data.provider = 'http';
              results.successful.push(response.data);
            }

            // Add delay between requests to the same domain
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

          } catch (error) {
            const apiError = error as any;
            results.failed.push({
              url,
              error: apiError.message,
              statusCode: apiError.statusCode
            });

            console.warn(`Failed to scrape ${url}:`, (error as Error).message);
          }
        }

      } catch (domainError) {
        // If domain-level error, mark all URLs as failed
        results.failed.push(...domainUrls.map(url => ({
          url,
          error: `Domain error: ${(domainError as Error).message}`
        })));
      }
    }

    results.successRate = results.successful.length / results.totalAttempted;

    return results;
  }

  /**
   * Convert Firecrawl result to standard ScrapedContent format
   */
  private convertFirecrawlToStandard(firecrawlData: FirecrawlScrapedContent): ScrapedContent {
    return {
      url: firecrawlData.url,
      title: firecrawlData.title || firecrawlData.metadata?.title || '',
      metaDescription: firecrawlData.description || firecrawlData.metadata?.description,
      content: firecrawlData.content || firecrawlData.markdown || '',
      wordCount: firecrawlData.content ? this.countWords(firecrawlData.content) : undefined,
      canonical: firecrawlData.metadata?.sourceURL,
      h1: this.extractH1FromMarkdown(firecrawlData.markdown || ''),
      h2Tags: this.extractH2FromMarkdown(firecrawlData.markdown || ''),
      links: firecrawlData.links?.map(link => ({
        href: link,
        text: '',
        rel: ''
      })) || [],
      provider: 'firecrawl'
    };
  }

  /**
   * Extract H1 tags from markdown
   */
  private extractH1FromMarkdown(markdown: string): string | undefined {
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    return h1Match ? h1Match[1].trim() : undefined;
  }

  /**
   * Extract H2 tags from markdown
   */
  private extractH2FromMarkdown(markdown: string): string[] {
    const h2Matches = markdown.match(/^##\s+(.+)$/gm);
    return h2Matches ? h2Matches.map(match => match.replace(/^##\s+/, '').trim()) : [];
  }

  /**
   * Enhanced competitor analysis using Firecrawl's LLM extraction
   */
  async analyzeCompetitorContent(
    urls: string[],
    extractionPrompt?: string
  ): Promise<CompetitorDomainAnalysis[]> {
    if (!this.useFirecrawl || !this.firecrawlScraper) {
      console.warn('Firecrawl not available, using basic competitor analysis');
      return await this.basicCompetitorAnalysis(urls);
    }

    const analyses: CompetitorDomainAnalysis[] = [];
    const prompt = extractionPrompt || `
      Extract the following information from this page:
      - Main topic/theme
      - Target keywords (if visible)
      - Content type (blog post, product page, service page, etc.)
      - Key sections/topics covered
      - Unique value propositions mentioned
    `;

    // Group URLs by domain
    const urlsByDomain = urls.reduce((acc, url) => {
      try {
        const domain = new URL(url).hostname;
        if (!acc[domain]) acc[domain] = [];
        acc[domain].push(url);
      } catch (error) {
        console.warn(`Invalid URL: ${url}`);
      }
      return acc;
    }, {} as Record<string, string[]>);

    for (const [domain, domainUrls] of Object.entries(urlsByDomain)) {
      try {
        const pages: ScrapedContent[] = [];

        for (const url of domainUrls) {
          try {
            // Use LLM extraction for richer content analysis
            const extractionResult = await this.firecrawlScraper.extractWithLLM(url, prompt);

            if (extractionResult.success) {
              const standardContent = await this.firecrawlScraper.scrapeUrl(url);

              if (standardContent.success) {
                const converted = this.convertFirecrawlToStandard(standardContent.data);
                // Enhance with LLM extraction data
                converted.schema = extractionResult.data ? [extractionResult.data] : undefined;
                pages.push(converted);
              }
            }

            // Rate limit between requests
            await new Promise(resolve => setTimeout(resolve, 1000));

          } catch (error) {
            console.warn(`Failed to analyze ${url}:`, error);
          }
        }

        if (pages.length > 0) {
          analyses.push({
            domain,
            pages,
            totalPages: pages.length,
            topicClusters: this.identifyTopicClusters(pages),
            contentGaps: this.identifyContentGaps(pages)
          });
        }

      } catch (error) {
        console.warn(`Failed to analyze domain ${domain}:`, error);
      }
    }

    return analyses;
  }

  /**
   * Basic competitor analysis without Firecrawl
   */
  private async basicCompetitorAnalysis(urls: string[]): Promise<CompetitorDomainAnalysis[]> {
    const scrapeResult = await this.scrapeUrls({ urls });

    // Group by domain
    const pagesByDomain = scrapeResult.successful.reduce((acc, page) => {
      try {
        const domain = new URL(page.url).hostname;
        if (!acc[domain]) acc[domain] = [];
        acc[domain].push(page);
      } catch (error) {
        console.warn(`Invalid URL: ${page.url}`);
      }
      return acc;
    }, {} as Record<string, ScrapedContent[]>);

    return Object.entries(pagesByDomain).map(([domain, pages]) => ({
      domain,
      pages,
      totalPages: pages.length,
      topicClusters: this.identifyTopicClusters(pages),
      contentGaps: this.identifyContentGaps(pages)
    }));
  }

  /**
   * Identify topic clusters from scraped content
   */
  private identifyTopicClusters(pages: ScrapedContent[]): Array<{
    topic: string;
    pages: string[];
    keywords: string[];
  }> {
    // Basic clustering based on common words in titles and H1 tags
    const topicMap = new Map<string, { pages: string[]; keywords: Set<string> }>();

    pages.forEach(page => {
      const text = `${page.title} ${page.h1 || ''} ${page.h2Tags?.join(' ') || ''}`.toLowerCase();
      const words = text.match(/\b\w+\b/g) || [];

      // Find common themes
      const themes = words.filter(word => word.length > 4); // Filter out short words

      themes.forEach(theme => {
        if (!topicMap.has(theme)) {
          topicMap.set(theme, { pages: [], keywords: new Set() });
        }

        const cluster = topicMap.get(theme)!;
        if (!cluster.pages.includes(page.url)) {
          cluster.pages.push(page.url);
          words.forEach(word => cluster.keywords.add(word));
        }
      });
    });

    // Convert to array and filter by relevance
    return Array.from(topicMap.entries())
      .filter(([_, cluster]) => cluster.pages.length > 1) // Only clusters with multiple pages
      .sort((a, b) => b[1].pages.length - a[1].pages.length) // Sort by cluster size
      .slice(0, 10) // Top 10 clusters
      .map(([topic, cluster]) => ({
        topic,
        pages: cluster.pages,
        keywords: Array.from(cluster.keywords).slice(0, 20) // Top 20 keywords per cluster
      }));
  }

  /**
   * Identify potential content gaps
   */
  private identifyContentGaps(pages: ScrapedContent[]): string[] {
    // Basic gap analysis - this could be enhanced with more sophisticated NLP
    const commonTopics = [
      'pricing', 'features', 'benefits', 'comparison', 'reviews', 'tutorial',
      'getting started', 'best practices', 'case study', 'integration',
      'api', 'documentation', 'support', 'faq', 'about', 'contact'
    ];

    const coveredTopics = new Set<string>();

    pages.forEach(page => {
      const text = `${page.title} ${page.content || ''}`.toLowerCase();
      commonTopics.forEach(topic => {
        if (text.includes(topic)) {
          coveredTopics.add(topic);
        }
      });
    });

    return commonTopics.filter(topic => !coveredTopics.has(topic));
  }

  // Keep existing HTTP scraping methods for fallback
  protected getDefaultHeaders(): Record<string, string> {
    return {
      'User-Agent': this.defaultUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    };
  }

  // ... (keep other existing methods like robots.txt checking, HTML parsing, etc.)

  private async checkRobotsTxt(domain: string, userAgent: string): Promise<{ allowed: boolean; crawlDelay: number }> {
    // Implementation would check robots.txt - simplified for now
    return { allowed: true, crawlDelay: 1 };
  }

  private cleanRobotsCache(): void {
    const now = Date.now();
    const ttl = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, entry] of this.robotsCache) {
      if (now - entry.timestamp > ttl) {
        this.robotsCache.delete(key);
      }
    }
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Health check for both scraping methods
   */
  async healthCheck(): Promise<{ healthy: boolean; providers: Record<string, boolean>; message?: string }> {
    const results = {
      healthy: false,
      providers: {
        firecrawl: false,
        http: false
      },
      message: ''
    };

    // Test Firecrawl if available
    if (this.useFirecrawl && this.firecrawlScraper) {
      try {
        const firecrawlHealth = await this.firecrawlScraper.healthCheck();
        results.providers.firecrawl = firecrawlHealth.healthy;
      } catch (error) {
        console.warn('Firecrawl health check failed:', error);
      }
    }

    // Test HTTP scraping
    try {
      const httpTest = await this.scrapeWithHttp(['https://httpbin.org/html'], {
        urls: ['https://httpbin.org/html'],
        extractContent: false
      });
      results.providers.http = httpTest.successRate > 0;
    } catch (error) {
      console.warn('HTTP scraping health check failed:', error);
    }

    results.healthy = results.providers.firecrawl || results.providers.http;
    results.message = `Firecrawl: ${results.providers.firecrawl ? '✅' : '❌'}, HTTP: ${results.providers.http ? '✅' : '❌'}`;

    return results;
  }

  /**
   * Get current provider being used
   */
  getCurrentProvider(): 'firecrawl' | 'http' {
    return this.useFirecrawl ? 'firecrawl' : 'http';
  }

  /**
   * Get credits used (Firecrawl only)
   */
  getCreditsUsed(): number {
    return this.firecrawlScraper?.getCreditsUsed() || 0;
  }

  /**
   * Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    console.log('🔧 Shutting down enhanced scraper...');

    if (this.firecrawlScraper) {
      await this.firecrawlScraper.shutdown();
    }

    EnhancedWebScraper.instance = null;

    console.log('✅ Enhanced scraper shutdown complete');
  }
}