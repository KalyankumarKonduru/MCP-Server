interface MedicalEntities {
    patientInfo: {
        name?: string;
        dob?: string;
        mrn?: string;
        age?: string;
    };
    diagnoses: Array<{
        condition: string;
        icd10?: string;
        date?: string;
        severity?: string;
        confidence?: number;
    }>;
    medications: Array<{
        name: string;
        dosage?: string;
        frequency?: string;
        route?: string;
        confidence?: number;
    }>;
    labResults: Array<{
        testName: string;
        value: string;
        unit?: string;
        normalRange?: string;
        abnormal: boolean;
        date?: string;
        confidence?: number;
    }>;
    vitalSigns: Array<{
        type: string;
        value: string;
        unit: string;
        date?: string;
    }>;
}
export declare function extractMedicalEntities(text: string, includeConfidence?: boolean): Promise<MedicalEntities>;
export {};
//# sourceMappingURL=medical-ner-service.d.ts.map