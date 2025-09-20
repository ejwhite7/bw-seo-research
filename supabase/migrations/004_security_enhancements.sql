-- Security Enhancements and Data Protection
-- Migration: 004_security_enhancements.sql

-- Enable audit logging extension if available
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Create audit table for tracking sensitive operations
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit table
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- Enable RLS on audit table
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only allow users to view their own audit logs
CREATE POLICY "Users can view their own audit logs" ON audit_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Only system can insert audit logs
CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (current_setting('role', true) = 'service_role');

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    client_ip INET;
    client_agent TEXT;
BEGIN
    -- Get current user ID
    current_user_id := auth.uid();
    
    -- Get client info from current settings (set by application)
    BEGIN
        client_ip := current_setting('app.client_ip')::INET;
    EXCEPTION
        WHEN OTHERS THEN client_ip := NULL;
    END;
    
    BEGIN
        client_agent := current_setting('app.user_agent');
    EXCEPTION
        WHEN OTHERS THEN client_agent := NULL;
    END;
    
    -- Insert audit record
    INSERT INTO audit_logs (
        user_id, 
        action, 
        table_name, 
        record_id, 
        old_values, 
        new_values,
        ip_address,
        user_agent
    ) VALUES (
        current_user_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        client_ip,
        client_agent
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for sensitive tables
CREATE TRIGGER audit_settings_trigger
    AFTER INSERT OR UPDATE OR DELETE ON settings
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_runs_trigger
    AFTER INSERT OR UPDATE OR DELETE ON runs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Data retention policies
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO data_retention_policies (table_name, retention_days) VALUES
    ('runs', 90),
    ('keywords', 90),
    ('clusters', 90),
    ('competitors', 90),
    ('roadmap_items', 90),
    ('audit_logs', 365)
ON CONFLICT (table_name) DO NOTHING;

-- Function to clean up old data based on retention policies
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS INTEGER AS $$
DECLARE
    policy RECORD;
    delete_count INTEGER := 0;
    total_deleted INTEGER := 0;
BEGIN
    FOR policy IN SELECT * FROM data_retention_policies LOOP
        CASE policy.table_name
            WHEN 'audit_logs' THEN
                DELETE FROM audit_logs 
                WHERE created_at < NOW() - (policy.retention_days || ' days')::INTERVAL;
                GET DIAGNOSTICS delete_count = ROW_COUNT;
                
            WHEN 'runs' THEN
                DELETE FROM runs 
                WHERE created_at < NOW() - (policy.retention_days || ' days')::INTERVAL
                AND status IN ('completed', 'failed', 'cancelled');
                GET DIAGNOSTICS delete_count = ROW_COUNT;
                
            ELSE
                delete_count := 0;
        END CASE;
        
        total_deleted := total_deleted + delete_count;
        
        INSERT INTO audit_logs (user_id, action, table_name, new_values)
        VALUES (NULL, 'CLEANUP', policy.table_name, 
               jsonb_build_object('deleted_count', delete_count, 'retention_days', policy.retention_days));
    END LOOP;
    
    RETURN total_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for cleanup function
GRANT EXECUTE ON FUNCTION cleanup_old_data() TO service_role;

-- Enhanced API key encryption with key rotation support
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_version INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retired_at TIMESTAMP WITH TIME ZONE
);

-- Ensure only one active key at a time
CREATE UNIQUE INDEX idx_encryption_keys_active ON encryption_keys(is_active) WHERE is_active = TRUE;

-- Enhanced encryption functions with key versioning
CREATE OR REPLACE FUNCTION encrypt_api_key_versioned(api_key TEXT, key_version INTEGER DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    current_key_version INTEGER;
    encryption_key TEXT;
BEGIN
    -- Get current active key version if not specified
    IF key_version IS NULL THEN
        SELECT k.key_version INTO current_key_version 
        FROM encryption_keys k 
        WHERE k.is_active = TRUE 
        LIMIT 1;
        
        IF current_key_version IS NULL THEN
            RAISE EXCEPTION 'No active encryption key found';
        END IF;
    ELSE
        current_key_version := key_version;
    END IF;
    
    -- Get the encryption key from settings (this would be environment-specific)
    encryption_key := current_setting('app.encryption_key');
    
    RETURN jsonb_build_object(
        'encrypted_value', encode(pgp_sym_encrypt(api_key, encryption_key), 'base64'),
        'key_version', current_key_version,
        'encrypted_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_api_key_versioned(encrypted_data JSONB)
RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- Get the encryption key from settings
    encryption_key := current_setting('app.encryption_key');
    
    RETURN pgp_sym_decrypt(
        decode(encrypted_data->>'encrypted_value', 'base64'), 
        encryption_key
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Log decryption failure
        INSERT INTO audit_logs (user_id, action, table_name, new_values)
        VALUES (auth.uid(), 'DECRYPT_FAILED', 'api_keys', 
               jsonb_build_object('error', SQLERRM, 'key_version', encrypted_data->>'key_version'));
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rate limiting table for API usage
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    api_endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    window_duration INTERVAL DEFAULT '1 hour',
    max_requests INTEGER DEFAULT 1000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_rate_limits_user_endpoint ON rate_limits(user_id, api_endpoint);
CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);

-- Enable RLS on rate limits
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can only see their own rate limits
CREATE POLICY "Users can view their own rate limits" ON rate_limits
    FOR SELECT USING (auth.uid() = user_id);

-- Function to check and update rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_user_id UUID,
    p_api_endpoint VARCHAR(100),
    p_max_requests INTEGER DEFAULT 1000,
    p_window_duration INTERVAL DEFAULT '1 hour'
)
RETURNS JSONB AS $$
DECLARE
    current_count INTEGER;
    window_start_time TIMESTAMP WITH TIME ZONE;
    is_allowed BOOLEAN := TRUE;
    reset_time TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get or create rate limit record
    INSERT INTO rate_limits (user_id, api_endpoint, max_requests, window_duration)
    VALUES (p_user_id, p_api_endpoint, p_max_requests, p_window_duration)
    ON CONFLICT (user_id, api_endpoint) DO NOTHING;
    
    -- Get current rate limit info
    SELECT request_count, window_start, window_start + window_duration
    INTO current_count, window_start_time, reset_time
    FROM rate_limits
    WHERE user_id = p_user_id AND api_endpoint = p_api_endpoint;
    
    -- Check if window has expired
    IF window_start_time + p_window_duration < NOW() THEN
        -- Reset the window
        UPDATE rate_limits
        SET request_count = 1, 
            window_start = NOW(),
            updated_at = NOW()
        WHERE user_id = p_user_id AND api_endpoint = p_api_endpoint;
        
        current_count := 1;
        reset_time := NOW() + p_window_duration;
    ELSE
        -- Check if limit exceeded
        IF current_count >= p_max_requests THEN
            is_allowed := FALSE;
        ELSE
            -- Increment counter
            UPDATE rate_limits
            SET request_count = request_count + 1,
                updated_at = NOW()
            WHERE user_id = p_user_id AND api_endpoint = p_api_endpoint;
            
            current_count := current_count + 1;
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'allowed', is_allowed,
        'current_count', current_count,
        'max_requests', p_max_requests,
        'reset_time', reset_time,
        'remaining', GREATEST(0, p_max_requests - current_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, VARCHAR, INTEGER, INTERVAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION encrypt_api_key_versioned(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_api_key_versioned(JSONB) TO service_role;

-- Security monitoring views
CREATE OR REPLACE VIEW security_metrics AS
SELECT 
    date_trunc('hour', created_at) as hour,
    action,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users
FROM audit_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', created_at), action
ORDER BY hour DESC, event_count DESC;

-- Failed login attempts tracking
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    failure_reason TEXT
);

CREATE INDEX idx_failed_login_email ON failed_login_attempts(email, attempt_time DESC);
CREATE INDEX idx_failed_login_ip ON failed_login_attempts(ip_address, attempt_time DESC);

-- Function to log failed login attempts
CREATE OR REPLACE FUNCTION log_failed_login(
    p_email VARCHAR(255),
    p_ip_address TEXT,
    p_user_agent TEXT,
    p_failure_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO failed_login_attempts (email, ip_address, user_agent, failure_reason)
    VALUES (p_email, p_ip_address::INET, p_user_agent, p_failure_reason);
    
    -- Clean up old attempts (keep last 30 days)
    DELETE FROM failed_login_attempts 
    WHERE attempt_time < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_failed_login(VARCHAR, TEXT, TEXT, TEXT) TO service_role;

-- Data masking function for sensitive fields in logs
CREATE OR REPLACE FUNCTION mask_sensitive_data(data JSONB)
RETURNS JSONB AS $$
BEGIN
    IF data IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Mask API keys
    IF data ? 'ahrefs_api_key_encrypted' THEN
        data := jsonb_set(data, '{ahrefs_api_key_encrypted}', '"[MASKED]"');
    END IF;
    
    IF data ? 'anthropic_api_key_encrypted' THEN
        data := jsonb_set(data, '{anthropic_api_key_encrypted}', '"[MASKED]"');
    END IF;
    
    -- Mask email addresses
    IF data ? 'email' THEN
        data := jsonb_set(data, '{email}', '"[MASKED]"');
    END IF;
    
    RETURN data;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create secure view for audit logs that masks sensitive data
CREATE OR REPLACE VIEW audit_logs_safe AS
SELECT 
    id,
    user_id,
    action,
    table_name,
    record_id,
    mask_sensitive_data(old_values) as old_values,
    mask_sensitive_data(new_values) as new_values,
    ip_address,
    CASE 
        WHEN LENGTH(user_agent) > 100 THEN LEFT(user_agent, 97) || '...'
        ELSE user_agent 
    END as user_agent,
    created_at
FROM audit_logs;

-- Grant access to safe view
GRANT SELECT ON audit_logs_safe TO authenticated;