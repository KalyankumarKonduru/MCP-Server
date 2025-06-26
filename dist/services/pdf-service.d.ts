export interface PDFParseResult {
    text: string;
    pageCount: number;
    metadata: {
        title?: string;
        author?: string;
        subject?: string;
        creator?: string;
        producer?: string;
        creationDate?: Date;
        modificationDate?: Date;
    };
    info: {
        fileSize: number;
        version?: string;
        encrypted: boolean;
    };
}
export interface PDFProcessingOptions {
    maxPages?: number;
    pageRange?: {
        start: number;
        end: number;
    };
    extractImages?: boolean;
    preserveFormatting?: boolean;
}
export declare class PDFService {
    constructor();
    parsePDF(filePath: string, options?: PDFProcessingOptions): Promise<PDFParseResult>;
    parsePDFBuffer(buffer: Buffer, options?: PDFProcessingOptions): Promise<PDFParseResult>;
    private cleanText;
    private preserveFormatting;
    private extractPageRange;
    extractMedicalInformation(filePath: string): Promise<{
        text: string;
        medicalSections: Record<string, string>;
        confidence: number;
    }>;
    private identifyMedicalSections;
    private calculateMedicalConfidence;
    validatePDF(filePath: string): Promise<{
        isValid: boolean;
        isMedical: boolean;
        confidence: number;
        issues: string[];
    }>;
    extractTextByPages(filePath: string): Promise<Array<{
        pageNumber: number;
        text: string;
    }>>;
    getSupportedFormats(): string[];
    getDocumentInfo(filePath: string): Promise<{
        fileName: string;
        fileSize: number;
        pageCount: number;
        isEncrypted: boolean;
        metadata: any;
    }>;
}
//# sourceMappingURL=pdf-service.d.ts.map