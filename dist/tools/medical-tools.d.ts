import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient } from '../db/mongodb-client.js';
import { MedicalNERService } from '../services/medical-ner-service.js';
import { LocalEmbeddingService } from '../services/local-embedding-service.js';
export interface ExtractMedicalEntitiesRequest {
    text: string;
    documentId?: string;
    entityTypes?: string[];
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
export declare class MedicalTools {
    private mongoClient;
    private nerService;
    private embeddingService;
    constructor(mongoClient: MongoDBClient, nerService: MedicalNERService, embeddingService: LocalEmbeddingService);
    createExtractMedicalEntitiesTool(): Tool;
    handleExtractMedicalEntities(args: ExtractMedicalEntitiesRequest): Promise<any>;
    createFindSimilarCasesTool(): Tool;
    handleFindSimilarCases(args: FindSimilarCasesRequest): Promise<any>;
    createAnalyzePatientHistoryTool(): Tool;
    handleAnalyzePatientHistory(args: AnalyzePatientHistoryRequest): Promise<any>;
    createMedicalInsightsTool(): Tool;
    handleMedicalInsights(args: MedicalInsightsRequest): Promise<any>;
    private findCommonEntities;
    private generateTimeline;
    private generateSummary;
    private generateTrends;
    private getDocumentTypeDistribution;
    private getTopEntities;
    private extractInsight;
    getAllTools(): Tool[];
}
//# sourceMappingURL=medical-tools.d.ts.map