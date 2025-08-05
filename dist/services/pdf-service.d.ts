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
    private pdfExtract;
    constructor();
    parsePDF(filePath: string, options?: PDFProcessingOptions): Promise<PDFParseResult>;
    parsePDFBuffer(buffer: Buffer, options?: PDFProcessingOptions): Promise<PDFParseResult>;
    private processExtractedData;
    private extractTextFromPage;
    private extractMetadata;
    private parsePDFDate;
    private cleanText;
}
//# sourceMappingURL=pdf-service.d.ts.map