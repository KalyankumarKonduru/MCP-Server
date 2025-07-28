import OpenAI from 'openai';
export class FHIRExtractionService {
    aidboxClient;
    openaiApiKey;
    openai;
    constructor(aidboxClient, openaiApiKey) {
        this.aidboxClient = aidboxClient;
        this.openaiApiKey = openaiApiKey;
        if (this.openaiApiKey) {
            this.openai = new OpenAI({ apiKey: this.openaiApiKey });
        }
    }
    /**
     * Extract FHIR-structured data from medical text using NER entities
     */
    async extractFHIRData(text, entities, metadata) {
        console.log(`🔍 Extracting FHIR data from ${entities.length} entities`);
        // Group entities by type
        const entityGroups = this.groupEntitiesByType(entities);
        // Extract structured data
        const extracted = {
            observations: this.extractObservations(entityGroups, text),
            conditions: this.extractConditions(entityGroups, text),
            medications: this.extractMedications(entityGroups, text),
            procedures: this.extractProcedures(entityGroups, text)
        };
        // Extract patient data if present
        const patientData = this.extractPatientData(entityGroups, text);
        if (patientData) {
            extracted.patient = patientData;
        }
        // If we have OpenAI API, use it for better extraction
        if (this.openai) {
            const enhanced = await this.enhanceWithLLM(text, entities, extracted);
            return enhanced;
        }
        console.log(`✅ Extracted: ${extracted.observations?.length || 0} observations, ${extracted.conditions?.length || 0} conditions, ${extracted.medications?.length || 0} medications`);
        return extracted;
    }
    /**
     * Create or update FHIR resources in Aidbox
     */
    async syncToAidbox(extractedData, patientId, documentId) {
        const errors = [];
        const resourceIds = {
            observations: [],
            conditions: [],
            medications: [],
            procedures: []
        };
        try {
            // Create or find patient
            if (!patientId && extractedData.patient) {
                const patient = await this.findOrCreatePatient(extractedData.patient);
                patientId = patient.id;
            }
            if (!patientId) {
                throw new Error('No patient ID provided and could not extract patient data');
            }
            console.log(`🏥 Syncing to Aidbox for patient: ${patientId}`);
            // Create observations
            if (extractedData.observations && extractedData.observations.length > 0) {
                console.log(`📊 Creating ${extractedData.observations.length} observations...`);
                for (const obs of extractedData.observations) {
                    try {
                        const resource = await this.aidboxClient.create('Observation', {
                            resourceType: 'Observation',
                            ...obs,
                            subject: { reference: `Patient/${patientId}` },
                            meta: {
                                tag: [{
                                        system: 'http://medplum.com/document-source',
                                        code: documentId || 'unknown'
                                    }]
                            }
                        });
                        resourceIds.observations.push(resource.id);
                    }
                    catch (error) {
                        console.error('Failed to create observation:', error.message);
                        errors.push({ type: 'Observation', error: error.message, data: obs });
                    }
                }
            }
            // Create conditions
            if (extractedData.conditions && extractedData.conditions.length > 0) {
                console.log(`🏥 Creating ${extractedData.conditions.length} conditions...`);
                for (const condition of extractedData.conditions) {
                    try {
                        const resource = await this.aidboxClient.create('Condition', {
                            resourceType: 'Condition',
                            ...condition,
                            subject: { reference: `Patient/${patientId}` },
                            meta: {
                                tag: [{
                                        system: 'http://medplum.com/document-source',
                                        code: documentId || 'unknown'
                                    }]
                            }
                        });
                        resourceIds.conditions.push(resource.id);
                    }
                    catch (error) {
                        console.error('Failed to create condition:', error.message);
                        errors.push({ type: 'Condition', error: error.message, data: condition });
                    }
                }
            }
            // Create medication requests
            if (extractedData.medications && extractedData.medications.length > 0) {
                console.log(`💊 Creating ${extractedData.medications.length} medication requests...`);
                for (const med of extractedData.medications) {
                    try {
                        const resource = await this.aidboxClient.create('MedicationRequest', {
                            resourceType: 'MedicationRequest',
                            ...med,
                            subject: { reference: `Patient/${patientId}` },
                            requester: {
                                reference: 'Practitioner/system-extraction'
                            },
                            meta: {
                                tag: [{
                                        system: 'http://medplum.com/document-source',
                                        code: documentId || 'unknown'
                                    }]
                            }
                        });
                        resourceIds.medications.push(resource.id);
                    }
                    catch (error) {
                        console.error('Failed to create medication request:', error.message);
                        errors.push({ type: 'MedicationRequest', error: error.message, data: med });
                    }
                }
            }
            // Create procedures
            if (extractedData.procedures && extractedData.procedures.length > 0) {
                console.log(`🔧 Creating ${extractedData.procedures.length} procedures...`);
                for (const proc of extractedData.procedures) {
                    try {
                        const resource = await this.aidboxClient.create('Procedure', {
                            resourceType: 'Procedure',
                            ...proc,
                            subject: { reference: `Patient/${patientId}` },
                            meta: {
                                tag: [{
                                        system: 'http://medplum.com/document-source',
                                        code: documentId || 'unknown'
                                    }]
                            }
                        });
                        resourceIds.procedures.push(resource.id);
                    }
                    catch (error) {
                        console.error('Failed to create procedure:', error.message);
                        errors.push({ type: 'Procedure', error: error.message, data: proc });
                    }
                }
            }
            console.log(`✅ Sync complete: Created ${Object.values(resourceIds).flat().length} resources with ${errors.length} errors`);
            return { patientId, resourceIds, errors };
        }
        catch (error) {
            console.error('Failed to sync to Aidbox:', error);
            throw new Error(`Failed to sync to Aidbox: ${error}`);
        }
    }
    groupEntitiesByType(entities) {
        return entities.reduce((groups, entity) => {
            const type = entity.label.toLowerCase();
            if (!groups[type])
                groups[type] = [];
            groups[type].push(entity);
            return groups;
        }, {});
    }
    extractPatientData(entityGroups, text) {
        const patient = {};
        // Extract person names
        const personEntities = entityGroups['person'] || [];
        if (personEntities.length > 0) {
            // Simple heuristic: first person entity might be the patient
            const nameParts = personEntities[0].text.split(' ');
            patient.name = {
                given: nameParts.slice(0, -1),
                family: nameParts[nameParts.length - 1]
            };
        }
        // Extract dates that might be birth dates
        const dateEntities = entityGroups['date'] || [];
        for (const dateEntity of dateEntities) {
            // Look for birth date patterns
            const context = text.substring(Math.max(0, dateEntity.start - 50), dateEntity.end + 50).toLowerCase();
            if (context.includes('birth') || context.includes('born') || context.includes('dob')) {
                patient.birthDate = this.parseDate(dateEntity.text);
            }
        }
        // Extract identifiers (MRN, SSN, etc.)
        const idPattern = /(?:mrn|medical record number|patient id)[\s:]*(\w+)/i;
        const idMatch = text.match(idPattern);
        if (idMatch) {
            patient.identifier = [{
                    system: 'http://hospital.local/mrn',
                    value: idMatch[1]
                }];
        }
        return Object.keys(patient).length > 0 ? patient : null;
    }
    extractObservations(entityGroups, text) {
        const observations = [];
        // Lab values and test results
        const labEntities = [
            ...(entityGroups['test_result'] || []),
            ...(entityGroups['lab_value'] || []),
            ...(entityGroups['diagnostic_procedure'] || [])
        ];
        for (const entity of labEntities) {
            // Extract value if present - look for patterns like "140 mg/dl", "7.5%", etc.
            const valuePattern = /(\d+\.?\d*)\s*(mg\/dl|mmol\/l|%|units?|iu|mcg|ng|pg|ml|l|g|mg|kg|mmhg|bpm)?/i;
            const contextWindow = 50;
            const valueContext = text.substring(entity.end, Math.min(text.length, entity.end + contextWindow));
            const valueMatch = valueContext.match(valuePattern);
            const observation = {
                code: {
                    coding: [{
                            system: 'http://loinc.org',
                            display: entity.text
                        }],
                    text: entity.text
                },
                status: 'final',
                effectiveDateTime: this.extractDateFromContext(text, entity.start) || new Date().toISOString()
            };
            if (valueMatch) {
                observation.valueQuantity = {
                    value: parseFloat(valueMatch[1]),
                    unit: valueMatch[2] || 'unit',
                    system: 'http://unitsofmeasure.org',
                    code: valueMatch[2] || 'unit'
                };
            }
            // Determine category based on entity text
            if (entity.text.toLowerCase().includes('blood') ||
                entity.text.toLowerCase().includes('glucose') ||
                entity.text.toLowerCase().includes('cholesterol')) {
                observation.category = [{
                        coding: [{
                                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                                code: 'laboratory',
                                display: 'Laboratory'
                            }]
                    }];
            }
            observations.push(observation);
        }
        // Vital signs
        const vitalEntities = entityGroups['vital_sign'] || [];
        for (const entity of vitalEntities) {
            const observation = {
                code: {
                    coding: [{
                            system: 'http://loinc.org',
                            display: entity.text
                        }],
                    text: entity.text
                },
                status: 'final',
                category: [{
                        coding: [{
                                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                                code: 'vital-signs',
                                display: 'Vital Signs'
                            }]
                    }],
                effectiveDateTime: new Date().toISOString()
            };
            // Extract vital sign values
            const valuePattern = /(\d+\.?\d*)\s*(\/\s*\d+)?/;
            const valueMatch = entity.text.match(valuePattern);
            if (valueMatch) {
                observation.valueQuantity = {
                    value: parseFloat(valueMatch[1]),
                    system: 'http://unitsofmeasure.org'
                };
                // Determine unit based on vital sign type
                if (entity.text.toLowerCase().includes('pressure')) {
                    observation.valueQuantity.unit = 'mmHg';
                    observation.valueQuantity.code = 'mm[Hg]';
                }
                else if (entity.text.toLowerCase().includes('temperature')) {
                    observation.valueQuantity.unit = '°F';
                    observation.valueQuantity.code = '[degF]';
                }
                else if (entity.text.toLowerCase().includes('pulse') || entity.text.toLowerCase().includes('heart rate')) {
                    observation.valueQuantity.unit = 'bpm';
                    observation.valueQuantity.code = '/min';
                }
            }
            observations.push(observation);
        }
        return observations;
    }
    extractConditions(entityGroups, text) {
        const conditions = [];
        const conditionEntities = [
            ...(entityGroups['disease_disorder'] || []),
            ...(entityGroups['diagnosis'] || []),
            ...(entityGroups['problem'] || []),
            ...(entityGroups['symptom'] || [])
        ];
        // De-duplicate conditions by text
        const uniqueConditions = new Map();
        for (const entity of conditionEntities) {
            const key = entity.text.toLowerCase();
            if (!uniqueConditions.has(key) || entity.confidence > uniqueConditions.get(key).confidence) {
                uniqueConditions.set(key, entity);
            }
        }
        for (const entity of uniqueConditions.values()) {
            const condition = {
                code: {
                    coding: [{
                            system: 'http://snomed.info/sct',
                            display: entity.text
                        }],
                    text: entity.text
                },
                clinicalStatus: {
                    coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                            code: 'active',
                            display: 'Active'
                        }]
                },
                verificationStatus: {
                    coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
                            code: entity.label === 'symptom' ? 'provisional' : 'confirmed',
                            display: entity.label === 'symptom' ? 'Provisional' : 'Confirmed'
                        }]
                },
                recordedDate: new Date().toISOString()
            };
            // Extract onset date if mentioned
            const onsetDate = this.extractDateFromContext(text, entity.start);
            if (onsetDate) {
                condition.onsetDateTime = onsetDate;
            }
            conditions.push(condition);
        }
        return conditions;
    }
    extractMedications(entityGroups, text) {
        const medications = [];
        const medEntities = [
            ...(entityGroups['medication'] || []),
            ...(entityGroups['drug'] || []),
            ...(entityGroups['treatment'] || [])
        ];
        for (const entity of medEntities) {
            // Extract dosage information from surrounding context
            const contextWindow = 100;
            const afterContext = text.substring(entity.end, Math.min(text.length, entity.end + contextWindow));
            // Look for dosage patterns
            const dosagePattern = /(\d+\.?\d*)\s*(mg|mcg|g|ml|units?|tablets?|caps?|pills?)/i;
            const frequencyPattern = /(once|twice|three times|four times|q\d+h|bid|tid|qid|prn|daily|every \d+ hours?)/i;
            const dosageMatch = afterContext.match(dosagePattern);
            const frequencyMatch = afterContext.match(frequencyPattern);
            const medication = {
                medicationCodeableConcept: {
                    coding: [{
                            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                            display: entity.text
                        }],
                    text: entity.text
                },
                status: 'active',
                intent: 'order',
                authoredOn: new Date().toISOString()
            };
            // Add dosage instruction if found
            if (dosageMatch || frequencyMatch) {
                medication.dosageInstruction = [{
                        text: `${entity.text} ${dosageMatch?.[0] || ''} ${frequencyMatch?.[0] || ''}`.trim()
                    }];
                if (dosageMatch) {
                    medication.dosageInstruction[0].doseAndRate = [{
                            doseQuantity: {
                                value: parseFloat(dosageMatch[1]),
                                unit: dosageMatch[2],
                                system: 'http://unitsofmeasure.org'
                            }
                        }];
                }
                if (frequencyMatch) {
                    medication.dosageInstruction[0].timing = {
                        code: {
                            text: frequencyMatch[0]
                        }
                    };
                }
            }
            medications.push(medication);
        }
        return medications;
    }
    extractProcedures(entityGroups, text) {
        const procedures = [];
        const procEntities = [
            ...(entityGroups['therapeutic_procedure'] || []),
            ...(entityGroups['surgery'] || []),
            ...(entityGroups['procedure'] || [])
        ];
        for (const entity of procEntities) {
            const procedure = {
                code: {
                    coding: [{
                            system: 'http://snomed.info/sct',
                            display: entity.text
                        }],
                    text: entity.text
                },
                status: 'completed'
            };
            // Extract date if mentioned
            const performedDate = this.extractDateFromContext(text, entity.start);
            if (performedDate) {
                procedure.performedDateTime = performedDate;
            }
            else {
                // Default to document date
                procedure.performedDateTime = new Date().toISOString();
            }
            procedures.push(procedure);
        }
        return procedures;
    }
    async findOrCreatePatient(patientData) {
        // Try to find existing patient by identifier
        if (patientData.identifier?.length > 0) {
            try {
                const searchResult = await this.aidboxClient.search('Patient', {
                    identifier: patientData.identifier[0].value
                });
                if (searchResult.entry?.length > 0) {
                    console.log(`Found existing patient: ${searchResult.entry[0].resource.id}`);
                    return searchResult.entry[0].resource;
                }
            }
            catch (error) {
                console.error('Error searching for patient:', error);
            }
        }
        // Create new patient
        console.log('Creating new patient...');
        return await this.aidboxClient.create('Patient', {
            resourceType: 'Patient',
            ...patientData
        });
    }
    extractDateFromContext(text, position) {
        // Look for dates within 100 characters of the entity
        const contextWindow = 100;
        const start = Math.max(0, position - contextWindow);
        const end = Math.min(text.length, position + contextWindow);
        const context = text.substring(start, end);
        // Date patterns to look for
        const datePatterns = [
            // MM/DD/YYYY or MM-DD-YYYY
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
            // YYYY-MM-DD
            /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
            // Month DD, YYYY
            /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
            // DD Month YYYY
            /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
        ];
        for (const pattern of datePatterns) {
            const match = context.match(pattern);
            if (match) {
                try {
                    // Parse the date based on the pattern
                    let date;
                    if (pattern.source.includes('January')) {
                        // Month name patterns
                        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
                        const monthIndex = monthNames.findIndex(m => match[0].toLowerCase().includes(m));
                        const day = parseInt(match[0].match(/\d{1,2}/)?.[0] || '1');
                        const year = parseInt(match[0].match(/\d{4}/)?.[0] || new Date().getFullYear().toString());
                        date = new Date(year, monthIndex, day);
                    }
                    else {
                        // Numeric patterns
                        date = new Date(match[0]);
                    }
                    if (!isNaN(date.getTime())) {
                        return date.toISOString();
                    }
                }
                catch (e) {
                    // Invalid date, continue
                }
            }
        }
        return null;
    }
    parseDate(dateStr) {
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
            }
        }
        catch (e) {
            // Invalid date
        }
        return null;
    }
    async enhanceWithLLM(text, entities, initialExtraction) {
        if (!this.openai) {
            return initialExtraction;
        }
        try {
            const prompt = `You are a medical data extraction expert. Given the following medical text and extracted entities, enhance the FHIR resource extraction with proper medical coding and structure.

Medical Text:
${text.substring(0, 2000)}

Extracted Entities:
${JSON.stringify(entities.slice(0, 20), null, 2)}

Current Extraction:
${JSON.stringify(initialExtraction, null, 2)}

Please enhance the extraction by:
1. Adding proper LOINC codes for observations where possible
2. Adding SNOMED CT codes for conditions where possible
3. Adding RxNorm codes for medications where possible
4. Extracting any missed patient demographic information
5. Improving date extraction and temporal relationships

Return the enhanced FHIR data in the same JSON format.`;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            });
            const enhanced = JSON.parse(response.choices[0].message.content || '{}');
            return enhanced;
        }
        catch (error) {
            console.error('LLM enhancement failed:', error);
            return initialExtraction;
        }
    }
}
//# sourceMappingURL=fhir-extraction-service.js.map