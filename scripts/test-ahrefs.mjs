/**
 * Ahrefs API Test Script - Final Verification
 * 
 * Run with: node scripts/test-ahrefs.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Manual .env.local parsing
function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (e) {
    console.warn('Could not load .env.local:', e.message);
  }
}

loadEnv();

const AHREFS_API_KEY = process.env.AHREFS_API_KEY;

if (!AHREFS_API_KEY) {
  console.error('❌ AHREFS_API_KEY environment variable is not set');
  process.exit(1);
}

console.log('🔑 Ahrefs API Key:', AHREFS_API_KEY.substring(0, 10) + '...');

async function testEndpoint(name, url, method) {
  console.log(`\n📡 ${name}`);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${AHREFS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`   ✅ Success (${response.status})`);
      return { success: true, data };
    } else {
      console.log(`   ❌ Failed (${response.status}): ${data.error || JSON.stringify(data)}`);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 AHREFS API v3 - VERIFICATION');
  console.log('='.repeat(60));
  
  const today = new Date().toISOString().split('T')[0];
  
  console.log('\n📊 TESTING SITE EXPLORER (Available on your plan)');
  console.log('-'.repeat(50));
  
  const siteMetrics = await testEndpoint(
    'Site Metrics for ahrefs.com',
    `https://api.ahrefs.com/v3/site-explorer/metrics?target=ahrefs.com&mode=domain&date=${today}&select=org_keywords,org_traffic,org_cost`,
    'GET'
  );
  
  const domainRating = await testEndpoint(
    'Domain Rating for ahrefs.com',
    `https://api.ahrefs.com/v3/site-explorer/domain-rating?target=ahrefs.com&date=${today}&select=domain_rating,ahrefs_rank`,
    'GET'
  );
  
  const organicKeywords = await testEndpoint(
    'Organic Keywords for moz.com (Competitor Analysis)',
    `https://api.ahrefs.com/v3/site-explorer/organic-keywords?target=moz.com&mode=domain&country=us&date=${today}&select=keyword,volume,position,traffic&limit=5`,
    'GET'
  );
  
  console.log('\n📝 TESTING KEYWORDS EXPLORER (May require higher plan)');
  console.log('-'.repeat(50));
  
  const keywordOverview = await testEndpoint(
    'Keyword Overview for "seo tools"',
    `https://api.ahrefs.com/v3/keywords-explorer/overview?keywords=seo+tools&country=us&select=keyword,volume,difficulty`,
    'GET'
  );
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  const siteExplorerWorks = siteMetrics.success && domainRating.success;
  const keywordsExplorerWorks = keywordOverview.success;
  
  console.log('\n✅ WORKING FEATURES:');
  if (siteMetrics.success) console.log('   • Site metrics (traffic, keyword count)');
  if (domainRating.success) console.log('   • Domain rating');
  if (organicKeywords.success) console.log('   • Competitor organic keywords');
  
  console.log('\n⚠️  FEATURES USING MOCK DATA:');
  if (!keywordsExplorerWorks) {
    console.log('   • Keyword volume lookup');
    console.log('   • Keyword difficulty');
    console.log('   • Keyword ideas/suggestions');
  }
  
  console.log('\n📋 INTEGRATION STATUS:');
  console.log(`   Site Explorer: ${siteExplorerWorks ? '✅ Working' : '❌ Not Working'}`);
  console.log(`   Keywords Explorer: ${keywordsExplorerWorks ? '✅ Working' : '⚠️ Using mock data'}`);
  
  if (organicKeywords.success && organicKeywords.data?.keywords) {
    console.log('\n🔍 Sample competitor keywords from moz.com:');
    organicKeywords.data.keywords.slice(0, 5).forEach((kw, i) => {
      console.log(`   ${i+1}. "${kw.keyword}" - Vol: ${kw.volume}, Pos: ${kw.position}`);
    });
  }
  
  console.log('\n💡 The app will automatically use mock data for unavailable features.');
}

runTests().catch(console.error);
