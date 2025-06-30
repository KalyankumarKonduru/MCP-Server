import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient } from '../db/mongodb-client.js';
import { LocalEmbeddingService } from '../services/local-embedding-service.js';
import { MedicalNERService } from '../services/medical-ner-service.js';
import { OCRService } from '../services/ocr-service.js';
import { PDFService } from '../services/pdf-service.js';
export interface UploadDocumentRequest {
    title: string;
    content?: string;
    filePath?: string;
    fileBuffer?: string;
    metadata?: {
        fileType?: string;
        size?: number;
        tags?: string[];
        patientId?: string;
        documentType?: 'clinical_note' | 'lab_report' | 'prescription' | 'discharge_summary' | 'other';
    };
}
export interface SearchDocumentsRequest {
    query: string;
    limit?: number;
    threshold?: number;
    searchType?: 'vector' | 'text' | 'hybrid';
    vectorWeight?: number;
    textWeight?: number;
    filter?: {
        documentType?: string;
        patientId?: string;
        tags?: string[];
        dateRange?: {
            start: string;
            end: string;
        };
    };
}
export interface ListDocumentsRequest {
    limit?: number;
    offset?: number;
    filter?: {
        documentType?: string;
        patientId?: string;
        tags?: string[];
        processed?: boolean;
    };
}
export declare class DocumentTools {
    private mongoClient;
    private embeddingService;
    private nerService;
    private ocrService;
    private pdfService;
    constructor(mongoClient: MongoDBClient, embeddingService: LocalEmbeddingService, nerService: MedicalNERService, ocrService: OCRService, pdfService: PDFService);
    createUploadDocumentTool(): Tool;
    handleUploadDocument(args: UploadDocumentRequest): Promise<any>;
    createSearchDocumentsTool(): Tool;
    handleSearchDocuments(args: SearchDocumentsRequest): Promise<any>;
    createListDocumentsTool(): Tool;
    handleListDocuments(args: ListDocumentsRequest): Promise<any>;
    private extractTextFromFile;
    getAllTools(): Tool[];
}
//# sourceMappingURL=document-tools.d.ts.map