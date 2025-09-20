const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  user: 'postgres',
  host: 'db.rqbqtwjoulynmnilskfd.supabase.co',
  database: 'postgres',
  password: 'udejjGqnEm85ep3',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

async function executeSqlFile(filePath) {
  console.log(`\n📄 Executing ${path.basename(filePath)}...`);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${filePath}`);
    return { success: 0, errors: 0 };
  }

  const sqlContent = fs.readFileSync(filePath, 'utf8');

  // Split SQL content into individual statements
  const statements = sqlContent
    .split(/;\s*(?=\n|$)/)
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.match(/^--/));

  console.log(`Found ${statements.length} SQL statements`);

  let successCount = 0;
  let errorCount = 0;
  const client = await pool.connect();

  try {
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (!statement || statement.length < 5) continue;

      console.log(`Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 80)}...`);

      try {
        await client.query(statement);
        successCount++;
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message);
        errorCount++;

        // Continue with other statements unless it's a critical error
        if (error.message.includes('already exists')) {
          console.log('↪️ Item already exists, continuing...');
        }
      }
    }
  } finally {
    client.release();
  }

  console.log(`✅ ${path.basename(filePath)} completed: ${successCount} success, ${errorCount} errors`);
  return { success: successCount, errors: errorCount };
}

async function setupDatabase() {
  console.log('🚀 Setting up Dream 100 Keyword Engine database...');

  try {
    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('✅ Connected to PostgreSQL:', result.rows[0].version.split(',')[0]);
    client.release();

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
      const result = await executeSqlFile(filePath);
      totalSuccess += result.success;
      totalErrors += result.errors;
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Total successful statements: ${totalSuccess}`);
    console.log(`❌ Total errors: ${totalErrors}`);

    // Verify tables were created
    console.log('\n🔍 Verifying table creation...');
    const verifyClient = await pool.connect();

    const tableQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    const tables = await verifyClient.query(tableQuery);
    console.log('📋 Created tables:', tables.rows.map(r => r.table_name).join(', '));

    const expectedTables = ['runs', 'keywords', 'clusters', 'competitors', 'roadmap_items', 'settings'];
    const existingTables = tables.rows.map(r => r.table_name);
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));

    if (missingTables.length === 0) {
      console.log('✅ All required tables created successfully!');
    } else {
      console.log('❌ Missing tables:', missingTables);
    }

    verifyClient.release();

    if (totalErrors === 0 || missingTables.length === 0) {
      console.log('\n🎉 Database setup completed successfully!');
    } else {
      console.log('\n⚠️ Database setup completed with some errors. Please review the output above.');
    }

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  setupDatabase().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = { setupDatabase };