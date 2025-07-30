import { Db } from 'mongodb';
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
export declare class MongoDBClient {
    private client;
    db: Db;
    private documentsCollection;
    private entitiesCollection;
    constructor(connectionString: string, dbName?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private createBasicIndexes;
    insertDocument(document: MedicalDocument): Promise<string>;
    updateDocument(id: string, updates: Partial<MedicalDocument>): Promise<boolean>;
    vectorSearch(queryEmbedding: number[], limit?: number, threshold?: number, filter?: Record<string, any>): Promise<SearchResult[]>;
    textSearch(query: string, limit?: number, filter?: Record<string, any>): Promise<SearchResult[]>;
    private textSearchFallback;
    hybridSearch(query: string, queryEmbedding: number[], limit?: number, vectorWeight?: number, textWeight?: number, filter?: Record<string, any>): Promise<SearchResult[]>;
    findDocuments(filter?: Record<string, any>, limit?: number, offset?: number): Promise<MedicalDocument[]>;
    findDocumentById(id: string): Promise<MedicalDocument | null>;
    deleteDocument(id: string): Promise<boolean>;
    countDocuments(filter?: Record<string, any>): Promise<number>;
    findByMedicalEntity(entityLabel: string, limit?: number): Promise<MedicalDocument[]>;
    getPatientDocuments(patientId: string): Promise<MedicalDocument[]>;
    /**
     * Get documents by filter with pagination support
     * Required by DocumentTools and MedicalTools
     */
    getDocumentsByFilter(filter?: Record<string, any>, limit?: number, offset?: number): Promise<MedicalDocument[]>;
    /**
     * Search documents using text search with filters
     * Required by MedicalTools - returns documents directly (not SearchResult[])
     */
    searchDocuments(query: string, filter?: Record<string, any>, limit?: number): Promise<MedicalDocument[]>;
    /**
     * List documents with filtering and pagination
     * Required by DocumentTools - alias for getDocumentsByFilter
     */
    listDocuments(limit?: number, offset?: number, filter?: Record<string, any>): Promise<MedicalDocument[]>;
}
//# sourceMappingURL=mongodb-client.d.ts.map