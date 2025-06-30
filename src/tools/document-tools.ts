// src/tools/document-tools.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient, MedicalDocument } from '../db/mongodb-client.js';
import { LocalEmbeddingService } from '../services/local-embedding-service.js';
import { MedicalNERService } from '../services/medical-ner-service.js';
import { OCRService } from '../services/ocr-service.js';
import { PDFService } from '../services/pdf-service.js';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadDocumentRequest {
  title: string;
  content?: string;
  filePath?: string;
  fileBuffer?: string; // base64 encoded
  metadata?: {
    fileType?: string;
    size?: number;
    tags?: string[];
    patientId?: string;
    documentType?: 'clinical_note' | 'lab_report' | 'prescription' | 'discharge_summary' | 'other';
  };
}

export interface SearchDocumentsRequest {
  query: string;
  limit?: number;
  threshold?: number;
  searchType?: 'vector' | 'text' | 'hybrid';
  vectorWeight?: number;
  textWeight?: number;
  filter?: {
    documentType?: string;
    patientId?: string;
    tags?: string[];
    dateRange?: {
      start: string;
      end: string;
    };
  };
}

export interface ListDocumentsRequest {
  limit?: number;
  offset?: number;
  filter?: {
    documentType?: string;
    patientId?: string;
    tags?: string[];
    processed?: boolean;
  };
}

export class DocumentTools {
  constructor(
    private mongoClient: MongoDBClient,
    private embeddingService: LocalEmbeddingService,
    private nerService: MedicalNERService,
    private ocrService: OCRService,
    private pdfService: PDFService
  ) {}

  createUploadDocumentTool(): Tool {
    return {
      name: 'uploadDocument',
      description: 'Upload and process a medical document with automatic text extraction, NER, and local embedding generation',
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

  async handleUploadDocument(args: UploadDocumentRequest): Promise<any> {
    try {
      let extractedText = args.content || '';
      let processingResults: any = {};

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

      // Generate embedding using Local HuggingFace model
      const embedding = await this.embeddingService.generateMedicalDocumentEmbedding(
        args.title,
        extractedText,
        medicalEntities.map(e => ({ text: e.text, label: e.label }))
      );

      // Create document object
      const document: MedicalDocument = {
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
                embeddingModel: 'all-MiniLM-L6-v2',
                ...processingResults
              },
              medicalEntities: medicalEntities.slice(0, 10) // Show first 10 entities
            }, null, 2)
          }
        ]
      };
    } catch (error) {
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

  createSearchDocumentsTool(): Tool {
    return {
      name: 'searchDocuments',
      description: 'Search medical documents using local HuggingFace semantic similarity, text search, or hybrid approach with filters',
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
          searchType: {
            type: 'string',
            enum: ['vector', 'text', 'hybrid'],
            description: 'Type of search to perform (default: hybrid)'
          },
          vectorWeight: {
            type: 'number',
            description: 'Weight for vector search in hybrid mode (default: 0.7)',
            minimum: 0,
            maximum: 1
          },
          textWeight: {
            type: 'number',
            description: 'Weight for text search in hybrid mode (default: 0.3)',
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

  async handleSearchDocuments(args: SearchDocumentsRequest): Promise<any> {
    try {
      console.log(`🔍 SEARCH TOOL CALLED - Query: "${args.query}"`);
      console.log(`🔍 SEARCH ARGS:`, JSON.stringify(args, null, 2));
      
      const searchType = args.searchType || 'hybrid';
      const limit = args.limit || 10;
      const threshold = args.threshold || 0.3;

      console.log(`🔍 SEARCH PARAMS - Type: ${searchType}, Limit: ${limit}, Threshold: ${threshold}`);

      // DEBUG: Check database state first
      console.log(`📊 Checking database state...`);
      const totalDocs = await this.mongoClient.countDocuments();
      const docsWithEmbeddings = await this.mongoClient.countDocuments({ embedding: { $exists: true } });
      
      console.log(`📊 DATABASE STATE - Total docs: ${totalDocs}, With embeddings: ${docsWithEmbeddings}`);

      if (totalDocs === 0) {
        console.log(`❌ No documents in database`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              query: args.query,
              resultsCount: 0,
              results: [],
              message: "No documents in database"
            }, null, 2)
          }]
        };
      }

      if (docsWithEmbeddings === 0) {
        console.log(`❌ No documents with embeddings`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              query: args.query,
              resultsCount: 0,
              results: [],
              message: "No documents have embeddings"
            }, null, 2)
          }]
        };
      }

      // Test embedding generation
      console.log(`🧠 Testing embedding generation...`);
      try {
        const testEmbedding = await this.embeddingService.generateQueryEmbedding(args.query);
        console.log(`✅ Generated embedding: ${testEmbedding.length} dimensions`);
        console.log(`🔍 Embedding preview: [${testEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      } catch (embError) {
        console.error(`❌ Embedding generation failed:`, embError);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Embedding generation failed: ${embError instanceof Error ? embError.message : embError}`,
              query: args.query
            }, null, 2)
          }]
        };
      }

      // Build MongoDB filter
      const mongoFilter: Record<string, any> = {};
      
      if (args.filter?.documentType) {
        mongoFilter['metadata.documentType'] = args.filter.documentType;
      }
      
      if (args.filter?.patientId) {
        mongoFilter['metadata.patientId'] = args.filter.patientId;
      }

      console.log(`🔍 MONGO FILTER:`, mongoFilter);

      let searchResults;

      // Always try vector search first for debugging
      console.log(`🧠 Attempting vector search...`);
      try {
        const queryEmbedding = await this.embeddingService.generateQueryEmbedding(args.query);
        console.log(`📐 Query embedding generated: ${queryEmbedding.length} dims`);
        
        searchResults = await this.mongoClient.vectorSearch(
          queryEmbedding,
          limit,
          threshold,
          mongoFilter
        );
        
        console.log(`📊 Vector search returned: ${searchResults.length} results`);
        
      } catch (vectorError) {
        console.error(`❌ Vector search failed:`, vectorError);
        
        // Fallback to text search
        console.log(`🔄 Falling back to text search...`);
        try {
          searchResults = await this.mongoClient.textSearch(args.query, limit, mongoFilter);
          console.log(`📊 Text search returned: ${searchResults.length} results`);
        } catch (textError) {
          console.error(`❌ Text search also failed:`, textError);
          
          // Last resort: return all documents
          console.log(`🔄 Returning all documents as last resort...`);
          const allDocs = await this.mongoClient.findDocuments(mongoFilter, limit);
          searchResults = allDocs.map(doc => ({
            document: doc,
            score: 0.5,
            relevantEntities: doc.medicalEntities || []
          }));
        }
      }

      console.log(`✅ Final search results: ${searchResults.length} documents`);
      
      // Format results
      const formattedResults = searchResults.map(result => ({
        id: result.document._id,
        title: result.document.title,
        content: result.document.content.substring(0, 500) + (result.document.content.length > 500 ? '...' : ''),
        score: result.score,
        metadata: result.document.metadata,
        relevantEntities: result.relevantEntities?.slice(0, 5) || []
      }));

      console.log(`📋 Formatted results: ${formattedResults.length} items`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              query: args.query,
              searchType,
              embeddingModel: this.embeddingService.getModelInfo().model,
              resultsCount: searchResults.length,
              results: formattedResults,
              searchParameters: {
                limit,
                threshold,
                filter: args.filter || {}
              },
              debug: {
                totalDocsInDb: totalDocs,
                docsWithEmbeddings,
                filterApplied: mongoFilter
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error(`❌ Search method completely failed:`, error);
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

  createListDocumentsTool(): Tool {
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

  async handleListDocuments(args: ListDocumentsRequest): Promise<any> {
    try {
      const limit = args.limit || 20;
      const offset = args.offset || 0;

      console.log(`📋 LIST DOCUMENTS DEBUG - Limit: ${limit}, Offset: ${offset}`);

      // Build filter
      const mongoFilter: Record<string, any> = {};
      
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

      console.log(`🔍 LIST FILTER:`, mongoFilter);

      // Get documents and count
      const [documents, totalCount] = await Promise.all([
        this.mongoClient.findDocuments(mongoFilter, limit, offset),
        this.mongoClient.countDocuments(mongoFilter)
      ]);

      console.log(`📊 FOUND: ${documents.length} documents (${totalCount} total)`);

      // Enhanced document analysis
      const enhancedDocuments = documents.map(doc => {
        const docInfo: any = {
          id: doc._id,
          title: doc.title,
          content: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
          contentLength: doc.content.length,
          metadata: doc.metadata,
          entityCount: doc.medicalEntities?.length || 0,
          hasEmbedding: !!doc.embedding,
          embeddingDimensions: doc.embedding?.length || null,
          embeddingModel: doc.embedding ? this.embeddingService.getModelInfo().model : null
        };

        // Add top medical entities for quick reference
        if (doc.medicalEntities && doc.medicalEntities.length > 0) {
          docInfo.topEntities = doc.medicalEntities
            .slice(0, 5)
            .map(entity => ({
              text: entity.text,
              label: entity.label,
              confidence: entity.confidence
            }));
        }

        // Add patient info if available
        if (doc.metadata?.patientId) {
          docInfo.patientInfo = {
            patientId: doc.metadata.patientId,
            documentType: doc.metadata.documentType
          };
        }

        return docInfo;
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              documents: enhancedDocuments,
              embeddingModel: this.embeddingService.getModelInfo().model,
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
    } catch (error) {
      console.error(`❌ List documents failed:`, error);
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

  private async extractTextFromFile(
    filePath?: string, 
    fileBuffer?: string, 
    fileType?: string
  ): Promise<{ text: string; processingInfo: any }> {
    try {
      let text = '';
      let processingInfo: any = {};

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
        } else {
          // Assume image file
          const ocrResult = await this.ocrService.processImageBuffer(buffer, fileType || 'unknown');
          text = ocrResult.text;
          processingInfo = {
            method: 'ocr',
            confidence: ocrResult.confidence
          };
        }
      } else if (filePath) {
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
        } else if (['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif'].includes(extension)) {
          const ocrResult = await this.ocrService.processImage(filePath);
          text = ocrResult.text;
          processingInfo = {
            method: 'ocr',
            confidence: ocrResult.confidence
          };
        } else {
          throw new Error(`Unsupported file type: ${extension}`);
        }
      }

      return { text, processingInfo };
    } catch (error) {
      console.error('Failed to extract text from file:', error);
      throw error;
    }
  }

  getAllTools(): Tool[] {
    return [
      this.createUploadDocumentTool(),
      this.createSearchDocumentsTool(),
      this.createListDocumentsTool()
    ];
  }
}