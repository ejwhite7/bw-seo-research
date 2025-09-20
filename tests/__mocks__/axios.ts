/**
 * Mock Axios HTTP Client for Dream 100 Keyword Engine Tests
 * 
 * Provides comprehensive mocking for HTTP requests to external APIs
 * including Ahrefs, scraping endpoints, and other HTTP services.
 */

import { jest } from '@jest/globals';

// Mock response data for different API endpoints
const mockResponses = {
  ahrefs: {
    keywords: {
      success: true,
      data: [
        {
          keyword: 'digital marketing',
          search_volume: 12000,
          keyword_difficulty: 45,
          cpc: 3.25,
          updated_date: '2024-01-15',
          serp_features: ['featured_snippet', 'people_also_ask'],
          position_history: [
            { date: '2024-01-01', avg_position: 5.2 },
            { date: '2024-01-15', avg_position: 4.8 }
          ]
        },
        {
          keyword: 'marketing automation',
          search_volume: 8500,
          keyword_difficulty: 52,
          cpc: 4.10,
          updated_date: '2024-01-15',
          serp_features: ['related_questions'],
          position_history: [
            { date: '2024-01-01', avg_position: 8.1 },
            { date: '2024-01-15', avg_position: 7.5 }
          ]
        }
      ],
      meta: {
        total_count: 2,
        page: 1,
        per_page: 100,
        api_credits_used: 2
      }
    },

    competitors: {
      success: true,
      data: [
        {
          domain: 'hubspot.com',
          organic_keywords: 45820,
          organic_traffic: 285000,
          domain_rating: 91,
          backlinks: 1250000,
          referring_domains: 15600
        },
        {
          domain: 'marketo.com',
          organic_keywords: 23450,
          organic_traffic: 156000,
          domain_rating: 85,
          backlinks: 890000,
          referring_domains: 12100
        }
      ]
    },

    serp: {
      success: true,
      data: {
        keyword: 'digital marketing tools',
        search_volume: 9800,
        results: [
          {
            position: 1,
            url: 'https://example.com/digital-marketing-tools',
            title: 'Best Digital Marketing Tools for 2024',
            description: 'Complete guide to the top digital marketing tools...',
            domain: 'example.com',
            traffic: 2840,
            snippet_length: 156
          },
          {
            position: 2,
            url: 'https://competitor.com/marketing-software',
            title: 'Top Marketing Software Solutions',
            description: 'Compare the leading marketing software platforms...',
            domain: 'competitor.com',
            traffic: 1920,
            snippet_length: 142
          }
        ]
      }
    }
  },

  scraping: {
    website: {
      success: true,
      data: {
        url: 'https://example.com/blog/digital-marketing',
        title: 'Complete Guide to Digital Marketing in 2024',
        description: 'Learn the latest digital marketing strategies and tactics',
        h1: 'Digital Marketing Guide',
        h2: ['Introduction', 'Strategy', 'Tools', 'Metrics'],
        content_length: 2845,
        word_count: 1120,
        images: 8,
        links: 24,
        load_time: 1.2,
        meta_keywords: 'digital marketing, strategy, tools',
        canonical_url: 'https://example.com/blog/digital-marketing',
        last_modified: '2024-01-10T10:30:00Z'
      }
    },

    sitemap: {
      success: true,
      data: {
        urls: [
          {
            url: 'https://example.com/',
            lastmod: '2024-01-15',
            changefreq: 'daily',
            priority: '1.0'
          },
          {
            url: 'https://example.com/about',
            lastmod: '2024-01-10',
            changefreq: 'monthly',
            priority: '0.8'
          },
          {
            url: 'https://example.com/blog/digital-marketing',
            lastmod: '2024-01-12',
            changefreq: 'weekly',
            priority: '0.9'
          }
        ],
        total_urls: 3,
        last_updated: '2024-01-15T09:00:00Z'
      }
    }
  },

  generic: {
    success: true,
    data: { message: 'Mock response' },
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
      'x-api-version': '1.0'
    }
  }
};

// Mock error responses
const mockErrors = {
  networkError: new Error('Network Error'),
  timeoutError: new Error('Timeout'),
  unauthorizedError: {
    response: {
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Invalid API key' }
    }
  },
  rateLimitError: {
    response: {
      status: 429,
      statusText: 'Too Many Requests',
      data: { error: 'Rate limit exceeded', retry_after: 60 },
      headers: { 'retry-after': '60' }
    }
  },
  serverError: {
    response: {
      status: 500,
      statusText: 'Internal Server Error',
      data: { error: 'Something went wrong' }
    }
  }
};

/**
 * Mock Axios instance
 */
class MockAxios {
  private shouldSimulateError: string | null = null;
  private requestDelay: number = 0;
  private requestHistory: any[] = [];

  constructor() {
    this.setupMockMethods();
  }

  private setupMockMethods() {
    // Mock HTTP methods
    this.get = jest.fn().mockImplementation(this.mockRequest.bind(this));
    this.post = jest.fn().mockImplementation(this.mockRequest.bind(this));
    this.put = jest.fn().mockImplementation(this.mockRequest.bind(this));
    this.patch = jest.fn().mockImplementation(this.mockRequest.bind(this));
    this.delete = jest.fn().mockImplementation(this.mockRequest.bind(this));
    this.request = jest.fn().mockImplementation(this.mockRequest.bind(this));

    // Mock create method
    this.create = jest.fn().mockReturnValue(this);
  }

  private async mockRequest(urlOrConfig: string | any, config?: any): Promise<any> {
    const finalConfig = typeof urlOrConfig === 'string' 
      ? { url: urlOrConfig, ...config }
      : urlOrConfig;

    // Log request for debugging
    this.requestHistory.push({
      timestamp: new Date().toISOString(),
      ...finalConfig
    });

    // Simulate network delay
    if (this.requestDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay));
    }

    // Simulate errors if requested
    if (this.shouldSimulateError) {
      const error = mockErrors[this.shouldSimulateError];
      if (error instanceof Error) {
        throw error;
      } else {
        const axiosError = new Error('Request failed') as any;
        axiosError.response = error.response;
        throw axiosError;
      }
    }

    // Return appropriate mock response based on URL
    const url = finalConfig.url || '';
    
    if (url.includes('ahrefs') || url.includes('api.ahrefs.com')) {
      return this.getAhrefsResponse(url, finalConfig);
    } else if (url.includes('scrape') || url.includes('scraper')) {
      return this.getScrapingResponse(url, finalConfig);
    } else {
      return {
        data: mockResponses.generic.data,
        status: 200,
        statusText: 'OK',
        headers: mockResponses.generic.headers,
        config: finalConfig
      };
    }
  }

  private getAhrefsResponse(url: string, config: any) {
    let responseData;
    
    if (url.includes('keywords') || url.includes('v3/keywords')) {
      responseData = mockResponses.ahrefs.keywords;
    } else if (url.includes('competitors') || url.includes('domain-competitors')) {
      responseData = mockResponses.ahrefs.competitors;
    } else if (url.includes('serp') || url.includes('serp-overview')) {
      responseData = mockResponses.ahrefs.serp;
    } else {
      responseData = mockResponses.generic;
    }

    return {
      data: responseData,
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'x-api-credits': '1',
        'x-rate-limit-remaining': '99'
      },
      config
    };
  }

  private getScrapingResponse(url: string, config: any) {
    let responseData;
    
    if (url.includes('sitemap')) {
      responseData = mockResponses.scraping.sitemap;
    } else {
      responseData = mockResponses.scraping.website;
    }

    return {
      data: responseData,
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'x-scrape-time': '1.2s'
      },
      config
    };
  }

  // Test utilities
  setSimulateError(errorType: string | null) {
    this.shouldSimulateError = errorType;
  }

  setRequestDelay(delayMs: number) {
    this.requestDelay = delayMs;
  }

  getRequestHistory() {
    return this.requestHistory.slice();
  }

  clearRequestHistory() {
    this.requestHistory = [];
  }

  resetMock() {
    this.shouldSimulateError = null;
    this.requestDelay = 0;
    this.requestHistory = [];
    jest.clearAllMocks();
    this.setupMockMethods();
  }

  // Mock properties
  get = jest.fn();
  post = jest.fn();
  put = jest.fn();
  patch = jest.fn();
  delete = jest.fn();
  request = jest.fn();
  create = jest.fn();
  defaults = {
    baseURL: '',
    timeout: 5000,
    headers: {}
  };
  interceptors = {
    request: {
      use: jest.fn(),
      eject: jest.fn()
    },
    response: {
      use: jest.fn(),
      eject: jest.fn()
    }
  };
}

// Create mock instance
const mockAxiosInstance = new MockAxios();

// Mock for ES modules
export default mockAxiosInstance;

// Mock for CommonJS
module.exports = mockAxiosInstance;
module.exports.default = mockAxiosInstance;

// Test helper functions
export const axiosHelpers = {
  /**
   * Create a mock axios instance for testing
   */
  createMockInstance: (config = {}) => {
    const instance = new MockAxios();
    instance.defaults = { ...instance.defaults, ...config };
    return instance;
  },

  /**
   * Generate mock Ahrefs keyword response
   */
  generateAhrefsKeywordResponse: (keywords: string[]) => ({
    success: true,
    data: keywords.map((keyword, index) => ({
      keyword,
      search_volume: Math.floor(Math.random() * 10000) + 100,
      keyword_difficulty: Math.floor(Math.random() * 100),
      cpc: Math.random() * 10,
      updated_date: '2024-01-15',
      serp_features: ['featured_snippet'],
      position_history: [
        { date: '2024-01-01', avg_position: Math.random() * 10 + 1 }
      ]
    })),
    meta: {
      total_count: keywords.length,
      page: 1,
      per_page: 100,
      api_credits_used: keywords.length
    }
  }),

  /**
   * Generate mock scraping response
   */
  generateScrapingResponse: (url: string, title?: string) => ({
    success: true,
    data: {
      url,
      title: title || `Page Title for ${url}`,
      description: `Meta description for ${url}`,
      h1: title || `Main Heading`,
      h2: ['Section 1', 'Section 2', 'Section 3'],
      content_length: Math.floor(Math.random() * 5000) + 1000,
      word_count: Math.floor(Math.random() * 2000) + 500,
      images: Math.floor(Math.random() * 20),
      links: Math.floor(Math.random() * 50),
      load_time: Math.random() * 3 + 0.5,
      last_modified: new Date().toISOString()
    }
  }),

  /**
   * Simulate different error types
   */
  errors: mockErrors,

  /**
   * Get the current mock instance
   */
  getInstance: () => mockAxiosInstance,

  /**
   * Reset all mocks to default state
   */
  reset: () => {
    mockAxiosInstance.resetMock();
  }
};