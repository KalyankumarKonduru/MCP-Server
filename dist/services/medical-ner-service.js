"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMedicalEntities = extractMedicalEntities;
// Medical patterns for entity extraction
const PATTERNS = {
    // Patient patterns
    patientName: /(?:Patient(?:\s+Name)?:\s*|Name:\s*)([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    dob: /(?:DOB|Date of Birth|Birth Date):\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    mrn: /(?:MRN|Medical Record Number|Medical Record #):\s*([A-Z0-9\-]+)/gi,
    age: /(?:Age:\s*|Patient Age:\s*)(\d{1,3})\s*(?:years?|yrs?|y\.o\.)/gi,
    // Diagnosis patterns
    diagnosis: /(?:Diagnosis|Dx|Impression|Assessment):\s*(.+?)(?=\n|$)/gi,
    icd10: /\b([A-Z]\d{2}(?:\.\d{1,2})?)\b/g,
    // Medication patterns
    medication: /(?:Medication|Rx|Prescribed):\s*(.+?)(?=\n|$)/gi,
    dosagePattern: /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?)/gi,
    // Lab result patterns
    labResult: /([A-Za-z\s]+?):\s*(\d+(?:\.\d+)?)\s*([a-zA-Z/%]+)?(?:\s*\((?:Normal|Reference):\s*([0-9\-\.<>]+)\))?/g,
    // Vital signs patterns
    bloodPressure: /(?:BP|Blood Pressure):\s*(\d{2,3}\/\d{2,3})/gi,
    heartRate: /(?:HR|Heart Rate|Pulse):\s*(\d{2,3})\s*(?:bpm|beats?\/min)?/gi,
    temperature: /(?:Temp|Temperature):\s*(\d{2,3}(?:\.\d)?)\s*°?[FC]/gi,
    respiratoryRate: /(?:RR|Resp(?:iratory)? Rate):\s*(\d{1,2})\s*(?:breaths?\/min)?/gi,
};
async function extractMedicalEntities(text, includeConfidence = true) {
    const entities = {
        patientInfo: {},
        diagnoses: [],
        medications: [],
        labResults: [],
        vitalSigns: []
    };
    // Extract patient information
    const nameMatch = PATTERNS.patientName.exec(text);
    if (nameMatch)
        entities.patientInfo.name = nameMatch[1];
    const dobMatch = PATTERNS.dob.exec(text);
    if (dobMatch)
        entities.patientInfo.dob = dobMatch[1];
    const mrnMatch = PATTERNS.mrn.exec(text);
    if (mrnMatch)
        entities.patientInfo.mrn = mrnMatch[1];
    const ageMatch = PATTERNS.age.exec(text);
    if (ageMatch)
        entities.patientInfo.age = ageMatch[1];
    // Extract diagnoses
    const diagnosisMatches = text.matchAll(PATTERNS.diagnosis);
    for (const match of diagnosisMatches) {
        const diagnosisText = match[1].trim();
        const conditions = diagnosisText.split(/[,;]/).map(c => c.trim());
        for (const condition of conditions) {
            if (condition.length > 5) { // Filter out very short matches
                const diagnosis = {
                    condition,
                    confidence: includeConfidence ? 0.85 : undefined
                };
                // Check for ICD-10 codes
                const icdMatch = PATTERNS.icd10.exec(condition);
                if (icdMatch) {
                    diagnosis.icd10 = icdMatch[1];
                    diagnosis.confidence = includeConfidence ? 0.95 : undefined;
                }
                // Determine severity based on keywords
                if (/acute|severe|critical/i.test(condition)) {
                    diagnosis.severity = 'acute';
                }
                else if (/chronic|persistent|long-term/i.test(condition)) {
                    diagnosis.severity = 'chronic';
                }
                entities.diagnoses.push(diagnosis);
            }
        }
    }
    // Extract medications (continued)
    const medMatches = text.matchAll(PATTERNS.medication);
    for (const match of medMatches) {
        const medText = match[1].trim();
        const medications = medText.split(/[,;]/).map(m => m.trim());
        for (const med of medications) {
            if (med.length > 3) {
                const medication = {
                    name: med.split(/\s+/)[0], // First word is usually the drug name
                    confidence: includeConfidence ? 0.8 : undefined
                };
                // Extract dosage
                const dosageMatch = PATTERNS.dosagePattern.exec(med);
                if (dosageMatch) {
                    medication.dosage = `${dosageMatch[1]} ${dosageMatch[2]}`;
                    medication.confidence = includeConfidence ? 0.9 : undefined;
                }
                // Extract frequency
                if (/daily|once a day|qd/i.test(med)) {
                    medication.frequency = 'daily';
                }
                else if (/twice a day|bid|b\.i\.d\./i.test(med)) {
                    medication.frequency = 'twice daily';
                }
                else if (/three times|tid|t\.i\.d\./i.test(med)) {
                    medication.frequency = 'three times daily';
                }
                else if (/four times|qid|q\.i\.d\./i.test(med)) {
                    medication.frequency = 'four times daily';
                }
                // Extract route
                if (/\boral|PO|by mouth\b/i.test(med)) {
                    medication.route = 'oral';
                }
                else if (/\bIV|intravenous\b/i.test(med)) {
                    medication.route = 'IV';
                }
                else if (/\bIM|intramuscular\b/i.test(med)) {
                    medication.route = 'IM';
                }
                entities.medications.push(medication);
            }
        }
    }
    // Extract lab results
    const labMatches = text.matchAll(PATTERNS.labResult);
    for (const match of labMatches) {
        const [_, testName, value, unit, normalRange] = match;
        const labResult = {
            testName: testName.trim(),
            value: value.trim(),
            unit: unit?.trim() || '',
            normalRange: normalRange?.trim(),
            abnormal: false,
            confidence: includeConfidence ? 0.85 : undefined
        };
        // Check if abnormal based on common indicators
        if (normalRange) {
            const numValue = parseFloat(value);
            if (normalRange.includes('-')) {
                const [min, max] = normalRange.split('-').map(n => parseFloat(n));
                labResult.abnormal = numValue < min || numValue > max;
            }
        }
        // Also check for explicit abnormal indicators
        const surroundingText = text.substring(match.index - 20, match.index + match[0].length + 20);
        if (/\b(high|elevated|low|decreased|abnormal)\b/i.test(surroundingText)) {
            labResult.abnormal = true;
        }
        entities.labResults.push(labResult);
    }
    // Extract vital signs
    // Blood Pressure
    const bpMatches = text.matchAll(PATTERNS.bloodPressure);
    for (const match of bpMatches) {
        entities.vitalSigns.push({
            type: 'Blood Pressure',
            value: match[1],
            unit: 'mmHg'
        });
    }
    // Heart Rate
    const hrMatches = text.matchAll(PATTERNS.heartRate);
    for (const match of hrMatches) {
        entities.vitalSigns.push({
            type: 'Heart Rate',
            value: match[1],
            unit: 'bpm'
        });
    }
    // Temperature
    const tempMatches = text.matchAll(PATTERNS.temperature);
    for (const match of tempMatches) {
        entities.vitalSigns.push({
            type: 'Temperature',
            value: match[1],
            unit: match[0].includes('F') ? '°F' : '°C'
        });
    }
    // Respiratory Rate
    const rrMatches = text.matchAll(PATTERNS.respiratoryRate);
    for (const match of rrMatches) {
        entities.vitalSigns.push({
            type: 'Respiratory Rate',
            value: match[1],
            unit: 'breaths/min'
        });
    }
    return entities;
}
//# sourceMappingURL=medical-ner-service.js.map