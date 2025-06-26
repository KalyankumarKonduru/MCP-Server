import { EmbeddingServiceInterface } from '../interfaces/embedding-interface.js';
export interface EmbeddingResult {
    embedding: number[];
    dimensions: number;
    model: string;
}
export declare class LocalEmbeddingService implements EmbeddingServiceInterface {
    private embedder;
    private isLoading;
    private model;
    constructor(model?: string);
    initialize(): Promise<void>;
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    generateMedicalDocumentEmbedding(title: string, content: string, medicalEntities?: Array<{
        text: string;
        label: string;
    }>): Promise<number[]>;
    generateQueryEmbedding(query: string, context?: string): Promise<number[]>;
    private preprocessText;
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
        isLocal: boolean;
    };
    isReady(): boolean;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=local-embedding-service.d.ts.map