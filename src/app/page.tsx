"use client";

import { useState, useEffect } from 'react';

interface Dream100Keyword {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  intent: string;
  relevanceScore: number;
  commercialScore: number;
}

interface Dream100Result {
  dream100Keywords: Dream100Keyword[];
  processingStats?: any;
  costBreakdown?: any;
}

interface UniverseResult {
  tier2Keywords: string[];
  tier3Keywords: string[];
  processingStats?: any;
  costBreakdown?: any;
}

interface ClusterResult {
  clusters: Array<{
    id: string;
    label: string;
    keywords: string[];
    size: number;
    avgVolume: number;
    avgDifficulty: number;
    intentMix: {
      informational: number;
      commercial: number;
      transactional: number;
    };
    priority: number;
  }>;
  processingStats?: any;
  costBreakdown?: any;
}

export default function Home() {
  const [keywords, setKeywords] = useState<string>('');
  const [step, setStep] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('mock');
  const [dream100Results, setDream100Results] = useState<Dream100Result | null>(null);
  const [universeResults, setUniverseResults] = useState<UniverseResult | null>(null);
  const [clusterResults, setClusterResults] = useState<ClusterResult | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const handleStartProcessing = async () => {
    console.log('🔍 handleStartProcessing called with keywords:', keywords);
    if (!keywords.trim()) {
      console.log('❌ No keywords provided - returning early');
      return;
    }

    setIsProcessing(true);
    setProcessingError(null);
    setDream100Results(null);

    try {
      const seedKeywords = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);
      console.log('🔍 Processed seedKeywords:', seedKeywords);

      const requestBody = {
        seedKeywords,
        targetCount: 100,
        market: 'US',
        intentFocus: 'mixed'
      };
      console.log('🔍 Sending request body:', requestBody);

      const response = await fetch('/api/expansion/dream100', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Display error message with details if available
        const errorMsg = result.error || 'Failed to generate Dream 100 keywords';
        const errorDetails = result.errorDetails;
        setProcessingError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
        setStep(1); // Stay on step 1 so user can retry
        return;
      }

      // Success case
      setDream100Results(result.data);
      setStep(2);
      setProcessingError(null); // Clear any previous errors
    } catch (error) {
      console.error('Processing error:', error);
      // Handle network errors or JSON parsing errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setProcessingError('Network error: Unable to connect to the server. Please check your internet connection and try again.');
      } else {
        setProcessingError('An unexpected error occurred while processing keywords. Please try again.');
      }
      setStep(1); // Stay on step 1 so user can retry
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUniverseExpansion = async () => {
    if (!dream100Results || !dream100Results.dream100Keywords) return;

    setIsProcessing(true);
    setProcessingError(null);
    setUniverseResults(null);

    try {
      const dream100Keywords = dream100Results.dream100Keywords.map(k => k.keyword);

      // Add timeout for long-running universe expansion (60 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60 * 60 * 1000);

      const response = await fetch('/api/expansion/universe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dream100Keywords,
          targetTier2Count: 1000,
          targetTier3Count: 9000,
          market: 'US'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      // Check for errors (HTTP or business logic)
      if (!response.ok || !result.success) {
        // Display error message with details if available
        const errorMsg = result.error || 'Failed to expand keyword universe';
        const errorDetails = result.errorDetails;
        setProcessingError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
        setStep(3); // Stay on step 3 so user can retry
        setIsProcessing(false);
        return;
      }

      // Success case
      setUniverseResults(result.data);
      setStep(4);
      setProcessingError(null); // Clear any previous errors
    } catch (error) {
      console.error('Universe expansion error:', error);
      // Handle network errors or JSON parsing errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setProcessingError('Network error: Unable to connect to the server. Please check your internet connection and try again.');
      } else if (error instanceof Error && error.name === 'AbortError') {
        setProcessingError('Request timed out: The universe expansion took too long. Try with fewer keywords.');
      } else {
        setProcessingError(`An unexpected error occurred while expanding the keyword universe. Please try again.`);
      }
      setStep(3); // Stay on step 3 so user can retry
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClustering = async () => {
    if (!universeResults) return;

    setIsProcessing(true);
    setProcessingError(null);
    setClusterResults(null);

    try {
      const allKeywords = [
        ...dream100Results?.dream100Keywords.map(k => k.keyword) || [],
        ...universeResults.tier2Keywords,
        ...universeResults.tier3Keywords
      ];

      const response = await fetch('/api/clustering/semantic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keywords: allKeywords,
          targetClusters: 20,
          minClusterSize: 5,
          maxClusterSize: 500
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Display error message with details if available
        const errorMsg = result.error || 'Failed to cluster keywords';
        const errorDetails = result.errorDetails;
        setProcessingError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
        setStep(4); // Stay on step 4 so user can retry
        return;
      }

      // Success case
      setClusterResults(result.data);
      setStep(5);
      setProcessingError(null); // Clear any previous errors
    } catch (error) {
      console.error('Clustering error:', error);
      // Handle network errors or JSON parsing errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setProcessingError('Network error: Unable to connect to the server. Please check your internet connection and try again.');
      } else {
        setProcessingError('An unexpected error occurred while clustering keywords. Please try again.');
      }
      setStep(4); // Stay on step 4 so user can retry
    } finally {
      setIsProcessing(false);
    }
  };

  // CSV Export Handlers
  const handleExportKeywordUniverse = () => {
    if (!dream100Results && !universeResults) return;

    const rows: string[] = [];
    
    // CSV Header
    rows.push('keyword,tier,volume,difficulty,intent,relevance_score,commercial_score');
    
    // Dream 100 keywords
    if (dream100Results?.dream100Keywords) {
      dream100Results.dream100Keywords.forEach(kw => {
        rows.push([
          `"${kw.keyword.replace(/"/g, '""')}"`,
          'dream100',
          kw.volume ?? '',
          kw.difficulty ?? '',
          kw.intent,
          (kw.relevanceScore * 100).toFixed(1),
          (kw.commercialScore * 100).toFixed(1)
        ].join(','));
      });
    }
    
    // Tier 2 keywords
    if (universeResults?.tier2Keywords) {
      universeResults.tier2Keywords.forEach(kw => {
        rows.push([
          `"${kw.replace(/"/g, '""')}"`,
          'tier2',
          '',
          '',
          '',
          '',
          ''
        ].join(','));
      });
    }
    
    // Tier 3 keywords  
    if (universeResults?.tier3Keywords) {
      universeResults.tier3Keywords.forEach(kw => {
        rows.push([
          `"${kw.replace(/"/g, '""')}"`,
          'tier3',
          '',
          '',
          '',
          '',
          ''
        ].join(','));
      });
    }
    
    downloadCSV(rows.join('\n'), 'keyword-universe.csv');
  };

  const handleExportClusters = () => {
    if (!clusterResults?.clusters) return;

    const rows: string[] = [];
    
    // CSV Header
    rows.push('cluster_id,cluster_label,size,avg_volume,avg_difficulty,priority,informational_pct,commercial_pct,transactional_pct,sample_keywords');
    
    clusterResults.clusters.forEach(cluster => {
      rows.push([
        cluster.id,
        `"${cluster.label.replace(/"/g, '""')}"`,
        cluster.size,
        cluster.avgVolume,
        cluster.avgDifficulty,
        (cluster.priority * 100).toFixed(1),
        (cluster.intentMix.informational * 100).toFixed(1),
        (cluster.intentMix.commercial * 100).toFixed(1),
        (cluster.intentMix.transactional * 100).toFixed(1),
        `"${cluster.keywords.slice(0, 5).join(', ').replace(/"/g, '""')}"`
      ].join(','));
    });
    
    downloadCSV(rows.join('\n'), 'keyword-clusters.csv');
  };

  const handleExportRoadmap = () => {
    if (!clusterResults?.clusters || !dream100Results?.dream100Keywords) return;

    const rows: string[] = [];
    
    // CSV Header per PRD spec
    rows.push('post_id,cluster_label,stage,primary_keyword,secondary_keywords,intent,volume,difficulty,blended_score,quick_win,suggested_title,dri,due_date,notes');
    
    // Generate roadmap items from clusters
    let postId = 1;
    const today = new Date();
    
    clusterResults.clusters.forEach((cluster, clusterIndex) => {
      // Create pillar post for each cluster
      const primaryKeyword = cluster.keywords[0] || cluster.label;
      const secondaryKeywords = cluster.keywords.slice(1, 4).join(', ');
      const dueDate = new Date(today);
      dueDate.setDate(today.getDate() + (clusterIndex * 7) + 7); // Stagger by week
      
      const isPillar = clusterIndex < 5;
      const stage = isPillar ? 'pillar' : 'supporting';
      const quickWin = cluster.avgDifficulty < 40 && cluster.avgVolume > 1000;
      
      // Determine primary intent
      const intentMix = cluster.intentMix;
      const primaryIntent = intentMix.commercial > intentMix.informational && intentMix.commercial > intentMix.transactional 
        ? 'commercial' 
        : intentMix.transactional > intentMix.informational 
          ? 'transactional' 
          : 'informational';
      
      // Generate suggested title
      const suggestedTitle = generateTitle(primaryKeyword, primaryIntent, isPillar);
      
      rows.push([
        `POST-${String(postId++).padStart(3, '0')}`,
        `"${cluster.label.replace(/"/g, '""')}"`,
        stage,
        `"${primaryKeyword.replace(/"/g, '""')}"`,
        `"${secondaryKeywords.replace(/"/g, '""')}"`,
        primaryIntent,
        cluster.avgVolume,
        cluster.avgDifficulty,
        (cluster.priority).toFixed(3),
        quickWin ? 'TRUE' : 'FALSE',
        `"${suggestedTitle.replace(/"/g, '""')}"`,
        '', // DRI - to be assigned
        dueDate.toISOString().split('T')[0],
        isPillar ? 'Pillar content - link from supporting posts' : ''
      ].join(','));
    });
    
    downloadCSV(rows.join('\n'), 'editorial-roadmap.csv');
  };

  // Helper function to generate titles
  const generateTitle = (keyword: string, intent: string, isPillar: boolean): string => {
    const capitalizedKeyword = keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    if (isPillar) {
      if (intent === 'commercial') {
        return `The Complete Guide to ${capitalizedKeyword}: Strategies, Tools & Best Practices`;
      } else if (intent === 'transactional') {
        return `Top ${capitalizedKeyword} Solutions: Comparison & Reviews for ${new Date().getFullYear()}`;
      } else {
        return `${capitalizedKeyword}: Everything You Need to Know in ${new Date().getFullYear()}`;
      }
    } else {
      if (intent === 'commercial') {
        return `Best ${capitalizedKeyword} Tools & Software Compared`;
      } else if (intent === 'transactional') {
        return `How to Choose the Right ${capitalizedKeyword} for Your Needs`;
      } else {
        return `${capitalizedKeyword}: A Practical Guide for Beginners`;
      }
    }
  };

  // Helper function to download CSV
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Dream 100 keywords only
  const handleExportDream100 = () => {
    if (!dream100Results || !dream100Results.dream100Keywords) return;

    const rows: string[] = [];
    rows.push('keyword,volume,difficulty,intent,relevance_score,commercial_score');
    
    dream100Results.dream100Keywords.forEach(kw => {
      rows.push([
        `"${kw.keyword.replace(/"/g, '""')}"`,
        kw.volume ?? '',
        kw.difficulty ?? '',
        kw.intent,
        (kw.relevanceScore * 100).toFixed(1),
        (kw.commercialScore * 100).toFixed(1)
      ].join(','));
    });
    
    downloadCSV(rows.join('\n'), 'dream-100-keywords.csv');
  };

  // Import Dream 100 keywords from CSV
  const handleImportDream100 = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header row if it exists
      const startIndex = lines[0]?.toLowerCase().includes('keyword') ? 1 : 0;
      
      const keywords: Dream100Keyword[] = [];
      for (let i = startIndex; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length >= 1 && parts[0].trim()) {
          keywords.push({
            keyword: parts[0].trim().replace(/^"|"$/g, ''),
            volume: parts[1] ? parseInt(parts[1]) || null : null,
            difficulty: parts[2] ? parseInt(parts[2]) || null : null,
            intent: parts[3] || 'informational',
            relevanceScore: parts[4] ? parseFloat(parts[4]) / 100 : 0.7,
            commercialScore: parts[5] ? parseFloat(parts[5]) / 100 : 0.5
          });
        }
      }
      
      if (keywords.length > 0) {
        setDream100Results({ dream100Keywords: keywords });
        setStep(2);
      }
    };
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
  };

  // Import keyword universe from CSV (plain keyword list)
  const handleImportUniverse = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header row if it exists
      const startIndex = lines[0]?.toLowerCase().includes('keyword') ? 1 : 0;
      
      const allKeywords: string[] = [];
      for (let i = startIndex; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts[0]?.trim()) {
          allKeywords.push(parts[0].trim().replace(/^"|"$/g, ''));
        }
      }
      
      // Split into tiers based on position (first 100 = dream100, next 1000 = tier2, rest = tier3)
      const dream100 = allKeywords.slice(0, 100);
      const tier2 = allKeywords.slice(100, 1100);
      const tier3 = allKeywords.slice(1100);
      
      // Create dream100 results if we don't have them
      if (!dream100Results && dream100.length > 0) {
        setDream100Results({
          dream100Keywords: dream100.map(kw => ({
            keyword: kw,
            volume: null,
            difficulty: null,
            intent: 'informational',
            relevanceScore: 0.7,
            commercialScore: 0.5
          }))
        });
      }
      
      if (tier2.length > 0 || tier3.length > 0) {
        setUniverseResults({
          tier2Keywords: tier2,
          tier3Keywords: tier3
        });
        setStep(3);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Helper function to parse CSV lines (handles quoted values)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  // Navigate to a specific step (only if prerequisites are met)
  const navigateToStep = (targetStep: number) => {
    // Step 1 is always accessible
    if (targetStep === 1) {
      setStep(1);
      return;
    }
    
    // Step 2 requires seeds or imported dream100
    if (targetStep === 2 && (keywords.trim() || dream100Results)) {
      setStep(2);
      return;
    }
    
    // Step 3 requires dream100 results
    if (targetStep === 3 && dream100Results) {
      setStep(3);
      return;
    }
    
    // Step 4 requires universe results
    if (targetStep === 4 && (universeResults || dream100Results)) {
      setStep(4);
      return;
    }
    
    // Step 5 requires cluster results
    if (targetStep === 5 && clusterResults) {
      setStep(5);
      return;
    }
  };

  // Check if a step is accessible
  const isStepAccessible = (targetStep: number): boolean => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return !!(keywords.trim() || dream100Results);
    if (targetStep === 3) return !!dream100Results;
    if (targetStep === 4) return !!(universeResults || dream100Results);
    if (targetStep === 5) return !!clusterResults;
    return false;
  };

  const stepNames = ['Input', 'Dream 100', 'Universe', 'Clusters', 'Roadmap'];

  // Check available providers on component mount
  useEffect(() => {
    async function checkProviders() {
      try {
        const response = await fetch('/api/providers/status');
        const data = await response.json();

        if (data.success && data.hasProviders) {
          setAvailableProviders(data.providers);
          // Primary provider is Anthropic for Dream 100 workflow
          setActiveProvider(data.primaryProvider || data.providers[0] || 'anthropic');
        } else {
          console.log('No providers available, using mock mode');
          setActiveProvider('mock');
        }
      } catch (error) {
        console.log('Error checking providers, using mock mode:', error);
        setActiveProvider('mock');
      }
    }

    checkProviders();
  }, []);

  return (
    <div className="min-h-screen bg-white py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Skip to main content link for screen readers */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('keywords')?.focus();
          }}
        >
          Skip to main content
        </a>

        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🚀 Dream 100 Keyword Engine
          </h1>
          <p className="text-lg text-gray-700">
            Transform seed keywords into a comprehensive content strategy
          </p>
          
          {/* API Provider Status */}
          <div className="mt-4 flex justify-center">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                activeProvider === 'mock' ? 'bg-yellow-400' : 'bg-green-400'
              }`} />
              {activeProvider === 'mock' ? (
                'Demo Mode - Mock Data'
              ) : activeProvider === 'anthropic' ? (
                'AI-Powered Mode Active'
              ) : (
                `${activeProvider.toUpperCase()} API Active`
              )}
              {availableProviders.length > 1 && (
                <span className="ml-2 text-gray-500">
                  (+{availableProviders.length - 1} enrichment source{availableProviders.length > 2 ? 's' : ''})
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Progress Steps - Clickable navigation */}
        <nav 
          className="flex justify-center mb-8" 
          aria-label="Progress through keyword research workflow"
        >
          <ol className="flex items-center space-x-4">
            {[1, 2, 3, 4, 5].map((num) => (
              <li key={num} className="flex items-center">
                <button
                  onClick={() => navigateToStep(num)}
                  disabled={!isStepAccessible(num) && step < num}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-200 ${
                    step === num
                      ? 'bg-blue-600 text-white border-blue-600 ring-4 ring-blue-200'
                      : step > num
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 cursor-pointer'
                      : isStepAccessible(num)
                      ? 'bg-white text-blue-600 border-blue-300 hover:border-blue-500 cursor-pointer'
                      : 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                  }`}
                  aria-current={step === num ? 'step' : undefined}
                  aria-label={`Step ${num}: ${stepNames[num - 1]}${step >= num ? ' (completed)' : step === num ? ' (current)' : isStepAccessible(num) ? ' (available)' : ' (locked)'}`}
                  title={isStepAccessible(num) ? `Go to ${stepNames[num - 1]}` : `Complete previous steps to unlock`}
                >
                  {step > num ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    num
                  )}
                </button>
                {num < 5 && (
                  <div 
                    className={`w-12 h-1 ${
                      step > num ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* Step Labels - Also clickable */}
        <div className="flex justify-center mb-12">
          <div className="grid grid-cols-5 gap-8 text-center text-sm">
            {stepNames.map((name, index) => (
              <button
                key={name}
                onClick={() => navigateToStep(index + 1)}
                disabled={!isStepAccessible(index + 1) && step < index + 1}
                className={`font-medium transition-colors duration-200 ${
                  step === index + 1 
                    ? 'text-blue-700 font-semibold' 
                    : step > index + 1
                    ? 'text-blue-600 hover:text-blue-800 cursor-pointer'
                    : isStepAccessible(index + 1)
                    ? 'text-blue-500 hover:text-blue-700 cursor-pointer'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <main id="main-content" className="bg-gray-50 rounded-lg shadow-sm border border-gray-200 p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Step 1: Enter Your Seed Keywords
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Enter 1-5 seed keywords to begin your keyword research journey. 
                  We'll expand these into 10,000+ keywords and create your editorial roadmap.
                </p>
              </div>
              
              <div className="space-y-4">
                <label 
                  htmlFor="keywords" 
                  className="block text-base font-semibold text-gray-900"
                >
                  Seed Keywords
                  <span className="block text-sm font-normal text-gray-600 mt-1">
                    Enter one keyword per line (1-5 keywords recommended)
                  </span>
                </label>
                <textarea
                  id="keywords"
                  name="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Example:&#10;social selling&#10;content marketing&#10;lead generation"
                  rows={5}
                  className="w-full p-4 text-base border-2 border-gray-300 rounded-lg 
                            focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                            bg-white text-gray-900 placeholder-gray-500
                            transition-colors duration-200"
                  aria-describedby="keywords-help"
                  required
                />
                <div id="keywords-help" className="text-sm text-gray-600">
                  Each keyword should be on a separate line. These will be expanded into thousands of related keywords.
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 pt-4">
                <button
                  onClick={handleStartProcessing}
                  disabled={!keywords.trim() || isProcessing}
                  className="px-8 py-4 bg-blue-600 text-white font-semibold text-base rounded-lg 
                            hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 
                            disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60
                            transition-all duration-200 min-w-[180px]"
                  aria-describedby={!keywords.trim() ? "button-disabled-help" : undefined}
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    'Start Processing'
                  )}
                </button>

                {/* Import options */}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>or skip ahead:</span>
                  <label className="cursor-pointer text-blue-600 hover:text-blue-800 hover:underline">
                    Import Dream 100 CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleImportDream100}
                      className="hidden"
                    />
                  </label>
                  <span>|</span>
                  <label className="cursor-pointer text-blue-600 hover:text-blue-800 hover:underline">
                    Import Keyword Universe
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleImportUniverse}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              {!keywords.trim() && (
                <div id="button-disabled-help" className="text-center text-sm text-gray-600 mt-2">
                  Please enter at least one keyword to continue
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Step 2: Dream 100 Generation
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Your Dream 100 keywords have been generated and analyzed.
                </p>
              </div>

              {processingError && (
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6" role="alert">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-base font-semibold text-yellow-900">Service Temporarily Unavailable</h3>
                      <div className="mt-2 text-sm text-yellow-800">
                        <p>{processingError}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            setProcessingError(null);
                            handleStartProcessing();
                          }}
                          className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {dream100Results && dream100Results.dream100Keywords && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Dream 100 Keywords ({dream100Results.dream100Keywords.length} generated)
                    </h3>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Keyword
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Volume
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Difficulty
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Intent
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Relevance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dream100Results.dream100Keywords.map((keyword, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {keyword.keyword}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {keyword.volume ? keyword.volume.toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {keyword.difficulty !== null ? `${keyword.difficulty}/100` : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                keyword.intent === 'commercial'
                                  ? 'bg-green-100 text-green-800'
                                  : keyword.intent === 'informational'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {keyword.intent}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {(keyword.relevanceScore * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-900 font-medium
                            hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200
                            transition-all duration-200"
                >
                  ← Back to Input
                </button>

                <div className="flex items-center gap-3">
                  {dream100Results && dream100Results.dream100Keywords && (
                    <button
                      onClick={handleExportDream100}
                      className="px-4 py-2 border-2 border-green-500 text-green-700 rounded-lg font-medium
                                hover:bg-green-50 focus:outline-none focus:ring-4 focus:ring-green-200
                                transition-all duration-200 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export CSV
                    </button>
                  )}

                  {dream100Results && dream100Results.dream100Keywords && (
                    <button
                      onClick={() => setStep(3)}
                      className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg
                                hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                                transition-all duration-200"
                    >
                      Continue to Universe →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Step 3: Universe Expansion
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Expand your Dream 100 keywords into a comprehensive 10,000+ keyword universe with tier-2 and tier-3 variations.
                </p>
              </div>

              {processingError && step === 3 && (
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6" role="alert">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-base font-semibold text-yellow-900">Service Temporarily Unavailable</h3>
                      <div className="mt-2 text-sm text-yellow-800">
                        <p>{processingError}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            setProcessingError(null);
                            handleUniverseExpansion();
                          }}
                          disabled={!dream100Results || isProcessing}
                          className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!universeResults && !isProcessing && (
                <div className="text-center py-12">
                  <button
                    onClick={handleUniverseExpansion}
                    disabled={!dream100Results || isProcessing}
                    className="px-8 py-4 bg-blue-600 text-white font-semibold text-base rounded-lg
                              hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                              disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60
                              transition-all duration-200 min-w-[200px]"
                  >
                    Generate Universe Keywords
                  </button>
                </div>
              )}

              {isProcessing && (
                <div className="text-center py-12">
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-lg font-medium text-gray-900">Expanding keyword universe...</span>
                  </div>
                </div>
              )}

              {universeResults && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Tier 2 Keywords ({universeResults.tier2Keywords.length})
                      </h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-4">
                      <div className="space-y-2">
                        {universeResults.tier2Keywords.slice(0, 50).map((keyword, index) => (
                          <div key={index} className="text-sm text-gray-700 px-2 py-1 bg-gray-50 rounded">
                            {keyword}
                          </div>
                        ))}
                        {universeResults.tier2Keywords.length > 50 && (
                          <div className="text-sm text-gray-500 italic px-2 py-1">
                            ... and {universeResults.tier2Keywords.length - 50} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Tier 3 Keywords ({universeResults.tier3Keywords.length})
                      </h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-4">
                      <div className="space-y-2">
                        {universeResults.tier3Keywords.slice(0, 50).map((keyword, index) => (
                          <div key={index} className="text-sm text-gray-700 px-2 py-1 bg-gray-50 rounded">
                            {keyword}
                          </div>
                        ))}
                        {universeResults.tier3Keywords.length > 50 && (
                          <div className="text-sm text-gray-500 italic px-2 py-1">
                            ... and {universeResults.tier3Keywords.length - 50} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-900 font-medium
                            hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200
                            transition-all duration-200"
                >
                  ← Back to Dream 100
                </button>

                <div className="flex items-center gap-3">
                  {(dream100Results || universeResults) && (
                    <button
                      onClick={handleExportKeywordUniverse}
                      className="px-4 py-2 border-2 border-green-500 text-green-700 rounded-lg font-medium
                                hover:bg-green-50 focus:outline-none focus:ring-4 focus:ring-green-200
                                transition-all duration-200 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export Universe CSV
                    </button>
                  )}

                  {universeResults && (
                    <button
                      onClick={() => setStep(4)}
                      className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg
                                hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                                transition-all duration-200"
                    >
                      Continue to Clustering →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Step 4: Semantic Clustering
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Group your keywords into semantic clusters for better content organization and strategy.
                </p>
              </div>

              {processingError && step === 4 && (
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6" role="alert">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-base font-semibold text-yellow-900">Service Temporarily Unavailable</h3>
                      <div className="mt-2 text-sm text-yellow-800">
                        <p>{processingError}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            setProcessingError(null);
                            handleClustering();
                          }}
                          disabled={!universeResults || isProcessing}
                          className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!clusterResults && !isProcessing && (
                <div className="text-center py-12">
                  <button
                    onClick={handleClustering}
                    disabled={!universeResults || isProcessing}
                    className="px-8 py-4 bg-blue-600 text-white font-semibold text-base rounded-lg
                              hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                              disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60
                              transition-all duration-200 min-w-[200px]"
                  >
                    Generate Semantic Clusters
                  </button>
                </div>
              )}

              {isProcessing && (
                <div className="text-center py-12">
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-lg font-medium text-gray-900">Clustering keywords...</span>
                  </div>
                </div>
              )}

              {clusterResults && (
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Semantic Clusters ({clusterResults.clusters.length})
                      </h3>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      <div className="divide-y divide-gray-200">
                        {clusterResults.clusters.map((cluster, index) => (
                          <div key={cluster.id} className="p-4 hover:bg-gray-50">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-semibold text-gray-900">{cluster.label}</h4>
                              <span className="text-sm text-gray-500">
                                {cluster.size} keywords
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-3">
                              <div className="text-sm">
                                <span className="text-gray-500">Avg Volume:</span>
                                <span className="ml-1 font-medium">{cluster.avgVolume.toLocaleString()}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-500">Avg Difficulty:</span>
                                <span className="ml-1 font-medium">{cluster.avgDifficulty}/100</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-500">Priority:</span>
                                <span className="ml-1 font-medium">{(cluster.priority * 100).toFixed(0)}%</span>
                              </div>
                            </div>

                            <div className="text-sm text-gray-700">
                              <span className="text-gray-500">Sample keywords:</span>
                              <span className="ml-1">{cluster.keywords.slice(0, 3).join(', ')}</span>
                              {cluster.keywords.length > 3 && (
                                <span className="text-gray-500"> +{cluster.keywords.length - 3} more</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-900 font-medium
                            hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200
                            transition-all duration-200"
                >
                  ← Back to Universe
                </button>

                {clusterResults && (
                  <button
                    onClick={() => setStep(5)}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg
                              hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                              transition-all duration-200"
                  >
                    Continue to Roadmap →
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Step 5: Editorial Roadmap
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  Your keyword research is complete! Review your clusters and generate your editorial roadmap.
                </p>
              </div>

              {clusterResults && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Research Summary
                  </h3>

                  <div className="grid md:grid-cols-4 gap-6 mb-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {dream100Results?.dream100Keywords?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Dream 100</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {universeResults?.tier2Keywords.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Tier 2</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {universeResults?.tier3Keywords.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Tier 3</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {clusterResults.clusters.length}
                      </div>
                      <div className="text-sm text-gray-600">Clusters</div>
                    </div>
                  </div>

                  <div className="flex justify-center gap-4 flex-wrap">
                    <button
                      onClick={handleExportKeywordUniverse}
                      disabled={isProcessing}
                      className="px-6 py-4 bg-blue-600 text-white font-semibold text-base rounded-lg
                                hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                                disabled:bg-gray-400 disabled:cursor-not-allowed
                                transition-all duration-200 min-w-[180px]"
                    >
                      📋 Export Keywords CSV
                    </button>
                    <button
                      onClick={handleExportClusters}
                      disabled={isProcessing}
                      className="px-6 py-4 bg-purple-600 text-white font-semibold text-base rounded-lg
                                hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300
                                disabled:bg-gray-400 disabled:cursor-not-allowed
                                transition-all duration-200 min-w-[180px]"
                    >
                      🗂️ Export Clusters CSV
                    </button>
                    <button
                      onClick={handleExportRoadmap}
                      disabled={isProcessing}
                      className="px-6 py-4 bg-green-600 text-white font-semibold text-base rounded-lg
                                hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300
                                disabled:bg-gray-400 disabled:cursor-not-allowed
                                transition-all duration-200 min-w-[180px]"
                    >
                      📊 Export Roadmap CSV
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-900 font-medium
                            hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200
                            transition-all duration-200"
                >
                  ← Back to Clusters
                </button>

                <button
                  onClick={() => {
                    // Reset to start over
                    setStep(1);
                    setKeywords('');
                    setDream100Results(null);
                    setUniverseResults(null);
                    setClusterResults(null);
                    setProcessingError(null);
                  }}
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg
                            hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300
                            transition-all duration-200"
                >
                  🚀 Start New Research
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-sm text-gray-600">
            <span aria-hidden="true">🌟</span> <a 
              href="https://github.com/ejwhite7/dream-100-kw-tool" 
              className="text-blue-700 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              target="_blank"
              rel="noopener noreferrer"
            >
              Star this project on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
