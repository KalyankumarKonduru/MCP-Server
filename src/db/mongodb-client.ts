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
  private db: Db;
  private documentsCollection: Collection<MedicalDocument>;
  private entitiesCollection: Collection<MedicalEntity>;

  constructor(connectionString: string, dbName: string = 'medical_documents') {
    this.client = new MongoClient(connectionString);
    this.db = this.client.db(dbName);
    this.documentsCollection = this.db.collection<MedicalDocument>('documents');
    this.entitiesCollection = this.db.collection<MedicalEntity>('entities');
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      console.log('Connected to MongoDB Atlas');
      
      // Create indexes for better performance
      await this.createIndexes();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('Disconnected from MongoDB Atlas');
  }

  private async createIndexes(): Promise<void> {
    try {
      // Text search index
      await this.documentsCollection.createIndex({ 
        title: 'text', 
        content: 'text' 
      });

      // Vector search index (for Atlas Vector Search)
      await this.documentsCollection.createIndex(
        { embedding: "2dsphere" },
        { name: "vector_index", background: true }
      );

      // Medical entity indexes
      await this.documentsCollection.createIndex({ 'medicalEntities.label': 1 });
      await this.documentsCollection.createIndex({ 'metadata.documentType': 1 });
      await this.documentsCollection.createIndex({ 'metadata.patientId': 1 });
      await this.documentsCollection.createIndex({ 'metadata.uploadedAt': -1 });

      console.log('Database indexes created successfully');
    } catch (error) {
      console.warn('Could not create some indexes:', error);
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
      const pipeline: any[] = [
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
        document: doc as MedicalDocument,
        score: doc.score || 0,
        relevantEntities: doc.medicalEntities || []
      }));
    } catch (error) {
      console.error('Vector search failed:', error);
      // Fallback to text search
      return this.textSearch(filter?.title || '', limit);
    }
  }

  async textSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      const results = await this.documentsCollection
        .find({ $text: { $search: query } })
        .limit(limit)
        .toArray();
      
      return results.map(doc => ({
        document: doc as MedicalDocument,
        score: 0.5,
        relevantEntities: doc.medicalEntities || []
      }));
    } catch (error) {
      console.error('Text search failed:', error);
      throw error;
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

