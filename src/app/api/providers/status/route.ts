// API endpoint to check available providers
import { NextResponse } from 'next/server';
import { getAvailableProviders } from '../../../../integrations/keyword-provider';

/**
 * Check if Anthropic API is configured (required for Dream 100 generation)
 */
function isAnthropicConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!(
    key &&
    key.length > 10 &&
    key !== 'your-anthropic-api-key' &&
    key.startsWith('sk-')
  );
}

/**
 * Check if Ahrefs API is configured (optional, for enrichment)
 */
function isAhrefsConfiguredForStatus(): boolean {
  const key = process.env.AHREFS_API_KEY;
  return !!(
    key &&
    key.length > 10 &&
    key !== 'your-ahrefs-api-key' &&
    process.env.ENABLE_AHREFS !== 'false'
  );
}

export async function GET() {
  try {
    // Check for the primary provider (Anthropic) used for Dream 100 generation
    const anthropicConfigured = isAnthropicConfigured();
    const ahrefsConfigured = isAhrefsConfiguredForStatus();
    
    // Also get SEO tool providers (Ahrefs/Moz/SEMRush)
    const seoProviders = getAvailableProviders();
    
    // Build provider list - Anthropic is the primary provider for this workflow
    const providers: string[] = [];
    if (anthropicConfigured) providers.push('anthropic');
    if (ahrefsConfigured) providers.push('ahrefs');
    providers.push(...seoProviders.filter(p => p !== 'ahrefs'));

    // The app is functional if Anthropic is configured (enrichment is optional)
    const hasProviders = anthropicConfigured;

    return NextResponse.json({
      success: true,
      providers,
      hasProviders,
      primaryProvider: anthropicConfigured ? 'anthropic' : null,
      enrichmentAvailable: ahrefsConfigured || seoProviders.length > 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking provider status:', error);

    return NextResponse.json({
      success: false,
      providers: [],
      hasProviders: false,
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}