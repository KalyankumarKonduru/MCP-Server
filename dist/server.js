"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MedicalMCPServer = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const dotenv_1 = __importDefault(require("dotenv"));
const mongodb_client_js_1 = require("./db/mongodb-client.js");
const local_embedding_service_js_1 = require("./services/local-embedding-service.js");
const medical_ner_service_js_1 = require("./services/medical-ner-service.js");
const ocr_service_js_1 = require("./services/ocr-service.js");
const pdf_service_js_1 = require("./services/pdf-service.js");
const document_tools_js_1 = require("./tools/document-tools.js");
const medical_tools_js_1 = require("./tools/medical-tools.js");
const local_embedding_tools_js_1 = require("./tools/local-embedding-tools.js");
// Load environment variables
dotenv_1.default.config();
// Detect if running in stdio mode
const isStdioMode = process.argv.includes('--stdio') ||
    process.stdin.isTTY === false ||
    process.env.MCP_STDIO_MODE === 'true';
// Detect if running in HTTP mode
const isHttpMode = process.env.MCP_HTTP_MODE === 'true';
// Custom logger that respects stdio mode
const logger = {
    log: (...args) => {
        if (!isStdioMode) {
            console.log(...args);
        }
        else {
            // In stdio mode, log to stderr to avoid interfering with JSON-RPC
            console.error(...args);
        }
    },
    error: (...args) => {
        console.error(...args);
    }
};
class MedicalMCPServer {
    server;
    mongoClient;
    localEmbeddingService;
    nerService;
    ocrService;
    pdfService;
    documentTools;
    medicalTools;
    localEmbeddingTools;
    constructor() {
        // Validate required environment variables
        const mongoConnectionString = process.env.MONGODB_CONNECTION_STRING;
        const dbName = process.env.MONGODB_DATABASE_NAME || 'medical_documents';
        if (!mongoConnectionString) {
            throw new Error('MONGODB_CONNECTION_STRING environment variable is required');
        }
        // Initialize services
        this.mongoClient = new mongodb_client_js_1.MongoDBClient(mongoConnectionString, dbName);
        this.localEmbeddingService = new local_embedding_service_js_1.LocalEmbeddingService(); // Using local HuggingFace model
        this.nerService = new medical_ner_service_js_1.MedicalNERService();
        this.ocrService = new ocr_service_js_1.OCRService();
        this.pdfService = new pdf_service_js_1.PDFService();
        // Initialize tools
        this.documentTools = new document_tools_js_1.DocumentTools(this.mongoClient, this.localEmbeddingService, // Using local embedding service instead of OpenAI
        this.nerService, this.ocrService, this.pdfService);
        this.medicalTools = new medical_tools_js_1.MedicalTools(this.mongoClient, this.nerService, this.localEmbeddingService // Using local embedding service
        );
        // Initialize local embedding tools
        this.localEmbeddingTools = new local_embedding_tools_js_1.LocalEmbeddingTools(this.mongoClient);
        // Initialize MCP server
        this.server = new index_js_1.Server({
            name: 'medical-mcp-server',
            version: '1.0.0',
            description: 'Medical MCP Server with local embeddings, document processing, NER, and vector search capabilities'
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
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
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                if (isStdioMode) {
                    logger.error(`Handling tool call: ${name}`);
                }
                switch (name) {
                    // Document tools
                    case 'uploadDocument':
                        return await this.documentTools.handleUploadDocument(args || {});
                    case 'searchDocuments':
                        return await this.documentTools.handleSearchDocuments(args || {});
                    case 'listDocuments':
                        return await this.documentTools.handleListDocuments(args || {});
                    // Medical tools
                    case 'extractMedicalEntities':
                        return await this.medicalTools.handleExtractMedicalEntities(args || {});
                    case 'findSimilarCases':
                        return await this.medicalTools.handleFindSimilarCases(args || {});
                    case 'analyzePatientHistory':
                        return await this.medicalTools.handleAnalyzePatientHistory(args || {});
                    case 'getMedicalInsights':
                        return await this.medicalTools.handleMedicalInsights(args || {});
                    // Local embedding tools
                    case 'generateEmbeddingLocal':
                        return await this.localEmbeddingTools.handleGenerateEmbedding(args || {});
                    case 'chunkAndEmbedDocument':
                        return await this.localEmbeddingTools.handleChunkAndEmbed(args || {});
                    case 'semanticSearchLocal':
                        return await this.localEmbeddingTools.handleSemanticSearch(args || {});
                    // Legacy tool names for backward compatibility
                    case 'upload_document':
                        return await this.documentTools.handleUploadDocument(args || {});
                    case 'extract_text':
                        return await this.handleExtractText(args || {});
                    case 'extract_medical_entities':
                        return await this.medicalTools.handleExtractMedicalEntities(args || {});
                    case 'search_by_diagnosis':
                        return await this.handleSearchByDiagnosis(args || {});
                    case 'semantic_search':
                        return await this.handleSemanticSearch(args || {});
                    case 'get_patient_summary':
                        return await this.handleGetPatientSummary(args || {});
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
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
    async handleToolCall(name, args) {
        try {
            switch (name) {
                // Document tools
                case 'uploadDocument':
                    return await this.documentTools.handleUploadDocument(args || {});
                case 'searchDocuments':
                    return await this.documentTools.handleSearchDocuments(args || {});
                case 'listDocuments':
                    return await this.documentTools.handleListDocuments(args || {});
                // Medical tools
                case 'extractMedicalEntities':
                    return await this.medicalTools.handleExtractMedicalEntities(args || {});
                case 'findSimilarCases':
                    return await this.medicalTools.handleFindSimilarCases(args || {});
                case 'analyzePatientHistory':
                    return await this.medicalTools.handleAnalyzePatientHistory(args || {});
                case 'getMedicalInsights':
                    return await this.medicalTools.handleMedicalInsights(args || {});
                // Local embedding tools
                case 'generateEmbeddingLocal':
                    return await this.localEmbeddingTools.handleGenerateEmbedding(args || {});
                case 'chunkAndEmbedDocument':
                    return await this.localEmbeddingTools.handleChunkAndEmbed(args || {});
                case 'semanticSearchLocal':
                    return await this.localEmbeddingTools.handleSemanticSearch(args || {});
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        }
        catch (error) {
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
    async handleExtractText(args) {
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
    async handleSearchByDiagnosis(args) {
        return await this.documentTools.handleSearchDocuments({
            query: args.diagnosisQuery || args.patientIdentifier,
            filter: {
                patientId: args.patientIdentifier,
                documentType: 'clinical_note'
            },
            limit: 10
        });
    }
    async handleSemanticSearch(args) {
        return await this.localEmbeddingTools.handleSemanticSearch({
            query: args.query,
            filter: args.patientId ? { patientId: args.patientId } : undefined,
            topK: args.limit || 5
        });
    }
    async handleGetPatientSummary(args) {
        return await this.medicalTools.handleAnalyzePatientHistory({
            patientId: args.patientIdentifier,
            analysisType: 'summary'
        });
    }
    async start() {
        try {
            if (isHttpMode) {
                logger.log('🏥 Medical MCP Server v1.0.0 (HTTP Mode)');
                logger.log('==========================================');
            }
            else if (isStdioMode) {
                logger.error('Starting Medical MCP Server in stdio mode...');
            }
            else {
                logger.log('🏥 Medical MCP Server v1.0.0');
                logger.log('=====================================');
                logger.log('Starting Medical MCP Server...');
            }
            // Connect to MongoDB
            await this.mongoClient.connect();
            if (isStdioMode) {
                logger.error('MongoDB connected successfully');
            }
            else {
                logger.log('✓ MongoDB connection established');
            }
            // Initialize local embedding service
            await this.localEmbeddingService.initialize();
            if (isStdioMode) {
                logger.error('Local embedding service initialized successfully');
            }
            else {
                logger.log('✓ Local embedding service initialized (HuggingFace Transformers)');
            }
            // Initialize OCR service
            await this.ocrService.initialize();
            if (isStdioMode) {
                logger.error('OCR service initialized successfully');
            }
            else {
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
                        timestamp: new Date().toISOString()
                    });
                });
                // MCP endpoint
                app.post('/mcp', async (req, res) => {
                    try {
                        // Handle MCP requests via HTTP
                        const request = req.body;
                        // Set appropriate headers for Streamable HTTP
                        res.setHeader('Content-Type', 'application/json');
                        // Generate session ID if not present
                        let sessionId = req.headers['mcp-session-id'];
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
                        }
                        else if (request.method === 'tools/list') {
                            const listResult = await this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
                                const documentTools = this.documentTools.getAllTools();
                                const medicalTools = this.medicalTools.getAllTools();
                                const localEmbeddingTools = this.localEmbeddingTools.getAllTools();
                                return {
                                    tools: [
                                        ...documentTools,
                                        ...medicalTools,
                                        ...localEmbeddingTools
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
                        }
                        else if (request.method === 'tools/call') {
                            // Handle tool calls manually
                            const toolResult = await this.handleToolCall(request.params.name, request.params.arguments);
                            res.json({
                                jsonrpc: '2.0',
                                result: toolResult,
                                id: request.id
                            });
                        }
                        else {
                            res.status(400).json({
                                jsonrpc: '2.0',
                                error: {
                                    code: -32601,
                                    message: 'Method not found'
                                },
                                id: request.id
                            });
                        }
                    }
                    catch (error) {
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
            }
            else {
                // Stdio mode
                const transport = new stdio_js_1.StdioServerTransport();
                await this.server.connect(transport);
                if (isStdioMode) {
                    logger.error('Medical MCP Server running on stdio transport');
                    logger.error('Ready to accept commands');
                }
                else {
                    logger.log('✓ Medical MCP Server started successfully');
                    this.logServerInfo();
                }
            }
        }
        catch (error) {
            logger.error('Failed to start server:', error);
            await this.cleanup();
            process.exit(1);
        }
    }
    async logServerInfo() {
        try {
            const stats = await this.getStatistics();
            logger.log(`📄 Documents in database: ${stats.documentsCount}`);
            logger.log(`🔧 Tools available: ${stats.toolsAvailable}`);
            logger.log(`🤖 Embedding model: ${stats.embeddingModel} (Local)`);
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
            logger.log('\n💬 The server is now listening for MCP client connections...');
        }
        catch (error) {
            logger.log('📊 Statistics unavailable during startup');
        }
    }
    async stop() {
        try {
            logger.error('Stopping Medical MCP Server...');
            await this.cleanup();
            logger.error('✓ Server stopped gracefully');
        }
        catch (error) {
            logger.error('Error stopping server:', error);
        }
    }
    async cleanup() {
        try {
            // Cleanup services
            await this.mongoClient.disconnect();
            await this.ocrService.terminate();
            await this.localEmbeddingService.shutdown();
            logger.error('✓ All services cleaned up');
        }
        catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }
    // Health check method
    async healthCheck() {
        const services = {};
        let allHealthy = true;
        try {
            // Check MongoDB connection
            await this.mongoClient.countDocuments();
            services.mongodb = true;
        }
        catch {
            services.mongodb = false;
            allHealthy = false;
        }
        services.localEmbedding = this.localEmbeddingService.isReady();
        if (!services.localEmbedding)
            allHealthy = false;
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
    async getStatistics() {
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
        }
        catch (error) {
            logger.error('Failed to get statistics:', error);
            throw error;
        }
    }
}
exports.MedicalMCPServer = MedicalMCPServer;
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
//# sourceMappingURL=server.js.map