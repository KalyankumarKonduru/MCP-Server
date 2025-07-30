import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient } from '../db/mongodb-client.js';
import { BioClinicalServerConnection } from '../services/bioclinical-server-connection.js';
import { LocalEmbeddingService } from '../services/local-embedding-service.js';
export interface ExtractMedicalEntitiesRequest {
    text: string;
    documentId?: string;
    entityTypes?: string[];
    confidenceThreshold?: number;
}
export interface FindSimilarCasesRequest {
    patientId?: string;
    documentId?: string;
    symptoms?: string[];
    conditions?: string[];
    medications?: string[];
    limit?: number;
}
export interface AnalyzePatientHistoryRequest {
    patientId: string;
    analysisType?: 'timeline' | 'summary' | 'trends';
    dateRange?: {
        start: string;
        end: string;
    };
}
export interface MedicalInsightsRequest {
    query: string;
    context?: {
        patientAge?: number;
        gender?: string;
        conditions?: string[];
        medications?: string[];
    };
    limit?: number;
}
/**
 * Medical Tools using BioClinical-Server for enhanced medical entity extraction
 * Provides backward compatibility with legacy interfaces while using state-of-the-art models
 */
export declare class MedicalTools {
    private mongoClient;
    private bioClinicalConnection;
    private embeddingService;
    constructor(mongoClient: MongoDBClient, bioClinicalConnection: BioClinicalServerConnection, embeddingService: LocalEmbeddingService);
    createExtractMedicalEntitiesTool(): Tool;
    handleExtractMedicalEntities(args: ExtractMedicalEntitiesRequest): Promise<any>;
    createFindSimilarCasesTool(): Tool;
    handleFindSimilarCases(args: FindSimilarCasesRequest): Promise<any>;
    createAnalyzePatientHistoryTool(): Tool;
    handleAnalyzePatientHistory(args: AnalyzePatientHistoryRequest): Promise<any>;
    createGetMedicalInsightsTool(): Tool;
    handleGetMedicalInsights(args: MedicalInsightsRequest): Promise<any>;
    private generateTimeline;
    private generateSummary;
    private generateTrends;
    private getDocumentTypeDistribution;
    private getTopEntities;
    private extractInsight;
    private calculateRelevanceScore;
    getAllTools(): Tool[];
}
//# sourceMappingURL=medical-tools.d.ts.map