"use strict";
// src/services/local-embedding-service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalEmbeddingService = void 0;
const transformers_1 = require("@xenova/transformers");
class LocalEmbeddingService {
    embedder = null;
    isLoading = false;
    model;
    constructor(model = "Xenova/all-MiniLM-L6-v2") {
        this.model = model;
    }
    async initialize() {
        if (this.embedder || this.isLoading)
            return;
        this.isLoading = true;
        try {
            console.log(`🧠 Loading local embedding model: ${this.model}...`);
            this.embedder = await (0, transformers_1.pipeline)("feature-extraction", this.model);
            console.log(`✅ Local embedding model loaded successfully`);
        }
        catch (error) {
            console.error('❌ Failed to load embedding model:', error);
            throw error;
        }
        finally {
            this.isLoading = false;
        }
    }
    async generateEmbedding(text) {
        if (!this.embedder) {
            await this.initialize();
        }
        try {
            // Clean and prepare text for embedding
            const cleanedText = this.preprocessText(text);
            const output = await this.embedder(cleanedText, {
                pooling: "mean",
                normalize: true,
            });
            return Array.from(output.data);
        }
        catch (error) {
            console.error('Failed to generate embedding:', error);
            throw new Error(`Embedding generation failed: ${error}`);
        }
    }
    async generateEmbeddings(texts) {
        if (!this.embedder) {
            await this.initialize();
        }
        try {
            const embeddings = [];
            for (const text of texts) {
                const cleanedText = this.preprocessText(text);
                const output = await this.embedder(cleanedText, {
                    pooling: "mean",
                    normalize: true,
                });
                embeddings.push(Array.from(output.data));
            }
            return embeddings;
        }
        catch (error) {
            console.error('Failed to generate batch embeddings:', error);
            throw new Error(`Batch embedding generation failed: ${error}`);
        }
    }
    async generateMedicalDocumentEmbedding(title, content, medicalEntities) {
        try {
            // Create a comprehensive text representation for medical documents
            let embeddingText = `Title: ${title}\n\nContent: ${content}`;
            if (medicalEntities && medicalEntities.length > 0) {
                const entitiesText = medicalEntities
                    .map(entity => `${entity.label}: ${entity.text}`)
                    .join(', ');
                embeddingText += `\n\nMedical Entities: ${entitiesText}`;
            }
            return await this.generateEmbedding(embeddingText);
        }
        catch (error) {
            console.error('Failed to generate medical document embedding:', error);
            throw error;
        }
    }
    async generateQueryEmbedding(query, context) {
        try {
            let queryText = query;
            if (context) {
                queryText = `Context: ${context}\n\nQuery: ${query}`;
            }
            return await this.generateEmbedding(queryText);
        }
        catch (error) {
            console.error('Failed to generate query embedding:', error);
            throw error;
        }
    }
    preprocessText(text) {
        // Clean and normalize text for better embeddings
        return text
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[^\w\s\-.,;:!?()]/g, '') // Remove special characters except basic punctuation
            .trim()
            .substring(0, 8000); // Limit length to avoid memory issues
    }
    async calculateSimilarity(embedding1, embedding2) {
        try {
            if (embedding1.length !== embedding2.length) {
                throw new Error('Embeddings must have the same dimensions');
            }
            // Calculate cosine similarity
            let dotProduct = 0;
            let norm1 = 0;
            let norm2 = 0;
            for (let i = 0; i < embedding1.length; i++) {
                dotProduct += embedding1[i] * embedding2[i];
                norm1 += embedding1[i] * embedding1[i];
                norm2 += embedding2[i] * embedding2[i];
            }
            const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
            return similarity;
        }
        catch (error) {
            console.error('Failed to calculate similarity:', error);
            throw error;
        }
    }
    async findSimilarTexts(queryEmbedding, candidateEmbeddings, threshold = 0.3) {
        try {
            const similarities = await Promise.all(candidateEmbeddings.map(async (candidate) => ({
                id: candidate.id,
                similarity: await this.calculateSimilarity(queryEmbedding, candidate.embedding)
            })));
            return similarities
                .filter(item => item.similarity >= threshold)
                .sort((a, b) => b.similarity - a.similarity);
        }
        catch (error) {
            console.error('Failed to find similar texts:', error);
            throw error;
        }
    }
    getModelInfo() {
        // all-MiniLM-L6-v2 has 384 dimensions
        const dimensions = this.model.includes("all-MiniLM-L6-v2") ? 384 :
            this.model.includes("all-mpnet-base-v2") ? 768 : 384;
        return {
            model: this.model,
            dimensions,
            isLocal: true
        };
    }
    isReady() {
        return this.embedder !== null && !this.isLoading;
    }
    async shutdown() {
        // Clean up if needed
        this.embedder = null;
        console.log('Local embedding service shut down');
    }
}
exports.LocalEmbeddingService = LocalEmbeddingService;
//# sourceMappingURL=local-embedding-service.js.map