// Medical MCP Repository
// File: src/server.ts
// Updated to use Official MCP SDK StreamableHTTP for HTTP mode with proper session management

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

interface MCPSession {
  transport: StreamableHTTPServerTransport;
  initialized: boolean;
  lastAccess: number;
}

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

  // Session management for HTTP mode
  private sessions: Map<string, MCPSession> = new Map();

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
    
    // Enhanced CORS configuration for MCP
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'mcp-session-id', 'Accept', 'Authorization'],
      exposedHeaders: ['mcp-session-id'], // Critical: Allow client to read session ID
      credentials: false
    }));
    
    this.app.use(express.json({ limit: '50mb' }));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        server: 'medical-mcp-server-enhanced',
        version: '2.0.0',
        transport: 'Official MCP StreamableHTTP',
        features: ['document-processing', 'medical-ner', 'vector-search', 'local-embeddings'],
        sessions: this.sessions.size,
        timestamp: new Date().toISOString()
      });
    });

    // Official MCP StreamableHTTP endpoint with proper session management
    this.app.post('/mcp', async (req, res) => {
      try {
        let sessionId = req.headers['mcp-session-id'] as string;
        let session = sessionId ? this.sessions.get(sessionId) : undefined;

        // If no session exists or session is invalid, create a new one
        if (!session) {
          sessionId = crypto.randomUUID();
          
          logger.log(`📝 Creating new MCP session: ${sessionId}`);
          
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId
          });

          // Connect server to transport once per session
          await this.server.connect(transport);
          
          session = {
            transport,
            initialized: false,
            lastAccess: Date.now()
          };
          
          this.sessions.set(sessionId, session);
          logger.log(`✅ New session created and connected: ${sessionId}`);
        }

        // Update last access time
        session.lastAccess = Date.now();

        // Set session ID in response header (critical for client)
        res.setHeader('mcp-session-id', sessionId);

        // Check if this is an initialization notification
        if (req.body?.method === 'notifications/initialized') {
          session.initialized = true;
          logger.log(`🔄 Session ${sessionId} marked as initialized`);
        }

        // Log request details for debugging
        logger.log(`📨 Processing ${req.body?.method || 'unknown'} request for session ${sessionId}`);

        // Handle the MCP request using the session's transport
        await session.transport.handleRequest(req, res, req.body);
        
        logger.log(`✅ Request processed successfully for session ${sessionId}`);
        
      } catch (error) {
        logger.error('StreamableHTTP request error:', error);
        
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
              data: error instanceof Error ? error.message : 'Unknown error'
            },
            id: req.body?.id || null
          });
        }
      }
    });

    // Session cleanup endpoint (optional - for client cleanup)
    this.app.delete('/mcp', (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      if (sessionId && this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId);
        logger.log(`🗑️  Session cleaned up: ${sessionId}`);
        res.status(204).send();
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    // Session status endpoint (for debugging)
    this.app.get('/sessions', (req, res) => {
      const sessionInfo = Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        initialized: session.initialized,
        lastAccess: new Date(session.lastAccess).toISOString(),
        age: Date.now() - session.lastAccess
      }));
      
      res.json({
        totalSessions: this.sessions.size,
        sessions: sessionInfo
      });
    });

    // Start HTTP server
    const port = parseInt(process.env.MCP_HTTP_PORT || '3005', 10);
    
    this.app.listen(port, '0.0.0.0', () => {
      logger.log('🚀 Medical MCP Server (Official StreamableHTTP) ready');
      logger.log('📊 Server Information:');
      logger.log('======================');
      logger.log(`✅ StreamableHTTP Server listening on port ${port} (all interfaces)`);
      logger.log(`🌐 Health check: http://localhost:${port}/health`);
      logger.log(`🔗 MCP endpoint: http://localhost:${port}/mcp`);
      logger.log(`📊 Sessions endpoint: http://localhost:${port}/sessions`);
      logger.log(`📡 Transport: Official MCP SDK StreamableHTTP with session management`);
      logger.log(`🔧 Protocol: MCP 2024-11-05 compliant`);
      logger.log(`🔄 Session management: Enabled`);
      
      this.logServerInfo();
    });

    // Clean up expired sessions periodically (prevent memory leaks)
    const sessionCleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000); // Check every 5 minutes

    // Store interval reference for cleanup
    (this as any).sessionCleanupInterval = sessionCleanupInterval;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const sessionTimeout = 3600000; // 1 hour in milliseconds
    let cleanedUp = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccess > sessionTimeout) {
        this.sessions.delete(sessionId);
        cleanedUp++;
        logger.log(`🗑️  Expired session cleaned up: ${sessionId}`);
      }
    }

    if (cleanedUp > 0) {
      logger.log(`🧹 Cleaned up ${cleanedUp} expired sessions. Active sessions: ${this.sessions.size}`);
    }
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
      
      if (isHttpMode) {
        logger.log('\n🔧 Session Management Details:');
        logger.log('   • Each client gets a unique session ID');
        logger.log('   • Sessions persist across requests');
        logger.log('   • Automatic cleanup of expired sessions');
        logger.log('   • Session timeout: 1 hour of inactivity');
      }
      
    } catch (error) {
      logger.log('📊 Statistics unavailable during startup');
    }
  }

  async stop(): Promise<void> {
    try {
      logger.log('🛑 Shutting down Medical MCP Server...');
      
      // Stop session cleanup interval
      if ((this as any).sessionCleanupInterval) {
        clearInterval((this as any).sessionCleanupInterval);
      }
      
      await this.cleanup();
      logger.log('✅ Medical MCP Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      // Clear all sessions
      logger.log(`🧹 Cleaning up ${this.sessions.size} active sessions...`);
      this.sessions.clear();
      
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
    sessions: number;
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
      sessions: this.sessions.size,
      timestamp: new Date().toISOString()
    };
  }

  async getStatistics(): Promise<{
    documentsCount: number;
    toolsAvailable: number;
    embeddingModel: string;
    uptime: number;
    sessions: number;
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
        uptime: process.uptime(),
        sessions: this.sessions.size
      };
    } catch (error) {
      logger.error('Failed to get statistics:', error);
      throw error;
    }
  }

  // Public method to get session info (for debugging)
  getSessionInfo(): Array<{ id: string; initialized: boolean; lastAccess: Date; age: number }> {
    return Array.from(this.sessions.entries()).map(([id, session]) => ({
      id,
      initialized: session.initialized,
      lastAccess: new Date(session.lastAccess),
      age: Date.now() - session.lastAccess
    }));
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