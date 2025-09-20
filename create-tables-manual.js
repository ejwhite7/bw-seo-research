const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'db.rqbqtwjoulynmnilskfd.supabase.co',
  database: 'postgres',
  password: 'udejjGqnEm85ep3',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function createTablesDirectly() {
  console.log('🚀 Creating tables directly...');

  const client = await pool.connect();

  try {
    // Enable extensions first
    console.log('📦 Enabling extensions...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "vector"');

    // Create custom types
    console.log('🏷️ Creating custom types...');
    try {
      await client.query(`DO $$ BEGIN CREATE TYPE keyword_stage AS ENUM ('dream100', 'tier2', 'tier3'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await client.query(`DO $$ BEGIN CREATE TYPE keyword_intent AS ENUM ('transactional', 'commercial', 'informational', 'navigational'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await client.query(`DO $$ BEGIN CREATE TYPE run_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
      await client.query(`DO $$ BEGIN CREATE TYPE roadmap_stage AS ENUM ('pillar', 'supporting'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    } catch (err) {
      console.log('⚠️ Some types may already exist:', err.message);
    }

    // Create runs table
    console.log('📋 Creating runs table...');
    await client.query(`
      CREATE TABLE runs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          seed_keywords TEXT[] NOT NULL,
          market VARCHAR(10) DEFAULT 'US-EN',
          status run_status DEFAULT 'pending',
          settings JSONB DEFAULT '{}',
          api_usage JSONB DEFAULT '{}',
          error_logs JSONB DEFAULT '[]',
          progress JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          started_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          total_keywords INTEGER DEFAULT 0,
          total_clusters INTEGER DEFAULT 0
      )
    `);

    // Create clusters table
    console.log('🔗 Creating clusters table...');
    await client.query(`
      CREATE TABLE clusters (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          label VARCHAR(255) NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          score DECIMAL(5,3) DEFAULT 0.000,
          intent_mix JSONB DEFAULT '{}',
          representative_keywords TEXT[],
          similarity_threshold DECIMAL(3,2) DEFAULT 0.75,
          embedding VECTOR(1536),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create keywords table
    console.log('🔑 Creating keywords table...');
    await client.query(`
      CREATE TABLE keywords (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,
          keyword VARCHAR(500) NOT NULL,
          stage keyword_stage NOT NULL,
          volume INTEGER DEFAULT 0,
          difficulty INTEGER DEFAULT 0,
          intent keyword_intent,
          relevance DECIMAL(3,2) DEFAULT 0.00,
          trend DECIMAL(3,2) DEFAULT 0.00,
          blended_score DECIMAL(5,3) DEFAULT 0.000,
          quick_win BOOLEAN DEFAULT FALSE,
          canonical_keyword VARCHAR(500),
          top_serp_urls TEXT[],
          embedding VECTOR(1536),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create competitors table
    console.log('🏢 Creating competitors table...');
    await client.query(`
      CREATE TABLE competitors (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          domain VARCHAR(255) NOT NULL,
          titles TEXT[],
          urls TEXT[],
          discovered_from_keyword VARCHAR(500),
          scrape_status VARCHAR(50) DEFAULT 'pending',
          scrape_error TEXT,
          scraped_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create roadmap_items table
    console.log('🗺️ Creating roadmap_items table...');
    await client.query(`
      CREATE TABLE roadmap_items (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,
          post_id VARCHAR(50) NOT NULL,
          stage roadmap_stage NOT NULL,
          primary_keyword VARCHAR(500) NOT NULL,
          secondary_keywords TEXT[],
          intent keyword_intent,
          volume INTEGER DEFAULT 0,
          difficulty INTEGER DEFAULT 0,
          blended_score DECIMAL(5,3) DEFAULT 0.000,
          quick_win BOOLEAN DEFAULT FALSE,
          suggested_title TEXT,
          dri VARCHAR(255),
          due_date DATE,
          notes TEXT,
          source_urls TEXT[],
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create settings table
    console.log('⚙️ Creating settings table...');
    await client.query(`
      CREATE TABLE settings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          ahrefs_api_key_encrypted TEXT,
          anthropic_api_key_encrypted TEXT,
          default_weights JSONB DEFAULT '{
              "dream100": {"volume": 0.40, "intent": 0.30, "relevance": 0.15, "trend": 0.10, "ease": 0.05},
              "tier2": {"volume": 0.35, "ease": 0.25, "relevance": 0.20, "intent": 0.15, "trend": 0.05},
              "tier3": {"ease": 0.35, "relevance": 0.30, "volume": 0.20, "intent": 0.10, "trend": 0.05}
          }',
          other_preferences JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id)
      )
    `);

    // Create basic indexes
    console.log('🚀 Creating indexes...');
    await client.query('CREATE INDEX idx_runs_user_id ON runs(user_id)');
    await client.query('CREATE INDEX idx_runs_status ON runs(status)');
    await client.query('CREATE INDEX idx_keywords_run_id ON keywords(run_id)');
    await client.query('CREATE INDEX idx_keywords_cluster_id ON keywords(cluster_id)');
    await client.query('CREATE INDEX idx_clusters_run_id ON clusters(run_id)');
    await client.query('CREATE INDEX idx_competitors_run_id ON competitors(run_id)');
    await client.query('CREATE INDEX idx_roadmap_items_run_id ON roadmap_items(run_id)');
    await client.query('CREATE INDEX idx_settings_user_id ON settings(user_id)');

    console.log('✅ All tables created successfully!');

    // Verify tables
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('📋 Created tables:', result.rows.map(r => r.table_name).join(', '));

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTablesDirectly().catch(console.error);