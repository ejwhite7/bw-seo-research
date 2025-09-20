-- Dream 100 Keyword Engine Database Schema
-- Migration: 001_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types
CREATE TYPE keyword_stage AS ENUM ('dream100', 'tier2', 'tier3');
CREATE TYPE keyword_intent AS ENUM ('transactional', 'commercial', 'informational', 'navigational');
CREATE TYPE run_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE roadmap_stage AS ENUM ('pillar', 'supporting');

-- Create runs table (processing run metadata)
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
);

-- Create indexes for runs table
CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_created_at ON runs(created_at DESC);

-- Create clusters table (semantic cluster information)
CREATE TABLE clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    score DECIMAL(5,3) DEFAULT 0.000,
    intent_mix JSONB DEFAULT '{}',
    representative_keywords TEXT[],
    similarity_threshold DECIMAL(3,2) DEFAULT 0.75,
    embedding VECTOR(1536), -- OpenAI ada-002 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for clusters table
CREATE INDEX idx_clusters_run_id ON clusters(run_id);
CREATE INDEX idx_clusters_score ON clusters(score DESC);
CREATE INDEX idx_clusters_size ON clusters(size DESC);
CREATE INDEX idx_clusters_embedding ON clusters USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create keywords table (all keywords with metrics and stage info)
CREATE TABLE keywords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,
    keyword VARCHAR(500) NOT NULL,
    stage keyword_stage NOT NULL,
    volume INTEGER DEFAULT 0,
    difficulty INTEGER DEFAULT 0, -- 0-100 KD score
    intent keyword_intent,
    relevance DECIMAL(3,2) DEFAULT 0.00, -- 0-1 similarity to seed
    trend DECIMAL(3,2) DEFAULT 0.00, -- 0-1 trend factor
    blended_score DECIMAL(5,3) DEFAULT 0.000,
    quick_win BOOLEAN DEFAULT FALSE,
    canonical_keyword VARCHAR(500),
    top_serp_urls TEXT[],
    embedding VECTOR(1536), -- For semantic similarity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for keywords table
CREATE INDEX idx_keywords_run_id ON keywords(run_id);
CREATE INDEX idx_keywords_cluster_id ON keywords(cluster_id);
CREATE INDEX idx_keywords_stage ON keywords(stage);
CREATE INDEX idx_keywords_blended_score ON keywords(blended_score DESC);
CREATE INDEX idx_keywords_quick_win ON keywords(quick_win) WHERE quick_win = TRUE;
CREATE INDEX idx_keywords_volume ON keywords(volume DESC);
CREATE INDEX idx_keywords_difficulty ON keywords(difficulty);
CREATE INDEX idx_keywords_keyword ON keywords(keyword);
CREATE INDEX idx_keywords_embedding ON keywords USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create competitors table (competitor domain data)
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
);

-- Create indexes for competitors table
CREATE INDEX idx_competitors_run_id ON competitors(run_id);
CREATE INDEX idx_competitors_domain ON competitors(domain);
CREATE INDEX idx_competitors_scrape_status ON competitors(scrape_status);

-- Create roadmap_items table (editorial roadmap entries)
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
);

-- Create indexes for roadmap_items table
CREATE INDEX idx_roadmap_items_run_id ON roadmap_items(run_id);
CREATE INDEX idx_roadmap_items_cluster_id ON roadmap_items(cluster_id);
CREATE INDEX idx_roadmap_items_due_date ON roadmap_items(due_date);
CREATE INDEX idx_roadmap_items_dri ON roadmap_items(dri);
CREATE INDEX idx_roadmap_items_quick_win ON roadmap_items(quick_win) WHERE quick_win = TRUE;
CREATE INDEX idx_roadmap_items_post_id ON roadmap_items(post_id);

-- Create settings table (user configuration and API keys)
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
);

-- Create indexes for settings table
CREATE INDEX idx_settings_user_id ON settings(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_runs_updated_at BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clusters_updated_at BEFORE UPDATE ON clusters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_keywords_updated_at BEFORE UPDATE ON keywords FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roadmap_items_updated_at BEFORE UPDATE ON roadmap_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create functions for API key encryption/decryption
CREATE OR REPLACE FUNCTION encrypt_api_key(api_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(pgp_sym_encrypt(api_key, current_setting('app.encryption_key')), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_api_key(encrypted_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(decode(encrypted_key, 'base64'), current_setting('app.encryption_key'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper functions for scoring
CREATE OR REPLACE FUNCTION calculate_blended_score(
    stage keyword_stage,
    volume INTEGER,
    difficulty INTEGER,
    intent keyword_intent,
    relevance DECIMAL(3,2),
    trend DECIMAL(3,2),
    weights JSONB DEFAULT NULL
)
RETURNS DECIMAL(5,3) AS $$
DECLARE
    normalized_volume DECIMAL(3,2);
    normalized_difficulty DECIMAL(3,2);
    intent_score DECIMAL(3,2);
    ease DECIMAL(3,2);
    stage_weights JSONB;
    final_score DECIMAL(5,3);
BEGIN
    -- Use default weights if none provided
    IF weights IS NULL THEN
        weights := '{
            "dream100": {"volume": 0.40, "intent": 0.30, "relevance": 0.15, "trend": 0.10, "ease": 0.05},
            "tier2": {"volume": 0.35, "ease": 0.25, "relevance": 0.20, "intent": 0.15, "trend": 0.05},
            "tier3": {"ease": 0.35, "relevance": 0.30, "volume": 0.20, "intent": 0.10, "trend": 0.05}
        }'::JSONB;
    END IF;
    
    -- Get stage-specific weights
    stage_weights := weights->stage::TEXT;
    
    -- Normalize values (0-1)
    normalized_volume := LEAST(GREATEST(COALESCE(volume, 0)::DECIMAL / 10000.0, 0.0), 1.0);
    ease := LEAST(GREATEST(1.0 - (COALESCE(difficulty, 50)::DECIMAL / 100.0), 0.0), 1.0);
    
    -- Intent scoring
    intent_score := CASE 
        WHEN intent = 'transactional' THEN 1.00
        WHEN intent = 'commercial' THEN 0.90
        WHEN intent = 'informational' THEN 0.70
        WHEN intent = 'navigational' THEN 0.50
        ELSE 0.60
    END;
    
    -- Calculate weighted score
    final_score := 
        (stage_weights->>'volume')::DECIMAL * normalized_volume +
        (stage_weights->>'ease')::DECIMAL * ease +
        (stage_weights->>'intent')::DECIMAL * intent_score +
        (stage_weights->>'relevance')::DECIMAL * COALESCE(relevance, 0.5) +
        (stage_weights->>'trend')::DECIMAL * COALESCE(trend, 0.5);
    
    RETURN LEAST(GREATEST(final_score, 0.000), 1.000);
END;
$$ LANGUAGE plpgsql;

-- Create function to detect quick wins
CREATE OR REPLACE FUNCTION is_quick_win(
    difficulty INTEGER,
    volume INTEGER,
    cluster_median_volume INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        (1.0 - (COALESCE(difficulty, 50)::DECIMAL / 100.0)) >= 0.70 AND
        COALESCE(volume, 0) >= COALESCE(cluster_median_volume, 100)
    );
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for cluster analytics
CREATE MATERIALIZED VIEW cluster_analytics AS
SELECT 
    c.id,
    c.run_id,
    c.label,
    c.size,
    c.score,
    c.intent_mix,
    COUNT(k.id) as actual_keyword_count,
    AVG(k.volume) as avg_volume,
    AVG(k.difficulty) as avg_difficulty,
    AVG(k.blended_score) as avg_blended_score,
    COUNT(k.id) FILTER (WHERE k.quick_win = TRUE) as quick_win_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY k.volume) as median_volume
FROM clusters c
LEFT JOIN keywords k ON c.id = k.cluster_id
GROUP BY c.id, c.run_id, c.label, c.size, c.score, c.intent_mix;

CREATE UNIQUE INDEX idx_cluster_analytics_id ON cluster_analytics(id);
CREATE INDEX idx_cluster_analytics_run_id ON cluster_analytics(run_id);

-- Create function to refresh cluster analytics
CREATE OR REPLACE FUNCTION refresh_cluster_analytics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY cluster_analytics;
END;
$$ LANGUAGE plpgsql;