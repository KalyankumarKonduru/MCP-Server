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

      // Generate embedding using local service
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

  async handleSearchDocuments(args: SearchDocumentsRequest): Promise<any> {
    try {
      // Generate query embedding using local service
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(args.query);

      // Build MongoDB filter
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
      
      if (args.filter?.dateRange) {
        mongoFilter['metadata.uploadedAt'] = {
          $gte: new Date(args.filter.dateRange.start),
          $lte: new Date(args.filter.dateRange.end)
        };
      }

      // Perform vector search
      const searchResults = await this.mongoClient.vectorSearch(
        queryEmbedding,
        args.limit || 10,
        args.threshold || 0.7,
        mongoFilter
      );

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
    } catch (error) {
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
    } catch (error) {
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