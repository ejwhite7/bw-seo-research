import { BaseApiClient } from './base-client';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

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
}

export interface ScrapeRequest {
  urls: string[];
  extractContent?: boolean;
  respectRobots?: boolean;
  userAgent?: string;
  timeout?: number;
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
}

export class WebScraper extends BaseApiClient {
  private static instance: WebScraper | null = null;
  private readonly defaultUserAgent = 'Mozilla/5.0 (compatible; Olli-Social-SEO-Bot/1.0; +https://ollisocial.com/bot)';
  private robotsCache = new Map<string, { allowed: boolean; crawlDelay: number; timestamp: number }>();
  
  constructor(redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: '', // No base URL for scraping
      apiKey: '', // No API key needed
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
    
    super(config, 'scraper');
    
    // Override with factory-created instances
    this.rateLimiter = RateLimiterFactory.createScraperLimiter(redis);
    this.circuitBreaker = CircuitBreakerFactory.createScraperBreaker();
    
    // Clean robots cache periodically (every hour)
    setInterval(() => this.cleanRobotsCache(), 60 * 60 * 1000);
  }
  
  public static getInstance(redis?: any): WebScraper {
    if (!this.instance) {
      this.instance = new WebScraper(redis);
    }
    return this.instance;
  }
  
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
  
  protected async executeRequest<T>(
    endpoint: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: any;
      timeout: number;
    }
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);
    
    try {
      const response = await fetch(endpoint, {
        method: options.method,
        headers: options.headers,
        signal: controller.signal,
        redirect: 'follow', // Follow redirects automatically
        referrerPolicy: 'no-referrer-when-downgrade'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const scraped = this.parseHtml(endpoint, html, response);
      
      return {
        data: scraped as T,
        success: true
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if ((error as Error).name === 'AbortError') {
        throw ErrorHandler.handleNetworkError(error as Error, {
          url: endpoint,
          method: 'GET',
          timeout: true
        });
      }
      
      throw ErrorHandler.handleNetworkError(error as Error, {
        url: endpoint,
        method: 'GET',
        timeout: false
      });
    }
  }
  
  /**
   * Scrape multiple URLs with compliance and rate limiting
   */
  async scrapeUrls(request: ScrapeRequest): Promise<ScrapingResult> {
    const {
      urls,
      extractContent = false,
      respectRobots = true,
      userAgent = this.defaultUserAgent,
      timeout = 15000
    } = request;
    
    const results: ScrapingResult = {
      successful: [],
      failed: [],
      robotsBlocked: [],
      totalAttempted: urls.length,
      successRate: 0
    };
    
    // Group URLs by domain for robots.txt checking and rate limiting
    const urlsByDomain = this.groupUrlsByDomain(urls);
    
    Sentry.addBreadcrumb({
      message: `Scraping ${urls.length} URLs across ${Object.keys(urlsByDomain).length} domains`,
      level: 'info',
      category: 'scraping',
      data: { 
        totalUrls: urls.length, 
        domains: Object.keys(urlsByDomain).length,
        respectRobots,
        extractContent
      }
    });
    
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
                cost: 0.001 // Minimal cost for scraping
              }),
              {
                maxAttempts: 2,
                provider: 'scraper',
                onRetry: (error, attempt) => {
                  console.warn(`Retrying scrape for ${url} (attempt ${attempt}):`, error.message);
                }
              }
            );
            
            if (response.success && response.data) {
              // Enhance content if requested
              if (extractContent && response.data.content) {
                response.data.wordCount = this.countWords(response.data.content);
              }
              
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
    
    Sentry.addBreadcrumb({
      message: `Scraping completed: ${results.successful.length}/${results.totalAttempted} successful`,
      level: results.successRate > 0.8 ? 'info' : 'warning',
      category: 'scraping-complete',
      data: {
        successRate: results.successRate,
        successful: results.successful.length,
        failed: results.failed.length,
        robotsBlocked: results.robotsBlocked.length
      }
    });
    
    return results;
  }
  
  /**
   * Analyze competitor domain for content patterns
   */
  async analyzeCompetitorDomain(
    domain: string,
    options: {
      maxPages?: number;
      extractContent?: boolean;
      identifyTopics?: boolean;
      respectRobots?: boolean;
    } = {}
  ): Promise<CompetitorDomainAnalysis> {
    const {
      maxPages = 50,
      extractContent = true,
      identifyTopics = true,
      respectRobots = true
    } = options;
    
    // First, get a sitemap or sample URLs for the domain
    const urls = await this.discoverDomainUrls(domain, maxPages);
    
    const scrapeResult = await this.scrapeUrls({
      urls,
      extractContent,
      respectRobots,
      timeout: 15000
    });
    
    const analysis: CompetitorDomainAnalysis = {
      domain,
      pages: scrapeResult.successful,
      totalPages: scrapeResult.successful.length
    };
    
    // Identify topic clusters if requested
    if (identifyTopics && scrapeResult.successful.length > 5) {
      analysis.topicClusters = this.identifyTopicClusters(scrapeResult.successful);
    }
    
    return analysis;
  }
  
  /**
   * Extract competitor titles for keyword analysis
   */
  async extractCompetitorTitles(
    urls: string[],
    options: {
      respectRobots?: boolean;
      batchSize?: number;
      onProgress?: (processed: number, total: number) => void;
    } = {}
  ): Promise<Array<{
    url: string;
    title: string;
    metaDescription?: string;
    h1?: string;
    wordCount?: number;
  }>> {
    const {
      respectRobots = true,
      batchSize = 20,
      onProgress
    } = options;
    
    const results: Array<{
      url: string;
      title: string;
      metaDescription?: string;
      h1?: string;
      wordCount?: number;
    }> = [];
    
    // Process in batches to manage rate limits
    const batches = this.chunkArray(urls, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      const scrapeResult = await this.scrapeUrls({
        urls: batch,
        extractContent: false, // Just need titles
        respectRobots
      });
      
      // Extract title information
      for (const page of scrapeResult.successful) {
        if (page.title) {
          results.push({
            url: page.url,
            title: page.title,
            metaDescription: page.metaDescription,
            h1: page.h1,
            wordCount: page.wordCount
          });
        }
      }
      
      if (onProgress) {
        onProgress(i + 1, batches.length);
      }
      
      // Delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }
  
  private parseHtml(url: string, html: string, response: Response): ScrapedContent {
    // Basic HTML parsing - in production, consider using a proper parser like jsdom
    const result: ScrapedContent = { url, title: '' };
    
    try {
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      result.title = titleMatch ? this.cleanText(titleMatch[1]) : '';
      
      // Extract meta description
      const metaDescMatch = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"']*)["\'][^>]*>/i);
      result.metaDescription = metaDescMatch ? this.cleanText(metaDescMatch[1]) : undefined;
      
      // Extract H1
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      result.h1 = h1Match ? this.cleanText(h1Match[1]) : undefined;
      
      // Extract H2 tags
      const h2Matches = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
      result.h2Tags = h2Matches ? 
        h2Matches.map(h2 => this.cleanText(h2.replace(/<h2[^>]*>|<\/h2>/gi, ''))) : [];
      
      // Extract canonical URL
      const canonicalMatch = html.match(/<link[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"']*)["\'][^>]*>/i);
      result.canonical = canonicalMatch ? canonicalMatch[1] : undefined;
      
      // Extract basic content (remove HTML tags)
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        result.content = this.extractTextContent(bodyMatch[1]);
        result.wordCount = this.countWords(result.content);
      }
      
      // Extract last modified from headers
      const lastModified = response.headers.get('last-modified');
      result.lastModified = lastModified || undefined;
      
      // Extract images
      const imgMatches = html.match(/<img[^>]*src=["\']([^"']*)["\'][^>]*alt=["\']([^"']*)["\'][^>]*>/gi);
      result.images = imgMatches ? imgMatches.map(img => {
        const srcMatch = img.match(/src=["\']([^"']*)["\']/i);
        const altMatch = img.match(/alt=["\']([^"']*)["\']/i);
        return {
          src: srcMatch ? srcMatch[1] : '',
          alt: altMatch ? altMatch[1] : ''
        };
      }).slice(0, 10) : []; // Limit to 10 images
      
    } catch (parseError) {
      console.warn(`Error parsing HTML for ${url}:`, parseError);
    }
    
    return result;
  }
  
  private async checkRobotsTxt(
    domain: string,
    userAgent: string
  ): Promise<{ allowed: boolean; crawlDelay: number }> {
    // Check cache first
    const cacheKey = `robots:${domain}:${userAgent}`;
    const cached = this.robotsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24 hour cache
      return { allowed: cached.allowed, crawlDelay: cached.crawlDelay };
    }
    
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': userAgent }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // If robots.txt doesn't exist, assume allowed
        const result = { allowed: true, crawlDelay: 0 };
        this.robotsCache.set(cacheKey, { ...result, timestamp: Date.now() });
        return result;
      }
      
      const robotsText = await response.text();
      const { allowed, crawlDelay } = this.parseRobotsTxt(robotsText, userAgent);
      
      this.robotsCache.set(cacheKey, { allowed, crawlDelay, timestamp: Date.now() });
      return { allowed, crawlDelay };
      
    } catch (error) {
      console.warn(`Error checking robots.txt for ${domain}:`, (error as Error).message);
      // Default to allowed if we can't check
      const result = { allowed: true, crawlDelay: 1 }; // 1 second default delay
      this.robotsCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    }
  }
  
  private parseRobotsTxt(robotsText: string, userAgent: string): { allowed: boolean; crawlDelay: number } {
    const lines = robotsText.split('\n');
    let currentSection = '';
    let allowed = true;
    let crawlDelay = 0;
    
    for (const line of lines) {
      const cleanLine = line.trim().toLowerCase();
      
      if (cleanLine.startsWith('user-agent:')) {
        const agent = cleanLine.substring(11).trim();
        currentSection = agent === '*' || agent === userAgent.toLowerCase() ? agent : '';
        continue;
      }
      
      if (currentSection && cleanLine.startsWith('disallow:')) {
        const path = cleanLine.substring(9).trim();
        if (path === '/' || path === '') {
          allowed = false;
        }
        // Note: More sophisticated path matching would be needed for production
      }
      
      if (currentSection && cleanLine.startsWith('crawl-delay:')) {
        const delay = parseInt(cleanLine.substring(12).trim());
        if (!isNaN(delay)) {
          crawlDelay = Math.max(crawlDelay, delay);
        }
      }
    }
    
    return { allowed, crawlDelay };
  }
  
  private async discoverDomainUrls(domain: string, maxUrls: number): Promise<string[]> {
    const urls: string[] = [];
    
    try {
      // Try to get sitemap first
      const sitemapUrls = await this.getSitemapUrls(domain);
      urls.push(...sitemapUrls.slice(0, maxUrls));
    } catch (error) {
      console.warn(`Could not fetch sitemap for ${domain}:`, (error as Error).message);
    }
    
    // If we don't have enough URLs, try common page patterns
    if (urls.length < maxUrls / 2) {
      const commonPaths = [
        '/', '/about', '/blog', '/services', '/products', '/contact',
        '/blog/page/1', '/blog/page/2', '/resources', '/case-studies'
      ];
      
      for (const path of commonPaths) {
        if (urls.length >= maxUrls) break;
        urls.push(`https://${domain}${path}`);
      }
    }
    
    return urls.slice(0, maxUrls);
  }
  
  private async getSitemapUrls(domain: string): Promise<string[]> {
    const sitemapUrl = `https://${domain}/sitemap.xml`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(sitemapUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Sitemap not found: ${response.status}`);
    }
    
    const sitemapXml = await response.text();
    const urlMatches = sitemapXml.match(/<loc>(.*?)<\/loc>/g);
    
    return urlMatches ? urlMatches.map(match => 
      match.replace(/<loc>|<\/loc>/g, '').trim()
    ) : [];
  }
  
  private identifyTopicClusters(pages: ScrapedContent[]): Array<{
    topic: string;
    pages: string[];
    keywords: string[];
  }> {
    // Simple clustering based on common words in titles and H1s
    const clusters: Map<string, { pages: string[]; keywords: Set<string> }> = new Map();
    
    for (const page of pages) {
      const text = `${page.title} ${page.h1 || ''}`.toLowerCase();
      const words = text.match(/\b\w{3,}\b/g) || [];
      
      // Find dominant words (simple approach)
      const wordFreq: Record<string, number> = {};
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
      
      const topWords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([word]) => word);
      
      const topic = topWords.join(' ');
      
      if (!clusters.has(topic)) {
        clusters.set(topic, { pages: [], keywords: new Set() });
      }
      
      clusters.get(topic)!.pages.push(page.url);
      topWords.forEach(word => clusters.get(topic)!.keywords.add(word));
    }
    
    return Array.from(clusters.entries()).map(([topic, data]) => ({
      topic,
      pages: data.pages,
      keywords: Array.from(data.keywords)
    }));
  }
  
  private groupUrlsByDomain(urls: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    
    for (const url of urls) {
      try {
        const domain = new URL(url).hostname;
        if (!groups[domain]) {
          groups[domain] = [];
        }
        groups[domain].push(url);
      } catch (error) {
        console.warn(`Invalid URL: ${url}`);
      }
    }
    
    return groups;
  }
  
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }
  
  private extractTextContent(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove styles
      .replace(/<[^>]*>/g, ' ')                     // Remove HTML tags
      .replace(/\s+/g, ' ')                         // Normalize whitespace
      .trim();
  }
  
  private countWords(text: string): number {
    return text.match(/\b\w+\b/g)?.length || 0;
  }
  
  private cleanRobotsCache(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const keysToDelete: string[] = [];
    this.robotsCache.forEach((value, key) => {
      if (value.timestamp < oneDayAgo) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.robotsCache.delete(key));
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}