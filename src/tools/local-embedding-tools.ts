// src/tools/local-embedding-tools.ts

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient, MedicalDocument } from '../db/mongodb-client.js';
import { pipeline } from '@xenova/transformers';

// Global model instances (loaded once)
let embedder: any;

// Load the embedding model once
async function loadEmbedder() {
  if (!embedder) {
    console.log('🧠 Loading local transformer model (all-MiniLM-L6-v2)...');
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log('✅ Local embedding model loaded successfully');
  }
  return embedder;
}

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

export class LocalEmbeddingTools {
  constructor(private mongoClient: MongoDBClient) {}

  // Tool 1: Generate and store embedding locally
  createGenerateEmbeddingTool(): Tool {
    return {
      name: 'generateEmbeddingLocal',
      description: 'Generate a vector embedding from text using local HuggingFace transformer and store it in MongoDB',
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

      const embedder = await loadEmbedder();
      
      // Generate embedding
      const output = await embedder(args.text, {
        pooling: "mean",
        normalize: true,
      });

      const embedding = Array.from(output.data);
      
      // Store in MongoDB
      const document = {
        text: args.text,
        embedding,
        metadata: {
          ...args.metadata,
          createdAt: new Date(),
          embeddingModel: 'all-MiniLM-L6-v2',
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
              model: 'all-MiniLM-L6-v2',
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
              message: 'Failed to generate and store embedding'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  // Tool 2: Chunk and embed large documents
  createChunkAndEmbedTool(): Tool {
    return {
      name: 'chunkAndEmbedDocument',
      description: 'Split a large document into chunks and generate embeddings for each chunk using local transformer',
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

      const embedder = await loadEmbedder();
      const collection = this.mongoClient.db.collection('document_chunks');
      
      let successfulChunks = 0;
      const chunkIds = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          // Generate embedding for this chunk
          const output = await embedder(chunk, {
            pooling: "mean",
            normalize: true,
          });
          
          const embedding = Array.from(output.data);
          
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
              embeddingModel: 'all-MiniLM-L6-v2',
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
              model: 'all-MiniLM-L6-v2',
              dimensions: 384 // all-MiniLM-L6-v2 dimensions
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
              message: 'Failed to chunk and embed document'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  // Tool 3: Semantic search using vector similarity
  createSemanticSearchTool(): Tool {
    return {
      name: 'semanticSearchLocal',
      description: 'Search for semantically similar document chunks using local embeddings and vector similarity',
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
      
      console.log(`🔍 Semantic search for: "${args.query}"`);
      
      // Generate query embedding
      const embedder = await loadEmbedder();
      const output = await embedder(args.query, {
        pooling: "mean",
        normalize: true,
      });
      
      const queryEmbedding = Array.from(output.data);
      
      // Build MongoDB aggregation pipeline
      const pipeline: any[] = [
        {
          $vectorSearch: {
            queryVector: queryEmbedding,
            path: "embedding",
            limit: topK * 2, // Get more results for filtering
            index: "vector_index_chunks" // You'll need to create this index
          }
        },
        {
          $addFields: {
            score: { $meta: "vectorSearchScore" }
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

      // Execute search
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
              message: 'Failed to perform semantic search',
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
      this.createSemanticSearchTool()
    ];
  }
}