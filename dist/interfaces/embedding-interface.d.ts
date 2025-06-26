export interface EmbeddingServiceInterface {
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
//# sourceMappingURL=embedding-interface.d.ts.map