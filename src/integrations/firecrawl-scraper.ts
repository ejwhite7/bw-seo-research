import FirecrawlApp from '@mendable/firecrawl-js';
import { BaseApiClient } from './base-client';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

export interface FirecrawlScrapedContent {
  url: string;
  title?: string;
  description?: string;
  content?: string;
  markdown?: string;
  html?: string;
  screenshot?: string;
  links?: string[];
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string;
    robots?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogUrl?: string;
    ogImage?: string;
    twitterCard?: string;
    twitterTitle?: string;
    twitterDescription?: string;
    sourceURL?: string;
    statusCode?: number;
    error?: string;
  };
  llm_extraction?: Record<string, any>;
}

export interface FirecrawlScrapeRequest {
  urls: string[];
  formats?: Array<'markdown' | 'html' | 'rawHtml' | 'screenshot'>;
  includeTags?: string[];
  excludeTags?: string[];
  onlyMainContent?: boolean;
  waitFor?: number;
  extractorOptions?: {
    mode: 'llm-extraction-from-markdown' | 'llm-extraction-from-raw-html';
    extractionPrompt?: string;
    extractionSchema?: Record<string, any>;
  };
  timeout?: number;
}

export interface FirecrawlBatchResult {
  successful: FirecrawlScrapedContent[];
  failed: Array<{
    url: string;
    error: string;
    statusCode?: number;
  }>;
  totalAttempted: number;
  successRate: number;
  creditsUsed: number;
}

export class FirecrawlScraper extends BaseApiClient {
  private static instance: FirecrawlScraper | null = null;
  private firecrawlApp: FirecrawlApp;
  private creditsUsed: number = 0;

  constructor(apiKey: string, redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: 'https://api.firecrawl.dev', // Firecrawl API base URL
      apiKey,
      timeout: 30000, // 30 seconds for scraping operations
      retries: 3,
      rateLimiter: {
        capacity: 100, // Firecrawl has higher rate limits
        refillRate: 20,
        refillPeriod: 60000 // 1 minute
      },
      circuitBreaker: {
        failureThreshold: 15,
        recoveryTimeout: 180000, // 3 minutes
        monitoringPeriod: 600000, // 10 minutes
        expectedFailureRate: 0.1 // 10% failure rate acceptable
      },
      cache: {
        ttl: 24 * 60 * 60 * 1000, // 1 day cache
        maxSize: 1000
      }
    };

    super(config, 'firecrawl');

    // Initialize Firecrawl client
    this.firecrawlApp = new FirecrawlApp({ apiKey });

    // Override with factory-created instances
    this.rateLimiter = RateLimiterFactory.createScraperLimiter(redis);
    this.circuitBreaker = CircuitBreakerFactory.createScraperBreaker();
  }

  public static getInstance(apiKey: string, redis?: any): FirecrawlScraper {
    if (!FirecrawlScraper.instance) {
      FirecrawlScraper.instance = new FirecrawlScraper(apiKey, redis);
    }
    return FirecrawlScraper.instance;
  }

  /**
   * Scrape a single URL using Firecrawl
   */
  async scrapeUrl(
    url: string,
    options: Partial<FirecrawlScrapeRequest> = {}
  ): Promise<ApiResponse<FirecrawlScrapedContent>> {
    const startTime = Date.now();

    try {
      await this.circuitBreaker.execute(`scrape-${url}`);
      await this.rateLimiter.consume('scrape');

      const scrapeOptions = {
        formats: options.formats || ['markdown', 'html'],
        includeTags: options.includeTags || ['title', 'meta', 'h1', 'h2', 'h3', 'p', 'a'],
        excludeTags: options.excludeTags || ['nav', 'footer', 'aside', 'script', 'style'],
        onlyMainContent: options.onlyMainContent ?? true,
        waitFor: options.waitFor || 0,
        timeout: options.timeout || 30000
      };

      console.log(`🔥 Scraping URL with Firecrawl: ${url}`);

      const result = await RetryHandler.withRetry(
        async () => {
          const scrapeResult = await this.firecrawlApp.scrapeUrl(url, scrapeOptions);

          if (!scrapeResult.success) {
            throw new Error(`Firecrawl scrape failed: ${scrapeResult.error}`);
          }

          return scrapeResult;
        },
        {
          maxAttempts: 3,
          provider: 'firecrawl',
          onRetry: (error, attempt) => {
            console.warn(`Retrying Firecrawl scrape for ${url} (attempt ${attempt}):`, error.message);
          }
        }
      );

      const scrapedData: FirecrawlScrapedContent = {
        url,
        title: result.data?.metadata?.title || '',
        description: result.data?.metadata?.description || '',
        content: result.data?.markdown || result.data?.content || '',
        markdown: result.data?.markdown,
        html: result.data?.html,
        screenshot: result.data?.screenshot,
        links: result.data?.links || [],
        metadata: result.data?.metadata || {},
        llm_extraction: result.data?.llm_extraction
      };

      // Track credits used (estimate)
      this.creditsUsed += 1;

      const responseTime = Date.now() - startTime;
      this.recordMetrics({
        operation: 'scrape',
        success: true,
        responseTime,
        cost: 0.002 // Estimated cost per scrape
      });

      console.log(`✅ Successfully scraped ${url} in ${responseTime}ms`);

      return {
        success: true,
        data: scrapedData,
        metadata: {
          provider: 'firecrawl',
          responseTime,
          creditsUsed: 1
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.recordMetrics({
        operation: 'scrape',
        success: false,
        responseTime,
        error: errorMessage
      });

      console.error(`❌ Failed to scrape ${url}:`, errorMessage);

      Sentry.captureException(error, {
        tags: {
          component: 'firecrawl-scraper',
          operation: 'scrape',
          url
        }
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: 'firecrawl',
          responseTime
        }
      };
    }
  }

  /**
   * Scrape multiple URLs in batch using Firecrawl
   */
  async scrapeBatch(
    urls: string[],
    options: Partial<FirecrawlScrapeRequest> = {}
  ): Promise<FirecrawlBatchResult> {
    const results: FirecrawlBatchResult = {
      successful: [],
      failed: [],
      totalAttempted: urls.length,
      successRate: 0,
      creditsUsed: 0
    };

    console.log(`🔥 Starting Firecrawl batch scrape for ${urls.length} URLs`);

    Sentry.addBreadcrumb({
      message: `Starting Firecrawl batch scrape for ${urls.length} URLs`,
      level: 'info',
      category: 'scraping',
      data: {
        totalUrls: urls.length,
        options
      }
    });

    // Process URLs with rate limiting
    for (const url of urls) {
      try {
        const result = await this.scrapeUrl(url, options);

        if (result.success && result.data) {
          results.successful.push(result.data);
          results.creditsUsed += result.metadata?.creditsUsed || 1;
        } else {
          results.failed.push({
            url,
            error: result.error || 'Unknown error'
          });
        }

        // Add delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({
          url,
          error: errorMessage
        });

        console.warn(`Failed to scrape ${url}:`, errorMessage);
      }
    }

    results.successRate = results.successful.length / results.totalAttempted;

    console.log(`🔥 Firecrawl batch scrape completed: ${results.successful.length}/${results.totalAttempted} successful`);

    Sentry.addBreadcrumb({
      message: `Firecrawl batch scrape completed: ${results.successful.length}/${results.totalAttempted} successful`,
      level: results.successRate > 0.8 ? 'info' : 'warning',
      category: 'scraping-complete',
      data: {
        successRate: results.successRate,
        successful: results.successful.length,
        failed: results.failed.length,
        creditsUsed: results.creditsUsed
      }
    });

    return results;
  }

  /**
   * Use Firecrawl's LLM extraction feature
   */
  async extractWithLLM(
    url: string,
    extractionPrompt: string,
    schema?: Record<string, any>
  ): Promise<ApiResponse<any>> {
    try {
      console.log(`🧠 Extracting data from ${url} using Firecrawl LLM extraction`);

      const result = await this.firecrawlApp.scrapeUrl(url, {
        formats: ['markdown'],
        extractorOptions: {
          mode: 'llm-extraction-from-markdown',
          extractionPrompt,
          extractionSchema: schema
        }
      });

      if (!result.success) {
        throw new Error(`LLM extraction failed: ${result.error}`);
      }

      this.creditsUsed += 5; // LLM extraction uses more credits

      return {
        success: true,
        data: result.data?.llm_extraction || result.data,
        metadata: {
          provider: 'firecrawl',
          creditsUsed: 5
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`❌ LLM extraction failed for ${url}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: 'firecrawl'
        }
      };
    }
  }

  /**
   * Crawl an entire website using Firecrawl
   */
  async crawlWebsite(
    baseUrl: string,
    options: {
      maxPages?: number;
      includePaths?: string[];
      excludePaths?: string[];
      allowBackwardLinks?: boolean;
      allowExternalLinks?: boolean;
    } = {}
  ): Promise<ApiResponse<FirecrawlScrapedContent[]>> {
    try {
      console.log(`🕷️ Crawling website: ${baseUrl}`);

      const crawlResult = await this.firecrawlApp.crawlUrl(baseUrl, {
        limit: options.maxPages || 10,
        scrapeOptions: {
          formats: ['markdown', 'html'],
          onlyMainContent: true
        },
        includePaths: options.includePaths,
        excludePaths: options.excludePaths,
        allowBackwardCrawling: options.allowBackwardLinks ?? false,
        allowExternalContentLinks: options.allowExternalLinks ?? false
      });

      if (!crawlResult.success) {
        throw new Error(`Website crawl failed: ${crawlResult.error}`);
      }

      const pages: FirecrawlScrapedContent[] = crawlResult.data?.map((page: any) => ({
        url: page.metadata?.sourceURL || '',
        title: page.metadata?.title || '',
        description: page.metadata?.description || '',
        content: page.markdown || page.content || '',
        markdown: page.markdown,
        html: page.html,
        links: page.links || [],
        metadata: page.metadata || {}
      })) || [];

      this.creditsUsed += pages.length;

      console.log(`✅ Successfully crawled ${pages.length} pages from ${baseUrl}`);

      return {
        success: true,
        data: pages,
        metadata: {
          provider: 'firecrawl',
          creditsUsed: pages.length
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`❌ Website crawl failed for ${baseUrl}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: 'firecrawl'
        }
      };
    }
  }

  /**
   * Get current credits usage
   */
  getCreditsUsed(): number {
    return this.creditsUsed;
  }

  /**
   * Reset credits counter
   */
  resetCreditsCounter(): void {
    this.creditsUsed = 0;
  }

  /**
   * Health check for Firecrawl API
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Test with a simple scrape of a reliable URL
      const testResult = await this.scrapeUrl('https://httpbin.org/html');

      return {
        healthy: testResult.success,
        message: testResult.success ? 'Firecrawl API is healthy' : testResult.error
      };

    } catch (error) {
      return {
        healthy: false,
        message: `Firecrawl health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    console.log('🔥 Shutting down Firecrawl scraper...');

    // Close any open connections if needed
    // Firecrawl SDK doesn't require explicit cleanup

    FirecrawlScraper.instance = null;

    console.log('✅ Firecrawl scraper shutdown complete');
  }
}

/**
 * Factory function to create Firecrawl scraper instance
 */
export function createFirecrawlScraper(apiKey: string, redis?: any): FirecrawlScraper {
  return FirecrawlScraper.getInstance(apiKey, redis);
}

/**
 * Check if Firecrawl is configured
 */
export function isFirecrawlConfigured(): boolean {
  return !!(
    process.env.FIRECRAWL_API_KEY &&
    process.env.FIRECRAWL_API_KEY !== 'your-firecrawl-api-key'
  );
}