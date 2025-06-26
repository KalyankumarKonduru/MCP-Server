"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBClient = void 0;
const mongodb_1 = require("mongodb");
class MongoDBClient {
    client;
    db; // Make db public for access in tools
    documentsCollection;
    entitiesCollection;
    constructor(connectionString, dbName = 'medical_documents') {
        this.client = new mongodb_1.MongoClient(connectionString);
        this.db = this.client.db(dbName);
        this.documentsCollection = this.db.collection('documents');
        this.entitiesCollection = this.db.collection('entities');
    }
    async connect() {
        try {
            await this.client.connect();
            console.log('Connected to MongoDB Atlas');
            // Create indexes for better performance
            await this.createIndexes();
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
    async createIndexes() {
        try {
            // Text search index
            await this.documentsCollection.createIndex({
                title: 'text',
                content: 'text'
            });
            // Vector search index (for Atlas Vector Search)
            try {
                await this.documentsCollection.createIndex({ embedding: "2dsphere" }, { name: "vector_index", background: true });
            }
            catch (error) {
                // Vector index creation might fail if not supported
                console.warn('Could not create vector index (normal for non-Atlas deployments)');
            }
            // Medical entity indexes
            await this.documentsCollection.createIndex({ 'medicalEntities.label': 1 });
            await this.documentsCollection.createIndex({ 'metadata.documentType': 1 });
            await this.documentsCollection.createIndex({ 'metadata.patientId': 1 });
            await this.documentsCollection.createIndex({ 'metadata.uploadedAt': -1 });
            console.log('Database indexes created successfully');
        }
        catch (error) {
            console.warn('Could not create some indexes:', error);
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
            const pipeline = [
                {
                    $vectorSearch: {
                        index: "vector_index",
                        path: "embedding",
                        queryVector: queryEmbedding,
                        numCandidates: limit * 10,
                        limit: limit
                    }
                },
                {
                    $addFields: {
                        score: { $meta: "vectorSearchScore" }
                    }
                }
            ];
            if (filter) {
                pipeline.push({ $match: filter });
            }
            pipeline.push({
                $match: {
                    score: { $gte: threshold }
                }
            });
            const results = await this.documentsCollection.aggregate(pipeline).toArray();
            return results.map(doc => ({
                document: doc,
                score: doc.score || 0,
                relevantEntities: doc.medicalEntities || []
            }));
        }
        catch (error) {
            console.error('Vector search failed:', error);
            // Fallback to text search
            return this.textSearch(filter?.title || '', limit);
        }
    }
    async textSearch(query, limit = 10) {
        try {
            const results = await this.documentsCollection
                .find({ $text: { $search: query } })
                .limit(limit)
                .toArray();
            return results.map(doc => ({
                document: doc,
                score: 0.5,
                relevantEntities: doc.medicalEntities || []
            }));
        }
        catch (error) {
            console.error('Text search failed:', error);
            throw error;
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