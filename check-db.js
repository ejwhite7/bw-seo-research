const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDatabase() {
  console.log('🔍 Checking database connection and existing schema...');

  try {
    // Test basic connectivity with a simple query
    const { data, error } = await supabase.rpc('get_schema_info');

    if (error) {
      console.error('❌ Error connecting:', error.message);
      return;
    }

    const tableNames = data.map(t => t.table_name).filter(name =>
      !name.startsWith('_') && !name.includes('supabase')
    );

    console.log('✅ Connected successfully');
    console.log(`📊 Found ${tableNames.length} public tables:`, tableNames);

    // Check for our expected tables
    const expectedTables = ['runs', 'keywords', 'clusters', 'competitors', 'roadmap_items', 'settings'];
    const missingTables = expectedTables.filter(t => !tableNames.includes(t));

    if (missingTables.length === 0) {
      console.log('✅ All required tables exist!');
    } else {
      console.log('❌ Missing tables:', missingTables);
      console.log('🛠️  Database setup is needed.');
    }

  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

checkDatabase();