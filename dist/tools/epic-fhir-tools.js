"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpicFHIRTools = void 0;
class EpicFHIRTools {
    config;
    constructor(config) {
        this.config = {
            ...config,
            baseUrl: config.useSandbox
                ? 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4'
                : config.baseUrl
        };
    }
    // Tool 1: Search Patients
    createSearchPatientsTool() {
        return {
            name: 'searchPatients',
            description: 'Search for patients in Epic EHR system by name, birthdate, or identifier',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Patient name (first and/or last name)'
                    },
                    birthdate: {
                        type: 'string',
                        description: 'Patient birth date in YYYY-MM-DD format'
                    },
                    identifier: {
                        type: 'string',
                        description: 'Patient identifier (MRN, SSN, etc.)'
                    },
                    gender: {
                        type: 'string',
                        enum: ['male', 'female', 'other', 'unknown'],
                        description: 'Patient gender'
                    }
                }
            }
        };
    }
    async handleSearchPatients(args) {
        try {
            const searchParams = new URLSearchParams();
            if (args.name)
                searchParams.append('name', args.name);
            if (args.birthdate)
                searchParams.append('birthdate', args.birthdate);
            if (args.identifier)
                searchParams.append('identifier', args.identifier);
            if (args.gender)
                searchParams.append('gender', args.gender);
            const response = await this.makeRequest(`/Patient?${searchParams.toString()}`);
            if (!response.entry || response.entry.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                message: 'No patients found matching the search criteria',
                                patientsFound: 0,
                                patients: []
                            }, null, 2)
                        }]
                };
            }
            const patients = response.entry.map((entry) => {
                const patient = entry.resource;
                return {
                    id: patient.id,
                    name: this.formatPatientName(patient.name),
                    birthDate: patient.birthDate,
                    gender: patient.gender,
                    phone: this.extractPhone(patient.telecom),
                    address: this.formatAddress(patient.address),
                    mrn: this.extractMRN(patient.identifier),
                    active: patient.active
                };
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            patientsFound: patients.length,
                            searchCriteria: args,
                            patients
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return this.handleError('searchPatients', error);
        }
    }
    // Tool 2: Get Patient Details
    createGetPatientTool() {
        return {
            name: 'getPatientDetails',
            description: 'Get detailed information for a specific patient by ID',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'FHIR Patient ID',
                        minLength: 1
                    }
                },
                required: ['patientId']
            }
        };
    }
    async handleGetPatient(args) {
        try {
            const patient = await this.makeRequest(`/Patient/${args.patientId}`);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            patient: {
                                id: patient.id,
                                name: this.formatPatientName(patient.name),
                                birthDate: patient.birthDate,
                                gender: patient.gender,
                                maritalStatus: patient.maritalStatus?.text,
                                phone: this.extractPhone(patient.telecom),
                                email: this.extractEmail(patient.telecom),
                                address: this.formatAddress(patient.address),
                                mrn: this.extractMRN(patient.identifier),
                                active: patient.active,
                                generalPractitioner: patient.generalPractitioner?.map((gp) => gp.display),
                                communication: patient.communication?.map((comm) => comm.language.text)
                            }
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return this.handleError('getPatientDetails', error);
        }
    }
    // Tool 3: Get Patient Observations (Lab Results, Vitals)
    createGetObservationsTool() {
        return {
            name: 'getPatientObservations',
            description: 'Get lab results, vital signs, and other observations for a patient',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'FHIR Patient ID',
                        minLength: 1
                    },
                    category: {
                        type: 'string',
                        enum: ['vital-signs', 'laboratory', 'exam', 'imaging', 'survey'],
                        description: 'Type of observations to retrieve'
                    },
                    code: {
                        type: 'string',
                        description: 'Specific observation code (LOINC, SNOMED, etc.)'
                    },
                    date: {
                        type: 'string',
                        description: 'Date range in format YYYY-MM-DD or ge2023-01-01&le2023-12-31'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (default: 20)',
                        minimum: 1,
                        maximum: 100
                    }
                },
                required: ['patientId']
            }
        };
    }
    async handleGetObservations(args) {
        try {
            const searchParams = new URLSearchParams();
            searchParams.append('patient', args.patientId);
            searchParams.append('_sort', '-date');
            searchParams.append('_count', (args.limit || 20).toString());
            if (args.category)
                searchParams.append('category', args.category);
            if (args.code)
                searchParams.append('code', args.code);
            if (args.date)
                searchParams.append('date', args.date);
            const response = await this.makeRequest(`/Observation?${searchParams.toString()}`);
            if (!response.entry || response.entry.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                message: 'No observations found for this patient',
                                observationsFound: 0,
                                observations: []
                            }, null, 2)
                        }]
                };
            }
            const observations = response.entry.map((entry) => {
                const obs = entry.resource;
                return {
                    id: obs.id,
                    status: obs.status,
                    category: obs.category?.[0]?.text,
                    code: {
                        text: obs.code?.text,
                        coding: obs.code?.coding?.[0]
                    },
                    value: this.formatObservationValue(obs),
                    unit: obs.valueQuantity?.unit,
                    referenceRange: obs.referenceRange?.[0]?.text,
                    date: obs.effectiveDateTime || obs.effectivePeriod?.start,
                    performer: obs.performer?.[0]?.display,
                    interpretation: obs.interpretation?.[0]?.text
                };
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            observationsFound: observations.length,
                            patientId: args.patientId,
                            observations
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return this.handleError('getPatientObservations', error);
        }
    }
    // Tool 4: Get Patient Medications
    createGetMedicationsTool() {
        return {
            name: 'getPatientMedications',
            description: 'Get current and past medications for a patient',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'FHIR Patient ID',
                        minLength: 1
                    },
                    status: {
                        type: 'string',
                        enum: ['active', 'completed', 'stopped', 'on-hold', 'cancelled'],
                        description: 'Medication status filter'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (default: 20)',
                        minimum: 1,
                        maximum: 100
                    }
                },
                required: ['patientId']
            }
        };
    }
    async handleGetMedications(args) {
        try {
            const searchParams = new URLSearchParams();
            searchParams.append('patient', args.patientId);
            searchParams.append('_sort', '-_lastUpdated');
            searchParams.append('_count', (args.limit || 20).toString());
            if (args.status)
                searchParams.append('status', args.status);
            const response = await this.makeRequest(`/MedicationRequest?${searchParams.toString()}`);
            if (!response.entry || response.entry.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                message: 'No medications found for this patient',
                                medicationsFound: 0,
                                medications: []
                            }, null, 2)
                        }]
                };
            }
            const medications = response.entry.map((entry) => {
                const med = entry.resource;
                return {
                    id: med.id,
                    status: med.status,
                    medication: {
                        text: med.medicationCodeableConcept?.text,
                        coding: med.medicationCodeableConcept?.coding?.[0]
                    },
                    dosage: med.dosageInstruction?.map((dose) => ({
                        text: dose.text,
                        route: dose.route?.text,
                        timing: dose.timing?.repeat,
                        doseQuantity: dose.doseAndRate?.[0]?.doseQuantity
                    })),
                    prescriber: med.requester?.display,
                    authoredOn: med.authoredOn,
                    dispenseRequest: {
                        quantity: med.dispenseRequest?.quantity,
                        expectedSupplyDuration: med.dispenseRequest?.expectedSupplyDuration
                    },
                    substitution: med.substitution?.allowedBoolean
                };
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            medicationsFound: medications.length,
                            patientId: args.patientId,
                            medications
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return this.handleError('getPatientMedications', error);
        }
    }
    // Tool 5: Get Patient Conditions/Diagnoses
    createGetConditionsTool() {
        return {
            name: 'getPatientConditions',
            description: 'Get diagnoses and medical conditions for a patient',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'FHIR Patient ID',
                        minLength: 1
                    },
                    clinicalStatus: {
                        type: 'string',
                        enum: ['active', 'resolved', 'inactive'],
                        description: 'Filter by clinical status'
                    },
                    category: {
                        type: 'string',
                        description: 'Condition category (problem-list-item, encounter-diagnosis)'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (default: 20)',
                        minimum: 1,
                        maximum: 100
                    }
                },
                required: ['patientId']
            }
        };
    }
    async handleGetConditions(args) {
        try {
            const searchParams = new URLSearchParams();
            searchParams.append('patient', args.patientId);
            searchParams.append('_sort', '-onset-date');
            searchParams.append('_count', (args.limit || 20).toString());
            if (args.clinicalStatus)
                searchParams.append('clinical-status', args.clinicalStatus);
            if (args.category)
                searchParams.append('category', args.category);
            const response = await this.makeRequest(`/Condition?${searchParams.toString()}`);
            if (!response.entry || response.entry.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                message: 'No conditions found for this patient',
                                conditionsFound: 0,
                                conditions: []
                            }, null, 2)
                        }]
                };
            }
            const conditions = response.entry.map((entry) => {
                const condition = entry.resource;
                return {
                    id: condition.id,
                    clinicalStatus: condition.clinicalStatus?.text,
                    verificationStatus: condition.verificationStatus?.text,
                    category: condition.category?.[0]?.text,
                    severity: condition.severity?.text,
                    code: {
                        text: condition.code?.text,
                        coding: condition.code?.coding?.[0]
                    },
                    onsetDate: condition.onsetDateTime || condition.onsetPeriod?.start,
                    abatementDate: condition.abatementDateTime,
                    recordedDate: condition.recordedDate,
                    recorder: condition.recorder?.display,
                    asserter: condition.asserter?.display,
                    note: condition.note?.map((note) => note.text)
                };
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            conditionsFound: conditions.length,
                            patientId: args.patientId,
                            conditions
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return this.handleError('getPatientConditions', error);
        }
    }
    // Tool 6: Get Patient Encounters
    createGetEncountersTool() {
        return {
            name: 'getPatientEncounters',
            description: 'Get healthcare encounters/visits for a patient',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'FHIR Patient ID',
                        minLength: 1
                    },
                    status: {
                        type: 'string',
                        enum: ['planned', 'arrived', 'in-progress', 'finished', 'cancelled'],
                        description: 'Encounter status filter'
                    },
                    class: {
                        type: 'string',
                        description: 'Encounter class (inpatient, outpatient, emergency, etc.)'
                    },
                    date: {
                        type: 'string',
                        description: 'Date range for encounters'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (default: 20)',
                        minimum: 1,
                        maximum: 100
                    }
                },
                required: ['patientId']
            }
        };
    }
    async handleGetEncounters(args) {
        try {
            const searchParams = new URLSearchParams();
            searchParams.append('patient', args.patientId);
            searchParams.append('_sort', '-date');
            searchParams.append('_count', (args.limit || 20).toString());
            if (args.status)
                searchParams.append('status', args.status);
            if (args.class)
                searchParams.append('class', args.class);
            if (args.date)
                searchParams.append('date', args.date);
            const response = await this.makeRequest(`/Encounter?${searchParams.toString()}`);
            if (!response.entry || response.entry.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                message: 'No encounters found for this patient',
                                encountersFound: 0,
                                encounters: []
                            }, null, 2)
                        }]
                };
            }
            const encounters = response.entry.map((entry) => {
                const encounter = entry.resource;
                return {
                    id: encounter.id,
                    status: encounter.status,
                    class: encounter.class?.display,
                    type: encounter.type?.[0]?.text,
                    priority: encounter.priority?.text,
                    serviceType: encounter.serviceType?.text,
                    period: {
                        start: encounter.period?.start,
                        end: encounter.period?.end
                    },
                    length: encounter.length?.value,
                    reasonCode: encounter.reasonCode?.[0]?.text,
                    hospitalization: encounter.hospitalization && {
                        admitSource: encounter.hospitalization.admitSource?.text,
                        dischargeDisposition: encounter.hospitalization.dischargeDisposition?.text
                    },
                    location: encounter.location?.map((loc) => ({
                        location: loc.location?.display,
                        status: loc.status,
                        period: loc.period
                    })),
                    participant: encounter.participant?.map((part) => ({
                        type: part.type?.[0]?.text,
                        individual: part.individual?.display,
                        period: part.period
                    }))
                };
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            encountersFound: encounters.length,
                            patientId: args.patientId,
                            encounters
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return this.handleError('getPatientEncounters', error);
        }
    }
    // Helper method to make HTTP requests
    async makeRequest(endpoint) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const headers = {
            'Accept': 'application/fhir+json',
            'Content-Type': 'application/fhir+json',
            'User-Agent': 'MCP-Medical-Server/1.0.0'
        };
        // For Epic sandbox, we need to handle the open endpoints differently
        if (this.config.useSandbox) {
            // Epic sandbox public endpoints - use different headers
            headers['Accept'] = 'application/json';
            delete headers['Content-Type'];
        }
        else if (this.config.accessToken) {
            headers['Authorization'] = `Bearer ${this.config.accessToken}`;
        }
        console.log(`🔍 Epic FHIR Request: ${url}`);
        console.log(`🔍 Headers:`, headers);
        const response = await fetch(url, {
            headers,
            method: 'GET'
        });
        console.log(`📊 Response status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Epic API Error Response:`, errorText.substring(0, 500));
            throw new Error(`Epic FHIR API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
        }
        const responseText = await response.text();
        try {
            return JSON.parse(responseText);
        }
        catch (parseError) {
            console.error(`❌ Failed to parse Epic response:`, responseText.substring(0, 200));
            throw new Error(`Invalid JSON response from Epic API`);
        }
    }
    // Helper methods for formatting data
    formatPatientName(names) {
        if (!names || names.length === 0)
            return 'Unknown';
        const name = names[0];
        const given = name.given?.join(' ') || '';
        const family = name.family || '';
        return `${given} ${family}`.trim();
    }
    extractPhone(telecoms) {
        return telecoms?.find(t => t.system === 'phone')?.value;
    }
    extractEmail(telecoms) {
        return telecoms?.find(t => t.system === 'email')?.value;
    }
    formatAddress(addresses) {
        if (!addresses || addresses.length === 0)
            return null;
        const addr = addresses[0];
        return {
            line: addr.line?.join(', '),
            city: addr.city,
            state: addr.state,
            postalCode: addr.postalCode,
            country: addr.country
        };
    }
    extractMRN(identifiers) {
        return identifiers?.find(id => id.type?.text?.toLowerCase().includes('mrn'))?.value;
    }
    formatObservationValue(obs) {
        if (obs.valueQuantity) {
            return {
                value: obs.valueQuantity.value,
                unit: obs.valueQuantity.unit,
                system: obs.valueQuantity.system
            };
        }
        if (obs.valueString)
            return obs.valueString;
        if (obs.valueBoolean !== undefined)
            return obs.valueBoolean;
        if (obs.valueCodeableConcept)
            return obs.valueCodeableConcept.text;
        return null;
    }
    handleError(toolName, error) {
        console.error(`Epic FHIR ${toolName} error:`, error);
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: error.message || 'Unknown error occurred',
                        tool: toolName,
                        timestamp: new Date().toISOString()
                    }, null, 2)
                }],
            isError: true
        };
    }
    // Get all Epic FHIR tools
    getAllTools() {
        return [
            this.createSearchPatientsTool(),
            this.createGetPatientTool(),
            this.createGetObservationsTool(),
            this.createGetMedicationsTool(),
            this.createGetConditionsTool(),
            this.createGetEncountersTool()
        ];
    }
}
exports.EpicFHIRTools = EpicFHIRTools;
//# sourceMappingURL=epic-fhir-tools.js.map