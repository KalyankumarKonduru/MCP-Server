import { MedicalEntity } from '../db/mongodb-client.js';
import { AidboxClient } from './aidbox-client.js';
export interface ExtractedFHIRData {
    patient?: {
        name?: {
            given?: string[];
            family?: string;
        };
        birthDate?: string;
        gender?: string;
        identifier?: {
            system: string;
            value: string;
        }[];
        telecom?: {
            system: string;
            value: string;
            use?: string;
        }[];
        address?: any[];
    };
    observations?: Array<{
        code: {
            coding: any[];
            text: string;
        };
        value?: any;
        effectiveDateTime?: string;
        status: string;
        category?: any[];
    }>;
    conditions?: Array<{
        code: {
            coding: any[];
            text: string;
        };
        clinicalStatus?: {
            coding: any[];
        };
        verificationStatus?: {
            coding: any[];
        };
        onsetDateTime?: string;
        recordedDate?: string;
    }>;
    medications?: Array<{
        medicationCodeableConcept?: {
            coding: any[];
            text: string;
        };
        status: string;
        intent: string;
        dosageInstruction?: any[];
        authoredOn?: string;
    }>;
    procedures?: Array<{
        code: {
            coding: any[];
            text: string;
        };
        status: string;
        performedDateTime?: string;
        performedPeriod?: any;
    }>;
}
export declare class FHIRExtractionService {
    private aidboxClient;
    private openaiApiKey?;
    private openai?;
    constructor(aidboxClient: AidboxClient, openaiApiKey?: string | undefined);
    /**
     * Extract FHIR-structured data from medical text using NER entities
     */
    extractFHIRData(text: string, entities: MedicalEntity[], metadata?: any): Promise<ExtractedFHIRData>;
    /**
     * Create or update FHIR resources in Aidbox
     */
    syncToAidbox(extractedData: ExtractedFHIRData, patientId?: string, documentId?: string): Promise<{
        patientId: string;
        resourceIds: Record<string, string[]>;
        errors: any[];
    }>;
    private groupEntitiesByType;
    private extractPatientData;
    private extractObservations;
    private extractConditions;
    private extractMedications;
    private extractProcedures;
    private findOrCreatePatient;
    private extractDateFromContext;
    private parseDate;
    private enhanceWithLLM;
}
//# sourceMappingURL=fhir-extraction-service.d.ts.map