"use strict";
// src/services/embedding-service.ts
// This file is replaced by local-embedding-service.ts
// Keeping this as a stub to prevent import errors
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
class EmbeddingService {
    constructor(apiKey, model) {
        console.warn('⚠️  EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    async generateEmbedding(text) {
        throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    async generateEmbeddings(texts) {
        throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    async generateMedicalDocumentEmbedding(title, content, medicalEntities) {
        throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    async generateQueryEmbedding(query, context) {
        throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    async calculateSimilarity(embedding1, embedding2) {
        throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    async findSimilarTexts(queryEmbedding, candidateEmbeddings, threshold = 0.7) {
        throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
    }
    getModelInfo() {
        return {
            model: 'deprecated',
            dimensions: 0
        };
    }
}
exports.EmbeddingService = EmbeddingService;
//# sourceMappingURL=embedding-service.js.map