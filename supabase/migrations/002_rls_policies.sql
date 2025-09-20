-- Row Level Security (RLS) Policies
-- Migration: 002_rls_policies.sql

-- Enable RLS on all tables
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policies for runs table
CREATE POLICY "Users can view their own runs" ON runs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own runs" ON runs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own runs" ON runs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own runs" ON runs
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for clusters table
CREATE POLICY "Users can view clusters from their runs" ON clusters
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = clusters.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert clusters for their runs" ON clusters
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = clusters.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update clusters from their runs" ON clusters
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = clusters.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete clusters from their runs" ON clusters
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = clusters.run_id 
            AND r.user_id = auth.uid()
        )
    );

-- Policies for keywords table
CREATE POLICY "Users can view keywords from their runs" ON keywords
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = keywords.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert keywords for their runs" ON keywords
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = keywords.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update keywords from their runs" ON keywords
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = keywords.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete keywords from their runs" ON keywords
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = keywords.run_id 
            AND r.user_id = auth.uid()
        )
    );

-- Policies for competitors table
CREATE POLICY "Users can view competitors from their runs" ON competitors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = competitors.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert competitors for their runs" ON competitors
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = competitors.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update competitors from their runs" ON competitors
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = competitors.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete competitors from their runs" ON competitors
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = competitors.run_id 
            AND r.user_id = auth.uid()
        )
    );

-- Policies for roadmap_items table
CREATE POLICY "Users can view roadmap items from their runs" ON roadmap_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = roadmap_items.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert roadmap items for their runs" ON roadmap_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = roadmap_items.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update roadmap items from their runs" ON roadmap_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = roadmap_items.run_id 
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete roadmap items from their runs" ON roadmap_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM runs r 
            WHERE r.id = roadmap_items.run_id 
            AND r.user_id = auth.uid()
        )
    );

-- Policies for settings table
CREATE POLICY "Users can view their own settings" ON settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" ON settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" ON settings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings" ON settings
    FOR DELETE USING (auth.uid() = user_id);

-- Service role policies (for system operations)
-- These allow the backend service to perform operations on behalf of users

-- Grant additional permissions to service role for materialized view refresh
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Create policy to allow service role to refresh materialized views
CREATE POLICY "Service role can refresh cluster analytics" ON cluster_analytics
    FOR ALL USING (current_setting('role', true) = 'service_role');

-- Create function to safely update run progress (bypasses RLS)
CREATE OR REPLACE FUNCTION update_run_progress(
    run_id UUID,
    new_status run_status DEFAULT NULL,
    progress_data JSONB DEFAULT NULL,
    api_usage_data JSONB DEFAULT NULL,
    error_data JSONB DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE runs SET
        status = COALESCE(new_status, status),
        progress = COALESCE(progress_data, progress),
        api_usage = COALESCE(api_usage_data, api_usage),
        error_logs = CASE 
            WHEN error_data IS NOT NULL THEN 
                COALESCE(error_logs, '[]'::JSONB) || error_data
            ELSE error_logs 
        END,
        updated_at = NOW(),
        started_at = CASE 
            WHEN new_status = 'processing' AND started_at IS NULL THEN NOW()
            ELSE started_at 
        END,
        completed_at = CASE 
            WHEN new_status IN ('completed', 'failed', 'cancelled') THEN NOW()
            ELSE completed_at 
        END
    WHERE id = run_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to safely bulk insert keywords (bypasses RLS for performance)
CREATE OR REPLACE FUNCTION bulk_insert_keywords(
    keywords_data JSONB
)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    WITH keyword_insert AS (
        INSERT INTO keywords (
            run_id, keyword, stage, volume, difficulty, 
            intent, relevance, trend, blended_score, 
            quick_win, canonical_keyword, top_serp_urls, embedding
        )
        SELECT 
            (data->>'run_id')::UUID,
            data->>'keyword',
            (data->>'stage')::keyword_stage,
            (data->>'volume')::INTEGER,
            (data->>'difficulty')::INTEGER,
            (data->>'intent')::keyword_intent,
            (data->>'relevance')::DECIMAL(3,2),
            (data->>'trend')::DECIMAL(3,2),
            (data->>'blended_score')::DECIMAL(5,3),
            (data->>'quick_win')::BOOLEAN,
            data->>'canonical_keyword',
            CASE 
                WHEN data->>'top_serp_urls' IS NOT NULL 
                THEN string_to_array(data->>'top_serp_urls', '|')
                ELSE NULL 
            END,
            (data->>'embedding')::VECTOR(1536)
        FROM jsonb_array_elements(keywords_data) AS data
        RETURNING 1
    )
    SELECT COUNT(*) INTO inserted_count FROM keyword_insert;
    
    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to safely bulk insert clusters (bypasses RLS for performance)
CREATE OR REPLACE FUNCTION bulk_insert_clusters(
    clusters_data JSONB
)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    WITH cluster_insert AS (
        INSERT INTO clusters (
            run_id, label, size, score, intent_mix,
            representative_keywords, similarity_threshold, embedding
        )
        SELECT 
            (data->>'run_id')::UUID,
            data->>'label',
            (data->>'size')::INTEGER,
            (data->>'score')::DECIMAL(5,3),
            (data->'intent_mix')::JSONB,
            CASE 
                WHEN data->>'representative_keywords' IS NOT NULL 
                THEN string_to_array(data->>'representative_keywords', '|')
                ELSE NULL 
            END,
            (data->>'similarity_threshold')::DECIMAL(3,2),
            (data->>'embedding')::VECTOR(1536)
        FROM jsonb_array_elements(clusters_data) AS data
        RETURNING 1
    )
    SELECT COUNT(*) INTO inserted_count FROM cluster_insert;
    
    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions on utility functions
GRANT EXECUTE ON FUNCTION update_run_progress(UUID, run_status, JSONB, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_insert_keywords(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_insert_clusters(JSONB) TO service_role;