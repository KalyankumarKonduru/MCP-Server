
// Update src/server.ts - Just the constructor and imports section

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { MongoDBClient } from './db/mongodb-client.js';
import { LocalEmbeddingService } from './services/local-embedding-service.js';
import { MedicalNERService } from './services/medical-ner-service.js';
import { OCRService } from './services/ocr-service.js';
import { PDFService } from './services/pdf-service.js';
import { DocumentTools } from './tools/document-tools.js';
import { MedicalTools } from './tools/medical-tools.js';
import { LocalEmbeddingTools } from './tools/local-embedding-tools.js';

// Load environment variables
dotenv.config();

// Detect if running in stdio mode
const isStdioMode = process.argv.includes('--stdio') || 
                   process.stdin.isTTY === false ||
                   process.env.MCP_STDIO_MODE === 'true';

// Detect if running in HTTP mode
const isHttpMode = process.env.MCP_HTTP_MODE === 'true';

// Custom logger that respects stdio mode
const logger = {
  log: (...args: any[]) => {
    if (!isStdioMode) {
      console.log(...args);
    } else {
      console.error(...args);
    }
  },
  error: (...args: any[]) => {
    console.error(...args);
  }
};

export class MedicalMCPServer {
  private server: Server;
  private mongoClient: MongoDBClient;
  private localEmbeddingService: LocalEmbeddingService;
  private nerService: MedicalNERService;
  private ocrService: OCRService;
  private pdfService: PDFService;
  private documentTools: DocumentTools;
  private medicalTools: MedicalTools;
  private localEmbeddingTools: LocalEmbeddingTools;

  constructor() {
    // Validate required environment variables
    const mongoConnectionString = process.env.MONGODB_CONNECTION_STRING;
    const dbName = process.env.MONGODB_DATABASE_NAME || 'MCP';

    if (!mongoConnectionString) {
      throw new Error('MONGODB_CONNECTION_STRING environment variable is required');
    }

    // Note: No Google API key required for local embeddings

    // Initialize services
    this.mongoClient = new MongoDBClient(mongoConnectionString, dbName);
    this.localEmbeddingService = new LocalEmbeddingService();
    this.nerService = new MedicalNERService();
    this.ocrService = new OCRService();
    this.pdfService = new PDFService();

    // Initialize tools with LOCAL embedding service
    this.documentTools = new DocumentTools(
      this.mongoClient,
      this.localEmbeddingService,
      this.nerService,
      this.ocrService,
      this.pdfService
    );

    this.medicalTools = new MedicalTools(
      this.mongoClient,
      this.nerService,
      this.localEmbeddingService
    );

    this.localEmbeddingTools = new LocalEmbeddingTools(this.mongoClient);

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'medical-mcp-server',
        version: '1.0.0',
        description: 'Medical MCP Server with Local HuggingFace embeddings, document processing, NER, and vector search capabilities'
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const documentToolsList = this.documentTools.getAllTools();
      const medicalToolsList = this.medicalTools.getAllTools();
      const localEmbeddingToolsList = this.localEmbeddingTools.getAllTools();
      
      return {
        tools: [
          ...documentToolsList,
          ...medicalToolsList,
          ...localEmbeddingToolsList
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // ADD DEBUG LINE
        console.log(`🔧 TOOL CALLED: "${name}" with args:`, JSON.stringify(args, null, 2));
        
        switch (name) {
          // Document tools
          case 'uploadDocument':
            console.log(`📤 Routing to DocumentTools.handleUploadDocument`);
            return await this.documentTools.handleUploadDocument(args as any || {});

          case 'searchDocuments':
            console.log(`🔍 Routing to DocumentTools.handleSearchDocuments`);
            return await this.documentTools.handleSearchDocuments(args as any || {});

          case 'listDocuments':
            console.log(`📋 Routing to DocumentTools.handleListDocuments`);
            return await this.documentTools.handleListDocuments(args as any || {});

          // Medical tools
          case 'extractMedicalEntities':
            console.log(`🏷️ Routing to MedicalTools.handleExtractMedicalEntities`);
            return await this.medicalTools.handleExtractMedicalEntities(args as any || {});

          case 'findSimilarCases':
            console.log(`🔗 Routing to MedicalTools.handleFindSimilarCases`);
            return await this.medicalTools.handleFindSimilarCases(args as any || {});

          case 'analyzePatientHistory':
            console.log(`📈 Routing to MedicalTools.handleAnalyzePatientHistory`);
            return await this.medicalTools.handleAnalyzePatientHistory(args as any || {});

          case 'getMedicalInsights':
            console.log(`💡 Routing to MedicalTools.handleMedicalInsights`);
            return await this.medicalTools.handleMedicalInsights(args as any || {});

          // Local embedding tools
          case 'generateEmbeddingLocal':
            console.log(`🧠 Routing to LocalEmbeddingTools.handleGenerateEmbedding`);
            return await this.localEmbeddingTools.handleGenerateEmbedding(args as any || {});

          case 'chunkAndEmbedDocument':
            console.log(`📄 Routing to LocalEmbeddingTools.handleChunkAndEmbed`);
            return await this.localEmbeddingTools.handleChunkAndEmbed(args as any || {});

          case 'semanticSearchLocal':
            console.log(`🔍 Routing to LocalEmbeddingTools.handleSemanticSearch`);
            return await this.localEmbeddingTools.handleSemanticSearch(args as any || {});

          // Legacy tool names for backward compatibility
          case 'upload_document':
            console.log(`📤 Routing to uploadDocument (legacy)`);
            return await this.documentTools.handleUploadDocument(args as any || {});

          case 'extract_text':
            console.log(`📝 Routing to handleExtractText (legacy)`);
            return await this.handleExtractText(args || {});

          case 'extract_medical_entities':
            console.log(`🏷️ Routing to extractMedicalEntities (legacy)`);
            return await this.medicalTools.handleExtractMedicalEntities(args as any || {});

          case 'search_by_diagnosis':
            console.log(`🔍 Routing to handleSearchByDiagnosis (legacy)`);
            return await this.handleSearchByDiagnosis(args || {});

          case 'semantic_search':
            console.log(`🔍 Routing to handleSemanticSearch (legacy)`);
            return await this.handleSemanticSearch(args || {});

          case 'get_patient_summary':
            console.log(`📊 Routing to handleGetPatientSummary (legacy)`);
            return await this.handleGetPatientSummary(args || {});

          default:
            console.log(`❌ UNKNOWN TOOL: "${name}"`);
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Error handling tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                tool: name,
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  // Handle tool calls for HTTP mode
// Replace the handleToolCall method in your src/server.ts

private async handleToolCall(name: string, args: any): Promise<any> {
    try {
      // ADD DEBUG LOGGING FOR HTTP MODE
      console.log(`🔧 HTTP TOOL CALLED: "${name}" with args:`, JSON.stringify(args, null, 2));
      
      switch (name) {
        // Document tools
        case 'uploadDocument':
          console.log(`📤 HTTP Routing to DocumentTools.handleUploadDocument`);
          return await this.documentTools.handleUploadDocument(args as any || {});
        case 'searchDocuments':
          console.log(`🔍 HTTP Routing to DocumentTools.handleSearchDocuments`);
          return await this.documentTools.handleSearchDocuments(args as any || {});
        case 'listDocuments':
          console.log(`📋 HTTP Routing to DocumentTools.handleListDocuments`);
          return await this.documentTools.handleListDocuments(args as any || {});
  
        // Medical tools
        case 'extractMedicalEntities':
          console.log(`🏷️ HTTP Routing to MedicalTools.handleExtractMedicalEntities`);
          return await this.medicalTools.handleExtractMedicalEntities(args as any || {});
        case 'findSimilarCases':
          console.log(`🔗 HTTP Routing to MedicalTools.handleFindSimilarCases`);
          return await this.medicalTools.handleFindSimilarCases(args as any || {});
        case 'analyzePatientHistory':
          console.log(`📈 HTTP Routing to MedicalTools.handleAnalyzePatientHistory`);
          return await this.medicalTools.handleAnalyzePatientHistory(args as any || {});
        case 'getMedicalInsights':
          console.log(`💡 HTTP Routing to MedicalTools.handleMedicalInsights`);
          return await this.medicalTools.handleMedicalInsights(args as any || {});
  
        // Local embedding tools (these were incorrectly labeled as Google)
        case 'generateEmbeddingLocal':
          console.log(`🧠 HTTP Routing to LocalEmbeddingTools.handleGenerateEmbedding`);
          return await this.localEmbeddingTools.handleGenerateEmbedding(args as any || {});
        case 'chunkAndEmbedDocument':
          console.log(`📄 HTTP Routing to LocalEmbeddingTools.handleChunkAndEmbed`);
          return await this.localEmbeddingTools.handleChunkAndEmbed(args as any || {});
        case 'semanticSearchLocal':
          console.log(`🔍 HTTP Routing to LocalEmbeddingTools.handleSemanticSearch`);
          return await this.localEmbeddingTools.handleSemanticSearch(args as any || {});
  
        // Legacy compatibility
        case 'generateEmbeddingGoogle':
          console.log(`🧠 HTTP Routing to LocalEmbeddingTools.handleGenerateEmbedding (legacy)`);
          return await this.localEmbeddingTools.handleGenerateEmbedding(args as any || {});
        case 'semanticSearchGoogle':
          console.log(`🔍 HTTP Routing to LocalEmbeddingTools.handleSemanticSearch (legacy)`);
          return await this.localEmbeddingTools.handleSemanticSearch(args as any || {});
        case 'hybridSearch':
          console.log(`🔄 HTTP Routing to LocalEmbeddingTools.handleHybridSearch (legacy)`);
          return await this.localEmbeddingTools.handleSemanticSearch(args as any || {}); // Note: using semantic search as fallback
  
        default:
          console.log(`❌ HTTP UNKNOWN TOOL: "${name}"`);
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`❌ HTTP Tool call failed for ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              tool: name
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  // Legacy compatibility handlers
  private async handleExtractText(args: any): Promise<any> {
    if (args.documentId) {
      const doc = await this.mongoClient.findDocumentById(args.documentId);
      if (doc) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                documentId: args.documentId,
                extractedText: doc.content,
                length: doc.content.length
              }, null, 2)
            }
          ]
        };
      }
    }
    throw new Error('Document not found');
  }

  private async handleSearchByDiagnosis(args: any): Promise<any> {
    return await this.documentTools.handleSearchDocuments({
      query: args.diagnosisQuery || args.patientIdentifier,
      filter: {
        patientId: args.patientIdentifier,
        documentType: 'clinical_note'
      },
      limit: 10
    });
  }

  private async handleSemanticSearch(args: any): Promise<any> {
    return await this.localEmbeddingTools.handleSemanticSearch({
      query: args.query,
      filter: args.patientId ? { patientId: args.patientId } : undefined,
      topK: args.limit || 5
    });
  }

  private async handleGetPatientSummary(args: any): Promise<any> {
    return await this.medicalTools.handleAnalyzePatientHistory({
      patientId: args.patientIdentifier,
      analysisType: 'summary'
    });
  }

  async start(): Promise<void> {
    try {
      if (isHttpMode) {
        logger.log('🏥 Medical MCP Server v1.0.0 (HTTP Mode with Google Gemini Embeddings)');
        logger.log('==========================================');
      } else if (isStdioMode) {
        logger.error('Starting Medical MCP Server in stdio mode...');
      } else {
        logger.log('🏥 Medical MCP Server v1.0.0 (Google Gemini Embeddings)');
        logger.log('=====================================');
        logger.log('Starting Medical MCP Server...');
      }
      
      // Connect to MongoDB
      await this.mongoClient.connect();
      if (isStdioMode) {
        logger.error('MongoDB connected successfully');
      } else {
        logger.log('✓ MongoDB connection established');
      }

      // Initialize Google embedding service
      await this.localEmbeddingService.initialize();
      if (isStdioMode) {
        logger.error('Google Embedding service initialized successfully');
      } else {
        logger.log('✓ Google Embedding service initialized (Gemini)');
      }

      // Initialize OCR service
      await this.ocrService.initialize();
      if (isStdioMode) {
        logger.error('OCR service initialized successfully');
      } else {
        logger.log('✓ OCR service initialized');
      }

      // Start the MCP server
      if (isHttpMode) {
        // HTTP mode setup
        const express = await import('express');
        const cors = await import('cors');
        
        const app = express.default();
        app.use(cors.default());
        app.use(express.default.json());

        // Health check endpoint
        app.get('/health', (req, res) => {
          res.json({
            status: 'healthy',
            server: 'medical-mcp-server',
            version: '1.0.0',
            embeddingService: 'Google Gemini',
            timestamp: new Date().toISOString()
          });
        });

        // MCP endpoint
        app.post('/mcp', async (req, res) => {
          try {
            // Handle MCP requests via HTTP
            console.log(`📨 HTTP REQUEST: ${req.body.method} - ${JSON.stringify(req.body, null, 2)}`);
            const request = req.body;
            
            // Set appropriate headers for Streamable HTTP
            res.setHeader('Content-Type', 'application/json');
            
            // Generate session ID if not present
            let sessionId = req.headers['mcp-session-id'] as string;
            if (!sessionId && request.method === 'initialize') {
              sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              res.setHeader('mcp-session-id', sessionId);
              logger.log('📋 New session initialized:', sessionId);
            }

            // Process the MCP request
            if (request.method === 'initialize') {
              res.json({
                jsonrpc: '2.0',
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: {
                    tools: {}
                  },
                  serverInfo: {
                    name: 'medical-mcp-server',
                    version: '1.0.0'
                  }
                },
                id: request.id
              });
            } else if (request.method === 'tools/list') {
              const listResult = await this.server.setRequestHandler(ListToolsRequestSchema, async () => {
                const documentTools = this.documentTools.getAllTools();
                const medicalTools = this.medicalTools.getAllTools();
                const googleEmbeddingTools = this.localEmbeddingTools.getAllTools();
                
                return {
                  tools: [
                    ...documentTools,
                    ...medicalTools,
                    ...googleEmbeddingTools
                  ],
                };
              });
              
              res.json({
                jsonrpc: '2.0',
                result: {
                  tools: [
                    ...this.documentTools.getAllTools(),
                    ...this.medicalTools.getAllTools(),
                    ...this.localEmbeddingTools.getAllTools()
                  ]
                },
                id: request.id
              });
            } else if (request.method === 'tools/call') {
              // Handle tool calls manually
              const toolResult = await this.handleToolCall(request.params.name, request.params.arguments);
              
              res.json({
                jsonrpc: '2.0',
                result: toolResult,
                id: request.id
              });
            } else {
              res.status(400).json({
                jsonrpc: '2.0',
                error: {
                  code: -32601,
                  message: 'Method not found'
                },
                id: request.id
              });
            }
          } catch (error) {
            logger.error('HTTP request error:', error);
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal error'
              },
              id: req.body?.id || null
            });
          }
        });

        const port = process.env.MCP_HTTP_PORT || 3001;
        app.listen(port, () => {
          logger.log(`🚀 HTTP Server is ready to accept connections`);
          logger.log(`📊 Server Information:`);
          logger.log(`======================`);
          logger.log(`✓ HTTP Server listening on port ${port}`);
          logger.log(`🌐 Health check: http://localhost:${port}/health`);
          logger.log(`🔗 MCP endpoint: http://localhost:${port}/mcp`);
          
          this.logServerInfo();
        });
      } else {
        // Stdio mode
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        
        if (isStdioMode) {
          logger.error('Medical MCP Server running on stdio transport');
          logger.error('Ready to accept commands');
        } else {
          logger.log('✓ Medical MCP Server started successfully');
          this.logServerInfo();
        }
      }
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async logServerInfo(): Promise<void> {
    try {
      const stats = await this.getStatistics();
      logger.log(`📄 Documents in database: ${stats.documentsCount}`);
      logger.log(`🔧 Tools available: ${stats.toolsAvailable}`);
      logger.log(`🤖 Embedding model: ${stats.embeddingModel} (Google Gemini)`);
      logger.log(`⏱️  Server uptime: ${Math.round(stats.uptime)}s`);
      
      logger.log('\n📝 Available tools:');
      logger.log('   📤 uploadDocument - Upload and process medical documents');
      logger.log('   🔍 searchDocuments - Search documents with semantic similarity');
      logger.log('   📋 listDocuments - List documents with filtering');
      logger.log('   🏷️  extractMedicalEntities - Extract medical entities from text');
      logger.log('   🔗 findSimilarCases - Find similar medical cases');
      logger.log('   📈 analyzePatientHistory - Analyze patient medical history');
      logger.log('   💡 getMedicalInsights - Get medical insights and recommendations');
      logger.log('   🧠 generateEmbeddingGoogle - Generate embeddings with Google Gemini');
      logger.log('   📄 chunkAndEmbedDocument - Chunk and embed large documents');
      logger.log('   🔍 semanticSearchGoogle - Search using Google embeddings');
      logger.log('   🔄 hybridSearch - Combined vector and text search');
      
      logger.log('\n💬 The server is now listening for MCP client connections...');
    } catch (error) {
      logger.log('📊 Statistics unavailable during startup');
    }
  }

  async stop(): Promise<void> {
    try {
      logger.error('Stopping Medical MCP Server...');
      await this.cleanup();
      logger.error('✓ Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      // Cleanup services
      await this.mongoClient.disconnect();
      await this.ocrService.terminate();
      await this.localEmbeddingService.shutdown();
      
      logger.error('✓ All services cleaned up');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  // Health check method
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    services: Record<string, boolean>;
    timestamp: string;
  }> {
    const services: Record<string, boolean> = {};
    let allHealthy = true;

    try {
      // Check MongoDB connection
      await this.mongoClient.countDocuments();
      services.mongodb = true;
    } catch {
      services.mongodb = false;
      allHealthy = false;
    }

    services.googleEmbedding = this.localEmbeddingService.isReady();
    if (!services.googleEmbedding) allHealthy = false;

    services.ner = true; // NER service is always available
    services.ocr = this.ocrService ? true : false;
    services.pdf = true; // PDF service is always available

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      services,
      timestamp: new Date().toISOString()
    };
  }

  // Get server statistics
  async getStatistics(): Promise<{
    documentsCount: number;
    toolsAvailable: number;
    embeddingModel: string;
    uptime: number;
  }> {
    try {
      const documentsCount = await this.mongoClient.countDocuments();
      const documentTools = this.documentTools.getAllTools();
      const medicalTools = this.medicalTools.getAllTools();
      const googleEmbeddingTools = this.localEmbeddingTools.getAllTools();
      const embeddingModel = this.localEmbeddingService.getModelInfo();

      return {
        documentsCount,
        toolsAvailable: documentTools.length + medicalTools.length + googleEmbeddingTools.length,
        embeddingModel: embeddingModel.model,
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Failed to get statistics:', error);
      throw error;
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});