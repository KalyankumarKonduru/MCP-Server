// src/db/mongodb-client.ts
import { MongoClient, Db, Collection } from 'mongodb';

export interface MedicalDocument {
  _id?: string;
  title: string;
  content: string;
  embedding?: number[];
  medicalEntities?: MedicalEntity[];
  metadata: {
    uploadedAt: Date;
    fileType?: string;
    size?: number;
    tags?: string[];
    patientId?: string;
    documentType?: 'clinical_note' | 'lab_report' | 'prescription' | 'discharge_summary' | 'other';
    processed?: boolean;
  };
}

export interface MedicalEntity {
  text: string;
  label: string;
  confidence: number;
  start: number;
  end: number;
}

export interface SearchResult {
  document: MedicalDocument;
  score: number;
  relevantEntities?: MedicalEntity[];
}

export class MongoDBClient {
  private client: MongoClient;
  public db: Db;
  private documentsCollection: Collection<MedicalDocument>;
  private entitiesCollection: Collection<MedicalEntity>;

  constructor(connectionString: string, dbName: string = 'MCP') {
    this.client = new MongoClient(connectionString);
    this.db = this.client.db(dbName);
    this.documentsCollection = this.db.collection<MedicalDocument>('documents');
    this.entitiesCollection = this.db.collection<MedicalEntity>('entities');
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      console.log('Connected to MongoDB Atlas');
      
      // Create basic indexes only (we'll use Atlas Search for the main functionality)
      await this.createBasicIndexes();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('Disconnected from MongoDB Atlas');
  }

  private async createBasicIndexes(): Promise<void> {
    try {
      // Only create essential indexes since we're using Atlas Search
      await this.documentsCollection.createIndex({ '_id': 1 });
      console.log('Basic database indexes created successfully');
    } catch (error) {
      console.warn('Could not create basic indexes:', error);
    }
  }

  async insertDocument(document: MedicalDocument): Promise<string> {
    try {
      document.metadata.uploadedAt = new Date();
      const result = await this.documentsCollection.insertOne(document);
      return result.insertedId.toString();
    } catch (error) {
      console.error('Failed to insert document:', error);
      throw error;
    }
  }

  async updateDocument(id: string, updates: Partial<MedicalDocument>): Promise<boolean> {
    try {
      const result = await this.documentsCollection.updateOne(
        { _id: id as any },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Failed to update document:', error);
      throw error;
    }
  }

  async vectorSearch(
    queryEmbedding: number[], 
    limit: number = 10, 
    threshold: number = 0.7,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      console.log('🔍 Starting vector search with embedding dims:', queryEmbedding.length);
      console.log('🔍 Search params:', { limit, threshold, filter });
  
      // Use the correct $vectorSearch syntax for MongoDB Atlas
      const pipeline: any[] = [
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
        const matchConditions: any = {};
        
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
      pipeline.push(
        { $match: { score: { $gte: threshold } } },
        { $limit: limit }
      );
  
      console.log('🔍 Vector search pipeline:', JSON.stringify(pipeline, null, 2));
  
      const results = await this.documentsCollection.aggregate(pipeline).toArray();
      
      console.log(`📋 Vector search returned ${results.length} results`);
      results.forEach((result, i) => {
        console.log(`📄 Result ${i+1}: ${result.title}, score: ${result.score}`);
      });
      
      return results.map(doc => ({
        document: doc as MedicalDocument,
        score: doc.score || 0,
        relevantEntities: doc.medicalEntities || []
      }));
    } catch (error) {
      console.error('❌ Vector search failed:', error);
      console.error('Error details:', error.message);
      // Fallback to text search
      return this.textSearchFallback('', limit);
    }
  }
  async textSearch(query: string, limit: number = 10, filter?: Record<string, any>): Promise<SearchResult[]> {
    try {
      console.log('🔍 Starting text search for:', query);
      
      // Use Atlas Search text search capabilities with the unified index
      const pipeline: any[] = [
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
        const matchConditions: any = {};
        
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
        document: doc as MedicalDocument,
        score: doc.score || 0.5,
        relevantEntities: doc.medicalEntities || []
      }));
    } catch (error) {
      console.error('❌ Text search failed:', error);
      return this.textSearchFallback(query, limit);
    }
  }
  

  private async textSearchFallback(query: string, limit: number = 10): Promise<SearchResult[]> {
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
        document: doc as MedicalDocument,
        score: 0.3,
        relevantEntities: doc.medicalEntities || []
      }));
    } catch (error) {
      console.error('Fallback text search failed:', error);
      return [];
    }
  }

  async hybridSearch(
    query: string,
    queryEmbedding: number[],
    limit: number = 10,
    vectorWeight: number = 0.7,
    textWeight: number = 0.3,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      console.log('🔄 Starting hybrid search...');
      
      // For hybrid search, we'll do vector search first, then text search, then combine
      // Since MongoDB Atlas doesn't support true hybrid in one query easily
      
      const vectorResults = await this.vectorSearch(queryEmbedding, Math.ceil(limit * 0.7), 0.1, filter);
      const textResults = await this.textSearch(query, Math.ceil(limit * 0.5), filter);
      
      console.log(`🔄 Hybrid: ${vectorResults.length} vector + ${textResults.length} text results`);
      
      // Combine and deduplicate results
      const combinedResults = new Map<string, SearchResult>();
      
      // Add vector results with vector weight
      vectorResults.forEach(result => {
        const id = result.document._id as string;
        combinedResults.set(id, {
          ...result,
          score: result.score * vectorWeight
        });
      });
      
      // Add text results with text weight, or boost existing results
      textResults.forEach(result => {
        const id = result.document._id as string;
        const existing = combinedResults.get(id);
        
        if (existing) {
          // Boost score if document found in both searches
          existing.score += result.score * textWeight;
        } else {
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
    } catch (error) {
      console.error('❌ Hybrid search failed:', error);
      // Fallback to vector search only
      return this.vectorSearch(queryEmbedding, limit, 0.5, filter);
    }
  }

  async findDocuments(
    filter: Record<string, any> = {},
    limit: number = 50,
    offset: number = 0
  ): Promise<MedicalDocument[]> {
    try {
      const results = await this.documentsCollection
        .find(filter)
        .skip(offset)
        .limit(limit)
        .sort({ 'metadata.uploadedAt': -1 })
        .toArray();
      
      return results as MedicalDocument[];
    } catch (error) {
      console.error('Failed to find documents:', error);
      throw error;
    }
  }

  async findDocumentById(id: string): Promise<MedicalDocument | null> {
    try {
      const result = await this.documentsCollection.findOne({ _id: id as any });
      return result as MedicalDocument | null;
    } catch (error) {
      console.error('Failed to find document by ID:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      const result = await this.documentsCollection.deleteOne({ _id: id as any });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    try {
      return await this.documentsCollection.countDocuments(filter);
    } catch (error) {
      console.error('Failed to count documents:', error);
      throw error;
    }
  }

  async findByMedicalEntity(entityLabel: string, limit: number = 20): Promise<MedicalDocument[]> {
    try {
      const results = await this.documentsCollection
        .find({ 'medicalEntities.label': entityLabel })
        .limit(limit)
        .sort({ 'metadata.uploadedAt': -1 })
        .toArray();
      
      return results as MedicalDocument[];
    } catch (error) {
      console.error('Failed to find documents by medical entity:', error);
      throw error;
    }
  }

  async getPatientDocuments(patientId: string): Promise<MedicalDocument[]> {
    try {
      const results = await this.documentsCollection
        .find({ 'metadata.patientId': patientId })
        .sort({ 'metadata.uploadedAt': -1 })
        .toArray();
      
      return results as MedicalDocument[];
    } catch (error) {
      console.error('Failed to get patient documents:', error);
      throw error;
    }
  }
}