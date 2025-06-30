"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBClient = void 0;
// src/db/mongodb-client.ts
const mongodb_1 = require("mongodb");
class MongoDBClient {
    client;
    db;
    documentsCollection;
    entitiesCollection;
    constructor(connectionString, dbName = 'MCP') {
        this.client = new mongodb_1.MongoClient(connectionString);
        this.db = this.client.db(dbName);
        this.documentsCollection = this.db.collection('documents');
        this.entitiesCollection = this.db.collection('entities');
    }
    async connect() {
        try {
            await this.client.connect();
            console.log('Connected to MongoDB Atlas');
            // Create basic indexes only (we'll use Atlas Search for the main functionality)
            await this.createBasicIndexes();
        }
        catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }
    async disconnect() {
        await this.client.close();
        console.log('Disconnected from MongoDB Atlas');
    }
    async createBasicIndexes() {
        try {
            // Only create essential indexes since we're using Atlas Search
            await this.documentsCollection.createIndex({ '_id': 1 });
            console.log('Basic database indexes created successfully');
        }
        catch (error) {
            console.warn('Could not create basic indexes:', error);
        }
    }
    async insertDocument(document) {
        try {
            document.metadata.uploadedAt = new Date();
            const result = await this.documentsCollection.insertOne(document);
            return result.insertedId.toString();
        }
        catch (error) {
            console.error('Failed to insert document:', error);
            throw error;
        }
    }
    async updateDocument(id, updates) {
        try {
            const result = await this.documentsCollection.updateOne({ _id: id }, { $set: updates });
            return result.modifiedCount > 0;
        }
        catch (error) {
            console.error('Failed to update document:', error);
            throw error;
        }
    }
    async vectorSearch(queryEmbedding, limit = 10, threshold = 0.7, filter) {
        try {
            console.log('🔍 Starting vector search with embedding dims:', queryEmbedding.length);
            console.log('🔍 Search params:', { limit, threshold, filter });
            // Use the correct $vectorSearch syntax for MongoDB Atlas
            const pipeline = [
                {
                    $vectorSearch: {
                        index: "unified_search_index",
                        path: "embedding",
                        queryVector: queryEmbedding,
                        numCandidates: Math.max(limit * 10, 100), // Get more candidates for better results
                        limit: limit * 2 // Get more results before filtering
                    }
                },
                {
                    $addFields: {
                        score: { $meta: "vectorSearchScore" }
                    }
                }
            ];
            // Add filters if provided
            if (filter && Object.keys(filter).length > 0) {
                const matchConditions = {};
                if (filter['metadata.patientId']) {
                    matchConditions['metadata.patientId'] = filter['metadata.patientId'];
                }
                if (filter['metadata.documentType']) {
                    matchConditions['metadata.documentType'] = filter['metadata.documentType'];
                }
                if (filter['metadata.uploadedAt']) {
                    matchConditions['metadata.uploadedAt'] = filter['metadata.uploadedAt'];
                }
                if (Object.keys(matchConditions).length > 0) {
                    pipeline.push({ $match: matchConditions });
                }
            }
            // Apply threshold and final limit
            pipeline.push({ $match: { score: { $gte: threshold } } }, { $limit: limit });
            console.log('🔍 Vector search pipeline:', JSON.stringify(pipeline, null, 2));
            const results = await this.documentsCollection.aggregate(pipeline).toArray();
            console.log(`📋 Vector search returned ${results.length} results`);
            results.forEach((result, i) => {
                console.log(`📄 Result ${i + 1}: ${result.title}, score: ${result.score}`);
            });
            return results.map(doc => ({
                document: doc,
                score: doc.score || 0,
                relevantEntities: doc.medicalEntities || []
            }));
        }
        catch (error) {
            console.error('❌ Vector search failed:', error);
            console.error('Error details:', error instanceof Error ? error.message : error);
            // Fallback to text search
            return this.textSearchFallback('', limit);
        }
    }
    async textSearch(query, limit = 10, filter) {
        try {
            console.log('🔍 Starting text search for:', query);
            // Use Atlas Search text search capabilities with the unified index
            const pipeline = [
                {
                    $search: {
                        index: "unified_search_index",
                        text: {
                            query: query,
                            path: ["title", "content"]
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
            if (filter && Object.keys(filter).length > 0) {
                const matchConditions = {};
                if (filter['metadata.patientId']) {
                    matchConditions['metadata.patientId'] = filter['metadata.patientId'];
                }
                if (filter['metadata.documentType']) {
                    matchConditions['metadata.documentType'] = filter['metadata.documentType'];
                }
                if (Object.keys(matchConditions).length > 0) {
                    pipeline.push({ $match: matchConditions });
                }
            }
            pipeline.push({ $limit: limit });
            console.log('🔍 Text search pipeline:', JSON.stringify(pipeline, null, 2));
            const results = await this.documentsCollection.aggregate(pipeline).toArray();
            console.log(`📋 Text search returned ${results.length} results`);
            return results.map(doc => ({
                document: doc,
                score: doc.score || 0.5,
                relevantEntities: doc.medicalEntities || []
            }));
        }
        catch (error) {
            console.error('❌ Text search failed:', error);
            return this.textSearchFallback(query, limit);
        }
    }
    async textSearchFallback(query, limit = 10) {
        try {
            // Basic regex search as ultimate fallback
            const results = await this.documentsCollection
                .find({
                $or: [
                    { title: { $regex: query, $options: 'i' } },
                    { content: { $regex: query, $options: 'i' } }
                ]
            })
                .limit(limit)
                .toArray();
            return results.map(doc => ({
                document: doc,
                score: 0.3,
                relevantEntities: doc.medicalEntities || []
            }));
        }
        catch (error) {
            console.error('Fallback text search failed:', error);
            return [];
        }
    }
    async hybridSearch(query, queryEmbedding, limit = 10, vectorWeight = 0.7, textWeight = 0.3, filter) {
        try {
            console.log('🔄 Starting hybrid search...');
            // For hybrid search, we'll do vector search first, then text search, then combine
            // Since MongoDB Atlas doesn't support true hybrid in one query easily
            const vectorResults = await this.vectorSearch(queryEmbedding, Math.ceil(limit * 0.7), 0.1, filter);
            const textResults = await this.textSearch(query, Math.ceil(limit * 0.5), filter);
            console.log(`🔄 Hybrid: ${vectorResults.length} vector + ${textResults.length} text results`);
            // Combine and deduplicate results
            const combinedResults = new Map();
            // Add vector results with vector weight
            vectorResults.forEach(result => {
                const id = result.document._id;
                combinedResults.set(id, {
                    ...result,
                    score: result.score * vectorWeight
                });
            });
            // Add text results with text weight, or boost existing results
            textResults.forEach(result => {
                const id = result.document._id;
                const existing = combinedResults.get(id);
                if (existing) {
                    // Boost score if document found in both searches
                    existing.score += result.score * textWeight;
                }
                else {
                    combinedResults.set(id, {
                        ...result,
                        score: result.score * textWeight
                    });
                }
            });
            // Sort by combined score and return top results
            const finalResults = Array.from(combinedResults.values())
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            console.log(`🔄 Hybrid search final: ${finalResults.length} results`);
            return finalResults;
        }
        catch (error) {
            console.error('❌ Hybrid search failed:', error);
            // Fallback to vector search only
            return this.vectorSearch(queryEmbedding, limit, 0.5, filter);
        }
    }
    async findDocuments(filter = {}, limit = 50, offset = 0) {
        try {
            const results = await this.documentsCollection
                .find(filter)
                .skip(offset)
                .limit(limit)
                .sort({ 'metadata.uploadedAt': -1 })
                .toArray();
            return results;
        }
        catch (error) {
            console.error('Failed to find documents:', error);
            throw error;
        }
    }
    async findDocumentById(id) {
        try {
            const result = await this.documentsCollection.findOne({ _id: id });
            return result;
        }
        catch (error) {
            console.error('Failed to find document by ID:', error);
            throw error;
        }
    }
    async deleteDocument(id) {
        try {
            const result = await this.documentsCollection.deleteOne({ _id: id });
            return result.deletedCount > 0;
        }
        catch (error) {
            console.error('Failed to delete document:', error);
            throw error;
        }
    }
    async countDocuments(filter = {}) {
        try {
            return await this.documentsCollection.countDocuments(filter);
        }
        catch (error) {
            console.error('Failed to count documents:', error);
            throw error;
        }
    }
    async findByMedicalEntity(entityLabel, limit = 20) {
        try {
            const results = await this.documentsCollection
                .find({ 'medicalEntities.label': entityLabel })
                .limit(limit)
                .sort({ 'metadata.uploadedAt': -1 })
                .toArray();
            return results;
        }
        catch (error) {
            console.error('Failed to find documents by medical entity:', error);
            throw error;
        }
    }
    async getPatientDocuments(patientId) {
        try {
            const results = await this.documentsCollection
                .find({ 'metadata.patientId': patientId })
                .sort({ 'metadata.uploadedAt': -1 })
                .toArray();
            return results;
        }
        catch (error) {
            console.error('Failed to get patient documents:', error);
            throw error;
        }
    }
}
exports.MongoDBClient = MongoDBClient;
//# sourceMappingURL=mongodb-client.js.map