import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient } from '../db/mongodb-client.js';
import { GoogleEmbeddingService } from '../services/google-embedding-service.js';
export declare class GoogleEmbeddingTools {
    private mongoClient;
    private embeddingService;
    constructor(mongoClient: MongoDBClient, embeddingService: GoogleEmbeddingService);
    createGenerateEmbeddingTool(): Tool;
    handleGenerateEmbedding(args: {
        text: string;
        metadata?: {
            source?: string;
            patientId?: string;
            documentType?: string;
            tags?: string[];
        };
    }): Promise<any>;
    createChunkAndEmbedTool(): Tool;
    handleChunkAndEmbed(args: {
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
    }): Promise<any>;
    createSemanticSearchTool(): Tool;
    handleSemanticSearch(args: {
        query: string;
        topK?: number;
        threshold?: number;
        filter?: {
            patientId?: string;
            documentType?: string;
            documentId?: string;
            source?: string;
        };
    }): Promise<any>;
    createHybridSearchTool(): Tool;
    handleHybridSearch(args: {
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
    }): Promise<any>;
    getAllTools(): Tool[];
}
//# sourceMappingURL=google-embedding-tools.d.ts.map