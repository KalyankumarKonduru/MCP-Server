"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentTools = void 0;
const path = __importStar(require("path"));
class DocumentTools {
    mongoClient;
    embeddingService;
    nerService;
    ocrService;
    pdfService;
    constructor(mongoClient, embeddingService, nerService, ocrService, pdfService) {
        this.mongoClient = mongoClient;
        this.embeddingService = embeddingService;
        this.nerService = nerService;
        this.ocrService = ocrService;
        this.pdfService = pdfService;
    }
    createUploadDocumentTool() {
        return {
            name: 'uploadDocument',
            description: 'Upload and process a medical document with automatic text extraction, NER, and embedding generation',
            inputSchema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Title of the document'
                    },
                    content: {
                        type: 'string',
                        description: 'Text content of the document (if already extracted)'
                    },
                    filePath: {
                        type: 'string',
                        description: 'Path to the document file (PDF, image, etc.)'
                    },
                    fileBuffer: {
                        type: 'string',
                        description: 'Base64 encoded file content'
                    },
                    metadata: {
                        type: 'object',
                        properties: {
                            fileType: {
                                type: 'string',
                                description: 'Type of file (pdf, jpg, png, etc.)'
                            },
                            size: {
                                type: 'number',
                                description: 'File size in bytes'
                            },
                            tags: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Tags for categorization'
                            },
                            patientId: {
                                type: 'string',
                                description: 'Patient identifier'
                            },
                            documentType: {
                                type: 'string',
                                enum: ['clinical_note', 'lab_report', 'prescription', 'discharge_summary', 'other'],
                                description: 'Type of medical document'
                            }
                        }
                    }
                },
                required: ['title']
            }
        };
    }
    async handleUploadDocument(args) {
        try {
            let extractedText = args.content || '';
            let processingResults = {};
            // Extract text from file if provided
            if (args.filePath || args.fileBuffer) {
                const extractionResult = await this.extractTextFromFile(args.filePath, args.fileBuffer, args.metadata?.fileType);
                extractedText = extractionResult.text;
                processingResults = extractionResult.processingInfo;
            }
            if (!extractedText.trim()) {
                throw new Error('No text content provided or extracted from file');
            }
            // Extract medical entities
            const medicalEntitiesResult = await this.nerService.extractEntities(extractedText);
            const medicalEntities = medicalEntitiesResult.entities;
            // Generate embedding using local service
            const embedding = await this.embeddingService.generateMedicalDocumentEmbedding(args.title, extractedText, medicalEntities.map(e => ({ text: e.text, label: e.label })));
            // Create document object
            const document = {
                title: args.title,
                content: extractedText,
                embedding,
                medicalEntities,
                metadata: {
                    ...args.metadata,
                    uploadedAt: new Date(),
                    processed: true
                }
            };
            // Save to database
            const documentId = await this.mongoClient.insertDocument(document);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            documentId,
                            message: `Medical document "${args.title}" processed and uploaded successfully`,
                            processingResults: {
                                textLength: extractedText.length,
                                entitiesFound: medicalEntities.length,
                                embeddingDimensions: embedding.length,
                                ...processingResults
                            },
                            medicalEntities: medicalEntities.slice(0, 10) // Show first 10 entities
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error occurred',
                            message: 'Failed to upload and process document'
                        }, null, 2)
                    }
                ],
                isError: true
            };
        }
    }
    createSearchDocumentsTool() {
        return {
            name: 'searchDocuments',
            description: 'Search medical documents using semantic similarity and filters',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query text'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (default: 10)',
                        minimum: 1,
                        maximum: 50
                    },
                    threshold: {
                        type: 'number',
                        description: 'Minimum similarity score (default: 0.7)',
                        minimum: 0,
                        maximum: 1
                    },
                    filter: {
                        type: 'object',
                        properties: {
                            documentType: {
                                type: 'string',
                                enum: ['clinical_note', 'lab_report', 'prescription', 'discharge_summary', 'other']
                            },
                            patientId: {
                                type: 'string',
                                description: 'Filter by patient ID'
                            },
                            tags: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Filter by tags'
                            },
                            dateRange: {
                                type: 'object',
                                properties: {
                                    start: { type: 'string', format: 'date' },
                                    end: { type: 'string', format: 'date' }
                                }
                            }
                        }
                    }
                },
                required: ['query']
            }
        };
    }
    async handleSearchDocuments(args) {
        try {
            // Generate query embedding using local service
            const queryEmbedding = await this.embeddingService.generateQueryEmbedding(args.query);
            // Build MongoDB filter
            const mongoFilter = {};
            if (args.filter?.documentType) {
                mongoFilter['metadata.documentType'] = args.filter.documentType;
            }
            if (args.filter?.patientId) {
                mongoFilter['metadata.patientId'] = args.filter.patientId;
            }
            if (args.filter?.tags && args.filter.tags.length > 0) {
                mongoFilter['metadata.tags'] = { $in: args.filter.tags };
            }
            if (args.filter?.dateRange) {
                mongoFilter['metadata.uploadedAt'] = {
                    $gte: new Date(args.filter.dateRange.start),
                    $lte: new Date(args.filter.dateRange.end)
                };
            }
            // Perform vector search
            const searchResults = await this.mongoClient.vectorSearch(queryEmbedding, args.limit || 10, args.threshold || 0.7, mongoFilter);
            // Format results
            const formattedResults = searchResults.map(result => ({
                id: result.document._id,
                title: result.document.title,
                content: result.document.content.substring(0, 500) + (result.document.content.length > 500 ? '...' : ''),
                score: result.score,
                metadata: result.document.metadata,
                relevantEntities: result.relevantEntities?.slice(0, 5) || []
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            query: args.query,
                            resultsCount: searchResults.length,
                            results: formattedResults,
                            searchParameters: {
                                limit: args.limit || 10,
                                threshold: args.threshold || 0.7,
                                filter: args.filter || {}
                            }
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error occurred',
                            message: 'Failed to search documents',
                            query: args.query
                        }, null, 2)
                    }
                ],
                isError: true
            };
        }
    }
    createListDocumentsTool() {
        return {
            name: 'listDocuments',
            description: 'List medical documents with pagination and filtering',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Maximum number of documents (default: 20)',
                        minimum: 1,
                        maximum: 100
                    },
                    offset: {
                        type: 'number',
                        description: 'Number of documents to skip (default: 0)',
                        minimum: 0
                    },
                    filter: {
                        type: 'object',
                        properties: {
                            documentType: {
                                type: 'string',
                                enum: ['clinical_note', 'lab_report', 'prescription', 'discharge_summary', 'other']
                            },
                            patientId: {
                                type: 'string'
                            },
                            tags: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            processed: {
                                type: 'boolean',
                                description: 'Filter by processing status'
                            }
                        }
                    }
                }
            }
        };
    }
    async handleListDocuments(args) {
        try {
            const limit = args.limit || 20;
            const offset = args.offset || 0;
            // Build filter
            const mongoFilter = {};
            if (args.filter?.documentType) {
                mongoFilter['metadata.documentType'] = args.filter.documentType;
            }
            if (args.filter?.patientId) {
                mongoFilter['metadata.patientId'] = args.filter.patientId;
            }
            if (args.filter?.tags && args.filter.tags.length > 0) {
                mongoFilter['metadata.tags'] = { $in: args.filter.tags };
            }
            if (args.filter?.processed !== undefined) {
                mongoFilter['metadata.processed'] = args.filter.processed;
            }
            // Get documents and count
            const [documents, totalCount] = await Promise.all([
                this.mongoClient.findDocuments(mongoFilter, limit, offset),
                this.mongoClient.countDocuments(mongoFilter)
            ]);
            // Format results (exclude embeddings for performance)
            const formattedDocuments = documents.map(doc => ({
                id: doc._id,
                title: doc.title,
                content: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
                metadata: doc.metadata,
                entityCount: doc.medicalEntities?.length || 0,
                hasEmbedding: !!doc.embedding
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            documents: formattedDocuments,
                            pagination: {
                                limit,
                                offset,
                                total: totalCount,
                                hasMore: offset + limit < totalCount,
                                currentPage: Math.floor(offset / limit) + 1,
                                totalPages: Math.ceil(totalCount / limit)
                            },
                            filter: args.filter || {}
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error occurred',
                            message: 'Failed to list documents'
                        }, null, 2)
                    }
                ],
                isError: true
            };
        }
    }
    async extractTextFromFile(filePath, fileBuffer, fileType) {
        try {
            let text = '';
            let processingInfo = {};
            if (fileBuffer) {
                // Handle base64 encoded file
                const buffer = Buffer.from(fileBuffer, 'base64');
                if (fileType?.toLowerCase() === 'pdf') {
                    const pdfResult = await this.pdfService.parsePDFBuffer(buffer);
                    text = pdfResult.text;
                    processingInfo = {
                        method: 'pdf_parse',
                        pageCount: pdfResult.pageCount,
                        metadata: pdfResult.metadata
                    };
                }
                else {
                    // Assume image file
                    const ocrResult = await this.ocrService.processImageBuffer(buffer, fileType || 'unknown');
                    text = ocrResult.text;
                    processingInfo = {
                        method: 'ocr',
                        confidence: ocrResult.confidence
                    };
                }
            }
            else if (filePath) {
                // Handle file path
                const extension = path.extname(filePath).toLowerCase();
                if (extension === '.pdf') {
                    const pdfResult = await this.pdfService.parsePDF(filePath);
                    text = pdfResult.text;
                    processingInfo = {
                        method: 'pdf_parse',
                        pageCount: pdfResult.pageCount,
                        metadata: pdfResult.metadata
                    };
                }
                else if (['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif'].includes(extension)) {
                    const ocrResult = await this.ocrService.processImage(filePath);
                    text = ocrResult.text;
                    processingInfo = {
                        method: 'ocr',
                        confidence: ocrResult.confidence
                    };
                }
                else {
                    throw new Error(`Unsupported file type: ${extension}`);
                }
            }
            return { text, processingInfo };
        }
        catch (error) {
            console.error('Failed to extract text from file:', error);
            throw error;
        }
    }
    getAllTools() {
        return [
            this.createUploadDocumentTool(),
            this.createSearchDocumentsTool(),
            this.createListDocumentsTool()
        ];
    }
}
exports.DocumentTools = DocumentTools;
//# sourceMappingURL=document-tools.js.map