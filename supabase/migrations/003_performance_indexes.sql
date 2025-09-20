-- Performance Optimization Indexes
-- Migration: 003_performance_indexes.sql

-- Additional composite indexes for common query patterns

-- Keywords table performance indexes
CREATE INDEX CONCURRENTLY idx_keywords_run_stage_score 
ON keywords(run_id, stage, blended_score DESC);

CREATE INDEX CONCURRENTLY idx_keywords_run_quickwin_score 
ON keywords(run_id, quick_win, blended_score DESC) 
WHERE quick_win = TRUE;

CREATE INDEX CONCURRENTLY idx_keywords_cluster_score 
ON keywords(cluster_id, blended_score DESC) 
WHERE cluster_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_keywords_volume_difficulty 
ON keywords(volume DESC, difficulty ASC) 
WHERE volume > 0;

CREATE INDEX CONCURRENTLY idx_keywords_intent_stage 
ON keywords(intent, stage) 
WHERE intent IS NOT NULL;

-- Partial index for canonicalization queries
CREATE INDEX CONCURRENTLY idx_keywords_canonical_lookup 
ON keywords(canonical_keyword, run_id) 
WHERE canonical_keyword IS NOT NULL;

-- Clusters table performance indexes
CREATE INDEX CONCURRENTLY idx_clusters_run_score_size 
ON clusters(run_id, score DESC, size DESC);

-- Roadmap items performance indexes
CREATE INDEX CONCURRENTLY idx_roadmap_run_duedate_score 
ON roadmap_items(run_id, due_date ASC, blended_score DESC);

CREATE INDEX CONCURRENTLY idx_roadmap_cluster_duedate 
ON roadmap_items(cluster_id, due_date ASC) 
WHERE cluster_id IS NOT NULL;

-- Competitors table performance indexes
CREATE INDEX CONCURRENTLY idx_competitors_run_domain_status 
ON competitors(run_id, domain, scrape_status);

CREATE INDEX CONCURRENTLY idx_competitors_scraped_success 
ON competitors(scraped_at DESC) 
WHERE scrape_status = 'completed';

-- Settings table optimization
CREATE INDEX CONCURRENTLY idx_settings_user_updated 
ON settings(user_id, updated_at DESC);

-- Text search indexes for keyword lookup
CREATE INDEX CONCURRENTLY idx_keywords_keyword_trgm 
ON keywords USING gin(keyword gin_trgm_ops);

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full text search index for keyword and cluster labels
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS keyword_tsvector tsvector;
CREATE INDEX CONCURRENTLY idx_keywords_fts 
ON keywords USING gin(keyword_tsvector);

-- Function to update tsvector
CREATE OR REPLACE FUNCTION keywords_tsvector_update() RETURNS trigger AS $$
BEGIN
    NEW.keyword_tsvector := to_tsvector('english', NEW.keyword);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain tsvector
DROP TRIGGER IF EXISTS tsvector_update_keywords ON keywords;
CREATE TRIGGER tsvector_update_keywords 
    BEFORE INSERT OR UPDATE ON keywords 
    FOR EACH ROW EXECUTE FUNCTION keywords_tsvector_update();

-- Update existing records
UPDATE keywords SET keyword_tsvector = to_tsvector('english', keyword) WHERE keyword_tsvector IS NULL;

-- Cluster label text search
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS label_tsvector tsvector;
CREATE INDEX CONCURRENTLY idx_clusters_fts 
ON clusters USING gin(label_tsvector);

CREATE OR REPLACE FUNCTION clusters_tsvector_update() RETURNS trigger AS $$
BEGIN
    NEW.label_tsvector := to_tsvector('english', NEW.label);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsvector_update_clusters ON clusters;
CREATE TRIGGER tsvector_update_clusters 
    BEFORE INSERT OR UPDATE ON clusters 
    FOR EACH ROW EXECUTE FUNCTION clusters_tsvector_update();

UPDATE clusters SET label_tsvector = to_tsvector('english', label) WHERE label_tsvector IS NULL;

-- Partial indexes for common filtering
CREATE INDEX CONCURRENTLY idx_runs_user_status_created 
ON runs(user_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY idx_runs_completed_recent 
ON runs(completed_at DESC, total_keywords DESC) 
WHERE status = 'completed' AND completed_at IS NOT NULL;

-- Statistics for query planner optimization
CREATE STATISTICS IF NOT EXISTS keywords_multicolumn_stats 
ON run_id, stage, blended_score, quick_win FROM keywords;

CREATE STATISTICS IF NOT EXISTS clusters_multicolumn_stats 
ON run_id, score, size FROM clusters;

-- Analyze tables to update statistics
ANALYZE runs;
ANALYZE keywords;
ANALYZE clusters;
ANALYZE competitors;
ANALYZE roadmap_items;
ANALYZE settings;

-- Create function for efficient keyword search with ranking
CREATE OR REPLACE FUNCTION search_keywords_ranked(
    p_run_id UUID,
    p_search_term TEXT,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    keyword TEXT,
    stage keyword_stage,
    blended_score DECIMAL(5,3),
    volume INTEGER,
    difficulty INTEGER,
    quick_win BOOLEAN,
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        k.id,
        k.keyword,
        k.stage,
        k.blended_score,
        k.volume,
        k.difficulty,
        k.quick_win,
        ts_rank(k.keyword_tsvector, plainto_tsquery('english', p_search_term)) AS relevance_score
    FROM keywords k
    WHERE k.run_id = p_run_id
    AND (
        k.keyword_tsvector @@ plainto_tsquery('english', p_search_term)
        OR k.keyword ILIKE '%' || p_search_term || '%'
    )
    ORDER BY 
        ts_rank(k.keyword_tsvector, plainto_tsquery('english', p_search_term)) DESC,
        k.blended_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create function for cluster search
CREATE OR REPLACE FUNCTION search_clusters_ranked(
    p_run_id UUID,
    p_search_term TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    label TEXT,
    size INTEGER,
    score DECIMAL(5,3),
    keyword_count BIGINT,
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.label,
        c.size,
        c.score,
        COUNT(k.id) AS keyword_count,
        ts_rank(c.label_tsvector, plainto_tsquery('english', p_search_term)) AS relevance_score
    FROM clusters c
    LEFT JOIN keywords k ON c.id = k.cluster_id
    WHERE c.run_id = p_run_id
    AND (
        c.label_tsvector @@ plainto_tsquery('english', p_search_term)
        OR c.label ILIKE '%' || p_search_term || '%'
    )
    GROUP BY c.id, c.label, c.size, c.score, c.label_tsvector
    ORDER BY 
        ts_rank(c.label_tsvector, plainto_tsquery('english', p_search_term)) DESC,
        c.score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_keywords_ranked(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_clusters_ranked(UUID, TEXT, INTEGER) TO authenticated;

-- Create materialized view for run summaries (for dashboard)
CREATE MATERIALIZED VIEW run_summaries AS
SELECT 
    r.id,
    r.user_id,
    r.seed_keywords,
    r.market,
    r.status,
    r.created_at,
    r.completed_at,
    r.total_keywords,
    r.total_clusters,
    COALESCE(k_counts.dream100_count, 0) as dream100_count,
    COALESCE(k_counts.tier2_count, 0) as tier2_count,
    COALESCE(k_counts.tier3_count, 0) as tier3_count,
    COALESCE(k_counts.quick_win_count, 0) as quick_win_count,
    COALESCE(k_stats.avg_volume, 0) as avg_volume,
    COALESCE(k_stats.avg_difficulty, 0) as avg_difficulty,
    COALESCE(k_stats.avg_score, 0) as avg_blended_score,
    COALESCE(comp_count.competitor_count, 0) as competitor_count,
    COALESCE(roadmap_count.roadmap_items_count, 0) as roadmap_items_count
FROM runs r
LEFT JOIN (
    SELECT 
        run_id,
        COUNT(*) FILTER (WHERE stage = 'dream100') as dream100_count,
        COUNT(*) FILTER (WHERE stage = 'tier2') as tier2_count,
        COUNT(*) FILTER (WHERE stage = 'tier3') as tier3_count,
        COUNT(*) FILTER (WHERE quick_win = true) as quick_win_count
    FROM keywords
    GROUP BY run_id
) k_counts ON r.id = k_counts.run_id
LEFT JOIN (
    SELECT 
        run_id,
        AVG(volume) as avg_volume,
        AVG(difficulty) as avg_difficulty,
        AVG(blended_score) as avg_score
    FROM keywords
    WHERE volume > 0
    GROUP BY run_id
) k_stats ON r.id = k_stats.run_id
LEFT JOIN (
    SELECT run_id, COUNT(*) as competitor_count
    FROM competitors
    GROUP BY run_id
) comp_count ON r.id = comp_count.run_id
LEFT JOIN (
    SELECT run_id, COUNT(*) as roadmap_items_count
    FROM roadmap_items
    GROUP BY run_id
) roadmap_count ON r.id = roadmap_count.run_id;

CREATE UNIQUE INDEX idx_run_summaries_id ON run_summaries(id);
CREATE INDEX idx_run_summaries_user_created ON run_summaries(user_id, created_at DESC);
CREATE INDEX idx_run_summaries_status ON run_summaries(status);

-- Function to refresh run summaries
CREATE OR REPLACE FUNCTION refresh_run_summaries()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY run_summaries;
END;
$$ LANGUAGE plpgsql;

-- Scheduled job to refresh materialized views (requires pg_cron extension in production)
-- This would be set up in production: SELECT cron.schedule('refresh-analytics', '*/15 * * * *', 'SELECT refresh_cluster_analytics(); SELECT refresh_run_summaries();');