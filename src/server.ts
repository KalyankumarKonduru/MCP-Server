// Medical MCP Repository
// File: src/server.ts
// Updated to use Official MCP SDK StreamableHTTP for HTTP mode

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';

import { MongoDBClient } from './db/mongodb-client.js';
import { LocalEmbeddingService } from './services/local-embedding-service.js';
import { MedicalNERService } from './services/medical-ner-service.js';
import { OCRService } from './services/ocr-service.js';
import { PDFService } from './services/pdf-service.js';
import { DocumentTools } from './tools/document-tools.js';
import { MedicalTools } from './tools/medical-tools.js';
import { LocalEmbeddingTools } from './tools/local-embedding-tools.js';

// Loading environment variables
dotenv.config();

const isStdioMode = process.argv.includes('--stdio') || 
                   process.stdin.isTTY === false ||
                   process.env.MCP_STDIO_MODE === 'true';

const isHttpMode = process.env.MCP_HTTP_MODE === 'true';

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
  private app?: express.Application;
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

    // Initialize services
    this.mongoClient = new MongoDBClient(mongoConnectionString, dbName);
    this.localEmbeddingService = new LocalEmbeddingService();
    this.nerService = new MedicalNERService();
    this.ocrService = new OCRService();
    this.pdfService = new PDFService();

    // Initialize existing tools
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

    // Initialize MCP server with official SDK
    this.server = new Server(
      {
        name: 'medical-mcp-server-enhanced',
        version: '2.0.0',
        description: 'Medical MCP Server with document processing, enhanced NER, and vector search capabilities (Official SDK)'
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
    // List available tools using official MCP SDK
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const documentToolsList = this.documentTools.getAllTools();
      const medicalToolsList = this.medicalTools.getAllTools();
      const localEmbeddingToolsList = this.localEmbeddingTools.getAllTools();
      
      return {
        tools: [
          ...documentToolsList,
          ...medicalToolsList,
          ...localEmbeddingToolsList,
        ],
      };
    });

    // Handle initialized notification using official MCP SDK
    this.server.setNotificationHandler(InitializedNotificationSchema, async () => {
      logger.log('✅ Client initialized notification received');
      // No response needed for notifications
    });

    // Handle tool calls using official MCP SDK
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.log(`🔧 TOOL CALLED: "${name}" with args:`, JSON.stringify(args, null, 2));
        
        // Route to appropriate tool handler
        const toolHandlers: Record<string, () => Promise<any>> = {
          // Document tools
          'uploadDocument': () => this.documentTools.handleUploadDocument(args as any || {}),
          'searchDocuments': () => this.documentTools.handleSearchDocuments(args as any || {}),
          'listDocuments': () => this.documentTools.handleListDocuments(args as any || {}),

          // Medical tools
          'extractMedicalEntities': () => this.medicalTools.handleExtractMedicalEntities(args as any || {}),
          'findSimilarCases': () => this.medicalTools.handleFindSimilarCases(args as any || {}),
          'analyzePatientHistory': () => this.medicalTools.handleAnalyzePatientHistory(args as any || {}),
          'getMedicalInsights': () => this.medicalTools.handleMedicalInsights(args as any || {}),

          // Local embedding tools
          'generateEmbeddingLocal': () => this.localEmbeddingTools.handleGenerateEmbedding(args as any || {}),
          'chunkAndEmbedDocument': () => this.localEmbeddingTools.handleChunkAndEmbed(args as any || {}),
          'semanticSearchLocal': () => this.localEmbeddingTools.handleSemanticSearch(args as any || {}),

          // Legacy compatibility handlers
          'upload_document': () => this.documentTools.handleUploadDocument(args as any || {}),
          'extract_text': () => this.handleExtractText(args || {}),
          'extract_medical_entities': () => this.medicalTools.handleExtractMedicalEntities(args as any || {}),
          'search_by_diagnosis': () => this.handleSearchByDiagnosis(args || {}),
          'semantic_search': () => this.handleSemanticSearch(args || {}),
          'get_patient_summary': () => this.handleGetPatientSummary(args || {}),
        };

        const handler = toolHandlers[name];
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const result = await handler();
        logger.log(`✅ TOOL COMPLETED: "${name}"`);
        
        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ TOOL ERROR: "${name}":`, errorMessage);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: errorMessage,
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
        logger.log('🏥 Medical MCP Server v2.0.0 (Official StreamableHTTP Mode)');
        logger.log('===========================================================');
      } else if (isStdioMode) {
        logger.error('Starting Medical MCP Server (Official STDIO mode)...');
      } else {
        logger.log('🏥 Medical MCP Server v2.0.0 (Official SDK)');
        logger.log('============================================');
      }
      
      // Connect to MongoDB
      await this.mongoClient.connect();
      logger.log('✅ MongoDB connection established');

      // Initialize Local embedding service
      await this.localEmbeddingService.initialize();
      logger.log('✅ Local Embedding service initialized');

      // Initialize OCR service
      await this.ocrService.initialize();
      logger.log('✅ OCR service initialized');

      // Start the appropriate transport
      if (isHttpMode) {
        await this.startStreamableHTTPServer();
      } else {
        await this.startStdioServer();
      }
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async startStreamableHTTPServer(): Promise<void> {
    // Create Express app for health checks and static endpoints
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        server: 'medical-mcp-server-enhanced',
        version: '2.0.0',
        transport: 'Official MCP StreamableHTTP',
        features: ['document-processing', 'medical-ner', 'vector-search', 'local-embeddings'],
        timestamp: new Date().toISOString()
      });
    });

    // Official MCP StreamableHTTP endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        // Create StreamableHTTP transport for this request
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID()
        });

        // Connect server to transport for this request
        await this.server.connect(transport);
        
        // Handle the MCP request using official SDK
        await transport.handleRequest(req, res, req.body);
        
      } catch (error) {
        logger.error('StreamableHTTP request error:', error);
        
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: req.body?.id || null
          });
        }
      }
    });

    // Start HTTP server
    const port = parseInt(process.env.MCP_HTTP_PORT || '3001', 10);
    
    this.app.listen(port, '0.0.0.0', () => {
      logger.log('🚀 Medical MCP Server (Official StreamableHTTP) ready');
      logger.log('📊 Server Information:');
      logger.log('======================');
      logger.log(`✅ StreamableHTTP Server listening on port ${port} (all interfaces)`);
      logger.log(`🌐 Health check: http://localhost:${port}/health`);
      logger.log(`🔗 MCP endpoint: http://localhost:${port}/mcp`);
      logger.log(`📡 Transport: Official MCP SDK StreamableHTTP`);
      logger.log(`🔧 Protocol: MCP 2024-11-05 compliant`);
      
      this.logServerInfo();
    });
  }

  private async startStdioServer(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    if (isStdioMode) {
      logger.error('Medical MCP Server running on official STDIO transport');
      logger.error('Ready to accept commands');
    } else {
      logger.log('✅ Medical MCP Server started with official STDIO transport');
      this.logServerInfo();
    }
  }

  private async logServerInfo(): Promise<void> {
    try {
      const stats = await this.getStatistics();
      logger.log(`📄 Documents in database: ${stats.documentsCount}`);
      logger.log(`🔧 Tools available: ${stats.toolsAvailable}`);
      logger.log(`🤖 Embedding model: ${stats.embeddingModel}`);
      logger.log(`⏱️  Server uptime: ${Math.round(stats.uptime)}s`);
      
      logger.log('\n📝 Available tools:');
      logger.log('   📤 uploadDocument - Upload and process medical documents');
      logger.log('   🔍 searchDocuments - Search documents with semantic similarity');
      logger.log('   📋 listDocuments - List documents with filtering');
      logger.log('   🏷️  extractMedicalEntities - Extract medical entities from text');
      logger.log('   🔗 findSimilarCases - Find similar medical cases');
      logger.log('   📈 analyzePatientHistory - Analyze patient medical history');
      logger.log('   💡 getMedicalInsights - Get medical insights and recommendations');
      logger.log('   🧠 generateEmbeddingLocal - Generate embeddings locally');
      logger.log('   📄 chunkAndEmbedDocument - Chunk and embed large documents');
      logger.log('   🔍 semanticSearchLocal - Search using local embeddings');
      
      logger.log('\n💬 The server is now ready for official MCP client connections...');
    } catch (error) {
      logger.log('📊 Statistics unavailable during startup');
    }
  }

  async stop(): Promise<void> {
    try {
      logger.log('🛑 Shutting down Medical MCP Server...');
      await this.cleanup();
      logger.log('✅ Medical MCP Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.mongoClient) {
        await this.mongoClient.disconnect();
      }
      if (this.ocrService) {
        await this.ocrService.terminate();
      }
      if (this.localEmbeddingService) {
        await this.localEmbeddingService.shutdown();
      }
      
      logger.log('✅ All services cleaned up');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    services: Record<string, boolean>;
    timestamp: string;
  }> {
    const services: Record<string, boolean> = {};
    let allHealthy = true;

    try {
      await this.mongoClient.countDocuments();
      services.mongodb = true;
    } catch {
      services.mongodb = false;
      allHealthy = false;
    }

    services.localEmbedding = this.localEmbeddingService.isReady();
    if (!services.localEmbedding) allHealthy = false;

    services.ner = true;
    services.ocr = this.ocrService ? true : false;
    services.pdf = true;

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      services,
      timestamp: new Date().toISOString()
    };
  }

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
      const localEmbeddingTools = this.localEmbeddingTools.getAllTools();
      const embeddingModel = this.localEmbeddingService.getModelInfo();

      return {
        documentsCount,
        toolsAvailable: documentTools.length + medicalTools.length + localEmbeddingTools.length,
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