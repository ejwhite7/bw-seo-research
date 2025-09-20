/**
 * Settings Data Models
 * 
 * User preferences, API configuration, and system settings
 * with encrypted storage and validation.
 */

import { z } from 'zod';
import type { UUID, Timestamp, EmailString } from './index';
import type { ScoringWeights, StageWeights } from './scoring';

/**
 * Core settings interface matching database schema
 */
export interface Settings {
  readonly id: UUID;
  readonly userId: UUID;
  readonly ahrefsApiKeyEncrypted: string | null;
  readonly anthropicApiKeyEncrypted: string | null;
  readonly defaultWeights: ScoringWeights;
  readonly otherPreferences: UserPreferences;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/**
 * User preferences and configuration
 */
export interface UserPreferences {
  readonly notifications: NotificationSettings;
  readonly interface: InterfaceSettings;
  readonly defaults: DefaultSettings;
  readonly integrations: IntegrationSettings;
  readonly privacy: PrivacySettings;
  readonly billing: BillingSettings;
}

/**
 * Notification preferences
 */
export interface NotificationSettings {
  readonly email: {
    readonly runCompleted: boolean;
    readonly runFailed: boolean;
    readonly weeklyDigest: boolean;
    readonly quotaWarnings: boolean;
    readonly newFeatures: boolean;
  };
  readonly inApp: {
    readonly runStatusUpdates: boolean;
    readonly costAlerts: boolean;
    readonly recommendations: boolean;
  };
  readonly slack: {
    readonly enabled: boolean;
    readonly webhookUrl?: string;
    readonly channels: string[];
    readonly events: string[];
  };
}

/**
 * Interface and display settings
 */
export interface InterfaceSettings {
  readonly theme: 'light' | 'dark' | 'system';
  readonly language: string;
  readonly timezone: string;
  readonly dateFormat: 'US' | 'EU' | 'ISO';
  readonly numberFormat: 'US' | 'EU';
  readonly defaultView: {
    readonly keywordTable: 'compact' | 'detailed';
    readonly clusterView: 'grid' | 'list';
    readonly roadmapView: 'calendar' | 'table';
  };
  readonly autoRefresh: {
    readonly enabled: boolean;
    readonly intervalMinutes: number;
  };
}

/**
 * Default values for new runs
 */
export interface DefaultSettings {
  readonly market: string;
  readonly language: string;
  readonly maxKeywords: number;
  readonly postsPerMonth: number;
  readonly enableCompetitorScraping: boolean;
  readonly similarityThreshold: number;
  readonly quickWinThreshold: number;
  readonly contentFocus: 'blog' | 'product' | 'service' | 'mixed';
  readonly teamMembers: Array<{
    readonly name: string;
    readonly email: EmailString;
    readonly role: string;
    readonly capacity: number;
  }>;
}

/**
 * Integration settings and API configurations
 */
export interface IntegrationSettings {
  readonly ahrefs: {
    readonly quotaLimit: number;
    readonly costPerRequest: number;
    readonly rateLimitRequests: number;
    readonly rateLimitPeriod: number; // seconds
    readonly enableCaching: boolean;
    readonly cacheExpiryDays: number;
  };
  readonly anthropic: {
    readonly model: string;
    readonly maxTokens: number;
    readonly temperature: number;
    readonly costPerToken: number;
    readonly enableStreaming: boolean;
  };
  readonly scraping: {
    readonly respectRobotsTxt: boolean;
    readonly crawlDelaySeconds: number;
    readonly maxPagesPerDomain: number;
    readonly timeoutSeconds: number;
    readonly userAgent: string;
  };
  readonly exports: {
    readonly defaultFormat: 'csv' | 'excel' | 'json';
    readonly includeMetadata: boolean;
    readonly cloudStorage: {
      readonly provider?: 'aws' | 'gcp' | 'azure';
      readonly bucket?: string;
      readonly region?: string;
    };
  };
}

/**
 * Privacy and data retention settings
 */
export interface PrivacySettings {
  readonly dataRetention: {
    readonly runDataDays: number;
    readonly exportDataDays: number;
    readonly logDataDays: number;
    readonly autoDeleteEnabled: boolean;
  };
  readonly analytics: {
    readonly allowUsageTracking: boolean;
    readonly allowPerformanceMetrics: boolean;
    readonly allowErrorReporting: boolean;
  };
  readonly sharing: {
    readonly allowTeamAccess: boolean;
    readonly allowPublicExports: boolean;
    readonly shareAnonymizedInsights: boolean;
  };
}

/**
 * Billing and usage settings
 */
export interface BillingSettings {
  readonly plan: 'free' | 'pro' | 'enterprise';
  readonly billingCycle: 'monthly' | 'annually';
  readonly budgetLimits: {
    readonly monthlyBudget: number;
    readonly apiCostLimit: number;
    readonly storageLimit: number; // GB
    readonly alertThresholds: number[]; // percentages
  };
  readonly paymentMethod: {
    readonly type?: 'card' | 'bank' | 'invoice';
    readonly last4?: string;
    readonly expiryDate?: string;
  };
  readonly usage: {
    readonly currentPeriodStart: string;
    readonly currentPeriodEnd: string;
    readonly runsUsed: number;
    readonly keywordsProcessed: number;
    readonly apiCostsIncurred: number;
    readonly storageUsed: number; // GB
  };
}

/**
 * Settings creation and update inputs
 */
export interface CreateSettingsInput {
  readonly userId: UUID;
  readonly ahrefsApiKey?: string;
  readonly anthropicApiKey?: string;
  readonly defaultWeights?: Partial<ScoringWeights>;
  readonly preferences?: Partial<UserPreferences>;
}

export interface UpdateSettingsInput {
  readonly ahrefsApiKey?: string | null;
  readonly anthropicApiKey?: string | null;
  readonly defaultWeights?: {
    readonly dream100?: Partial<StageWeights>;
    readonly tier2?: Partial<StageWeights>;
    readonly tier3?: Partial<StageWeights>;
  };
  readonly preferences?: {
    readonly notifications?: {
      readonly email?: Partial<NotificationSettings['email']>;
      readonly inApp?: Partial<NotificationSettings['inApp']>;
      readonly slack?: Partial<NotificationSettings['slack']>;
    };
    readonly interface?: Partial<InterfaceSettings>;
    readonly defaults?: Partial<DefaultSettings>;
    readonly integrations?: Partial<IntegrationSettings>;
    readonly privacy?: Partial<PrivacySettings>;
    readonly billing?: Partial<BillingSettings>;
  };
}

/**
 * API key management
 */
export interface ApiKeyInfo {
  readonly provider: 'ahrefs' | 'anthropic';
  readonly isConfigured: boolean;
  readonly lastValidated: Timestamp | null;
  readonly isValid: boolean;
  readonly quotaRemaining: number | null;
  readonly nextResetDate: string | null;
  readonly errorMessage: string | null;
}

/**
 * Settings validation result
 */
export interface SettingsValidation {
  readonly isValid: boolean;
  readonly apiKeys: {
    readonly ahrefs: ApiKeyInfo;
    readonly anthropic: ApiKeyInfo;
  };
  readonly warnings: Array<{
    readonly type: 'quota' | 'cost' | 'configuration';
    readonly message: string;
    readonly severity: 'low' | 'medium' | 'high';
  }>;
  readonly recommendations: string[];
}

/**
 * Usage analytics and insights
 */
export interface UsageAnalytics {
  readonly userId: UUID;
  readonly period: {
    readonly start: string;
    readonly end: string;
  };
  readonly metrics: {
    readonly totalRuns: number;
    readonly totalKeywords: number;
    readonly totalClusters: number;
    readonly avgProcessingTime: number;
    readonly successRate: number;
  };
  readonly costs: {
    readonly total: number;
    readonly ahrefs: number;
    readonly anthropic: number;
    readonly infrastructure: number;
    readonly breakdown: Array<{
      readonly date: string;
      readonly amount: number;
      readonly provider: string;
    }>;
  };
  readonly trends: {
    readonly keywordsPerRun: Array<{ date: string; value: number }>;
    readonly processingTime: Array<{ date: string; value: number }>;
    readonly costs: Array<{ date: string; value: number }>;
  };
  readonly recommendations: Array<{
    readonly type: 'optimization' | 'cost_saving' | 'feature';
    readonly title: string;
    readonly description: string;
    readonly impact: 'low' | 'medium' | 'high';
  }>;
}

/**
 * Team management settings
 */
export interface TeamSettings {
  readonly teamId: UUID;
  readonly name: string;
  readonly members: TeamMember[];
  readonly permissions: TeamPermissions;
  readonly limits: TeamLimits;
  readonly billing: {
    readonly plan: 'team' | 'enterprise';
    readonly seats: number;
    readonly monthlyBudget: number;
  };
}

export interface TeamMember {
  readonly userId: UUID;
  readonly email: EmailString;
  readonly name: string;
  readonly role: 'admin' | 'editor' | 'viewer';
  readonly permissions: string[];
  readonly joinedAt: Timestamp;
  readonly lastActiveAt: Timestamp | null;
}

export interface TeamPermissions {
  readonly canCreateRuns: string[]; // roles
  readonly canViewAllRuns: string[];
  readonly canEditSettings: string[];
  readonly canManageTeam: string[];
  readonly canExportData: string[];
  readonly canViewBilling: string[];
}

export interface TeamLimits {
  readonly maxRuns: number;
  readonly maxKeywords: number;
  readonly monthlyBudget: number;
  readonly storageLimit: number; // GB
  readonly retentionDays: number;
}

/**
 * Validation schemas using Zod
 */
export const NotificationSettingsSchema = z.object({
  email: z.object({
    runCompleted: z.boolean().default(true),
    runFailed: z.boolean().default(true),
    weeklyDigest: z.boolean().default(false),
    quotaWarnings: z.boolean().default(true),
    newFeatures: z.boolean().default(false)
  }),
  inApp: z.object({
    runStatusUpdates: z.boolean().default(true),
    costAlerts: z.boolean().default(true),
    recommendations: z.boolean().default(true)
  }),
  slack: z.object({
    enabled: z.boolean().default(false),
    webhookUrl: z.string().url().optional(),
    channels: z.array(z.string().min(1).max(50)).default([]),
    events: z.array(z.string().min(1).max(50)).default([])
  })
});

export const InterfaceSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.string().min(2).max(10).default('en'),
  timezone: z.string().min(1).max(50).default('UTC'),
  dateFormat: z.enum(['US', 'EU', 'ISO']).default('US'),
  numberFormat: z.enum(['US', 'EU']).default('US'),
  defaultView: z.object({
    keywordTable: z.enum(['compact', 'detailed']).default('detailed'),
    clusterView: z.enum(['grid', 'list']).default('grid'),
    roadmapView: z.enum(['calendar', 'table']).default('calendar')
  }),
  autoRefresh: z.object({
    enabled: z.boolean().default(false),
    intervalMinutes: z.number().int().min(1).max(60).default(5)
  })
});

export const DefaultSettingsSchema = z.object({
  market: z.string().min(2).max(10).default('US'),
  language: z.string().min(2).max(10).default('en'),
  maxKeywords: z.number().int().min(100).max(10000).default(10000),
  postsPerMonth: z.number().int().min(1).max(100).default(20),
  enableCompetitorScraping: z.boolean().default(true),
  similarityThreshold: z.number().min(0.1).max(0.9).default(0.7),
  quickWinThreshold: z.number().min(0.5).max(0.9).default(0.7),
  contentFocus: z.enum(['blog', 'product', 'service', 'mixed']).default('blog'),
  teamMembers: z.array(z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.string().min(1).max(50),
    capacity: z.number().int().min(1).max(50)
  })).default([])
});

export const IntegrationSettingsSchema = z.object({
  ahrefs: z.object({
    quotaLimit: z.number().int().min(1000).default(10000),
    costPerRequest: z.number().min(0.001).default(0.01),
    rateLimitRequests: z.number().int().min(1).max(1000).default(100),
    rateLimitPeriod: z.number().int().min(1).max(3600).default(60),
    enableCaching: z.boolean().default(true),
    cacheExpiryDays: z.number().int().min(1).max(90).default(30)
  }),
  anthropic: z.object({
    model: z.string().min(1).max(50).default('claude-3-haiku-20240307'),
    maxTokens: z.number().int().min(100).max(100000).default(4000),
    temperature: z.number().min(0).max(2).default(0.2),
    costPerToken: z.number().min(0.0000001).default(0.000001),
    enableStreaming: z.boolean().default(false)
  }),
  scraping: z.object({
    respectRobotsTxt: z.boolean().default(true),
    crawlDelaySeconds: z.number().min(0.5).max(60).default(1),
    maxPagesPerDomain: z.number().int().min(10).max(10000).default(1000),
    timeoutSeconds: z.number().int().min(5).max(120).default(30),
    userAgent: z.string().min(10).max(200).default('Dream100Bot/1.0')
  }),
  exports: z.object({
    defaultFormat: z.enum(['csv', 'excel', 'json']).default('csv'),
    includeMetadata: z.boolean().default(true),
    cloudStorage: z.object({
      provider: z.enum(['aws', 'gcp', 'azure']).optional(),
      bucket: z.string().min(1).max(100).optional(),
      region: z.string().min(1).max(50).optional()
    }).optional()
  })
});

export const UserPreferencesSchema = z.object({
  notifications: NotificationSettingsSchema,
  interface: InterfaceSettingsSchema,
  defaults: DefaultSettingsSchema,
  integrations: IntegrationSettingsSchema,
  privacy: z.object({
    dataRetention: z.object({
      runDataDays: z.number().int().min(7).max(365).default(90),
      exportDataDays: z.number().int().min(7).max(365).default(30),
      logDataDays: z.number().int().min(7).max(180).default(30),
      autoDeleteEnabled: z.boolean().default(true)
    }),
    analytics: z.object({
      allowUsageTracking: z.boolean().default(true),
      allowPerformanceMetrics: z.boolean().default(true),
      allowErrorReporting: z.boolean().default(true)
    }),
    sharing: z.object({
      allowTeamAccess: z.boolean().default(false),
      allowPublicExports: z.boolean().default(false),
      shareAnonymizedInsights: z.boolean().default(true)
    })
  }),
  billing: z.object({
    plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
    billingCycle: z.enum(['monthly', 'annually']).default('monthly'),
    budgetLimits: z.object({
      monthlyBudget: z.number().min(0).default(100),
      apiCostLimit: z.number().min(0).default(50),
      storageLimit: z.number().min(1).default(10),
      alertThresholds: z.array(z.number().min(0).max(100)).default([50, 75, 90])
    }),
    paymentMethod: z.object({
      type: z.enum(['card', 'bank', 'invoice']).optional(),
      last4: z.string().length(4).optional(),
      expiryDate: z.string().regex(/^\d{2}\/\d{2}$/).optional()
    }),
    usage: z.object({
      currentPeriodStart: z.string().datetime(),
      currentPeriodEnd: z.string().datetime(),
      runsUsed: z.number().int().min(0).default(0),
      keywordsProcessed: z.number().int().min(0).default(0),
      apiCostsIncurred: z.number().min(0).default(0),
      storageUsed: z.number().min(0).default(0)
    })
  })
});

export const CreateSettingsInputSchema = z.object({
  userId: z.string().uuid(),
  ahrefsApiKey: z.string().min(10).max(500).optional(),
  anthropicApiKey: z.string().min(10).max(500).optional(),
  defaultWeights: z.object({
    dream100: z.object({
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      trend: z.number().min(0).max(1),
      ease: z.number().min(0).max(1)
    }).partial(),
    tier2: z.object({
      volume: z.number().min(0).max(1),
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }).partial(),
    tier3: z.object({
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }).partial()
  }).partial().optional(),
  preferences: UserPreferencesSchema.partial().optional()
});

export const UpdateSettingsInputSchema = z.object({
  ahrefsApiKey: z.string().min(10).max(500).nullable().optional(),
  anthropicApiKey: z.string().min(10).max(500).nullable().optional(),
  defaultWeights: z.object({
    dream100: z.object({
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      trend: z.number().min(0).max(1),
      ease: z.number().min(0).max(1)
    }).partial(),
    tier2: z.object({
      volume: z.number().min(0).max(1),
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }).partial(),
    tier3: z.object({
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }).partial()
  }).partial().optional(),
  preferences: UserPreferencesSchema.partial().optional()
});

/**
 * Type guards for runtime type checking
 */
export const isSettings = (value: unknown): value is Settings => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.userId === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

export const isApiKeyInfo = (value: unknown): value is ApiKeyInfo => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.provider === 'string' &&
    typeof obj.isConfigured === 'boolean' &&
    typeof obj.isValid === 'boolean'
  );
};

/**
 * Utility functions for settings operations
 */
export const getDefaultUserPreferences = (): UserPreferences => ({
  notifications: {
    email: {
      runCompleted: true,
      runFailed: true,
      weeklyDigest: false,
      quotaWarnings: true,
      newFeatures: false
    },
    inApp: {
      runStatusUpdates: true,
      costAlerts: true,
      recommendations: true
    },
    slack: {
      enabled: false,
      channels: [],
      events: []
    }
  },
  interface: {
    theme: 'system',
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'US',
    numberFormat: 'US',
    defaultView: {
      keywordTable: 'detailed',
      clusterView: 'grid',
      roadmapView: 'calendar'
    },
    autoRefresh: {
      enabled: false,
      intervalMinutes: 5
    }
  },
  defaults: {
    market: 'US',
    language: 'en',
    maxKeywords: 10000,
    postsPerMonth: 20,
    enableCompetitorScraping: true,
    similarityThreshold: 0.7,
    quickWinThreshold: 0.7,
    contentFocus: 'blog',
    teamMembers: []
  },
  integrations: {
    ahrefs: {
      quotaLimit: 10000,
      costPerRequest: 0.01,
      rateLimitRequests: 100,
      rateLimitPeriod: 60,
      enableCaching: true,
      cacheExpiryDays: 30
    },
    anthropic: {
      model: 'claude-3-haiku-20240307',
      maxTokens: 4000,
      temperature: 0.2,
      costPerToken: 0.000001,
      enableStreaming: false
    },
    scraping: {
      respectRobotsTxt: true,
      crawlDelaySeconds: 1,
      maxPagesPerDomain: 1000,
      timeoutSeconds: 30,
      userAgent: 'Dream100Bot/1.0 (SEO Research Tool)'
    },
    exports: {
      defaultFormat: 'csv',
      includeMetadata: true,
      cloudStorage: {}
    }
  },
  privacy: {
    dataRetention: {
      runDataDays: 90,
      exportDataDays: 30,
      logDataDays: 30,
      autoDeleteEnabled: true
    },
    analytics: {
      allowUsageTracking: true,
      allowPerformanceMetrics: true,
      allowErrorReporting: true
    },
    sharing: {
      allowTeamAccess: false,
      allowPublicExports: false,
      shareAnonymizedInsights: true
    }
  },
  billing: {
    plan: 'free',
    billingCycle: 'monthly',
    budgetLimits: {
      monthlyBudget: 100,
      apiCostLimit: 50,
      storageLimit: 10,
      alertThresholds: [50, 75, 90]
    },
    paymentMethod: {},
    usage: {
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      runsUsed: 0,
      keywordsProcessed: 0,
      apiCostsIncurred: 0,
      storageUsed: 0
    }
  }
});

export const validateApiKey = async (
  provider: 'ahrefs' | 'anthropic',
  apiKey: string
): Promise<ApiKeyInfo> => {
  // This would be implemented with actual API validation
  // For now, return a mock validation result
  return {
    provider,
    isConfigured: apiKey.length > 10,
    lastValidated: new Date().toISOString(),
    isValid: apiKey.length > 10 && !apiKey.includes('invalid'),
    quotaRemaining: provider === 'ahrefs' ? 5000 : null,
    nextResetDate: provider === 'ahrefs' ? '2024-12-31' : null,
    errorMessage: apiKey.includes('invalid') ? 'Invalid API key format' : null
  };
};

export const calculateUsageCosts = (
  usage: BillingSettings['usage'],
  integrationSettings: IntegrationSettings
): number => {
  const { apiCostsIncurred, storageUsed } = usage;
  const storageRatePerGB = 0.10; // $0.10 per GB per month
  
  return apiCostsIncurred + (storageUsed * storageRatePerGB);
};

export const getBudgetUtilization = (
  usage: BillingSettings['usage'],
  budgetLimits: BillingSettings['budgetLimits']
): {
  percentage: number;
  remaining: number;
  status: 'safe' | 'warning' | 'critical';
} => {
  const totalCost = usage.apiCostsIncurred + (usage.storageUsed * 0.10);
  const percentage = (totalCost / budgetLimits.monthlyBudget) * 100;
  const remaining = budgetLimits.monthlyBudget - totalCost;
  
  let status: 'safe' | 'warning' | 'critical' = 'safe';
  if (percentage >= 90) status = 'critical';
  else if (percentage >= 75) status = 'warning';
  
  return { percentage, remaining, status };
};

export const getRecommendedSettings = (
  currentUsage: UsageAnalytics,
  currentSettings: Settings
): Array<{
  type: 'performance' | 'cost' | 'quality';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionRequired: boolean;
}> => {
  const recommendations: Array<{
    type: 'performance' | 'cost' | 'quality';
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    actionRequired: boolean;
  }> = [];
  const { metrics, costs } = currentUsage;
  
  // Performance recommendations
  if (metrics.avgProcessingTime > 1200) { // 20 minutes
    recommendations.push({
      type: 'performance',
      title: 'Enable API caching to improve performance',
      description: 'Your runs are taking longer than average. Enable caching to reduce API calls and speed up processing.',
      impact: 'high',
      actionRequired: true
    });
  }
  
  // Cost optimization
  if (costs.total > 50) {
    recommendations.push({
      type: 'cost',
      title: 'Optimize scoring weights to reduce API usage',
      description: 'Your API costs are high. Consider adjusting scoring weights to prioritize cached data.',
      impact: 'medium',
      actionRequired: false
    });
  }
  
  // Quality improvements
  if (metrics.successRate < 0.95) {
    recommendations.push({
      type: 'quality',
      title: 'Increase timeout settings to reduce failures',
      description: 'Some runs are failing due to timeouts. Consider increasing API timeout settings.',
      impact: 'medium',
      actionRequired: true
    });
  }
  
  return recommendations;
};

export const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) return '***';
  return apiKey.slice(0, 4) + '***' + apiKey.slice(-4);
};

export const formatCurrency = (
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount);
};

export const getSettingsValidationMessages = (
  validation: SettingsValidation
): string[] => {
  const messages: string[] = [];
  
  if (!validation.apiKeys.ahrefs.isValid) {
    messages.push('Ahrefs API key is invalid or missing');
  }
  
  if (!validation.apiKeys.anthropic.isValid) {
    messages.push('Anthropic API key is invalid or missing');
  }
  
  validation.warnings.forEach(warning => {
    messages.push(warning.message);
  });
  
  return messages;
};