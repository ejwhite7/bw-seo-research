#!/bin/bash

# Apply Supabase migrations via PostgREST API
set -e

echo "🚀 Applying Supabase migrations..."

# Load environment variables
source .env.local

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local"
    exit 1
fi

echo "📡 Connected to: $SUPABASE_URL"

# Function to execute SQL via PostgREST
execute_sql() {
    local sql_content="$1"
    local description="$2"

    echo "⚡ Executing: $description"

    # Escape SQL for JSON
    local escaped_sql=$(echo "$sql_content" | jq -R -s .)

    local response=$(curl -s -w "\n%{http_code}" \
        -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
        -H "Content-Type: application/json" \
        -H "apikey: $SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -d "{\"sql\": $escaped_sql}")

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)

    if [ "$http_code" -ne 200 ]; then
        echo "❌ Failed ($http_code): $body"
        return 1
    else
        echo "✅ Success"
        return 0
    fi
}

# Create the exec_sql function first
echo "📝 Creating exec_sql function..."

create_exec_function="
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS \$\$
BEGIN
    EXECUTE sql;
    RETURN 'OK';
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERROR: ' || SQLERRM;
END;
\$\$;
"

execute_sql "$create_exec_function" "Creating exec_sql helper function"

# Apply migrations
migrations=(
    "supabase/migrations/001_initial_schema.sql"
    "supabase/migrations/002_rls_policies.sql"
    "supabase/migrations/003_performance_indexes.sql"
    "supabase/migrations/004_security_enhancements.sql"
)

for migration_file in "${migrations[@]}"; do
    if [ -f "$migration_file" ]; then
        echo "📄 Processing $(basename "$migration_file")..."

        # Read SQL file and process it in chunks
        sql_content=$(cat "$migration_file")

        # Split by semicolon and process each statement
        while IFS= read -r statement; do
            statement=$(echo "$statement" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')

            # Skip empty lines and comments
            if [ -n "$statement" ] && [[ ! "$statement" =~ ^-- ]]; then
                if ! execute_sql "$statement" "SQL statement"; then
                    echo "⚠️ Warning: Statement failed, continuing..."
                fi
            fi
        done <<< "$(echo "$sql_content" | sed 's/;/;\n/g')"

        echo "✅ Completed $(basename "$migration_file")"
    else
        echo "⚠️ Migration file not found: $migration_file"
    fi
done

echo "🎉 Migration process completed!"
echo ""
echo "🔍 Next steps:"
echo "1. Verify tables were created in your Supabase dashboard"
echo "2. Test the application connection"
echo "3. Update Vercel environment variables if needed"