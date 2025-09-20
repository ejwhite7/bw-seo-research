"use client";

import { useState, useEffect } from 'react';
import { getAvailableProviders } from '../integrations/keyword-provider';

export default function Home() {
  const [keywords, setKeywords] = useState<string>('');
  const [step, setStep] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('mock');

  const handleStartProcessing = async () => {
    if (!keywords.trim()) return;
    
    setIsProcessing(true);
    // Mock processing delay
    setTimeout(() => {
      setStep(2);
      setIsProcessing(false);
    }, 2000);
  };

  const stepNames = ['Input', 'Dream 100', 'Universe', 'Clusters', 'Roadmap'];

  // Check available providers on component mount
  useEffect(() => {
    try {
      const providers = getAvailableProviders();
      setAvailableProviders(providers);
      
      if (providers.length > 0) {
        setActiveProvider(providers[0]);
      } else if (process.env.NEXT_PUBLIC_MOCK_EXTERNAL_APIS === 'true') {
        setActiveProvider('mock');
      }
    } catch (error) {
      console.log('No providers available, using mock mode');
      setActiveProvider('mock');
    }
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
              ) : (
                `${activeProvider.toUpperCase()} API Active`
              )}
              {availableProviders.length > 1 && (
                <span className="ml-2 text-gray-500">
                  (+{availableProviders.length - 1} backup{availableProviders.length > 2 ? 's' : ''})
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Progress Steps */}
        <div 
          className="flex justify-center mb-8" 
          aria-label="Progress through keyword research workflow"
          role="img"
          aria-describedby="progress-description"
        >
          <ol className="flex items-center space-x-4">
            {[1, 2, 3, 4, 5].map((num) => (
              <li key={num} className="flex items-center">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
                    step >= num 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-gray-900 border-gray-300'
                  }`}
                  aria-current={step === num ? 'step' : undefined}
                  aria-label={`Step ${num}: ${stepNames[num - 1]}${step >= num ? ' (completed)' : step === num ? ' (current)' : ''}`}
                >
                  {step > num ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    num
                  )}
                </div>
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
          <div id="progress-description" className="sr-only">
            Progress indicator showing current step in the keyword research workflow
          </div>
        </div>

        {/* Step Labels */}
        <div className="flex justify-center mb-12" aria-hidden="true">
          <div className="grid grid-cols-5 gap-8 text-center text-sm">
            {stepNames.map((name, index) => (
              <div 
                key={name}
                className={`font-medium ${
                  step >= index + 1 ? 'text-blue-700' : 'text-gray-500'
                }`}
              >
                {name}
              </div>
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

              <div className="flex justify-center pt-4">
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
                  AI is expanding your seed keywords into 100 high-value head terms...
                </p>
              </div>
              
              <div 
                className="bg-amber-50 border-2 border-amber-200 rounded-lg p-6"
                role="alert"
                aria-labelledby="demo-mode-title"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 id="demo-mode-title" className="text-base font-semibold text-amber-900">
                      🚧 Demo Mode Active
                    </h3>
                    <div className="mt-2 text-sm text-amber-800">
                      <p>This is a development preview. The full keyword processing pipeline will be available when API keys are configured in your environment settings.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-900 font-medium
                            hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200
                            transition-all duration-200"
                >
                  ← Back to Input
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
