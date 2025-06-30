// src/db/setup-vector-indexes.ts - Updated for Google AI Embeddings Only

import { MongoClient } from 'mongodb';

export async function setupVectorIndexes(
  connectionString: string, 
  dbName: string = 'medical_documents'
) {
  const client = new MongoClient(connectionString);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB for index setup...');
    
    const db = client.db(dbName);
    
    // Google AI embeddings are 768 dimensions
    const dimensions = 768;
    
    console.log(`Setting up vector indexes for Google AI embeddings (${dimensions} dimensions)`);
    
    // Create vector search index for document chunks
    const chunksCollection = db.collection('document_chunks');
    
    try {
      const chunkIndexName = 'vector_index_chunks_google';
      await chunksCollection.createSearchIndex({
        name: chunkIndexName,
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: dimensions,
              similarity: 'cosine'
            }
          ]
        }
      });
      console.log(`✅ Vector index for document_chunks created: ${chunkIndexName}`);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log(`ℹ️  Vector index for document_chunks already exists`);
      } else {
        console.error('❌ Failed to create vector index for document_chunks:', error);
      }
    }

    // Create vector search index for embeddings collection
    const embeddingsCollection = db.collection('embeddings');
    
    try {
      const embeddingIndexName = 'vector_index_embeddings_google';
      await embeddingsCollection.createSearchIndex({
        name: embeddingIndexName,
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: dimensions,
              similarity: 'cosine'
            }
          ]
        }
      });
      console.log(`✅ Vector index for embeddings created: ${embeddingIndexName}`);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log(`ℹ️  Vector index for embeddings already exists`);
      } else {
        console.error('❌ Failed to create vector index for embeddings:', error);
      }
    }

    // Create vector search index for main documents collection
    const documentsCollection = db.collection('documents');
    
    try {
      const documentIndexName = 'vector_index_documents_google';
      await documentsCollection.createSearchIndex({
        name: documentIndexName,
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: dimensions,
              similarity: 'cosine'
            }
          ]
        }
      });
      console.log(`✅ Vector index for documents created: ${documentIndexName}`);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log(`ℹ️  Vector index for documents already exists`);
      } else {
        console.error('❌ Failed to create vector index for documents:', error);
      }
    }

    // Create regular indexes for filtering and performance
    try {
      // Document chunks indexes
      await chunksCollection.createIndex({ 'metadata.patientId': 1 });
      await chunksCollection.createIndex({ 'metadata.documentType': 1 });
      await chunksCollection.createIndex({ 'metadata.documentId': 1 });
      await chunksCollection.createIndex({ 'metadata.createdAt': -1 });
      await chunksCollection.createIndex({ 'metadata.embeddingModel': 1 });
      
      // Documents indexes
      await documentsCollection.createIndex({ 'metadata.patientId': 1 });
      await documentsCollection.createIndex({ 'metadata.documentType': 1 });
      await documentsCollection.createIndex({ 'metadata.uploadedAt': -1 });
      await documentsCollection.createIndex({ 'metadata.processed': 1 });
      await documentsCollection.createIndex({ 'medicalEntities.label': 1 });
      
      // Embeddings indexes
      await embeddingsCollection.createIndex({ 'metadata.source': 1 });
      await embeddingsCollection.createIndex({ 'metadata.patientId': 1 });
      await embeddingsCollection.createIndex({ 'metadata.createdAt': -1 });
      await embeddingsCollection.createIndex({ 'metadata.embeddingModel': 1 });
      
      // Text search indexes
      await documentsCollection.createIndex({ 
        title: 'text', 
        content: 'text' 
      }, { name: 'text_search_index' });
      
      console.log('✅ Regular indexes created successfully');
    } catch (error) {
      console.error('❌ Failed to create some regular indexes:', error);
    }

    // Create compound indexes for common query patterns
    try {
      // Compound index for patient + document type queries
      await documentsCollection.createIndex({ 
        'metadata.patientId': 1, 
        'metadata.documentType': 1,
        'metadata.uploadedAt': -1
      });
      
      // Compound index for medical entity queries
      await documentsCollection.createIndex({
        'medicalEntities.label': 1,
        'medicalEntities.text': 1,
        'metadata.uploadedAt': -1
      });
      
      // Compound index for Google embedding metadata
      await chunksCollection.createIndex({
        'metadata.embeddingModel': 1,
        'metadata.patientId': 1,
        'metadata.createdAt': -1
      });
      
      console.log('✅ Compound indexes created successfully');
    } catch (error) {
      console.error('❌ Failed to create compound indexes:', error);
    }

    console.log(`🎉 All indexes setup complete for Google AI embeddings!`);
    
    // Log index information
    const collections = ['documents', 'document_chunks', 'embeddings'];
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const indexes = await collection.listIndexes().toArray();
        console.log(`📋 ${collectionName} indexes:`, indexes.map(idx => idx.name));
      } catch (error) {
        console.log(`⚠️  Could not list indexes for ${collectionName}`);
      }
    }
    
  } finally {
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
      console.log('Index setup completed successfully for Google AI embeddings');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Index setup failed:', error);
      process.exit(1);
    });
}