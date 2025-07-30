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
    error?: string;
}
export interface BioClinicalModelInfo {
    modelName: string;
    isLoaded: boolean;
    device: string;
    supportedEntities: string[];
    torchVersion: string;
    entityMapping: Record<string, string>;
}
/**
 * Connection service for BioClinical-Server MCP integration
 * Handles communication with the Clinical-AI-Apollo/Medical-NER model server
 */
export declare class BioClinicalServerConnection {
    private baseUrl;
    private sessionId;
    private isInitialized;
    private requestId;
    private connectionTimeout;
    private healthCheckTimeout;
    constructor(baseUrl?: string);
    /**
     * Establish connection to BioClinical-Server
     * Performs health check, MCP initialization, and tool discovery
     */
    connect(): Promise<void>;
    /**
     * Extract medical entities from text using BioClinical-Server
     * @param text - Text to analyze for medical entities
     * @param confidenceThreshold - Minimum confidence score (0.0-1.0)
     * @param entityTypes - Optional filter for specific entity types
     * @returns Promise<BioClinicalResult>
     */
    extractMedicalEntities(text: string, confidenceThreshold?: number, entityTypes?: string[]): Promise<BioClinicalResult>;
    /**
     * Get information about the loaded BioClinical model
     * @returns Promise<BioClinicalModelInfo>
     */
    getModelInfo(): Promise<BioClinicalModelInfo>;
    /**
     * Check if the connection is active and healthy
     * @returns Promise<boolean>
     */
    isConnected(): Promise<boolean>;
    /**
     * Disconnect from the BioClinical server
     */
    disconnect(): Promise<void>;
    /**
     * Get connection status and statistics
     */
    getConnectionInfo(): {
        baseUrl: string;
        isInitialized: boolean;
        hasSession: boolean;
        sessionId: string | null;
    };
    /**
     * Check server health and availability
     */
    private checkServerHealth;
    /**
     * Send MCP request to the server
     */
    private sendRequest;
    /**
     * Send MCP notification (no response expected)
     */
    private sendNotification;
    /**
     * Validate text input for entity extraction
     */
    private validateTextInput;
    /**
     * Retry mechanism for failed requests
     */
    private retryRequest;
    /**
     * Batch entity extraction for multiple texts
     */
    extractMedicalEntitiesBatch(texts: string[], confidenceThreshold?: number, entityTypes?: string[]): Promise<BioClinicalResult[]>;
}
//# sourceMappingURL=bioclinical-server-connection.d.ts.map