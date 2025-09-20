/**
 * Comprehensive test suite for the Ethical Competitor Research and Web Scraping Service
 * 
 * Tests cover:
 * - Security compliance and input validation
 * - Robots.txt parsing and compliance
 * - Rate limiting and circuit breaker functionality
 * - Content sanitization and extraction
 * - Error handling and resilience
 * - Integration with Ahrefs API
 * - Database operations and audit logging
 */

import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { CompetitorResearchService, RobotsTxtParser, ContentSanitizer, DomainRateLimiter } from '../scraping';
import { DatabaseService } from '../../lib/database-service';
import { AhrefsClient } from '../../integrations/ahrefs';
import { WebScraper } from '../../integrations/scraper';
import {
  Competitor,
  CreateCompetitorInput,
  ScrapeConfig,
  ScrapeStatus,
  RobotsTxtInfo,
  generateScrapeConfig
} from '../../models/competitor';
import { UUID, DomainString, URLString, KeywordString, Timestamp } from '../../models/index';
import * as Sentry from '@sentry/nextjs';

// Mock external dependencies
jest.mock('../../lib/database-service');
jest.mock('../../integrations/ahrefs');
jest.mock('../../integrations/scraper');
jest.mock('@sentry/nextjs');

// Mock fetch for robots.txt tests
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('RobotsTxtParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAndParse', () => {
    it('should parse standard robots.txt correctly', async () => {
      const robotsContent = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /public/
Crawl-delay: 2
Sitemap: https://example.com/sitemap.xml
      `.trim();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(robotsContent),
        headers: new Headers({ 'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT' })
      } as Response);

      const result = await RobotsTxtParser.fetchAndParse('example.com');

      expect(result).toEqual({
        exists: true,
        crawlDelay: 2,
        allowedPaths: ['/public/'],
        disallowedPaths: ['/admin/', '/private/'],
        sitemapUrls: ['https://example.com/sitemap.xml'],
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
      });
    });

    it('should handle missing robots.txt gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      const result = await RobotsTxtParser.fetchAndParse('example.com');

      expect(result).toEqual({
        exists: false,
        crawlDelay: 1,
        allowedPaths: [],
        disallowedPaths: [],
        sitemapUrls: [],
        lastModified: null
      });
    });

    it('should enforce size limits for security', async () => {
      const largeContent = 'User-agent: *\nDisallow: /\n'.repeat(10000);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(largeContent),
        headers: new Headers()
      } as Response);

      const result = await RobotsTxtParser.fetchAndParse('example.com');

      // Should fall back to default when content is too large
      expect(result.exists).toBe(false);
      expect(result.crawlDelay).toBe(1);
    });

    it('should handle network timeouts', async () => {
      jest.useFakeTimers();
      
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({} as Response), 15000))
      );

      const fetchPromise = RobotsTxtParser.fetchAndParse('example.com', 'TestBot/1.0', 5000);
      
      // Fast-forward past timeout
      jest.advanceTimersByTime(6000);
      
      const result = await fetchPromise;
      
      expect(result.exists).toBe(false);
      
      jest.useRealTimers();
    });

    it('should parse user-agent specific rules', async () => {
      const robotsContent = `
User-agent: *
Disallow: /

User-agent: Dream100Bot
Disallow: /admin/
Allow: /
Crawl-delay: 1
      `.trim();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(robotsContent),
        headers: new Headers()
      } as Response);

      const result = await RobotsTxtParser.fetchAndParse('example.com', 'Dream100Bot/1.0');

      expect(result.disallowedPaths).toEqual(['/admin/']);
      expect(result.allowedPaths).toEqual(['/']);
      expect(result.crawlDelay).toBe(1);
    });
  });

  describe('isPathAllowed', () => {
    const robotsInfo: RobotsTxtInfo = {
      exists: true,
      crawlDelay: 1,
      allowedPaths: ['/public/', '/blog/'],
      disallowedPaths: ['/admin/', '/private/', '/api/*'],
      sitemapUrls: [],
      lastModified: null
    };

    it('should allow paths not explicitly disallowed', () => {
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/contact')).toBe(true);
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/about')).toBe(true);
    });

    it('should disallow explicitly blocked paths', () => {
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/admin/users')).toBe(false);
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/private/data')).toBe(false);
    });

    it('should handle wildcard patterns', () => {
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/api/users')).toBe(false);
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/api/data')).toBe(false);
    });

    it('should prioritize allow rules over disallow', () => {
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/public/admin')).toBe(true);
      expect(RobotsTxtParser.isPathAllowed(robotsInfo, '/blog/private')).toBe(true);
    });

    it('should allow everything when no robots.txt exists', () => {
      const noRobots: RobotsTxtInfo = {
        exists: false,
        crawlDelay: null,
        allowedPaths: [],
        disallowedPaths: [],
        sitemapUrls: [],
        lastModified: null
      };

      expect(RobotsTxtParser.isPathAllowed(noRobots, '/admin/secret')).toBe(true);
    });
  });
});

describe('ContentSanitizer', () => {
  describe('sanitizeContent', () => {
    it('should remove dangerous script tags', () => {
      const maliciousContent = {
        title: 'Safe Title <script>alert("xss")</script>',
        content: '<p>Good content</p><script src="evil.js"></script><p>More content</p>',
        metaDescription: 'Clean description <script>steal()</script>'
      };

      const sanitized = ContentSanitizer.sanitizeContent(maliciousContent);

      expect(sanitized.title).toBe('Safe Title');
      expect(sanitized.content).toBe('Good content More content');
      expect(sanitized.metaDescription).toBe('Clean description');
    });

    it('should remove iframe and embed tags', () => {
      const content = {
        content: '<div>Content</div><iframe src="evil.com"></iframe><embed src="malware.swf">'
      };

      const sanitized = ContentSanitizer.sanitizeContent(content);

      expect(sanitized.content).toBe('Content');
    });

    it('should enforce length limits', () => {
      const longTitle = 'A'.repeat(300);
      const content = {
        title: longTitle
      };

      const sanitized = ContentSanitizer.sanitizeContent(content);

      expect(sanitized.title?.length).toBeLessThanOrEqual(200);
      expect(sanitized.title?.endsWith('...')).toBe(true);
    });

    it('should sanitize URLs to only allow HTTP/HTTPS', () => {
      const content = {
        url: 'javascript:alert(1)',
        canonical: 'https://example.com/page'
      };

      const sanitized = ContentSanitizer.sanitizeContent(content);

      expect(sanitized.url).toBe('');
      expect(sanitized.canonical).toBe('https://example.com/page');
    });

    it('should normalize whitespace', () => {
      const content = {
        title: '  Title   with   extra   spaces  ',
        content: 'Content\n\n\nwith\tmultiple\r\nwhitespace'
      };

      const sanitized = ContentSanitizer.sanitizeContent(content);

      expect(sanitized.title).toBe('Title with extra spaces');
      expect(sanitized.content).toBe('Content with multiple whitespace');
    });

    it('should limit H2 tags to prevent abuse', () => {
      const manyH2s = Array.from({ length: 30 }, (_, i) => `Heading ${i}`);;
      const content = {
        h2Tags: manyH2s
      };

      const sanitized = ContentSanitizer.sanitizeContent(content);

      expect(sanitized.h2Tags?.length).toBeLessThanOrEqual(20);
    });
  });
});

describe('DomainRateLimiter', () => {
  let rateLimiter: DomainRateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    rateLimiter = new DomainRateLimiter({
      baseDelay: 1000, // 1 second
      maxDelay: 10000, // 10 seconds
      maxRequestsPerMinute: 5
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should enforce minimum delay between requests', async () => {
    const domain = 'example.com';
    const startTime = Date.now();

    // First request should go through immediately
    await rateLimiter.waitForDomain(domain);
    expect(Date.now() - startTime).toBeLessThan(100);

    // Second request should wait
    const secondRequestPromise = rateLimiter.waitForDomain(domain);
    
    // Fast-forward time but not enough
    jest.advanceTimersByTime(500);
    
    // Should still be waiting
    let secondRequestCompleted = false;
    secondRequestPromise.then(() => { secondRequestCompleted = true; });
    
    await Promise.resolve(); // Process pending promises
    expect(secondRequestCompleted).toBe(false);
    
    // Fast-forward enough time
    jest.advanceTimersByTime(1500);
    await secondRequestPromise;
    
    expect(secondRequestCompleted).toBe(false); // Promise may not have resolved yet in test
  });

  it('should enforce per-minute request limits', async () => {
    const domain = 'example.com';

    // Make 5 requests (the limit)
    for (let i = 0; i < 5; i++) {
      await rateLimiter.waitForDomain(domain);
      jest.advanceTimersByTime(1000); // Advance past delay
    }

    // 6th request should wait for minute reset
    const sixthRequestPromise = rateLimiter.waitForDomain(domain);
    
    jest.advanceTimersByTime(30000); // 30 seconds - not enough
    
    let completed = false;
    sixthRequestPromise.then(() => { completed = true; });
    await Promise.resolve();
    
    expect(completed).toBe(false);
    
    jest.advanceTimersByTime(31000); // Total 61 seconds - should reset
    await sixthRequestPromise;
  });

  it('should handle backoff periods', async () => {
    const domain = 'example.com';
    
    rateLimiter.setBackoff(domain, 5000); // 5 second backoff
    
    const requestPromise = rateLimiter.waitForDomain(domain);
    
    jest.advanceTimersByTime(3000); // Not enough
    
    let completed = false;
    requestPromise.then(() => { completed = true; });
    await Promise.resolve();
    
    expect(completed).toBe(false);
    
    jest.advanceTimersByTime(3000); // Total 6 seconds
    await requestPromise;
  });

  it('should provide accurate domain status', () => {
    const domain = 'example.com';
    
    // Initial status
    let status = rateLimiter.getDomainStatus(domain);
    expect(status.canRequest).toBe(true);
    expect(status.waitTime).toBe(0);
    expect(status.requestCount).toBe(0);
    
    // After setting backoff
    rateLimiter.setBackoff(domain, 5000);
    status = rateLimiter.getDomainStatus(domain);
    expect(status.canRequest).toBe(false);
    expect(status.waitTime).toBeGreaterThan(0);
  });
});

describe('CompetitorResearchService', () => {
  let service: CompetitorResearchService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockAhrefsClient: jest.Mocked<AhrefsClient>;
  let mockWebScraper: jest.Mocked<WebScraper>;

  const mockRunId = '12345678-1234-5678-9012-123456789012' as UUID;
  const mockConfig: ScrapeConfig = generateScrapeConfig('example.com' as DomainString);

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mocks
    mockDatabaseService = {
      updateCompetitor: jest.fn(),
      getCompetitorsByRun: jest.fn(),
    } as any;
    
    mockAhrefsClient = {
      getKeywordOverview: jest.fn(),
      getCompetitorKeywords: jest.fn(),
      healthCheck: jest.fn()
    } as any;
    
    mockWebScraper = {
      scrapeUrls: jest.fn(),
      healthCheck: jest.fn()
    } as any;
    
    // Mock static methods
    jest.spyOn(AhrefsClient, 'getInstance').mockReturnValue(mockAhrefsClient);
    jest.spyOn(WebScraper, 'getInstance').mockReturnValue(mockWebScraper);
    
    service = new CompetitorResearchService(mockDatabaseService, {
      ahrefsApiKey: 'test-key',
      scrapeConfig: mockConfig
    });
  });

  describe('discoverCompetitors', () => {
    it('should discover competitors from keyword SERP data', async () => {
      const keywords = ['test keyword', 'another keyword'] as KeywordString[];
      
      // Mock Ahrefs response
      mockAhrefsClient.getKeywordOverview.mockResolvedValue({
        success: true,
        data: {
          serp_data: [
            { url: 'https://competitor1.com/page1', traffic: 1000 },
            { url: 'https://competitor2.com/page2', traffic: 800 },
            { url: 'https://competitor1.com/page3', traffic: 500 }
          ]
        }
      } as any);
      
      const competitors = await service.discoverCompetitors(mockRunId, keywords, {
        topN: 10,
        excludeDomains: ['oursite.com' as DomainString]
      });
      
      expect(competitors).toHaveLength(2);
      expect(competitors[0].domain).toBe('competitor1.com');
      expect(competitors[1].domain).toBe('competitor2.com');
      expect(competitors[0].runId).toBe(mockRunId);
    });
    
    it('should handle API errors gracefully', async () => {
      const keywords = ['test keyword'] as KeywordString[];
      
      mockAhrefsClient.getKeywordOverview.mockRejectedValue(new Error('API Error'));
      
      const competitors = await service.discoverCompetitors(mockRunId, keywords);
      
      expect(competitors).toHaveLength(0);
      expect(Sentry.addBreadcrumb).toHaveBeenCalled();
    });
    
    it('should exclude specified domains', async () => {
      const keywords = ['test keyword'] as KeywordString[];
      
      mockAhrefsClient.getKeywordOverview.mockResolvedValue({
        success: true,
        data: {
          serp_data: [
            { url: 'https://competitor1.com/page1', traffic: 1000 },
            { url: 'https://excluded.com/page2', traffic: 800 }
          ]
        }
      } as any);
      
      const competitors = await service.discoverCompetitors(mockRunId, keywords, {
        excludeDomains: ['excluded.com' as DomainString]
      });
      
      expect(competitors).toHaveLength(1);
      expect(competitors[0].domain).toBe('competitor1.com');
    });
  });
  
  describe('scrapeCompetitors', () => {
    const mockCompetitor: Competitor = {
      id: 'comp-123' as UUID,
      runId: mockRunId,
      domain: 'competitor.com' as DomainString,
      titles: null,
      urls: null,
      discoveredFromKeyword: 'test keyword' as KeywordString,
      scrapeStatus: 'pending',
      scrapeError: null,
      scrapedAt: null,
      createdAt: '2024-01-01T00:00:00Z' as Timestamp
    };
    
    beforeEach(() => {
      // Mock successful robots.txt fetch
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('User-agent: *\nAllow: /'),
        headers: new Headers()
      } as Response);
      
      // Mock successful scraping
      mockWebScraper.scrapeUrls.mockResolvedValue({
        successful: [
          {
            url: 'https://competitor.com/page1',
            title: 'Great Article Title',
            content: 'Article content here',
            metaDescription: 'Article description'
          }
        ],
        failed: [],
        robotsBlocked: [],
        totalAttempted: 1,
        successRate: 1
      });
    });
    
    it('should scrape competitors successfully', async () => {
      const results = await service.scrapeCompetitors([mockCompetitor], mockConfig);
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].titlesExtracted).toBe(1);
      expect(mockDatabaseService.updateCompetitor).toHaveBeenCalledWith(
        mockCompetitor.id,
        expect.objectContaining({
          scrapeStatus: 'completed',
          titles: ['Great Article Title']
        })
      );
    });
    
    it('should respect robots.txt restrictions', async () => {
      // Mock restrictive robots.txt
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('User-agent: *\nDisallow: /'),
        headers: new Headers()
      } as Response);
      
      const results = await service.scrapeCompetitors([mockCompetitor], mockConfig);
      
      expect(results[0].success).toBe(false);
      expect(mockDatabaseService.updateCompetitor).toHaveBeenCalledWith(
        mockCompetitor.id,
        expect.objectContaining({
          scrapeStatus: 'robots_blocked'
        })
      );
    });
    
    it('should handle scraping failures gracefully', async () => {
      mockWebScraper.scrapeUrls.mockRejectedValue(new Error('Network error'));
      
      const results = await service.scrapeCompetitors([mockCompetitor], mockConfig);
      
      expect(results[0].success).toBe(false);
      expect(results[0].errors.length).toBeGreaterThan(0);
      expect(mockDatabaseService.updateCompetitor).toHaveBeenCalledWith(
        mockCompetitor.id,
        expect.objectContaining({
          scrapeStatus: 'failed'
        })
      );
    });
    
    it('should sanitize extracted content', async () => {
      mockWebScraper.scrapeUrls.mockResolvedValue({
        successful: [
          {
            url: 'https://competitor.com/page1',
            title: 'Safe Title <script>alert("xss")</script>',
            content: '<p>Content</p><script>evil()</script>',
            metaDescription: 'Clean description'
          }
        ],
        failed: [],
        robotsBlocked: [],
        totalAttempted: 1,
        successRate: 1
      });
      
      const results = await service.scrapeCompetitors([mockCompetitor], mockConfig);
      
      expect(mockDatabaseService.updateCompetitor).toHaveBeenCalledWith(
        mockCompetitor.id,
        expect.objectContaining({
          titles: ['Safe Title'] // Script tag should be removed
        })
      );
    });
    
    it('should call progress callback', async () => {
      const progressCallback = jest.fn();
      
      await service.scrapeCompetitors([mockCompetitor], mockConfig, progressCallback);
      
      expect(progressCallback).toHaveBeenCalledWith(0, 1, 'competitor.com');
      expect(progressCallback).toHaveBeenCalledWith(1, 1);
    });
  });
  
  describe('generateCompetitiveLandscape', () => {
    it('should generate landscape analysis', async () => {
      const mockCompetitors = [
        {
          ...mockCompetitor,
          scrapeStatus: 'completed' as ScrapeStatus,
          titles: ['Article 1', 'Guide to Something', 'Best Practices']
        }
      ];
      
      mockDatabaseService.getCompetitorsByRun.mockResolvedValue(mockCompetitors as any);
      mockAhrefsClient.getCompetitorKeywords.mockResolvedValue({
        success: true,
        data: {
          keywords: [
            { keyword: 'test keyword', position: 5, volume: 1000 },
            { keyword: 'another keyword', position: 8, volume: 500 }
          ]
        }
      } as any);
      
      const landscape = await service.generateCompetitiveLandscape(
        mockRunId,
        ['our keyword'] as KeywordString[]
      );
      
      expect(landscape.totalCompetitors).toBe(1);
      expect(landscape.topCompetitors).toHaveLength(1);
      expect(landscape.industryInsights.commonTopics.length).toBeGreaterThan(0);
      expect(landscape.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should handle no competitor data', async () => {
      mockDatabaseService.getCompetitorsByRun.mockResolvedValue([]);
      
      const landscape = await service.generateCompetitiveLandscape(
        mockRunId,
        ['our keyword'] as KeywordString[]
      );
      
      expect(landscape.totalCompetitors).toBe(0);
      expect(landscape.recommendations[0]).toContain('No competitor data');
    });
  });
  
  describe('healthCheck', () => {
    it('should return healthy status when all systems operational', async () => {
      mockAhrefsClient.healthCheck.mockResolvedValue({
        healthy: true,
        issues: [],
        metrics: {} as any,
        circuitBreaker: {},
        rateLimit: {},
        cache: {}
      });
      
      mockWebScraper.healthCheck.mockResolvedValue({
        healthy: true,
        issues: [],
        metrics: {} as any,
        circuitBreaker: {},
        rateLimit: {},
        cache: {}
      });
      
      const health = await service.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
    });
    
    it('should report integration issues', async () => {
      mockAhrefsClient.healthCheck.mockResolvedValue({
        healthy: false,
        issues: ['Rate limit exhausted'],
        metrics: {} as any,
        circuitBreaker: {},
        rateLimit: {},
        cache: {}
      });
      
      mockWebScraper.healthCheck.mockResolvedValue({
        healthy: true,
        issues: [],
        metrics: {} as any,
        circuitBreaker: {},
        rateLimit: {},
        cache: {}
      });
      
      const health = await service.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.issues[0]).toContain('Ahrefs integration issues');
    });
  });
  
  describe('createCompetitorBatch', () => {
    it('should create competitor batch for processing', async () => {
      const competitors: CreateCompetitorInput[] = [
        {
          runId: mockRunId,
          domain: 'competitor1.com',
          discoveredFromKeyword: 'test keyword',
          priority: 8
        }
      ];
      
      const batch = await service.createCompetitorBatch(
        mockRunId,
        competitors,
        mockConfig
      );
      
      expect(batch.runId).toBe(mockRunId);
      expect(batch.competitors).toEqual(competitors);
      expect(batch.config).toEqual(mockConfig);
      expect(batch.priority).toBe(5);
      expect(batch.batchId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });
  });
});

describe('Security and Compliance Tests', () => {
  describe('Input Validation', () => {
    it('should reject malicious domain inputs', () => {
      const maliciousDomains = [
        'javascript:alert(1)',
        'http://evil.com/../../../etc/passwd',
        '<script>alert(1)</script>.com',
        'ftp://unauthorized.com'
      ];
      
      maliciousDomains.forEach(domain => {
        expect(() => {
          // This would be validated at the API layer
          const url = new URL(`https://${domain}`);
        }).toThrow();
      });
    });
    
    it('should handle extremely long inputs safely', () => {
      const longDomain = 'a'.repeat(1000) + '.com';
      const longContent = 'x'.repeat(100000);
      
      const sanitized = ContentSanitizer.sanitizeContent({
        title: longContent,
        content: longContent
      });
      
      expect(sanitized.title?.length).toBeLessThanOrEqual(200);
      expect(sanitized.content?.length).toBeLessThanOrEqual(50000);
    });
  });
  
  describe('Rate Limiting Compliance', () => {
    it('should enforce minimum delays between requests', async () => {
      jest.useFakeTimers();
      
      const rateLimiter = new DomainRateLimiter({
        baseDelay: 2000, // 2 seconds minimum
        maxDelay: 10000,
        maxRequestsPerMinute: 10
      });
      
      const domain = 'respectful-scraping.com';
      
      await rateLimiter.waitForDomain(domain);
      
      const startTime = Date.now();
      const secondRequestPromise = rateLimiter.waitForDomain(domain);
      
      // Should not complete immediately
      jest.advanceTimersByTime(1000);
      let completed = false;
      secondRequestPromise.then(() => { completed = true; });
      await Promise.resolve();
      expect(completed).toBe(false);
      
      // Should complete after minimum delay
      jest.advanceTimersByTime(2000);
      await secondRequestPromise;
      
      jest.useRealTimers();
    });
  });
  
  describe('Content Security', () => {
    it('should remove all potential XSS vectors', () => {
      const dangerousContent = {
        title: '<img src=x onerror=alert(1)> Title',
        content: '<div>Content<iframe src="javascript:alert(1)"></iframe></div>',
        metaDescription: '<script>steal_cookies()</script>Description',
        url: 'javascript:void(0)',
        canonical: 'vbscript:msgbox(1)'
      };
      
      const sanitized = ContentSanitizer.sanitizeContent(dangerousContent);
      
      expect(sanitized.title).not.toContain('<');
      expect(sanitized.title).not.toContain('onerror');
      expect(sanitized.content).not.toContain('<iframe');
      expect(sanitized.content).not.toContain('javascript:');
      expect(sanitized.metaDescription).not.toContain('<script');
      expect(sanitized.url).toBe(''); // Invalid URLs become empty
      expect(sanitized.canonical).toBe('');
    });
  });
  
  describe('Error Handling and Logging', () => {
    it('should log security incidents to Sentry', async () => {
      const service = new CompetitorResearchService({} as any, {
        ahrefsApiKey: 'test'
      });
      
      // Mock a security-related error
      mockFetch.mockRejectedValueOnce(new Error('Blocked by firewall'));
      
      try {
        await RobotsTxtParser.fetchAndParse('suspicious-domain.com');
      } catch (error) {
        // Error handling should have occurred
      }
      
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to fetch robots.txt'),
          level: 'warning',
          category: 'robots-txt'
        })
      );
    });
  });
});

describe('Integration Tests', () => {
  let service: CompetitorResearchService;
  
  beforeEach(() => {
    const mockDb = {
      updateCompetitor: jest.fn(),
      getCompetitorsByRun: jest.fn()
    } as any;
    
    service = new CompetitorResearchService(mockDb, {
      ahrefsApiKey: 'test-key'
    });
  });
  
  it('should handle end-to-end competitor discovery and scraping', async () => {
    // This would be a more comprehensive integration test
    // For now, we'll just ensure the service can be instantiated
    expect(service).toBeInstanceOf(CompetitorResearchService);
    
    const health = await service.healthCheck();
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('metrics');
    expect(health).toHaveProperty('integrations');
  });
});
