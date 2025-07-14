export declare class MedicalMCPServer {
    private server;
    private mongoClient;
    private localEmbeddingService;
    private nerService;
    private ocrService;
    private pdfService;
    private documentTools;
    private medicalTools;
    private localEmbeddingTools;
    constructor();
    private setupHandlers;
    private handleToolCall;
    private handleExtractText;
    private handleSearchByDiagnosis;
    private handleSemanticSearch;
    private handleGetPatientSummary;
    start(): Promise<void>;
    private logServerInfo;
    stop(): Promise<void>;
    private cleanup;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        services: Record<string, boolean>;
        timestamp: string;
    }>;
    getStatistics(): Promise<{
        documentsCount: number;
        toolsAvailable: number;
        embeddingModel: string;
        uptime: number;
    }>;
}
//# sourceMappingURL=server.d.ts.map