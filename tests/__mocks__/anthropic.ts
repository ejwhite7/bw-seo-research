/**
 * Mock Anthropic API Client for Dream 100 Keyword Engine Tests
 * 
 * Provides comprehensive mocking for Anthropic Claude API interactions
 * including keyword expansion, intent classification, and content generation.
 */

import { jest } from '@jest/globals';

// Mock response data for different use cases
const mockResponses = {
  keywordExpansion: {
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          keywords: [
            { keyword: 'digital marketing tools', relevance: 0.95, reasoning: 'Highly relevant to primary topic' },
            { keyword: 'marketing software', relevance: 0.90, reasoning: 'Direct semantic relationship' },
            { keyword: 'automation platforms', relevance: 0.85, reasoning: 'Related business tool category' },
            { keyword: 'analytics dashboard', relevance: 0.82, reasoning: 'Complementary functionality' },
            { keyword: 'campaign management', relevance: 0.80, reasoning: 'Core marketing process' }
          ]
        })
      }
    ],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 150,
      output_tokens: 200
    }
  },

  intentClassification: {
    id: 'msg_test_456',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          intent: 'commercial',
          confidence: 0.92,
          reasoning: 'Contains clear purchase intent signals and product comparison language',
          alternatives: [
            { intent: 'informational', confidence: 0.15 },
            { intent: 'navigational', confidence: 0.05 }
          ]
        })
      }
    ],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 80,
      output_tokens: 120
    }
  },

  titleGeneration: {
    id: 'msg_test_789',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          titles: [
            {
              title: 'Best Digital Marketing Tools for Small Business in 2024',
              reasoning: 'Optimized for commercial intent with year specificity'
            },
            {
              title: 'Complete Guide to Digital Marketing Software: Features & Pricing',
              reasoning: 'Comprehensive guide format targeting comparison searches'
            },
            {
              title: 'Top 10 Marketing Automation Platforms Reviewed',
              reasoning: 'List format with review angle for high engagement'
            }
          ]
        })
      }
    ],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 180
    }
  },

  clusterLabeling: {
    id: 'msg_test_101',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          label: 'Digital Marketing Tools',
          description: 'Software platforms and tools for digital marketing campaigns',
          keywords_covered: 45,
          confidence: 0.88,
          alternative_labels: ['Marketing Software', 'Digital Marketing Platforms']
        })
      }
    ],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 200,
      output_tokens: 100
    }
  }
};

// Mock error responses
const mockErrors = {
  rateLimit: {
    type: 'rate_limit_error',
    message: 'Rate limit exceeded',
    retry_after: 60
  },
  apiError: {
    type: 'api_error',
    message: 'Internal server error'
  },
  authError: {
    type: 'authentication_error',
    message: 'Invalid API key'
  }
};

/**
 * Mock Anthropic class
 */
class MockAnthropic {
  private apiKey: string;
  private baseURL: string;
  private shouldSimulateError: string | null = null;
  private requestDelay: number = 0;

  constructor(options: { apiKey: string; baseURL?: string }) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL || 'https://api.anthropic.com';
  }

  get messages() {
    return {
      create: jest.fn().mockImplementation(async (params: any) => {
        // Simulate network delay
        if (this.requestDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }

        // Simulate errors if requested
        if (this.shouldSimulateError) {
          throw new Error(mockErrors[this.shouldSimulateError]?.message || 'Unknown error');
        }

        // Validate required parameters
        if (!params.model || !params.messages || !Array.isArray(params.messages)) {
          throw new Error('Invalid request parameters');
        }

        const message = params.messages[0]?.content || '';
        
        // Return appropriate mock response based on message content
        if (message.includes('expand') || message.includes('keyword')) {
          return mockResponses.keywordExpansion;
        } else if (message.includes('intent') || message.includes('classify')) {
          return mockResponses.intentClassification;
        } else if (message.includes('title') || message.includes('headline')) {
          return mockResponses.titleGeneration;
        } else if (message.includes('cluster') || message.includes('label')) {
          return mockResponses.clusterLabeling;
        }

        // Default response
        return mockResponses.keywordExpansion;
      })
    };
  }

  // Test utilities
  setSimulateError(errorType: string | null) {
    this.shouldSimulateError = errorType;
  }

  setRequestDelay(delayMs: number) {
    this.requestDelay = delayMs;
  }

  resetMock() {
    this.shouldSimulateError = null;
    this.requestDelay = 0;
    jest.clearAllMocks();
  }
}

// Create the mock module
const mockAnthropicModule = {
  Anthropic: MockAnthropic,
  default: MockAnthropic
};

// Mock for ES modules
export default MockAnthropic;
export { MockAnthropic as Anthropic };

// Mock for CommonJS
module.exports = mockAnthropicModule;
module.exports.default = MockAnthropic;
module.exports.Anthropic = MockAnthropic;

// Test helper functions
export const mockHelpers = {
  /**
   * Create a mock Anthropic instance for testing
   */
  createMockClient: (options = {}) => {
    return new MockAnthropic({
      apiKey: 'test-api-key',
      ...options
    });
  },

  /**
   * Generate mock keyword expansion response
   */
  generateKeywordExpansion: (seedKeyword: string, count = 5) => ({
    ...mockResponses.keywordExpansion,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          keywords: Array.from({ length: count }, (_, i) => ({
            keyword: `${seedKeyword} variant ${i + 1}`,
            relevance: 0.9 - (i * 0.1),
            reasoning: `Generated variant ${i + 1} for testing`
          }))
        })
      }
    ]
  }),

  /**
   * Generate mock intent classification response
   */
  generateIntentClassification: (intent: string, confidence = 0.9) => ({
    ...mockResponses.intentClassification,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          intent,
          confidence,
          reasoning: `Test classification for ${intent} intent`,
          alternatives: [
            { intent: 'commercial', confidence: intent === 'commercial' ? confidence : 0.1 },
            { intent: 'informational', confidence: intent === 'informational' ? confidence : 0.1 },
            { intent: 'navigational', confidence: intent === 'navigational' ? confidence : 0.1 },
            { intent: 'transactional', confidence: intent === 'transactional' ? confidence : 0.1 }
          ].filter(alt => alt.intent !== intent)
        })
      }
    ]
  }),

  /**
   * Generate mock title generation response
   */
  generateTitleGeneration: (keyword: string, count = 3) => ({
    ...mockResponses.titleGeneration,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          titles: Array.from({ length: count }, (_, i) => ({
            title: `${keyword}: Complete Guide ${i + 1}`,
            reasoning: `Generated title ${i + 1} for testing purposes`
          }))
        })
      }
    ]
  }),

  /**
   * Generate mock cluster labeling response
   */
  generateClusterLabeling: (keywords: string[], label?: string) => ({
    ...mockResponses.clusterLabeling,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          label: label || `${keywords[0]} Cluster`,
          description: `Test cluster containing ${keywords.length} keywords`,
          keywords_covered: keywords.length,
          confidence: 0.85,
          alternative_labels: [`${keywords[0]} Topics`, `${keywords[0]} Keywords`]
        })
      }
    ]
  }),

  /**
   * Simulate API errors
   */
  errors: mockErrors,

  /**
   * Reset all mocks to default state
   */
  reset: () => {
    jest.clearAllMocks();
  }
};