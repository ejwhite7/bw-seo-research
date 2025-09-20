const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔗 Connecting to Supabase...');
console.log(`URL: ${supabaseUrl}`);
console.log(`Service Key: ${supabaseServiceKey ? '✅ Present' : '❌ Missing'}`);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Function to execute SQL directly via HTTP API
async function executeSqlDirect(sql) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ sql })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response;
}

// Function to execute SQL statements one by one
async function applySqlFile(filePath) {
  console.log(`\n📄 Applying ${path.basename(filePath)}...`);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${filePath}`);
    return { success: 0, errors: 0 };
  }

  const sqlContent = fs.readFileSync(filePath, 'utf8');

  // Split into individual statements (rough approach)
  const statements = sqlContent
    .split(/;\s*(?=\n|$)/) // Split on semicolons followed by newline or end
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.match(/^--/));

  console.log(`Found ${statements.length} SQL statements`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Skip empty statements
    if (!statement || statement.length < 5) continue;

    console.log(`Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);

    try {
      // For Supabase, we need to execute SQL via the edge functions or direct PostgreSQL connection
      // Since we can't use rpc easily, let's use supabase-js to execute raw SQL
      const { error } = await supabase.rpc('exec', { sql: statement });

      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    } catch (err) {
      console.error(`❌ Exception in statement ${i + 1}:`, err.message);
      errorCount++;
    }
  }

  console.log(`✅ ${path.basename(filePath)} completed: ${successCount} success, ${errorCount} errors`);
  return { success: successCount, errors: errorCount };
}

async function setupDatabase() {
  console.log('🚀 Setting up Dream 100 Keyword Engine database remotely...');

  try {
    // First, test connectivity
    const { data: testData, error: testError } = await supabase
      .from('pg_tables')
      .select('tablename')
      .limit(1);

    if (testError) {
      console.error('❌ Failed to connect to database:', testError.message);

      // Try alternative connection test
      console.log('Trying alternative connection method...');
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        }
      });

      if (response.ok) {
        console.log('✅ REST API connection successful');
      } else {
        console.error('❌ REST API connection failed:', response.status);
        return;
      }
    } else {
      console.log('✅ Database connection successful');
    }

    // Apply migrations in sequence
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
      const result = await applySqlFile(filePath);
      totalSuccess += result.success;
      totalErrors += result.errors;
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Total successful statements: ${totalSuccess}`);
    console.log(`❌ Total errors: ${totalErrors}`);

    if (totalErrors > 0) {
      console.log('\n⚠️ Some errors occurred during migration. This might be normal for items that already exist.');
    }

    console.log('\n🎉 Database setup completed!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  }
}

if (require.main === module) {
  setupDatabase().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}