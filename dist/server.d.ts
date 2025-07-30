export declare class MedicalMCPServer {
    private server;
    private app?;
    private mongoClient;
    private localEmbeddingService;
    private ocrService;
    private pdfService;
    private documentTools;
    private medicalTools;
    private localEmbeddingTools;
    private bioClinicalConnection;
    private sessions;
    constructor();
    private setupHandlers;
    private handleExtractText;
    private handleSearchByDiagnosis;
    private handleSemanticSearch;
    private handleGetPatientSummary;
    start(): Promise<void>;
    private startStreamableHTTPServer;
    private cleanupExpiredSessions;
    private startStdioServer;
    private logServerInfo;
    stop(): Promise<void>;
    private cleanup;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        services: Record<string, boolean>;
        sessions: number;
        timestamp: string;
    }>;
    getStatistics(): Promise<{
        documentsCount: number;
        toolsAvailable: number;
        embeddingModel: string;
        uptime: number;
        sessions: number;
    }>;
    getSessionInfo(): Array<{
        id: string;
        initialized: boolean;
        lastAccess: Date;
        age: number;
    }>;
}
//# sourceMappingURL=server.d.ts.map