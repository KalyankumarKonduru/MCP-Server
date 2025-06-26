export interface MedicalEntity {
    text: string;
    label: string;
    confidence: number;
    start: number;
    end: number;
    context?: string;
}
export interface NERResult {
    entities: MedicalEntity[];
    processedText: string;
    confidence: number;
}
export declare class MedicalNERService {
    private medicalTerms;
    private drugPatterns;
    private conditionPatterns;
    private procedurePatterns;
    constructor();
    private initializeMedicalTerms;
    private initializePatterns;
    extractEntities(text: string): Promise<NERResult>;
    private extractByTerms;
    private extractByPatterns;
    private extractByNLP;
    private getContext;
    private isMedicalMeasurement;
    private deduplicateEntities;
    extractMedicalEntitiesFromDocument(title: string, content: string): Promise<MedicalEntity[]>;
    getEntityTypes(): string[];
    filterEntitiesByType(entities: MedicalEntity[], type: string): MedicalEntity[];
    getEntityStatistics(entities: MedicalEntity[]): Record<string, number>;
}
//# sourceMappingURL=medical-ner-service.d.ts.map