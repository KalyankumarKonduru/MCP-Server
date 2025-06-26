"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToMongoDB = connectToMongoDB;
exports.saveDocument = saveDocument;
exports.getDocument = getDocument;
exports.updateDocumentStatus = updateDocumentStatus;
exports.getPatientDocuments = getPatientDocuments;
exports.searchDocuments = searchDocuments;
exports.vectorSearch = vectorSearch;
exports.closeConnection = closeConnection;
const mongodb_1 = require("mongodb");
let client;
let db;
let documentsCollection;
async function connectToMongoDB() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/medical-docs';
        client = new mongodb_1.MongoClient(uri);
        await client.connect();
        console.log('Connected to MongoDB');
        db = client.db();
        documentsCollection = db.collection('documents');
        // Create indexes
        await createIndexes();
    }
    catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}
async function createIndexes() {
    // Text index for search
    await documentsCollection.createIndex({ extractedText: 'text' });
    // Compound index for patient queries
    await documentsCollection.createIndex({
        'metadata.patientName': 1,
        'metadata.sessionId': 1,
        uploadDate: -1
    });
    // Vector index for semantic search (if using MongoDB Atlas)
    // Comment this out if not using Atlas
    /*
    try {
      await documentsCollection.createIndex(
        { embedding: '2dsphere' },
        {
          name: 'vector_index',
          sparse: true
        }
      );
    } catch (error) {
      console.log('Vector index creation skipped (requires MongoDB Atlas)');
    }
    */
}
// Document operations
async function saveDocument(doc) {
    // Convert Buffer to Binary for MongoDB storage
    const docToSave = {
        ...doc,
        content: new mongodb_1.Binary(doc.content)
    };
    await documentsCollection.insertOne(docToSave);
}
async function getDocument(documentId) {
    const doc = await documentsCollection.findOne({ _id: documentId });
    if (doc && doc.content instanceof mongodb_1.Binary) {
        // Convert Binary back to Buffer
        return {
            ...doc,
            content: Buffer.from(doc.content.buffer)
        };
    }
    return doc;
}
async function updateDocumentStatus(documentId, status, updates) {
    await documentsCollection.updateOne({ _id: documentId }, {
        $set: {
            status,
            ...updates
        }
    });
}
async function getPatientDocuments(patientIdentifier, sessionId) {
    const query = {
        $or: [
            { 'metadata.patientName': new RegExp(patientIdentifier, 'i') },
            { 'processedData.patientInfo.name': new RegExp(patientIdentifier, 'i') }
        ]
    };
    if (sessionId) {
        query['metadata.sessionId'] = sessionId;
    }
    const docs = await documentsCollection
        .find(query)
        .sort({ uploadDate: -1 })
        .toArray();
    // Convert Binary to Buffer for each document
    return docs.map(doc => {
        if (doc.content instanceof mongodb_1.Binary) {
            return {
                ...doc,
                content: Buffer.from(doc.content.buffer)
            };
        }
        return doc;
    });
}
async function searchDocuments(searchText, filters) {
    const query = {
        $text: { $search: searchText }
    };
    if (filters?.patientId) {
        query['metadata.patientName'] = new RegExp(filters.patientId, 'i');
    }
    if (filters?.sessionId) {
        query['metadata.sessionId'] = filters.sessionId;
    }
    const docs = await documentsCollection
        .find(query)
        .project({ score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(10)
        .toArray();
    return docs.map(doc => {
        if (doc.content instanceof mongodb_1.Binary) {
            return {
                ...doc,
                content: Buffer.from(doc.content.buffer)
            };
        }
        return doc;
    });
}
// Vector search (simplified version for non-Atlas MongoDB)
async function vectorSearch(queryEmbedding, options = {}) {
    const { patientId, limit = 5 } = options;
    // For non-Atlas MongoDB, we'll do a simple cosine similarity search
    // In production with Atlas, this would use the vector index
    const documents = await documentsCollection
        .find(patientId ? { 'metadata.patientName': new RegExp(patientId, 'i') } : {})
        .toArray();
    // Calculate cosine similarity
    const results = documents
        .filter(doc => doc.embedding && doc.embedding.length > 0)
        .map(doc => {
        const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
        return {
            documentId: doc._id,
            filename: doc.filename,
            score: similarity,
            excerpt: doc.extractedText?.substring(0, 200) + '...',
            metadata: doc.metadata
        };
    })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    return results;
}
// Helper function for cosine similarity
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
// Cleanup
async function closeConnection() {
    if (client) {
        await client.close();
    }
}
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing MongoDB connection...');
    await closeConnection();
    process.exit(0);
});
//# sourceMappingURL=mongodb-client.js.map