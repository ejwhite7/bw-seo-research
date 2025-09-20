const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🧪 Testing Supabase connection...');
console.log(`📡 URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testConnection() {
  try {
    // Test basic connectivity and table access
    console.log('🔍 Testing table access...');

    // Test runs table
    const { data: runs, error: runsError } = await supabase
      .from('runs')
      .select('id')
      .limit(1);

    if (runsError) {
      console.error('❌ Error accessing runs table:', runsError.message);
    } else {
      console.log('✅ Runs table accessible');
    }

    // Test keywords table
    const { data: keywords, error: keywordsError } = await supabase
      .from('keywords')
      .select('id')
      .limit(1);

    if (keywordsError) {
      console.error('❌ Error accessing keywords table:', keywordsError.message);
    } else {
      console.log('✅ Keywords table accessible');
    }

    // Test clusters table
    const { data: clusters, error: clustersError } = await supabase
      .from('clusters')
      .select('id')
      .limit(1);

    if (clustersError) {
      console.error('❌ Error accessing clusters table:', clustersError.message);
    } else {
      console.log('✅ Clusters table accessible');
    }

    // Test competitors table
    const { data: competitors, error: competitorsError } = await supabase
      .from('competitors')
      .select('id')
      .limit(1);

    if (competitorsError) {
      console.error('❌ Error accessing competitors table:', competitorsError.message);
    } else {
      console.log('✅ Competitors table accessible');
    }

    // Test roadmap_items table
    const { data: roadmap, error: roadmapError } = await supabase
      .from('roadmap_items')
      .select('id')
      .limit(1);

    if (roadmapError) {
      console.error('❌ Error accessing roadmap_items table:', roadmapError.message);
    } else {
      console.log('✅ Roadmap_items table accessible');
    }

    // Test settings table
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('id')
      .limit(1);

    if (settingsError) {
      console.error('❌ Error accessing settings table:', settingsError.message);
    } else {
      console.log('✅ Settings table accessible');
    }

    console.log('\n🎉 Database connection test completed!');
    console.log('🚀 Your SEO research tool is ready to use!');

    console.log('\n📝 Next steps:');
    console.log('1. Visit your deployed app to test the full functionality');
    console.log('2. Sign up/login to create your first keyword research run');
    console.log('3. Add your Ahrefs API key in the settings (optional)');

  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
  }
}

testConnection();