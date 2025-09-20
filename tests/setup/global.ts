/**
 * Global Jest Setup for Dream 100 Keyword Engine
 * 
 * Initializes test environment, sets up database connections,
 * configures external service mocks, and prepares test data.
 */

import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

export default async function globalSetup() {
  console.log('🧪 Setting up Dream 100 Keyword Engine test environment...\n');

  // Set test environment variables if not already set
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/keyword_tool_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
  
  // Initialize test database
  await initializeTestDatabase();
  
  // Initialize test cache
  await initializeTestCache();
  
  // Setup external service mocks
  await setupExternalServiceMocks();
  
  // Create test data fixtures
  await createTestFixtures();

  console.log('✅ Test environment setup complete!\n');
}

/**
 * Initialize test database with clean schema
 */
async function initializeTestDatabase(): Promise<void> {
  try {
    console.log('📊 Initializing test database...');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Clean up existing test data
    const tables = ['roadmap_items', 'clusters', 'keywords', 'runs', 'settings'];
    
    for (const table of tables) {
      try {
        await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log(`  ✓ Cleaned ${table} table`);
      } catch (error) {
        // Table might not exist yet, that's fine
        console.log(`  - Skipped cleaning ${table} (table not found)`);
      }
    }
    
    console.log('✅ Test database initialized');
  } catch (error) {
    console.error('❌ Failed to initialize test database:', error);
    throw error;
  }
}

/**
 * Initialize test Redis cache
 */
async function initializeTestCache(): Promise<void> {
  try {
    console.log('🔴 Initializing test cache...');
    
    const redis = new Redis(process.env.REDIS_URL!, {
      enableReadyCheck: false,
      lazyConnect: true
    });

    // Clear test cache
    await redis.flushdb();
    
    // Set up test cache keys
    await redis.set('test:setup', 'complete', 'EX', 3600);
    
    console.log('✅ Test cache initialized');
    redis.disconnect();
  } catch (error) {
    console.warn('⚠️  Redis not available for testing (using memory cache fallback)');
  }
}

/**
 * Setup mocks for external APIs
 */
async function setupExternalServiceMocks(): Promise<void> {
  console.log('🎭 Setting up external service mocks...');
  
  // Create mock response files if they don't exist
  const mockDir = path.join(process.cwd(), 'tests', '__mocks__', 'responses');
  
  try {
    const fs = await import('fs');
    const mockDirExists = fs.existsSync(mockDir);
    
    if (!mockDirExists) {
      fs.mkdirSync(mockDir, { recursive: true });
      
      // Create Ahrefs mock responses
      fs.writeFileSync(
        path.join(mockDir, 'ahrefs-keywords.json'),
        JSON.stringify({
          success: true,
          data: [
            {
              keyword: 'test keyword',
              search_volume: 1000,
              keyword_difficulty: 45,
              cpc: 2.5,
              updated_date: '2024-01-01',
              serp_features: ['featured_snippet']
            }
          ]
        }, null, 2)
      );
      
      // Create Anthropic mock responses
      fs.writeFileSync(
        path.join(mockDir, 'anthropic-expansion.json'),
        JSON.stringify({
          success: true,
          data: {
            keywords: [
              { keyword: 'expanded keyword 1', relevance: 0.9, reasoning: 'High semantic similarity' },
              { keyword: 'expanded keyword 2', relevance: 0.8, reasoning: 'Related commercial intent' }
            ]
          }
        }, null, 2)
      );
    }
    
    console.log('✅ External service mocks ready');
  } catch (error) {
    console.warn('⚠️  Could not create mock files:', error.message);
  }
}

/**
 * Create test data fixtures
 */
async function createTestFixtures(): Promise<void> {
  console.log('🏗️  Creating test fixtures...');
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create test user settings
    const testUserId = '12345678-1234-5678-9012-123456789012';
    
    const { error: settingsError } = await supabase
      .from('settings')
      .upsert({
        id: testUserId,
        user_id: testUserId,
        ahrefs_api_key_encrypted: 'test-encrypted-ahrefs-key',
        anthropic_api_key_encrypted: 'test-encrypted-anthropic-key',
        default_weights: {
          volume: 0.4,
          intent: 0.3,
          relevance: 0.15,
          trend: 0.1,
          ease: 0.05
        },
        other_preferences: {
          notifications: true,
          auto_export: false,
          theme: 'light'
        }
      });
    
    if (!settingsError) {
      console.log('✅ Test user settings created');
    }

    // Create test run
    const { error: runError } = await supabase
      .from('runs')
      .upsert({
        id: 'test-run-id',
        user_id: testUserId,
        seed_keywords: ['test', 'keyword'],
        market: 'US',
        status: 'pending',
        settings: {
          maxDream100: 100,
          maxTier2PerDream: 10,
          maxTier3PerTier2: 10,
          maxKeywords: 10000,
          scoringWeights: {
            volume: 0.4,
            intent: 0.3,
            relevance: 0.15,
            trend: 0.1,
            ease: 0.05
          }
        },
        total_keywords: 0,
        total_clusters: 0
      });
    
    if (!runError) {
      console.log('✅ Test run created');
    }

    console.log('✅ Test fixtures ready');
  } catch (error) {
    console.warn('⚠️  Could not create all test fixtures:', error.message);
  }
}

/**
 * Cleanup function for emergency cleanup
 */
export async function emergencyCleanup(): Promise<void> {
  console.log('🧹 Emergency cleanup...');
  
  try {
    // Clear test database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const tables = ['roadmap_items', 'clusters', 'keywords', 'runs', 'settings'];
    for (const table of tables) {
      try {
        await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Clear test cache
    try {
      const redis = new Redis(process.env.REDIS_URL!);
      await redis.flushdb();
      redis.disconnect();
    } catch (error) {
      // Ignore Redis cleanup errors
    }
    
    console.log('✅ Emergency cleanup complete');
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error);
  }
}

// Handle uncaught errors during setup
process.on('unhandledRejection', async (error) => {
  console.error('❌ Unhandled rejection during test setup:', error);
  await emergencyCleanup();
  process.exit(1);
});

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught exception during test setup:', error);
  await emergencyCleanup();
  process.exit(1);
});