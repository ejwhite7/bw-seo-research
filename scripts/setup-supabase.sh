#!/bin/bash

# Dream 100 Keyword Engine - Supabase Setup Script
# This script sets up the complete Supabase database schema and configuration

set -e

echo "🚀 Setting up Dream 100 Keyword Engine database..."

# Load environment variables safely
echo "📝 Loading environment variables from .env.local"
set -a
source .env.local
set +a

# Start Supabase local development
echo "🔧 Starting Supabase local development environment..."
supabase start

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Run migrations
echo "📊 Running database migrations..."
supabase migration up

# Set up database configuration
echo "⚙️  Setting up database configuration..."

# Set the encryption key for API key storage
if [ -n "$DATABASE_ENCRYPTION_KEY" ]; then
    echo "🔐 Setting encryption key..."
    supabase sql --local -c "ALTER DATABASE postgres SET app.encryption_key = '$DATABASE_ENCRYPTION_KEY';"
else
    echo "⚠️  DATABASE_ENCRYPTION_KEY not set. Using default (not secure for production)."
    supabase sql --local -c "ALTER DATABASE postgres SET app.encryption_key = 'default-dev-key-not-for-production-32chars';"
fi

# Create initial encryption key version
echo "🔑 Setting up encryption key versioning..."
supabase sql --local -c "
INSERT INTO encryption_keys (key_version, is_active) 
VALUES (1, TRUE) 
ON CONFLICT DO NOTHING;
"

# Set up default data retention policies
echo "🗃️  Setting up data retention policies..."
supabase sql --local -c "
INSERT INTO data_retention_policies (table_name, retention_days) 
VALUES 
    ('runs', 90),
    ('keywords', 90),
    ('clusters', 90),
    ('competitors', 90),
    ('roadmap_items', 90),
    ('audit_logs', 365)
ON CONFLICT (table_name) DO UPDATE SET retention_days = EXCLUDED.retention_days;
"

# Create indexes concurrently (simulate production behavior)
echo "📈 Creating performance indexes..."
supabase sql --local -f supabase/migrations/003_performance_indexes.sql

# Set up security enhancements
echo "🔒 Setting up security enhancements..."
supabase sql --local -f supabase/migrations/004_security_enhancements.sql

# Grant necessary permissions
echo "🔐 Setting up permissions..."
supabase sql --local -c "
-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant additional permissions for service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
"

# Refresh materialized views
echo "🔄 Refreshing materialized views..."
supabase sql --local -c "
REFRESH MATERIALIZED VIEW cluster_analytics;
REFRESH MATERIALIZED VIEW run_summaries;
"

# Create test user and data (development only)
if [ "$NODE_ENV" != "production" ]; then
    echo "👤 Creating test user and sample data..."
    
    # Create test user
    TEST_USER_EMAIL="${TEST_USER_EMAIL:-test@example.com}"
    TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-testpassword123}"
    
    supabase sql --local -c "
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        '$TEST_USER_EMAIL',
        crypt('$TEST_USER_PASSWORD', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) ON CONFLICT (email) DO NOTHING;
    
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        created_at,
        updated_at
    ) SELECT 
        gen_random_uuid(),
        u.id,
        jsonb_build_object('sub', u.id, 'email', u.email),
        'email',
        NOW(),
        NOW()
    FROM auth.users u 
    WHERE u.email = '$TEST_USER_EMAIL'
    ON CONFLICT (provider, user_id) DO NOTHING;
    "
    
    echo "✅ Test user created: $TEST_USER_EMAIL / $TEST_USER_PASSWORD"
fi

# Show database status
echo "📊 Database setup complete! Status:"
supabase status

# Show connection details
echo ""
echo "🔗 Connection Details:"
echo "Database URL: $(supabase status | grep 'DB URL' | awk '{print $3}')"
echo "API URL: $(supabase status | grep 'API URL' | awk '{print $3}')"
echo "Anon Key: $(supabase status | grep 'anon key' | awk '{print $3}')"
echo "Service Role Key: $(supabase status | grep 'service_role key' | awk '{print $3}')"

echo ""
echo "📝 Next steps:"
echo "1. Copy the connection details to your .env.local file"
echo "2. Update your application configuration"
echo "3. Run 'npm run dev' to start the application"

echo ""
echo "🔧 Useful commands:"
echo "- View database: supabase db browser"
echo "- Reset database: supabase db reset"
echo "- Stop services: supabase stop"
echo "- View logs: supabase logs"

echo ""
echo "✅ Setup complete!"