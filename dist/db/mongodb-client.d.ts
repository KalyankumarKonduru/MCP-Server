interface MedicalDocument {
    _id: string;
    filename: string;
    mimeType: string;
    uploadDate: Date;
    fileSize: number;
    content: Buffer;
    status: 'uploaded' | 'processing' | 'text_extracted' | 'processed' | 'error';
    metadata: {
        patientName?: string;
        sessionId: string;
        description?: string;
    };
    extractedText: string | null;
    processedData: any | null;
    embedding?: number[];
    error?: string;
}
export declare function connectToMongoDB(): Promise<void>;
export declare function saveDocument(doc: MedicalDocument): Promise<void>;
export declare function getDocument(documentId: string): Promise<MedicalDocument | null>;
export declare function updateDocumentStatus(documentId: string, status: MedicalDocument['status'], updates?: Partial<MedicalDocument>): Promise<void>;
export declare function getPatientDocuments(patientIdentifier: string, sessionId?: string): Promise<MedicalDocument[]>;
export declare function searchDocuments(searchText: string, filters?: {
    patientId?: string;
    sessionId?: string;
}): Promise<MedicalDocument[]>;
export declare function vectorSearch(queryEmbedding: number[], options?: {
    patientId?: string;
    limit?: number;
}): Promise<any[]>;
export declare function closeConnection(): Promise<void>;
export {};
//# sourceMappingURL=mongodb-client.d.ts.map