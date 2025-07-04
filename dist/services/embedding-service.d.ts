import { EmbeddingServiceInterface } from '../interfaces/embedding-interface.js';
export interface EmbeddingResult {
    embedding: number[];
    tokenCount: number;
}
export declare class EmbeddingService implements EmbeddingServiceInterface {
    constructor(apiKey?: string, model?: string);
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    generateMedicalDocumentEmbedding(title: string, content: string, medicalEntities?: Array<{
        text: string;
        label: string;
    }>): Promise<number[]>;
    generateQueryEmbedding(query: string, context?: string): Promise<number[]>;
    calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number>;
    findSimilarTexts(queryEmbedding: number[], candidateEmbeddings: Array<{
        id: string;
        embedding: number[];
    }>, threshold?: number): Promise<Array<{
        id: string;
        similarity: number;
    }>>;
    getModelInfo(): {
        model: string;
        dimensions: number;
    };
}
//# sourceMappingURL=embedding-service.d.ts.map