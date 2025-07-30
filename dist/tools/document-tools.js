import { EntityMappingService } from '../services/entity-mapping-service.js';
import * as fs from 'fs';
import * as path from 'path';
/**
 * Document Tools using BioClinical-Server for enhanced medical entity extraction
 * Handles document upload, processing, and search with clinical-grade NER
 */
export class DocumentTools {
    mongoClient;
    embeddingService;
    bioClinicalConnection;
    ocrService;
    pdfService;
    constructor(mongoClient, embeddingService, bioClinicalConnection, ocrService, pdfService) {
        this.mongoClient = mongoClient;
        this.embeddingService = embeddingService;
        this.bioClinicalConnection = bioClinicalConnection;
        this.ocrService = ocrService;
        this.pdfService = pdfService;
    }
    createUploadDocumentTool() {
        return {
            name: 'uploadDocument',
            description: 'Upload and process a medical document with automatic text extraction, BioClinical NER, and local embedding generation',
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
            console.log(`📄 Processing document upload: ${args.title}`);
            let extractedText = args.content || '';
            let processingResults = {};
            // Extract text from file if provided
            if (args.filePath || args.fileBuffer) {
                console.log('📝 Extracting text from file...');
                const extractionResult = await this.extractTextFromFile(args.filePath, args.fileBuffer, args.metadata?.fileType);
                extractedText = extractionResult.text;
                processingResults = extractionResult.processingInfo;
            }
            if (!extractedText.trim()) {
                throw new Error('No text content provided or extracted from file');
            }
            console.log(`📊 Text extracted: ${extractedText.length} characters`);
            // Extract medical entities using BioClinical server
            console.log('🧬 Extracting medical entities using BioClinical-Server...');
            const bioClinicalResult = await this.bioClinicalConnection.extractMedicalEntities(extractedText, 0.5 // confidence threshold
            );
            if (!bioClinicalResult.success) {
                throw new Error(`BioClinical extraction failed: ${bioClinicalResult.error || 'Unknown error'}`);
            }
            // Map BioClinical entities to legacy format for database compatibility
            const medicalEntities = EntityMappingService.mapBioClinicalToLegacy(bioClinicalResult.entities);
            console.log(`🏷️  Extracted ${medicalEntities.length} medical entities`);
            // Generate embedding using Local HuggingFace model
            console.log('🔗 Generating document embeddings...');
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
                    processed: true,
                    ...(processingResults && {
                        nerModel: 'Clinical-AI-Apollo/Medical-NER',
                        nerProcessingTime: bioClinicalResult.processingTimeMs,
                        entitiesExtracted: medicalEntities.length,
                        nerConfidence: bioClinicalResult.confidence
                    })
                }
            };
            // Save to MongoDB
            console.log('💾 Saving document to database...');
            const savedDocId = await this.mongoClient.insertDocument(document);
            // Prepare response
            const result = {
                success: true,
                documentId: savedDocId,
                title: args.title,
                contentLength: extractedText.length,
                entitiesExtracted: medicalEntities.length,
                processingResults: {
                    textExtraction: processingResults,
                    entityExtraction: {
                        model: bioClinicalResult.model,
                        processingTimeMs: bioClinicalResult.processingTimeMs,
                        confidence: bioClinicalResult.confidence,
                        entitiesFound: bioClinicalResult.entitiesFound
                    },
                    embedding: {
                        dimensions: embedding.length,
                        model: 'local-huggingface'
                    }
                },
                entities: medicalEntities.map(entity => ({
                    text: entity.text,
                    label: entity.label,
                    confidence: entity.confidence
                })),
                metadata: {
                    documentType: args.metadata?.documentType,
                    patientId: args.metadata?.patientId,
                    tags: args.metadata?.tags
                }
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            console.error('❌ Document upload failed:', error);
            const errorResult = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorResult, null, 2)
                    }
                ]
            };
        }
    }
    createSearchDocumentsTool() {
        return {
            name: 'searchDocuments',
            description: 'Search medical documents using semantic similarity and text matching',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query'
                    },
                    limit: {
                        type: 'number',
                        default: 10,
                        description: 'Maximum number of results'
                    },
                    threshold: {
                        type: 'number',
                        default: 0.7,
                        description: 'Similarity threshold'
                    },
                    searchType: {
                        type: 'string',
                        enum: ['vector', 'text', 'hybrid'],
                        default: 'hybrid',
                        description: 'Type of search to perform'
                    },
                    vectorWeight: {
                        type: 'number',
                        default: 0.7,
                        description: 'Weight for vector similarity in hybrid search'
                    },
                    textWeight: {
                        type: 'number',
                        default: 0.3,
                        description: 'Weight for text matching in hybrid search'
                    },
                    filter: {
                        type: 'object',
                        properties: {
                            documentType: { type: 'string' },
                            patientId: { type: 'string' },
                            tags: {
                                type: 'array',
                                items: { type: 'string' }
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
            console.log(`🔍 Searching documents: "${args.query}"`);
            // Generate query embedding for semantic search
            const queryEmbedding = await this.embeddingService.generateEmbedding(args.query);
            // Perform search based on type using proper MongoDB methods
            let documents;
            switch (args.searchType) {
                case 'vector':
                    // Use basic document retrieval for now
                    documents = await this.mongoClient.getDocumentsByFilter({}, args.limit || 10);
                    break;
                case 'text':
                    documents = await this.mongoClient.getDocumentsByFilter({ $text: { $search: args.query } }, args.limit || 10);
                    break;
                default: // hybrid
                    documents = await this.mongoClient.getDocumentsByFilter({ $text: { $search: args.query } }, args.limit || 10);
            }
            const result = {
                success: true,
                query: args.query,
                searchType: args.searchType || 'hybrid',
                documentsFound: documents.length,
                documents: documents.map(doc => ({
                    id: doc._id,
                    title: doc.title,
                    summary: doc.content.substring(0, 200) + '...',
                    documentType: doc.metadata.documentType,
                    patientId: doc.metadata.patientId,
                    uploadDate: doc.metadata.uploadedAt,
                    relevantEntities: doc.medicalEntities?.slice(0, 5) || [],
                    tags: doc.metadata.tags || []
                }))
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            console.error('❌ Document search failed:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }
                ]
            };
        }
    }
    createListDocumentsTool() {
        return {
            name: 'listDocuments',
            description: 'List medical documents with optional filtering and pagination',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        default: 20,
                        description: 'Maximum number of documents to return'
                    },
                    offset: {
                        type: 'number',
                        default: 0,
                        description: 'Number of documents to skip'
                    },
                    filter: {
                        type: 'object',
                        properties: {
                            documentType: { type: 'string' },
                            patientId: { type: 'string' },
                            tags: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            processed: { type: 'boolean' }
                        }
                    }
                }
            }
        };
    }
    async handleListDocuments(args) {
        try {
            console.log('📋 Listing documents with filters:', args.filter);
            const documents = await this.mongoClient.getDocumentsByFilter(args.filter || {}, args.limit || 20, args.offset || 0);
            const totalCount = await this.mongoClient.countDocuments(args.filter || {});
            const result = {
                success: true,
                totalDocuments: totalCount,
                documentsReturned: documents.length,
                offset: args.offset || 0,
                limit: args.limit || 20,
                hasMore: (args.offset || 0) + documents.length < totalCount,
                documents: documents.map((doc) => ({
                    id: doc._id,
                    title: doc.title,
                    documentType: doc.metadata?.documentType,
                    patientId: doc.metadata?.patientId,
                    uploadDate: doc.metadata?.uploadedAt,
                    processed: doc.metadata?.processed,
                    entitiesCount: doc.medicalEntities?.length || 0,
                    contentLength: doc.content.length,
                    tags: doc.metadata?.tags || []
                }))
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            console.error('❌ List documents failed:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }
                ]
            };
        }
    }
    // Helper method for text extraction from files
    async extractTextFromFile(filePath, fileBuffer, fileType) {
        let text = '';
        let processingInfo = {};
        try {
            if (filePath) {
                // Extract from file path using OCR service
                if (!fs.existsSync(filePath)) {
                    throw new Error(`File not found: ${filePath}`);
                }
                const ext = path.extname(filePath).toLowerCase();
                const stats = fs.statSync(filePath);
                processingInfo.filePath = filePath;
                processingInfo.fileSize = stats.size;
                processingInfo.fileType = ext;
                switch (ext) {
                    case '.pdf':
                        console.log('📄 Processing PDF file...');
                        const pdfResult = await this.pdfService.parsePDF(filePath);
                        text = pdfResult.text;
                        processingInfo.pdf = {
                            pageCount: pdfResult.pageCount,
                            metadata: pdfResult.metadata
                        };
                        break;
                    case '.jpg':
                    case '.jpeg':
                    case '.png':
                    case '.tiff':
                    case '.bmp':
                    case '.gif':
                        console.log('🖼️  Processing image file with OCR...');
                        // Use OCR service's processImage method
                        const imageResult = await this.ocrService.processImage(filePath);
                        text = imageResult.text;
                        processingInfo.ocr = {
                            confidence: imageResult.confidence,
                            wordCount: imageResult.words?.length || 0
                        };
                        break;
                    case '.txt':
                        console.log('📝 Reading text file...');
                        text = fs.readFileSync(filePath, 'utf-8');
                        break;
                    default:
                        // Try using OCR service's processDocument for any other file
                        console.log(`🔄 Processing ${ext} file with OCR document processor...`);
                        const docResult = await this.ocrService.processDocument(filePath);
                        text = docResult.extractedText;
                        processingInfo.ocr = {
                            confidence: docResult.confidence,
                            pageCount: docResult.pageCount,
                            processingTime: docResult.processingTime
                        };
                }
            }
            else if (fileBuffer && fileType) {
                // Extract from base64 buffer
                const buffer = Buffer.from(fileBuffer, 'base64');
                processingInfo.fileSize = buffer.length;
                processingInfo.fileType = fileType;
                if (fileType.toLowerCase().includes('pdf')) {
                    console.log('📄 Processing PDF from buffer...');
                    const pdfResult = await this.pdfService.parsePDFBuffer(buffer);
                    text = pdfResult.text;
                    processingInfo.pdf = {
                        pageCount: pdfResult.pageCount,
                        metadata: pdfResult.metadata
                    };
                }
                else if (fileType.toLowerCase().includes('image')) {
                    console.log('🖼️  Processing image from buffer with OCR...');
                    // Use OCR service's processImageBuffer method
                    const ocrResult = await this.ocrService.processImageBuffer(buffer, fileType);
                    text = ocrResult.text;
                    processingInfo.ocr = {
                        confidence: ocrResult.confidence,
                        wordCount: ocrResult.words?.length || 0
                    };
                }
                else {
                    throw new Error(`Unsupported file type from buffer: ${fileType}`);
                }
            }
            processingInfo.textLength = text.length;
            processingInfo.extractionSuccess = true;
            return { text, processingInfo };
        }
        catch (error) {
            console.error('❌ Text extraction failed:', error);
            processingInfo.extractionSuccess = false;
            processingInfo.extractionError = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Method to get all tools for server registration
    getAllTools() {
        return [
            this.createUploadDocumentTool(),
            this.createSearchDocumentsTool(),
            this.createListDocumentsTool()
        ];
    }
}
//# sourceMappingURL=document-tools.js.map