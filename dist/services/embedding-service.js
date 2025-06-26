"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
exports.semanticSearch = semanticSearch;
const transformers_1 = require("@xenova/transformers");
let embeddingPipeline = null;
async function getEmbeddingPipeline() {
    if (!embeddingPipeline) {
        embeddingPipeline = await (0, transformers_1.pipeline)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return embeddingPipeline;
}
async function generateEmbedding(text) {
    try {
        const extractor = await getEmbeddingPipeline();
        // Truncate text to model's max length (512 tokens ~ 2000 chars)
        const truncatedText = text.substring(0, 2000);
        const output = await extractor(truncatedText, {
            pooling: 'mean',
            normalize: true
        });
        // Convert to regular array
        return Array.from(output.data);
    }
    catch (error) {
        console.error('Embedding generation error:', error);
        throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function semanticSearch(query, options = {}) {
    const { patientId, limit = 5 } = options;
    try {
        // Generate query embedding
        const queryEmbedding = await generateEmbedding(query);
        // Import MongoDB client here to avoid circular dependency
        const { vectorSearch } = await import('../db/mongodb-client.js');
        return await vectorSearch(queryEmbedding, { patientId, limit });
    }
    catch (error) {
        console.error('Semantic search error:', error);
        throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=embedding-service.js.map