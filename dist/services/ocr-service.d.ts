export interface OCRResult {
    text: string;
    confidence: number;
    words?: Array<{
        text: string;
        confidence: number;
        bbox: {
            x0: number;
            y0: number;
            x1: number;
            y1: number;
        };
    }>;
}
export interface DocumentProcessingResult {
    extractedText: string;
    confidence: number;
    pageCount?: number;
    processingTime: number;
    metadata: {
        fileType: string;
        fileSize: number;
        processedAt: Date;
    };
}
export declare class OCRService {
    private worker;
    private isInitialized;
    constructor();
    initialize(): Promise<void>;
    processImage(imagePath: string): Promise<OCRResult>;
    processImageBuffer(imageBuffer: Buffer, fileType: string): Promise<OCRResult>;
    processDocument(filePath: string): Promise<DocumentProcessingResult>;
    private processPDF;
    private cleanExtractedText;
    extractTextFromMedicalDocument(filePath: string, documentType?: 'prescription' | 'lab_report' | 'clinical_note' | 'discharge_summary'): Promise<DocumentProcessingResult>;
    private enhanceTextForMedicalType;
    private enhancePrescriptionText;
    private enhanceLabReportText;
    private enhanceClinicalNoteText;
    private enhanceDischargeText;
    terminate(): Promise<void>;
    getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low';
    validateMedicalDocument(text: string): Promise<{
        isValid: boolean;
        confidence: number;
        issues: string[];
    }>;
}
//# sourceMappingURL=ocr-service.d.ts.map