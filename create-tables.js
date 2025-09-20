const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createTables() {
  console.log('🚀 Creating database tables for Dream 100 Keyword Engine...');

  // Test connection first
  const { data: connectionTest, error: connectionError } = await supabase
    .from('information_schema.schemata')
    .select('schema_name')
    .eq('schema_name', 'public')
    .single();

  if (connectionError) {
    console.error('❌ Connection failed:', connectionError.message);
    return;
  }

  console.log('✅ Connected to Supabase successfully');

  const tables = [
    {
      name: 'runs',
      check: async () => {
        const { data, error } = await supabase.from('runs').select('id').limit(1);
        return !error;
      }
    },
    {
      name: 'clusters',
      check: async () => {
        const { data, error } = await supabase.from('clusters').select('id').limit(1);
        return !error;
      }
    },
    {
      name: 'keywords',
      check: async () => {
        const { data, error } = await supabase.from('keywords').select('id').limit(1);
        return !error;
      }
    },
    {
      name: 'competitors',
      check: async () => {
        const { data, error } = await supabase.from('competitors').select('id').limit(1);
        return !error;
      }
    },
    {
      name: 'roadmap_items',
      check: async () => {
        const { data, error } = await supabase.from('roadmap_items').select('id').limit(1);
        return !error;
      }
    },
    {
      name: 'settings',
      check: async () => {
        const { data, error } = await supabase.from('settings').select('id').limit(1);
        return !error;
      }
    }
  ];

  console.log('\n🔍 Checking existing tables...');

  for (const table of tables) {
    const exists = await table.check();
    console.log(`${table.name}: ${exists ? '✅ Exists' : '❌ Missing'}`);
  }

  // Check if we need to apply migrations
  const missingTables = [];
  for (const table of tables) {
    const exists = await table.check();
    if (!exists) {
      missingTables.push(table.name);
    }
  }

  if (missingTables.length === 0) {
    console.log('\n🎉 All tables already exist! Database is ready.');
    return;
  }

  console.log(`\n🛠️ Missing tables: ${missingTables.join(', ')}`);
  console.log('\n📝 To set up the database, you have two options:');
  console.log('\n1. 🌐 Use Supabase Dashboard (Recommended):');
  console.log(`   - Go to: ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/editor`);
  console.log('   - Navigate to SQL Editor');
  console.log('   - Copy and paste the contents of each migration file:');
  console.log('     • supabase/migrations/001_initial_schema.sql');
  console.log('     • supabase/migrations/002_rls_policies.sql');
  console.log('     • supabase/migrations/003_performance_indexes.sql');
  console.log('     • supabase/migrations/004_security_enhancements.sql');
  console.log('   - Execute each file in order');

  console.log('\n2. 📱 Use Supabase CLI:');
  console.log('   - Run: supabase login');
  console.log(`   - Run: supabase link --project-ref ${supabaseUrl.split('.')[0].split('//')[1]}`);
  console.log('   - Run: supabase db push');

  console.log('\nI\'ll provide the direct SQL content to copy-paste...');
}

createTables().catch(console.error);