export interface BioClinicalEntity {
    text: string;
    label: 'PROBLEM' | 'TREATMENT' | 'TEST';
    confidence: number;
    start: number;
    end: number;
    context?: string;
}
export interface BioClinicalResult {
    success: boolean;
    entitiesFound: number;
    confidence: number;
    processingTimeMs: number;
    model: string;
    entities: BioClinicalEntity[];
}
export declare class BioClinicalServerConnection {
    private baseUrl;
    private sessionId;
    private isInitialized;
    private requestId;
    constructor(baseUrl?: string);
    connect(): Promise<void>;
    extractMedicalEntities(text: string, confidenceThreshold?: number, entityTypes?: string[]): Promise<BioClinicalResult>;
    getModelInfo(): Promise<any>;
    private checkServerHealth;
    private sendRequest;
    private sendNotification;
}
//# sourceMappingURL=bioclinical-server-connection.d.ts.map