#!/usr/bin/env node

/**
 * Setup script to initialize Supabase database schema
 * This script applies all migrations to the hosted Supabase database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeSqlFile(filePath) {
  console.log(`📄 Executing ${path.basename(filePath)}...`);

  const sqlContent = fs.readFileSync(filePath, 'utf8');

  // Split SQL content by semicolons, but be careful with complex statements
  const statements = sqlContent
    .split(/;\s*\n/)
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        console.error(`❌ Error executing statement:`, error.message);
        console.error(`Statement: ${statement.substring(0, 100)}...`);
        errorCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`❌ Exception executing statement:`, err.message);
      console.error(`Statement: ${statement.substring(0, 100)}...`);
      errorCount++;
    }
  }

  console.log(`✅ ${path.basename(filePath)}: ${successCount} successful, ${errorCount} errors`);
  return { successCount, errorCount };
}

async function setupDatabase() {
  console.log('🚀 Setting up Dream 100 Keyword Engine database...');
  console.log(`🔗 Supabase URL: ${supabaseUrl}`);

  try {
    // Test connection
    const { data, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .limit(1);

    if (error) {
      console.error('❌ Failed to connect to Supabase:', error.message);
      process.exit(1);
    }

    console.log('✅ Connected to Supabase successfully');

    // Apply migrations in order
    const migrations = [
      'supabase/migrations/001_initial_schema.sql',
      'supabase/migrations/002_rls_policies.sql',
      'supabase/migrations/003_performance_indexes.sql',
      'supabase/migrations/004_security_enhancements.sql'
    ];

    let totalSuccess = 0;
    let totalErrors = 0;

    for (const migrationFile of migrations) {
      const filePath = path.join(__dirname, migrationFile);

      if (fs.existsSync(filePath)) {
        const result = await executeSqlFile(filePath);
        totalSuccess += result.successCount;
        totalErrors += result.errorCount;
      } else {
        console.warn(`⚠️  Migration file not found: ${migrationFile}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Total successful statements: ${totalSuccess}`);
    console.log(`❌ Total errors: ${totalErrors}`);

    if (totalErrors === 0) {
      console.log('\n🎉 Database setup completed successfully!');
    } else {
      console.log(`\n⚠️  Database setup completed with ${totalErrors} errors. Please review the output above.`);
    }

    // Test the setup by checking if tables exist
    console.log('\n🔍 Verifying table creation...');
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_schema_tables');

    if (!tablesError && tables) {
      const expectedTables = ['runs', 'keywords', 'clusters', 'competitors', 'roadmap_items', 'settings'];
      const existingTables = tables.map(t => t.table_name);
      const missingTables = expectedTables.filter(t => !existingTables.includes(t));

      if (missingTables.length === 0) {
        console.log('✅ All required tables created successfully');
      } else {
        console.log(`❌ Missing tables: ${missingTables.join(', ')}`);
      }
    }

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Create a helper function for executing raw SQL (since supabase.rpc might not work)
async function executeDirectSql(sql) {
  // Alternative approach using HTTP API
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({ sql })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

if (require.main === module) {
  setupDatabase().catch(console.error);
}

module.exports = { setupDatabase };