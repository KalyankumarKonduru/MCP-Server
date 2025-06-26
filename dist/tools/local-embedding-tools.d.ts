import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient } from '../db/mongodb-client.js';
export declare class LocalEmbeddingTools {
    private mongoClient;
    constructor(mongoClient: MongoDBClient);
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
    getAllTools(): Tool[];
}
//# sourceMappingURL=local-embedding-tools.d.ts.map