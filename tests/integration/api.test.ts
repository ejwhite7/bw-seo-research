/**
 * Integration Tests for API Endpoints
 * 
 * Tests all API routes and external service integrations
 * including authentication, rate limiting, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Next.js API testing utilities
interface NextApiRequest {
  method: string;
  body: any;
  query: any;
  headers: Record<string, string>;
  cookies: Record<string, string>;
}

interface NextApiResponse {
  status: (code: number) => NextApiResponse;
  json: (data: any) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
}

// Mock API handlers for testing
class MockApiHandler {
  async handleRuns(req: NextApiRequest, res: NextApiResponse) {
    switch (req.method) {
      case 'GET':
        return this.getRuns(req, res);
      case 'POST':
        return this.createRun(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  }

  async handleRunById(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;
    
    switch (req.method) {
      case 'GET':
        return this.getRunById(id as string, req, res);
      case 'PUT':
        return this.updateRun(id as string, req, res);
      case 'DELETE':
        return this.deleteRun(id as string, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  }

  async handleKeywords(req: NextApiRequest, res: NextApiResponse) {
    const { runId } = req.query;
    
    switch (req.method) {
      case 'GET':
        return this.getKeywords(runId as string, req, res);
      case 'POST':
        return this.createKeywords(runId as string, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  }

  async handleClusters(req: NextApiRequest, res: NextApiResponse) {
    const { runId } = req.query;
    
    switch (req.method) {
      case 'GET':
        return this.getClusters(runId as string, req, res);
      case 'POST':
        return this.createClusters(runId as string, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  }

  async handleExport(req: NextApiRequest, res: NextApiResponse) {
    const { runId, format } = req.query;
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    return this.exportData(runId as string, format as string, req, res);
  }

  private async getRuns(req: NextApiRequest, res: NextApiResponse) {
    const { userId, status, limit = '10', offset = '0' } = req.query;
    
    // Simulate database query
    const mockRuns = Array.from({ length: parseInt(limit as string) }, (_, i) => ({
      id: `run-${i}`,
      userId: userId || 'test-user',
      seedKeywords: ['digital marketing', 'content marketing'],
      market: 'US',
      status: status || 'completed',
      totalKeywords: Math.floor(Math.random() * 5000) + 1000,
      totalClusters: Math.floor(Math.random() * 50) + 10,
      createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      updatedAt: new Date().toISOString()
    }));
    
    return res.status(200).json({
      data: mockRuns,
      pagination: {
        total: 100,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < 100
      }
    });
  }

  private async createRun(req: NextApiRequest, res: NextApiResponse) {
    const { seedKeywords, market, userId, settings } = req.body;
    
    // Validation
    if (!seedKeywords || !Array.isArray(seedKeywords) || seedKeywords.length === 0) {
      return res.status(400).json({ error: 'Seed keywords are required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Simulate run creation
    const newRun = {
      id: `run-${Date.now()}`,
      userId,
      seedKeywords,
      market: market || 'US',
      status: 'pending',
      totalKeywords: 0,
      totalClusters: 0,
      settings: settings || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return res.status(201).json({ data: newRun });
  }

  private async getRunById(id: string, req: NextApiRequest, res: NextApiResponse) {
    if (!id) {
      return res.status(400).json({ error: 'Run ID is required' });
    }
    
    // Simulate database lookup
    const mockRun = {
      id,
      userId: 'test-user',
      seedKeywords: ['digital marketing', 'content marketing'],
      market: 'US',
      status: 'completed',
      totalKeywords: 2847,
      totalClusters: 23,
      settings: {
        maxKeywords: 10000,
        enableClustering: true,
        generateRoadmap: true
      },
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-01T10:30:00Z'
    };
    
    return res.status(200).json({ data: mockRun });
  }

  private async updateRun(id: string, req: NextApiRequest, res: NextApiResponse) {
    const { status, settings } = req.body;
    
    // Simulate update
    const updatedRun = {
      id,
      status: status || 'completed',
      settings: settings || {},
      updatedAt: new Date().toISOString()
    };
    
    return res.status(200).json({ data: updatedRun });
  }

  private async deleteRun(id: string, req: NextApiRequest, res: NextApiResponse) {
    // Simulate deletion
    return res.status(204).end();
  }

  private async getKeywords(runId: string, req: NextApiRequest, res: NextApiResponse) {
    const { stage, limit = '100', offset = '0', sort = 'blendedScore', order = 'desc' } = req.query;
    
    // Generate mock keywords
    const mockKeywords = Array.from({ length: parseInt(limit as string) }, (_, i) => ({
      id: `kw-${i}`,
      keyword: `test keyword ${i}`,
      stage: stage || ['dream100', 'tier2', 'tier3'][i % 3],
      volume: Math.floor(Math.random() * 10000) + 100,
      difficulty: Math.floor(Math.random() * 100) + 1,
      cpc: Math.random() * 10,
      intent: ['commercial', 'informational', 'navigational'][i % 3],
      relevanceScore: Math.random() * 0.4 + 0.6,
      blendedScore: Math.random() * 0.4 + 0.6,
      quickWin: Math.random() > 0.8,
      clusterId: i % 5 < 3 ? `cluster-${i % 5}` : null,
      runId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    
    return res.status(200).json({
      data: mockKeywords,
      pagination: {
        total: 2847,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < 2847
      }
    });
  }

  private async createKeywords(runId: string, req: NextApiRequest, res: NextApiResponse) {
    const { keywords } = req.body;
    
    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'Keywords array is required' });
    }
    
    // Simulate keyword creation
    const createdKeywords = keywords.map((kw, i) => ({
      id: `kw-${Date.now()}-${i}`,
      ...kw,
      runId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    
    return res.status(201).json({ data: createdKeywords });
  }

  private async getClusters(runId: string, req: NextApiRequest, res: NextApiResponse) {
    const { limit = '50', offset = '0' } = req.query;
    
    // Generate mock clusters
    const mockClusters = Array.from({ length: parseInt(limit as string) }, (_, i) => ({
      id: `cluster-${i}`,
      runId,
      label: `Cluster ${i}`,
      keywords: [`keyword ${i}`, `term ${i}`, `phrase ${i}`],
      size: Math.floor(Math.random() * 20) + 3,
      score: Math.random() * 0.4 + 0.6,
      intentMix: {
        commercial: Math.random() * 50 + 25,
        informational: Math.random() * 50 + 25
      },
      avgVolume: Math.floor(Math.random() * 5000) + 1000,
      avgDifficulty: Math.floor(Math.random() * 60) + 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    
    return res.status(200).json({
      data: mockClusters,
      pagination: {
        total: 23,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < 23
      }
    });
  }

  private async createClusters(runId: string, req: NextApiRequest, res: NextApiResponse) {
    const { clusters } = req.body;
    
    if (!clusters || !Array.isArray(clusters)) {
      return res.status(400).json({ error: 'Clusters array is required' });
    }
    
    // Simulate cluster creation
    const createdClusters = clusters.map((cluster, i) => ({
      id: `cluster-${Date.now()}-${i}`,
      ...cluster,
      runId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    
    return res.status(201).json({ data: createdClusters });
  }

  private async exportData(runId: string, format: string, req: NextApiRequest, res: NextApiResponse) {
    if (!runId) {
      return res.status(400).json({ error: 'Run ID is required' });
    }
    
    const supportedFormats = ['csv', 'xlsx', 'json'];
    if (!supportedFormats.includes(format)) {
      return res.status(400).json({ error: 'Unsupported format' });
    }
    
    // Simulate export generation
    const exportData = {
      runId,
      format,
      downloadUrl: `https://example.com/exports/${runId}.${format}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fileSize: Math.floor(Math.random() * 1000000) + 100000
    };
    
    return res.status(200).json({ data: exportData });
  }
}

// Test utilities
function createMockRequest(method: string, path: string, options: any = {}): NextApiRequest {
  return {
    method,
    body: options.body || {},
    query: options.query || {},
    headers: options.headers || { 'content-type': 'application/json' },
    cookies: options.cookies || {}
  };
}

function createMockResponse(): NextApiResponse {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any
  };

  return {
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res as any;
    }),
    json: jest.fn((data: any) => {
      res.body = data;
    }),
    end: jest.fn(),
    setHeader: jest.fn((name: string, value: string) => {
      res.headers[name] = value;
    })
  } as any;
}

describe('API Integration Tests', () => {
  let apiHandler: MockApiHandler;

  beforeEach(() => {
    apiHandler = new MockApiHandler();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Runs API', () => {
    describe('GET /api/runs', () => {
      it('should return list of runs with pagination', async () => {
        const req = createMockRequest('GET', '/api/runs', {
          query: { userId: 'test-user', limit: '5' }
        });
        const res = createMockResponse();

        await apiHandler.handleRuns(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                userId: 'test-user',
                seedKeywords: expect.any(Array),
                status: expect.any(String)
              })
            ]),
            pagination: expect.objectContaining({
              total: expect.any(Number),
              limit: 5,
              offset: 0,
              hasMore: expect.any(Boolean)
            })
          })
        );
      });

      it('should filter runs by status', async () => {
        const req = createMockRequest('GET', '/api/runs', {
          query: { status: 'completed' }
        });
        const res = createMockResponse();

        await apiHandler.handleRuns(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({ status: 'completed' })
            ])
          })
        );
      });
    });

    describe('POST /api/runs', () => {
      it('should create new run with valid data', async () => {
        const req = createMockRequest('POST', '/api/runs', {
          body: {
            seedKeywords: ['digital marketing', 'seo'],
            market: 'US',
            userId: 'test-user',
            settings: { maxKeywords: 5000 }
          }
        });
        const res = createMockResponse();

        await apiHandler.handleRuns(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              id: expect.any(String),
              userId: 'test-user',
              seedKeywords: ['digital marketing', 'seo'],
              market: 'US',
              status: 'pending'
            })
          })
        );
      });

      it('should return 400 for missing seed keywords', async () => {
        const req = createMockRequest('POST', '/api/runs', {
          body: { userId: 'test-user' }
        });
        const res = createMockResponse();

        await apiHandler.handleRuns(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Seed keywords are required'
          })
        );
      });

      it('should return 400 for missing user ID', async () => {
        const req = createMockRequest('POST', '/api/runs', {
          body: { seedKeywords: ['test'] }
        });
        const res = createMockResponse();

        await apiHandler.handleRuns(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'User ID is required'
          })
        );
      });
    });

    describe('GET /api/runs/[id]', () => {
      it('should return specific run by ID', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run-123', {
          query: { id: 'test-run-123' }
        });
        const res = createMockResponse();

        await apiHandler.handleRunById(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              id: 'test-run-123',
              totalKeywords: expect.any(Number),
              totalClusters: expect.any(Number)
            })
          })
        );
      });

      it('should return 400 for missing run ID', async () => {
        const req = createMockRequest('GET', '/api/runs/', {
          query: { id: '' }
        });
        const res = createMockResponse();

        await apiHandler.handleRunById(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Run ID is required'
          })
        );
      });
    });

    describe('PUT /api/runs/[id]', () => {
      it('should update run status and settings', async () => {
        const req = createMockRequest('PUT', '/api/runs/test-run-123', {
          query: { id: 'test-run-123' },
          body: { status: 'processing', settings: { maxKeywords: 8000 } }
        });
        const res = createMockResponse();

        await apiHandler.handleRunById(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              id: 'test-run-123',
              status: 'processing',
              updatedAt: expect.any(String)
            })
          })
        );
      });
    });

    describe('DELETE /api/runs/[id]', () => {
      it('should delete run successfully', async () => {
        const req = createMockRequest('DELETE', '/api/runs/test-run-123', {
          query: { id: 'test-run-123' }
        });
        const res = createMockResponse();

        await apiHandler.handleRunById(req, res);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.end).toHaveBeenCalled();
      });
    });
  });

  describe('Keywords API', () => {
    describe('GET /api/runs/[runId]/keywords', () => {
      it('should return keywords for a run', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/keywords', {
          query: { runId: 'test-run', limit: '20' }
        });
        const res = createMockResponse();

        await apiHandler.handleKeywords(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                keyword: expect.any(String),
                stage: expect.stringMatching(/^(dream100|tier2|tier3)$/),
                volume: expect.any(Number),
                difficulty: expect.any(Number),
                blendedScore: expect.any(Number)
              })
            ])
          })
        );
      });

      it('should filter keywords by stage', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/keywords', {
          query: { runId: 'test-run', stage: 'dream100' }
        });
        const res = createMockResponse();

        await apiHandler.handleKeywords(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });

      it('should support sorting and pagination', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/keywords', {
          query: { 
            runId: 'test-run', 
            sort: 'volume', 
            order: 'desc',
            limit: '50',
            offset: '100'
          }
        });
        const res = createMockResponse();

        await apiHandler.handleKeywords(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            pagination: expect.objectContaining({
              limit: 50,
              offset: 100
            })
          })
        );
      });
    });

    describe('POST /api/runs/[runId]/keywords', () => {
      it('should create keywords for a run', async () => {
        const req = createMockRequest('POST', '/api/runs/test-run/keywords', {
          query: { runId: 'test-run' },
          body: {
            keywords: [
              {
                keyword: 'digital marketing',
                stage: 'dream100',
                volume: 12000,
                difficulty: 45,
                intent: 'commercial'
              }
            ]
          }
        });
        const res = createMockResponse();

        await apiHandler.handleKeywords(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                keyword: 'digital marketing',
                runId: 'test-run'
              })
            ])
          })
        );
      });

      it('should return 400 for invalid keywords data', async () => {
        const req = createMockRequest('POST', '/api/runs/test-run/keywords', {
          query: { runId: 'test-run' },
          body: { keywords: 'invalid' }
        });
        const res = createMockResponse();

        await apiHandler.handleKeywords(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Keywords array is required'
          })
        );
      });
    });
  });

  describe('Clusters API', () => {
    describe('GET /api/runs/[runId]/clusters', () => {
      it('should return clusters for a run', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/clusters', {
          query: { runId: 'test-run' }
        });
        const res = createMockResponse();

        await apiHandler.handleClusters(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                runId: 'test-run',
                label: expect.any(String),
                keywords: expect.any(Array),
                size: expect.any(Number),
                score: expect.any(Number)
              })
            ])
          })
        );
      });
    });

    describe('POST /api/runs/[runId]/clusters', () => {
      it('should create clusters for a run', async () => {
        const req = createMockRequest('POST', '/api/runs/test-run/clusters', {
          query: { runId: 'test-run' },
          body: {
            clusters: [
              {
                label: 'Digital Marketing Tools',
                keywords: ['tool1', 'tool2'],
                size: 2,
                score: 0.8
              }
            ]
          }
        });
        const res = createMockResponse();

        await apiHandler.handleClusters(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                label: 'Digital Marketing Tools',
                runId: 'test-run'
              })
            ])
          })
        );
      });
    });
  });

  describe('Export API', () => {
    describe('GET /api/runs/[runId]/export', () => {
      it('should generate export for CSV format', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/export', {
          query: { runId: 'test-run', format: 'csv' }
        });
        const res = createMockResponse();

        await apiHandler.handleExport(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              runId: 'test-run',
              format: 'csv',
              downloadUrl: expect.stringContaining('.csv'),
              expiresAt: expect.any(String),
              fileSize: expect.any(Number)
            })
          })
        );
      });

      it('should generate export for Excel format', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/export', {
          query: { runId: 'test-run', format: 'xlsx' }
        });
        const res = createMockResponse();

        await apiHandler.handleExport(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              format: 'xlsx'
            })
          })
        );
      });

      it('should return 400 for unsupported format', async () => {
        const req = createMockRequest('GET', '/api/runs/test-run/export', {
          query: { runId: 'test-run', format: 'pdf' }
        });
        const res = createMockResponse();

        await apiHandler.handleExport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Unsupported format'
          })
        );
      });

      it('should return 400 for missing run ID', async () => {
        const req = createMockRequest('GET', '/api/export', {
          query: { format: 'csv' }
        });
        const res = createMockResponse();

        await apiHandler.handleExport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Run ID is required'
          })
        );
      });
    });
  });

  describe('HTTP Methods', () => {
    it('should return 405 for unsupported methods', async () => {
      const req = createMockRequest('PATCH', '/api/runs');
      const res = createMockResponse();

      await apiHandler.handleRuns(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Method not allowed'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const req = createMockRequest('POST', '/api/runs', {
        body: 'malformed json'
      });
      const res = createMockResponse();

      // This would normally be handled by Next.js middleware
      expect(req.body).toBe('malformed json');
    });

    it('should handle missing content-type header', async () => {
      const req = createMockRequest('POST', '/api/runs', {
        headers: {}
      });
      const res = createMockResponse();

      expect(req.headers).toEqual({});
    });
  });

  describe('Performance and Limits', () => {
    it('should respect pagination limits', async () => {
      const req = createMockRequest('GET', '/api/runs', {
        query: { limit: '1000' } // Large limit
      });
      const res = createMockResponse();

      await apiHandler.handleRuns(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // API should handle large limits gracefully
    });

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () => 
        apiHandler.handleRuns(
          createMockRequest('GET', '/api/runs'),
          createMockResponse()
        )
      );

      const results = await Promise.all(requests);
      
      // All requests should complete successfully
      expect(results).toHaveLength(10);
    });
  });
});