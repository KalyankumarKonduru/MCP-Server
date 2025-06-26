"use strict";
// src/db/setup-vector-indexes.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupVectorIndexes = setupVectorIndexes;
const mongodb_1 = require("mongodb");
async function setupVectorIndexes(connectionString, dbName = 'medical_documents') {
    const client = new mongodb_1.MongoClient(connectionString);
    try {
        await client.connect();
        console.log('Connected to MongoDB for index setup...');
        const db = client.db(dbName);
        // Create vector search index for document chunks (384 dimensions for all-MiniLM-L6-v2)
        const chunksCollection = db.collection('document_chunks');
        try {
            await chunksCollection.createSearchIndex({
                name: 'vector_index_chunks',
                definition: {
                    fields: [
                        {
                            type: 'vector',
                            path: 'embedding',
                            numDimensions: 384,
                            similarity: 'cosine'
                        }
                    ]
                }
            });
            console.log('✅ Vector index for document_chunks created');
        }
        catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️  Vector index for document_chunks already exists');
            }
            else {
                console.error('❌ Failed to create vector index for document_chunks:', error);
            }
        }
        // Create vector search index for embeddings collection
        const embeddingsCollection = db.collection('embeddings');
        try {
            await embeddingsCollection.createSearchIndex({
                name: 'vector_index_embeddings',
                definition: {
                    fields: [
                        {
                            type: 'vector',
                            path: 'embedding',
                            numDimensions: 384,
                            similarity: 'cosine'
                        }
                    ]
                }
            });
            console.log('✅ Vector index for embeddings created');
        }
        catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️  Vector index for embeddings already exists');
            }
            else {
                console.error('❌ Failed to create vector index for embeddings:', error);
            }
        }
        // Create regular indexes for filtering
        try {
            await chunksCollection.createIndex({ 'metadata.patientId': 1 });
            await chunksCollection.createIndex({ 'metadata.documentType': 1 });
            await chunksCollection.createIndex({ 'metadata.documentId': 1 });
            await chunksCollection.createIndex({ 'metadata.createdAt': -1 });
            console.log('✅ Regular indexes for document_chunks created');
        }
        catch (error) {
            console.error('❌ Failed to create regular indexes:', error);
        }
        console.log('🎉 All indexes setup complete!');
    }
    finally {
        await client.close();
    }
}
// Run this script to setup indexes
if (require.main === module) {
    const connectionString = process.env.MONGODB_CONNECTION_STRING;
    if (!connectionString) {
        console.error('MONGODB_CONNECTION_STRING environment variable is required');
        process.exit(1);
    }
    setupVectorIndexes(connectionString)
        .then(() => {
        console.log('Index setup completed successfully');
        process.exit(0);
    })
        .catch((error) => {
        console.error('Index setup failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=setup-vector-indexes.js.map