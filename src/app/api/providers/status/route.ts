// API endpoint to check available providers
import { NextResponse } from 'next/server';
import { getAvailableProviders } from '../../../../integrations/keyword-provider';

export async function GET() {
  try {
    const providers = getAvailableProviders();

    return NextResponse.json({
      success: true,
      providers,
      hasProviders: providers.length > 0,
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