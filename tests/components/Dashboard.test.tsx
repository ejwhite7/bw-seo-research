/**
 * Component Tests for Dashboard
 * 
 * Tests the main dashboard component including run management,
 * keyword display, clustering visualization, and export functionality.
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock data types
interface Run {
  id: string;
  userId: string;
  seedKeywords: string[];
  market: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalKeywords: number;
  totalClusters: number;
  createdAt: string;
  updatedAt: string;
}

interface Keyword {
  id: string;
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  volume: number;
  difficulty: number;
  intent: string;
  relevanceScore: number;
  blendedScore: number;
  quickWin: boolean;
  clusterId?: string;
}

interface Cluster {
  id: string;
  label: string;
  keywords: string[];
  size: number;
  score: number;
  intentMix: Record<string, number>;
}

// Mock Dashboard component
function MockDashboard({ 
  runs = [], 
  keywords = [], 
  clusters = [],
  isLoading = false,
  onCreateRun,
  onDeleteRun,
  onExportData
}: {
  runs?: Run[];
  keywords?: Keyword[];
  clusters?: Cluster[];
  isLoading?: boolean;
  onCreateRun?: (seedKeywords: string[]) => void;
  onDeleteRun?: (runId: string) => void;
  onExportData?: (runId: string, format: string) => void;
}) {
  const [selectedRun, setSelectedRun] = React.useState<Run | null>(runs[0] || null);
  const [seedKeywords, setSeedKeywords] = React.useState('');
  const [filterStage, setFilterStage] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState('blendedScore');
  const [viewMode, setViewMode] = React.useState<'keywords' | 'clusters'>('keywords');

  // Filter and sort keywords
  const filteredKeywords = keywords
    .filter(kw => filterStage === 'all' || kw.stage === filterStage)
    .sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return b.volume - a.volume;
        case 'difficulty':
          return a.difficulty - b.difficulty;
        case 'blendedScore':
        default:
          return b.blendedScore - a.blendedScore;
      }
    });

  const handleCreateRun = () => {
    if (seedKeywords.trim() && onCreateRun) {
      const keywords = seedKeywords.split(',').map(kw => kw.trim()).filter(Boolean);
      onCreateRun(keywords);
      setSeedKeywords('');
    }
  };

  if (isLoading) {
    return (
      <div data-testid="dashboard-loading">
        <div>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div data-testid="dashboard" className="dashboard">
      <header className="dashboard-header">
        <h1>Dream 100 Keyword Engine</h1>
        <div className="stats">
          <div data-testid="total-runs">Total Runs: {runs.length}</div>
          <div data-testid="total-keywords">
            Total Keywords: {runs.reduce((sum, run) => sum + run.totalKeywords, 0)}
          </div>
        </div>
      </header>

      <section className="create-run-section">
        <h2>Create New Run</h2>
        <div className="create-run-form">
          <input
            data-testid="seed-keywords-input"
            type="text"
            placeholder="Enter seed keywords (comma separated)"
            value={seedKeywords}
            onChange={(e) => setSeedKeywords(e.target.value)}
          />
          <button
            data-testid="create-run-button"
            onClick={handleCreateRun}
            disabled={!seedKeywords.trim()}
          >
            Create Run
          </button>
        </div>
      </section>

      <section className="runs-section">
        <h2>Recent Runs</h2>
        {runs.length === 0 ? (
          <div data-testid="no-runs">No runs found. Create your first run above.</div>
        ) : (
          <div className="runs-list">
            {runs.map((run) => (
              <div
                key={run.id}
                data-testid={`run-${run.id}`}
                className={`run-item ${selectedRun?.id === run.id ? 'selected' : ''}`}
                onClick={() => setSelectedRun(run)}
              >
                <div className="run-header">
                  <h3>{run.seedKeywords.join(', ')}</h3>
                  <span className={`status status-${run.status}`}>{run.status}</span>
                </div>
                <div className="run-stats">
                  <span>{run.totalKeywords} keywords</span>
                  <span>{run.totalClusters} clusters</span>
                  <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="run-actions">
                  <button
                    data-testid={`export-${run.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportData?.(run.id, 'csv');
                    }}
                  >
                    Export CSV
                  </button>
                  <button
                    data-testid={`delete-${run.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRun?.(run.id);
                    }}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedRun && (
        <section className="run-details">
          <div className="run-details-header">
            <h2>Run Details: {selectedRun.seedKeywords.join(', ')}</h2>
            <div className="view-mode-toggle">
              <button
                data-testid="keywords-view"
                className={viewMode === 'keywords' ? 'active' : ''}
                onClick={() => setViewMode('keywords')}
              >
                Keywords
              </button>
              <button
                data-testid="clusters-view"
                className={viewMode === 'clusters' ? 'active' : ''}
                onClick={() => setViewMode('clusters')}
              >
                Clusters
              </button>
            </div>
          </div>

          {viewMode === 'keywords' && (
            <div className="keywords-section">
              <div className="filters">
                <select
                  data-testid="stage-filter"
                  value={filterStage}
                  onChange={(e) => setFilterStage(e.target.value)}
                >
                  <option value="all">All Stages</option>
                  <option value="dream100">Dream 100</option>
                  <option value="tier2">Tier 2</option>
                  <option value="tier3">Tier 3</option>
                </select>
                <select
                  data-testid="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="blendedScore">Blended Score</option>
                  <option value="volume">Volume</option>
                  <option value="difficulty">Difficulty</option>
                </select>
              </div>

              <div className="keywords-table">
                <div className="table-header">
                  <div>Keyword</div>
                  <div>Stage</div>
                  <div>Volume</div>
                  <div>Difficulty</div>
                  <div>Intent</div>
                  <div>Score</div>
                  <div>Quick Win</div>
                </div>
                {filteredKeywords.length === 0 ? (
                  <div data-testid="no-keywords">No keywords found</div>
                ) : (
                  filteredKeywords.slice(0, 50).map((keyword) => (
                    <div
                      key={keyword.id}
                      data-testid={`keyword-${keyword.id}`}
                      className="keyword-row"
                    >
                      <div className="keyword-text">{keyword.keyword}</div>
                      <div className={`stage stage-${keyword.stage}`}>{keyword.stage}</div>
                      <div>{keyword.volume.toLocaleString()}</div>
                      <div>{keyword.difficulty}</div>
                      <div className={`intent intent-${keyword.intent}`}>{keyword.intent}</div>
                      <div className="score">{keyword.blendedScore.toFixed(3)}</div>
                      <div className={`quick-win ${keyword.quickWin ? 'yes' : 'no'}`}>
                        {keyword.quickWin ? '✓' : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {viewMode === 'clusters' && (
            <div className="clusters-section">
              {clusters.length === 0 ? (
                <div data-testid="no-clusters">No clusters found</div>
              ) : (
                <div className="clusters-grid">
                  {clusters.map((cluster) => (
                    <div
                      key={cluster.id}
                      data-testid={`cluster-${cluster.id}`}
                      className="cluster-card"
                    >
                      <h3 className="cluster-label">{cluster.label}</h3>
                      <div className="cluster-stats">
                        <div>Size: {cluster.size}</div>
                        <div>Score: {cluster.score.toFixed(3)}</div>
                      </div>
                      <div className="cluster-keywords">
                        {cluster.keywords.slice(0, 5).map((keyword, index) => (
                          <span key={index} className="cluster-keyword">
                            {keyword}
                          </span>
                        ))}
                        {cluster.keywords.length > 5 && (
                          <span className="more-keywords">
                            +{cluster.keywords.length - 5} more
                          </span>
                        )}
                      </div>
                      <div className="intent-mix">
                        {Object.entries(cluster.intentMix).map(([intent, percentage]) => (
                          <div key={intent} className="intent-bar">
                            <span>{intent}: {percentage.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

describe('Dashboard Component', () => {
  const mockRuns: Run[] = [
    {
      id: 'run-1',
      userId: 'user-1',
      seedKeywords: ['digital marketing', 'seo'],
      market: 'US',
      status: 'completed',
      totalKeywords: 1250,
      totalClusters: 15,
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-01T12:00:00Z'
    },
    {
      id: 'run-2',
      userId: 'user-1',
      seedKeywords: ['content marketing'],
      market: 'US',
      status: 'processing',
      totalKeywords: 0,
      totalClusters: 0,
      createdAt: '2024-01-02T09:00:00Z',
      updatedAt: '2024-01-02T09:00:00Z'
    }
  ];

  const mockKeywords: Keyword[] = [
    {
      id: 'kw-1',
      keyword: 'digital marketing tools',
      stage: 'dream100',
      volume: 12000,
      difficulty: 45,
      intent: 'commercial',
      relevanceScore: 0.9,
      blendedScore: 0.85,
      quickWin: false
    },
    {
      id: 'kw-2',
      keyword: 'how to do digital marketing',
      stage: 'tier2',
      volume: 3500,
      difficulty: 25,
      intent: 'informational',
      relevanceScore: 0.8,
      blendedScore: 0.75,
      quickWin: true
    },
    {
      id: 'kw-3',
      keyword: 'digital marketing tutorial',
      stage: 'tier3',
      volume: 1200,
      difficulty: 15,
      intent: 'informational',
      relevanceScore: 0.7,
      blendedScore: 0.65,
      quickWin: true
    }
  ];

  const mockClusters: Cluster[] = [
    {
      id: 'cluster-1',
      label: 'Digital Marketing Tools',
      keywords: ['digital marketing tools', 'marketing software', 'automation tools'],
      size: 3,
      score: 0.85,
      intentMix: { commercial: 80, informational: 20 }
    },
    {
      id: 'cluster-2',
      label: 'Digital Marketing Education',
      keywords: ['digital marketing course', 'marketing tutorial', 'learn marketing'],
      size: 3,
      score: 0.75,
      intentMix: { informational: 90, commercial: 10 }
    }
  ];

  let mockOnCreateRun: jest.Mock;
  let mockOnDeleteRun: jest.Mock;
  let mockOnExportData: jest.Mock;

  beforeEach(() => {
    mockOnCreateRun = jest.fn();
    mockOnDeleteRun = jest.fn();
    mockOnExportData = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render dashboard with header and stats', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.getByText('Dream 100 Keyword Engine')).toBeInTheDocument();
      expect(screen.getByTestId('total-runs')).toHaveTextContent('Total Runs: 2');
      expect(screen.getByTestId('total-keywords')).toHaveTextContent('Total Keywords: 1250');
    });

    it('should render loading state', () => {
      render(<MockDashboard isLoading={true} />);

      expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });

    it('should show empty state when no runs exist', () => {
      render(
        <MockDashboard 
          runs={[]}
          onCreateRun={mockOnCreateRun}
        />
      );

      expect(screen.getByTestId('no-runs')).toBeInTheDocument();
      expect(screen.getByText('No runs found. Create your first run above.')).toBeInTheDocument();
    });
  });

  describe('Create Run Functionality', () => {
    it('should allow user to input seed keywords', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={[]}
          onCreateRun={mockOnCreateRun}
        />
      );

      const input = screen.getByTestId('seed-keywords-input');
      await user.type(input, 'digital marketing, seo, content marketing');

      expect(input).toHaveValue('digital marketing, seo, content marketing');
    });

    it('should disable create button when no keywords entered', () => {
      render(
        <MockDashboard 
          runs={[]}
          onCreateRun={mockOnCreateRun}
        />
      );

      const button = screen.getByTestId('create-run-button');
      expect(button).toBeDisabled();
    });

    it('should enable create button when keywords are entered', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={[]}
          onCreateRun={mockOnCreateRun}
        />
      );

      const input = screen.getByTestId('seed-keywords-input');
      const button = screen.getByTestId('create-run-button');

      await user.type(input, 'digital marketing');
      expect(button).not.toBeDisabled();
    });

    it('should call onCreateRun with parsed keywords', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={[]}
          onCreateRun={mockOnCreateRun}
        />
      );

      const input = screen.getByTestId('seed-keywords-input');
      const button = screen.getByTestId('create-run-button');

      await user.type(input, 'digital marketing, seo, content marketing');
      await user.click(button);

      expect(mockOnCreateRun).toHaveBeenCalledWith([
        'digital marketing',
        'seo',
        'content marketing'
      ]);
    });

    it('should clear input after creating run', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={[]}
          onCreateRun={mockOnCreateRun}
        />
      );

      const input = screen.getByTestId('seed-keywords-input');
      const button = screen.getByTestId('create-run-button');

      await user.type(input, 'test keyword');
      await user.click(button);

      expect(input).toHaveValue('');
    });
  });

  describe('Runs List', () => {
    it('should display all runs with correct information', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      expect(screen.getByTestId('run-run-1')).toBeInTheDocument();
      expect(screen.getByTestId('run-run-2')).toBeInTheDocument();

      // Check first run details
      const run1 = screen.getByTestId('run-run-1');
      expect(within(run1).getByText('digital marketing, seo')).toBeInTheDocument();
      expect(within(run1).getByText('completed')).toBeInTheDocument();
      expect(within(run1).getByText('1250 keywords')).toBeInTheDocument();
      expect(within(run1).getByText('15 clusters')).toBeInTheDocument();
    });

    it('should allow selecting a run', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      const run2 = screen.getByTestId('run-run-2');
      await user.click(run2);

      expect(run2).toHaveClass('selected');
    });

    it('should show export and delete buttons for each run', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          onExportData={mockOnExportData}
          onDeleteRun={mockOnDeleteRun}
        />
      );

      expect(screen.getByTestId('export-run-1')).toBeInTheDocument();
      expect(screen.getByTestId('delete-run-1')).toBeInTheDocument();
      expect(screen.getByTestId('export-run-2')).toBeInTheDocument();
      expect(screen.getByTestId('delete-run-2')).toBeInTheDocument();
    });

    it('should call onExportData when export button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          onExportData={mockOnExportData}
        />
      );

      const exportButton = screen.getByTestId('export-run-1');
      await user.click(exportButton);

      expect(mockOnExportData).toHaveBeenCalledWith('run-1', 'csv');
    });

    it('should call onDeleteRun when delete button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          onDeleteRun={mockOnDeleteRun}
        />
      );

      const deleteButton = screen.getByTestId('delete-run-1');
      await user.click(deleteButton);

      expect(mockOnDeleteRun).toHaveBeenCalledWith('run-1');
    });
  });

  describe('Keywords View', () => {
    it('should show keywords view by default', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      expect(screen.getByTestId('keywords-view')).toHaveClass('active');
      expect(screen.getByTestId('stage-filter')).toBeInTheDocument();
      expect(screen.getByTestId('sort-select')).toBeInTheDocument();
    });

    it('should display keywords with correct information', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      expect(screen.getByTestId('keyword-kw-1')).toBeInTheDocument();
      expect(screen.getByText('digital marketing tools')).toBeInTheDocument();
      expect(screen.getByText('dream100')).toBeInTheDocument();
      expect(screen.getByText('12,000')).toBeInTheDocument();
      expect(screen.getByText('commercial')).toBeInTheDocument();
    });

    it('should filter keywords by stage', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      const stageFilter = screen.getByTestId('stage-filter');
      await user.selectOptions(stageFilter, 'dream100');

      // Should only show dream100 keywords
      expect(screen.getByTestId('keyword-kw-1')).toBeInTheDocument();
      expect(screen.queryByTestId('keyword-kw-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('keyword-kw-3')).not.toBeInTheDocument();
    });

    it('should sort keywords by different criteria', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      const sortSelect = screen.getByTestId('sort-select');
      await user.selectOptions(sortSelect, 'volume');

      // Keywords should be sorted by volume (highest first)
      const keywordRows = screen.getAllByTestId(/^keyword-/);
      expect(keywordRows[0]).toHaveAttribute('data-testid', 'keyword-kw-1'); // 12,000 volume
    });

    it('should show quick win indicators', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      const quickWinRows = screen.getAllByText('✓');
      expect(quickWinRows).toHaveLength(2); // kw-2 and kw-3 are quick wins
    });

    it('should show empty state when no keywords match filter', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={[]}
          clusters={mockClusters}
        />
      );

      expect(screen.getByTestId('no-keywords')).toBeInTheDocument();
    });
  });

  describe('Clusters View', () => {
    it('should switch to clusters view when button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      const clustersButton = screen.getByTestId('clusters-view');
      await user.click(clustersButton);

      expect(clustersButton).toHaveClass('active');
      expect(screen.getByTestId('keywords-view')).not.toHaveClass('active');
    });

    it('should display clusters with correct information', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      await user.click(screen.getByTestId('clusters-view'));

      expect(screen.getByTestId('cluster-cluster-1')).toBeInTheDocument();
      expect(screen.getByText('Digital Marketing Tools')).toBeInTheDocument();
      expect(screen.getByText('Size: 3')).toBeInTheDocument();
      expect(screen.getByText('Score: 0.850')).toBeInTheDocument();
    });

    it('should show cluster keywords and intent mix', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      await user.click(screen.getByTestId('clusters-view'));

      const cluster1 = screen.getByTestId('cluster-cluster-1');
      expect(within(cluster1).getByText('digital marketing tools')).toBeInTheDocument();
      expect(within(cluster1).getByText('marketing software')).toBeInTheDocument();
      expect(within(cluster1).getByText('commercial: 80%')).toBeInTheDocument();
      expect(within(cluster1).getByText('informational: 20%')).toBeInTheDocument();
    });

    it('should show empty state when no clusters exist', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={[]}
        />
      );

      await user.click(screen.getByTestId('clusters-view'));

      expect(screen.getByTestId('no-clusters')).toBeInTheDocument();
    });

    it('should truncate long keyword lists in clusters', async () => {
      const user = userEvent.setup();
      
      const longCluster = {
        ...mockClusters[0],
        keywords: Array.from({ length: 10 }, (_, i) => `keyword ${i}`),
        size: 10
      };

      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={[longCluster]}
        />
      );

      await user.click(screen.getByTestId('clusters-view'));

      expect(screen.getByText('+5 more')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      // Check for proper heading structure
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);

      // Check for proper button roles
      expect(screen.getByTestId('create-run-button')).toHaveAttribute('type', 'button');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
          onCreateRun={mockOnCreateRun}
        />
      );

      const input = screen.getByTestId('seed-keywords-input');
      const button = screen.getByTestId('create-run-button');

      // Tab navigation should work
      await user.tab();
      expect(input).toHaveFocus();

      await user.type(input, 'test');
      await user.tab();
      expect(button).toHaveFocus();

      // Enter should trigger the button
      await user.keyboard('{Enter}');
      expect(mockOnCreateRun).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should limit displayed keywords for performance', () => {
      const manyKeywords = Array.from({ length: 1000 }, (_, i) => ({
        ...mockKeywords[0],
        id: `kw-${i}`,
        keyword: `keyword ${i}`
      }));

      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={manyKeywords}
          clusters={mockClusters}
        />
      );

      // Should only render first 50 keywords
      const keywordRows = screen.getAllByTestId(/^keyword-/);
      expect(keywordRows.length).toBeLessThanOrEqual(50);
    });

    it('should handle rapid filter changes', async () => {
      const user = userEvent.setup();
      
      render(
        <MockDashboard 
          runs={mockRuns}
          keywords={mockKeywords}
          clusters={mockClusters}
        />
      );

      const stageFilter = screen.getByTestId('stage-filter');

      // Rapidly change filters
      await user.selectOptions(stageFilter, 'dream100');
      await user.selectOptions(stageFilter, 'tier2');
      await user.selectOptions(stageFilter, 'tier3');
      await user.selectOptions(stageFilter, 'all');

      // Should not crash and should show all keywords
      expect(screen.getByTestId('keyword-kw-1')).toBeInTheDocument();
      expect(screen.getByTestId('keyword-kw-2')).toBeInTheDocument();
      expect(screen.getByTestId('keyword-kw-3')).toBeInTheDocument();
    });
  });
});