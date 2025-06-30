// src/tools/google-embedding-tools.ts

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient, MedicalDocument } from '../db/mongodb-client.js';
import { GoogleEmbeddingService } from '../services/google-embedding-service.js';

// Chunking utility function
function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim().length > 50) { // Only include meaningful chunks
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

export class GoogleEmbeddingTools {
  constructor(
    private mongoClient: MongoDBClient,
    private embeddingService: GoogleEmbeddingService
  ) {}

  // Tool 1: Generate and store embedding with Google Gemini
  createGenerateEmbeddingTool(): Tool {
    return {
      name: 'generateEmbeddingGoogle',
      description: 'Generate a vector embedding from text using Google Gemini and store it in MongoDB',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to embed (minimum 5 characters)'
          },
          metadata: {
            type: 'object',
            description: 'Optional metadata to store with the embedding',
            properties: {
              source: { type: 'string' },
              patientId: { type: 'string' },
              documentType: { type: 'string' },
              tags: { 
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        },
        required: ['text']
      }
    };
  }

  async handleGenerateEmbedding(args: {
    text: string;
    metadata?: {
      source?: string;
      patientId?: string;
      documentType?: string;
      tags?: string[];
    };
  }): Promise<any> {
    try {
      if (args.text.length < 5) {
        throw new Error('Text must be at least 5 characters long');
      }

      // Generate embedding using Google Gemini
      const embedding = await this.embeddingService.generateEmbedding(args.text);
      
      // Store in MongoDB
      const document = {
        text: args.text,
        embedding,
        metadata: {
          ...args.metadata,
          createdAt: new Date(),
          embeddingModel: 'gemini-embedding-exp-03-07',
          dimensions: embedding.length
        }
      };

      const collection = this.mongoClient.db.collection('embeddings');
      const result = await collection.insertOne(document);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              id: result.insertedId.toString(),
              dimensions: embedding.length,
              model: 'gemini-embedding-exp-03-07',
              textLength: args.text.length
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
              message: 'Failed to generate and store Google embedding'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  // Tool 2: Chunk and embed large documents with Google Gemini
  createChunkAndEmbedTool(): Tool {
    return {
      name: 'chunkAndEmbedDocument',
      description: 'Split a large document into chunks and generate embeddings for each chunk using Google Gemini',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Large text document to chunk and embed (minimum 100 characters)'
          },
          chunkSize: {
            type: 'number',
            description: 'Number of words per chunk (default: 500)',
            minimum: 50,
            maximum: 1000
          },
          overlap: {
            type: 'number',
            description: 'Number of words to overlap between chunks (default: 100)',
            minimum: 0,
            maximum: 200
          },
          metadata: {
            type: 'object',
            description: 'Metadata to attach to all chunks',
            properties: {
              documentId: { type: 'string' },
              title: { type: 'string' },
              patientId: { type: 'string' },
              documentType: { 
                type: 'string',
                enum: ['clinical_note', 'lab_report', 'prescription', 'discharge_summary', 'other']
              },
              source: { type: 'string' }
            }
          }
        },
        required: ['text']
      }
    };
  }

  async handleChunkAndEmbed(args: {
    text: string;
    chunkSize?: number;
    overlap?: number;
    metadata?: {
      documentId?: string;
      title?: string;
      patientId?: string;
      documentType?: string;
      source?: string;
    };
  }): Promise<any> {
    try {
      if (args.text.length < 100) {
        throw new Error('Text must be at least 100 characters long');
      }

      const chunkSize = args.chunkSize || 500;
      const overlap = args.overlap || 100;
      
      console.log(`📄 Chunking document: ${args.text.length} chars, ${chunkSize} words per chunk`);
      
      // Split into chunks
      const chunks = chunkText(args.text, chunkSize, overlap);
      console.log(`📋 Created ${chunks.length} chunks`);

      const collection = this.mongoClient.db.collection('document_chunks');
      
      let successfulChunks = 0;
      const chunkIds = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          // Generate embedding for this chunk using Google Gemini
          const embedding = await this.embeddingService.generateEmbedding(chunk);
          
          // Store chunk with embedding
          const chunkDoc = {
            chunkIndex: i,
            totalChunks: chunks.length,
            text: chunk,
            embedding,
            wordCount: chunk.split(/\s+/).length,
            metadata: {
              ...args.metadata,
              createdAt: new Date(),
              embeddingModel: 'gemini-embedding-exp-03-07',
              dimensions: embedding.length
            }
          };

          const result = await collection.insertOne(chunkDoc);
          chunkIds.push(result.insertedId.toString());
          successfulChunks++;
          
        } catch (error) {
          console.error(`Failed to process chunk ${i}:`, error);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              totalChunks: chunks.length,
              successfulChunks,
              chunkIds,
              chunkSize,
              overlap,
              model: 'gemini-embedding-exp-03-07',
              dimensions: 768 // Google Gemini embedding dimensions
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
              message: 'Failed to chunk and embed document with Google Gemini'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  // Tool 3: Semantic search using Google embeddings
  createSemanticSearchTool(): Tool {
    return {
      name: 'semanticSearchGoogle',
      description: 'Search for semantically similar document chunks using Google Gemini embeddings and vector similarity',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text'
          },
          topK: {
            type: 'number',
            description: 'Number of most similar results to return (default: 5)',
            minimum: 1,
            maximum: 20
          },
          threshold: {
            type: 'number',
            description: 'Minimum similarity score (0-1, default: 0.7)',
            minimum: 0,
            maximum: 1
          },
          filter: {
            type: 'object',
            description: 'Optional filters for search',
            properties: {
              patientId: { type: 'string' },
              documentType: { type: 'string' },
              documentId: { type: 'string' },
              source: { type: 'string' }
            }
          }
        },
        required: ['query']
      }
    };
  }

  async handleSemanticSearch(args: {
    query: string;
    topK?: number;
    threshold?: number;
    filter?: {
      patientId?: string;
      documentType?: string;
      documentId?: string;
      source?: string;
    };
  }): Promise<any> {
    try {
      const topK = args.topK || 5;
      const threshold = args.threshold || 0.3;
      
      console.log(`🔍 Semantic search with Google Gemini for: "${args.query}"`);
      
      // Generate query embedding using Google Gemini
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(args.query);
      
      // Use MongoDB Atlas Search with the unified index
      const pipeline: any[] = [
        {
          $search: {
            index: "unified_search_index",
            knnBeta: {
              vector: queryEmbedding,
              path: "embedding",
              k: topK * 2, // Get more results for filtering
              score: {
                boost: {
                  value: 1.0
                }
              }
            }
          }
        },
        {
          $addFields: {
            score: { $meta: "searchScore" }
          }
        }
      ];

      // Add filters if provided
      if (args.filter) {
        const matchConditions: any = {};
        
        if (args.filter.patientId) {
          matchConditions['metadata.patientId'] = args.filter.patientId;
        }
        if (args.filter.documentType) {
          matchConditions['metadata.documentType'] = args.filter.documentType;
        }
        if (args.filter.documentId) {
          matchConditions['metadata.documentId'] = args.filter.documentId;
        }
        if (args.filter.source) {
          matchConditions['metadata.source'] = args.filter.source;
        }
        
        if (Object.keys(matchConditions).length > 0) {
          pipeline.push({ $match: matchConditions });
        }
      }

      // Apply threshold and limit
      pipeline.push(
        { $match: { score: { $gte: threshold } } },
        { $limit: topK }
      );

      // Execute search on document_chunks collection
      const collection = this.mongoClient.db.collection('document_chunks');
      const results = await collection.aggregate(pipeline).toArray();

      const formattedResults = results.map(result => ({
        text: result.text,
        score: result.score || 0,
        chunkIndex: result.chunkIndex,
        totalChunks: result.totalChunks,
        wordCount: result.wordCount,
        metadata: result.metadata
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              query: args.query,
              resultsFound: formattedResults.length,
              embeddingModel: 'gemini-embedding-exp-03-07',
              searchParameters: {
                topK,
                threshold,
                filter: args.filter || {}
              },
              results: formattedResults
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
              message: 'Failed to perform semantic search with Google Gemini',
              query: args.query
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  // Tool 4: Hybrid search combining vector and text search
  createHybridSearchTool(): Tool {
    return {
      name: 'hybridSearch',
      description: 'Perform hybrid search combining Google Gemini vector similarity and text search for optimal results',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text'
          },
          topK: {
            type: 'number',
            description: 'Number of results to return (default: 10)',
            minimum: 1,
            maximum: 50
          },
          vectorWeight: {
            type: 'number',
            description: 'Weight for vector search (0-1, default: 0.7)',
            minimum: 0,
            maximum: 1
          },
          textWeight: {
            type: 'number',
            description: 'Weight for text search (0-1, default: 0.3)',
            minimum: 0,
            maximum: 1
          },
          threshold: {
            type: 'number',
            description: 'Minimum combined score threshold (default: 0.5)',
            minimum: 0,
            maximum: 1
          },
          filter: {
            type: 'object',
            description: 'Optional filters for search',
            properties: {
              patientId: { type: 'string' },
              documentType: { type: 'string' },
              source: { type: 'string' }
            }
          }
        },
        required: ['query']
      }
    };
  }

  async handleHybridSearch(args: {
    query: string;
    topK?: number;
    vectorWeight?: number;
    textWeight?: number;
    threshold?: number;
    filter?: {
      patientId?: string;
      documentType?: string;
      source?: string;
    };
  }): Promise<any> {
    try {
      const topK = args.topK || 10;
      const vectorWeight = args.vectorWeight || 0.7;
      const textWeight = args.textWeight || 0.3;
      const threshold = args.threshold || 0.3;
      
      console.log(`🔄 Hybrid search with Google Gemini for: "${args.query}"`);
      
      // Generate query embedding using Google Gemini
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(args.query);
      
      // Use the MongoDB hybrid search method
      const results = await this.mongoClient.hybridSearch(
        args.query,
        queryEmbedding,
        topK,
        vectorWeight,
        textWeight,
        args.filter
      );

      // Filter by threshold
      const filteredResults = results.filter(result => result.score >= threshold);

      const formattedResults = filteredResults.map(result => ({
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
              resultsFound: formattedResults.length,
              embeddingModel: 'gemini-embedding-exp-03-07',
              searchType: 'hybrid',
              searchParameters: {
                topK,
                vectorWeight,
                textWeight,
                threshold,
                filter: args.filter || {}
              },
              results: formattedResults
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
              message: 'Failed to perform hybrid search with Google Gemini',
              query: args.query
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  getAllTools(): Tool[] {
    return [
      this.createGenerateEmbeddingTool(),
      this.createChunkAndEmbedTool(),
      this.createSemanticSearchTool(),
      this.createHybridSearchTool()
    ];
  }
}