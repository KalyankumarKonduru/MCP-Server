// Create this as a simple Node.js script: check-database.js

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkDatabase() {
  const connectionString = process.env.MONGODB_CONNECTION_STRING;
  const dbName = process.env.MONGODB_DATABASE_NAME || 'MCP';
  
  if (!connectionString) {
    console.error('❌ MONGODB_CONNECTION_STRING not found');
    return;
  }

  const client = new MongoClient(connectionString);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(dbName);
    const collection = db.collection('documents');
    
    // Basic counts
    const total = await collection.countDocuments();
    const withEmbeddings = await collection.countDocuments({ embedding: { $exists: true } });
    
    console.log(`📊 Database: ${dbName}`);
    console.log(`📄 Total documents: ${total}`);
    console.log(`🧠 With embeddings: ${withEmbeddings}`);
    
    if (total > 0) {
      // Get sample documents
      const samples = await collection.find({}).limit(3).toArray();
      
      console.log('\n📋 Sample documents:');
      samples.forEach((doc, i) => {
        console.log(`\n${i + 1}. ${doc.title}`);
        console.log(`   Content: ${doc.content?.substring(0, 80)}...`);
        console.log(`   Patient: ${doc.metadata?.patientId || 'None'}`);
        console.log(`   Has embedding: ${!!doc.embedding} (${doc.embedding?.length || 0} dims)`);
        
        // Check if content contains "john doe" (case insensitive)
        const contentLower = doc.content?.toLowerCase() || '';
        const titleLower = doc.title?.toLowerCase() || '';
        const patientLower = doc.metadata?.patientId?.toLowerCase() || '';
        
        if (contentLower.includes('john') || titleLower.includes('john') || patientLower.includes('john')) {
          console.log(`   🎯 CONTAINS "john" - this should match your search!`);
        }
      });
      
      // Test manual search
      console.log('\n🔍 Testing manual text search for "john"...');
      const johnDocs = await collection.find({
        $or: [
          { title: { $regex: 'john', $options: 'i' } },
          { content: { $regex: 'john', $options: 'i' } },
          { 'metadata.patientId': { $regex: 'john', $options: 'i' } }
        ]
      }).toArray();
      
      console.log(`Found ${johnDocs.length} documents mentioning "john"`);
      johnDocs.forEach((doc, i) => {
        console.log(`   ${i + 1}. "${doc.title}" (Patient: ${doc.metadata?.patientId})`);
      });
    }
    
    // Check indexes
    console.log('\n🗃️ Checking indexes...');
    const indexes = await collection.listIndexes().toArray();
    const hasVectorIndex = indexes.some(idx => 
      idx.name?.includes('vector') || idx.name?.includes('search')
    );
    
    console.log(`Vector index exists: ${hasVectorIndex ? '✅' : '❌'}`);
    if (!hasVectorIndex) {
      console.log('🔧 You need to create a vector search index in MongoDB Atlas!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

checkDatabase();