// src/tools/epic-fhir-tools.ts - TypeScript Error Fixes
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface EpicConfig {
  baseUrl: string;
  clientId?: string;
  accessToken?: string;
  useSandbox: boolean;
}

// Type definitions for better type safety
interface PatientRecord {
  id: string;
  name: string;
  birthDate: string;
  gender: string;
  phone: string;
  mrn: string;
  active: boolean;
  address: {
    line: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

interface DetailedPatientRecord extends PatientRecord {
  maritalStatus: string;
  email: string;
  generalPractitioner: string[];
  communication: string[];
}

interface ObservationRecord {
  id: string;
  status: string;
  category: string;
  code: { text: string; coding: { code: string; system: string; } };
  value: any;
  unit?: string;
  referenceRange?: string;
  date: string;
  performer: string;
  interpretation?: string;
}

interface MedicationRecord {
  id: string;
  status: string;
  medication: { text: string; coding: { code: string; system: string; } };
  dosage: { text: string; route: string; doseQuantity: { value: number; unit: string; } }[];
  prescriber: string;
  authoredOn: string;
}

interface ConditionRecord {
  id: string;
  clinicalStatus: string;
  verificationStatus: string;
  category: string;
  code: { text: string; coding: { code: string; system: string; } };
  onsetDate: string;
  recordedDate: string;
  recorder: string;
  asserter: string;
}

interface EncounterRecord {
  id: string;
  status: string;
  class: string;
  type: string;
  period: { start: string; end: string };
  reasonCode: string;
  participant: { type: string; individual: string }[];
}

export class EpicFHIRTools {
  private config: EpicConfig;

  constructor(config: EpicConfig) {
    this.config = {
      ...config,
      baseUrl: config.useSandbox 
        ? 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4'
        : config.baseUrl
    };
  }

  // Tool 1: Search Patients (with fallback for known patients)
  createSearchPatientsTool(): Tool {
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

  async handleSearchPatients(args: {
    name?: string;
    birthdate?: string;
    identifier?: string;
    gender?: string;
  }): Promise<any> {
    try {
      // First, check if this is a known Epic sandbox patient
      if (args.name && this.config.useSandbox) {
        const knownPatientResult = this.searchKnownPatients(args.name);
        if (knownPatientResult) {
          return knownPatientResult;
        }
      }

      // Try the actual Epic API call
      const searchParams = new URLSearchParams();
      
      if (args.name) searchParams.append('name', args.name);
      if (args.birthdate) searchParams.append('birthdate', args.birthdate);
      if (args.identifier) searchParams.append('identifier', args.identifier);
      if (args.gender) searchParams.append('gender', args.gender);

      const response = await this.makeRequest(`/Patient?${searchParams.toString()}`);
      
      if (!response.entry || response.entry.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'No patients found matching the search criteria',
              patientsFound: 0,
              patients: [],
              suggestion: this.config.useSandbox ? 'Try known Epic sandbox patients: "Camila Lopez", "Jason Argonaut"' : 'Try different search criteria'
            }, null, 2)
          }]
        };
      }

      const patients = response.entry.map((entry: any) => {
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
    } catch (error) {
      return this.handleError('searchPatients', error);
    }
  }

  // Helper method to search known Epic sandbox patients
  private searchKnownPatients(name: string): any | null {
    const knownPatients: Record<string, PatientRecord> = {
      'camila lopez': {
        id: 'erXuFYUfucBZaryVksYEcMg3',
        name: 'Camila Lopez',
        birthDate: '1987-09-12',
        gender: 'female',
        phone: '555-555-5555',
        mrn: '203713',
        active: true,
        address: {
          line: '123 Main St',
          city: 'Madison',
          state: 'WI',
          postalCode: '53703',
          country: 'US'
        }
      },
      'jason argonaut': {
        id: 'Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB',
        name: 'Jason Argonaut',
        birthDate: '1985-08-01',
        gender: 'male',
        phone: '555-555-1234',
        mrn: '198765',
        active: true,
        address: {
          line: '456 Oak Ave',
          city: 'Verona',
          state: 'WI',
          postalCode: '53593',
          country: 'US'
        }
      },
      'jessica thunderman': {
        id: 'e63K2-FNJnCFoaGGe8dkPKI7',
        name: 'Jessica Thunderman',
        birthDate: '1992-03-15',
        gender: 'female',
        phone: '555-555-9876',
        mrn: '456789',
        active: true,
        address: {
          line: '789 Pine Rd',
          city: 'Middleton',
          state: 'WI',
          postalCode: '53562',
          country: 'US'
        }
      }
    };

    const searchName = name.toLowerCase().trim();
    const patient = knownPatients[searchName];

    if (patient) {
      console.log(`🏥 Found known Epic sandbox patient: ${patient.name}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            patientsFound: 1,
            searchCriteria: { name },
            patients: [patient],
            source: 'Epic sandbox known patients'
          }, null, 2)
        }]
      };
    }

    return null;
  }

  // Tool 2: Get Patient Details
  createGetPatientTool(): Tool {
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

  async handleGetPatient(args: { patientId: string }): Promise<any> {
    try {
      // For sandbox, try known patients first
      if (this.config.useSandbox) {
        const knownPatient = this.getKnownPatientById(args.patientId);
        if (knownPatient) {
          return knownPatient;
        }
      }

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
              generalPractitioner: patient.generalPractitioner?.map((gp: any) => gp.display),
              communication: patient.communication?.map((comm: any) => comm.language.text)
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError('getPatientDetails', error);
    }
  }

  private getKnownPatientById(patientId: string): any | null {
    const knownPatientsById: Record<string, DetailedPatientRecord> = {
      'erXuFYUfucBZaryVksYEcMg3': {
        id: 'erXuFYUfucBZaryVksYEcMg3',
        name: 'Camila Lopez',
        birthDate: '1987-09-12',
        gender: 'female',
        maritalStatus: 'Single',
        phone: '555-555-5555',
        email: 'camila.lopez@example.com',
        mrn: '203713',
        active: true,
        address: {
          line: '123 Main St',
          city: 'Madison',
          state: 'WI',
          postalCode: '53703',
          country: 'US'
        },
        generalPractitioner: ['Dr. Smith'],
        communication: ['English', 'Spanish']
      },
      'Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB': {
        id: 'Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB',
        name: 'Jason Argonaut',
        birthDate: '1985-08-01',
        gender: 'male',
        maritalStatus: 'Married',
        phone: '555-555-1234',
        email: 'jason.argonaut@example.com',
        mrn: '198765',
        active: true,
        address: {
          line: '456 Oak Ave',
          city: 'Verona',
          state: 'WI',
          postalCode: '53593',
          country: 'US'
        },
        generalPractitioner: ['Dr. Johnson'],
        communication: ['English']
      }
    };

    const patient = knownPatientsById[patientId];
    if (patient) {
      console.log(`🏥 Returning known patient details for: ${patient.name}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            patient,
            source: 'Epic sandbox known patient'
          }, null, 2)
        }]
      };
    }

    return null;
  }

  // Tool 3: Get Patient Observations (Lab Results, Vitals)
  createGetObservationsTool(): Tool {
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

  async handleGetObservations(args: {
    patientId: string;
    category?: string;
    code?: string;
    date?: string;
    limit?: number;
  }): Promise<any> {
    try {
      // For sandbox, return mock observations for known patients
      if (this.config.useSandbox && this.isKnownPatientId(args.patientId)) {
        return this.getMockObservations(args.patientId, args.category);
      }

      const searchParams = new URLSearchParams();
      searchParams.append('patient', args.patientId);
      searchParams.append('_sort', '-date');
      searchParams.append('_count', (args.limit || 20).toString());
      
      if (args.category) searchParams.append('category', args.category);
      if (args.code) searchParams.append('code', args.code);
      if (args.date) searchParams.append('date', args.date);

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

      const observations = response.entry.map((entry: any) => {
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
    } catch (error) {
      return this.handleError('getPatientObservations', error);
    }
  }

  private getMockObservations(patientId: string, category?: string): any {
    const mockObservations: Record<string, ObservationRecord[]> = {
      'erXuFYUfucBZaryVksYEcMg3': [
        {
          id: 'obs-1',
          status: 'final',
          category: 'vital-signs',
          code: { text: 'Blood Pressure', coding: { code: '85354-9', system: 'http://loinc.org' } },
          value: { systolic: 120, diastolic: 80 },
          unit: 'mmHg',
          date: '2024-12-01T10:30:00Z',
          performer: 'Dr. Smith',
          interpretation: 'Normal'
        },
        {
          id: 'obs-2',
          status: 'final',
          category: 'laboratory',
          code: { text: 'Glucose', coding: { code: '2345-7', system: 'http://loinc.org' } },
          value: { value: 95 },
          unit: 'mg/dL',
          referenceRange: '70-99 mg/dL',
          date: '2024-12-01T08:00:00Z',
          performer: 'Lab Tech',
          interpretation: 'Normal'
        },
        {
          id: 'obs-3',
          status: 'final',
          category: 'laboratory',
          code: { text: 'Hemoglobin A1c', coding: { code: '4548-4', system: 'http://loinc.org' } },
          value: { value: 5.8 },
          unit: '%',
          referenceRange: '< 5.7%',
          date: '2024-11-15T09:00:00Z',
          performer: 'Lab Tech',
          interpretation: 'Normal'
        }
      ]
    };

    const observations = mockObservations[patientId] || [];
    const filteredObs = category ? observations.filter((obs: ObservationRecord) => obs.category === category) : observations;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          observationsFound: filteredObs.length,
          patientId,
          observations: filteredObs,
          source: 'Epic sandbox mock data'
        }, null, 2)
      }]
    };
  }

  // Tool 4: Get Patient Medications
  createGetMedicationsTool(): Tool {
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

  async handleGetMedications(args: {
    patientId: string;
    status?: string;
    limit?: number;
  }): Promise<any> {
    try {
      // For sandbox, return mock medications for known patients
      if (this.config.useSandbox && this.isKnownPatientId(args.patientId)) {
        return this.getMockMedications(args.patientId, args.status);
      }

      const searchParams = new URLSearchParams();
      searchParams.append('patient', args.patientId);
      searchParams.append('_sort', '-_lastUpdated');
      searchParams.append('_count', (args.limit || 20).toString());
      
      if (args.status) searchParams.append('status', args.status);

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

      const medications = response.entry.map((entry: any) => {
        const med = entry.resource;
        return {
          id: med.id,
          status: med.status,
          medication: {
            text: med.medicationCodeableConcept?.text,
            coding: med.medicationCodeableConcept?.coding?.[0]
          },
          dosage: med.dosageInstruction?.map((dose: any) => ({
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
    } catch (error) {
      return this.handleError('getPatientMedications', error);
    }
  }

  private getMockMedications(patientId: string, status?: string): any {
    const mockMedications: Record<string, MedicationRecord[]> = {
      'erXuFYUfucBZaryVksYEcMg3': [
        {
          id: 'med-1',
          status: 'active',
          medication: {
            text: 'Metformin 500mg',
            coding: { code: '6809', system: 'http://www.nlm.nih.gov/research/umls/rxnorm' }
          },
          dosage: [{
            text: 'Take 1 tablet by mouth twice daily with meals',
            route: 'Oral',
            doseQuantity: { value: 1, unit: 'tablet' }
          }],
          prescriber: 'Dr. Smith',
          authoredOn: '2024-11-01T10:00:00Z'
        },
        {
          id: 'med-2',
          status: 'active',
          medication: {
            text: 'Lisinopril 10mg',
            coding: { code: '29046', system: 'http://www.nlm.nih.gov/research/umls/rxnorm' }
          },
          dosage: [{
            text: 'Take 1 tablet by mouth once daily',
            route: 'Oral',
            doseQuantity: { value: 1, unit: 'tablet' }
          }],
          prescriber: 'Dr. Smith',
          authoredOn: '2024-10-15T09:30:00Z'
        }
      ]
    };

    const medications = mockMedications[patientId] || [];
    const filteredMeds = status ? medications.filter((med: MedicationRecord) => med.status === status) : medications;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          medicationsFound: filteredMeds.length,
          patientId,
          medications: filteredMeds,
          source: 'Epic sandbox mock data'
        }, null, 2)
      }]
    };
  }

  // Tool 5: Get Patient Conditions/Diagnoses
  createGetConditionsTool(): Tool {
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

  async handleGetConditions(args: {
    patientId: string;
    clinicalStatus?: string;
    category?: string;
    limit?: number;
  }): Promise<any> {
    try {
      // For sandbox, return mock conditions for known patients
      if (this.config.useSandbox && this.isKnownPatientId(args.patientId)) {
        return this.getMockConditions(args.patientId, args.clinicalStatus);
      }

      const searchParams = new URLSearchParams();
      searchParams.append('patient', args.patientId);
      searchParams.append('_sort', '-onset-date');
      searchParams.append('_count', (args.limit || 20).toString());
      
      if (args.clinicalStatus) searchParams.append('clinical-status', args.clinicalStatus);
      if (args.category) searchParams.append('category', args.category);

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

      const conditions = response.entry.map((entry: any) => {
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
          note: condition.note?.map((note: any) => note.text)
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
    } catch (error) {
      return this.handleError('getPatientConditions', error);
    }
  }

  private getMockConditions(patientId: string, clinicalStatus?: string): any {
    const mockConditions: Record<string, ConditionRecord[]> = {
      'erXuFYUfucBZaryVksYEcMg3': [
        {
          id: 'cond-1',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          category: 'problem-list-item',
          code: {
            text: 'Type 2 Diabetes Mellitus',
            coding: { code: 'E11', system: 'http://hl7.org/fhir/sid/icd-10-cm' }
          },
          onsetDate: '2022-03-15T00:00:00Z',
          recordedDate: '2022-03-15T10:30:00Z',
          recorder: 'Dr. Smith',
          asserter: 'Dr. Smith'
        },
        {
          id: 'cond-2',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          category: 'problem-list-item',
          code: {
            text: 'Essential Hypertension',
            coding: { code: 'I10', system: 'http://hl7.org/fhir/sid/icd-10-cm' }
          },
          onsetDate: '2021-08-20T00:00:00Z',
          recordedDate: '2021-08-20T14:15:00Z',
          recorder: 'Dr. Smith',
          asserter: 'Dr. Smith'
        }
      ]
    };

    const conditions = mockConditions[patientId] || [];
    const filteredConditions = clinicalStatus ? conditions.filter((cond: ConditionRecord) => cond.clinicalStatus === clinicalStatus) : conditions;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          conditionsFound: filteredConditions.length,
          patientId,
          conditions: filteredConditions,
          source: 'Epic sandbox mock data'
        }, null, 2)
      }]
    };
  }

  // Tool 6: Get Patient Encounters
  createGetEncountersTool(): Tool {
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

  async handleGetEncounters(args: {
    patientId: string;
    status?: string;
    class?: string;
    date?: string;
    limit?: number;
  }): Promise<any> {
    try {
      // For sandbox, return mock encounters for known patients
      if (this.config.useSandbox && this.isKnownPatientId(args.patientId)) {
        return this.getMockEncounters(args.patientId, args.status);
      }

      const searchParams = new URLSearchParams();
      searchParams.append('patient', args.patientId);
      searchParams.append('_sort', '-date');
      searchParams.append('_count', (args.limit || 20).toString());
      
      if (args.status) searchParams.append('status', args.status);
      if (args.class) searchParams.append('class', args.class);
      if (args.date) searchParams.append('date', args.date);

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

      const encounters = response.entry.map((entry: any) => {
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
          location: encounter.location?.map((loc: any) => ({
            location: loc.location?.display,
            status: loc.status,
            period: loc.period
          })),
          participant: encounter.participant?.map((part: any) => ({
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
    } catch (error) {
      return this.handleError('getPatientEncounters', error);
    }
  }

  private getMockEncounters(patientId: string, status?: string): any {
    const mockEncounters: Record<string, EncounterRecord[]> = {
      'erXuFYUfucBZaryVksYEcMg3': [
        {
          id: 'enc-1',
          status: 'finished',
          class: 'outpatient',
          type: 'Routine Follow-up',
          period: {
            start: '2024-12-01T10:00:00Z',
            end: '2024-12-01T10:45:00Z'
          },
          reasonCode: 'Diabetes management',
          participant: [{
            type: 'attending physician',
            individual: 'Dr. Smith'
          }]
        },
        {
          id: 'enc-2',
          status: 'finished',
          class: 'outpatient',
          type: 'Annual Physical',
          period: {
            start: '2024-06-15T09:00:00Z',
            end: '2024-06-15T10:30:00Z'
          },
          reasonCode: 'Annual wellness visit',
          participant: [{
            type: 'attending physician',
            individual: 'Dr. Smith'
          }]
        }
      ]
    };

    const encounters = mockEncounters[patientId] || [];
    const filteredEncounters = status ? encounters.filter((enc: EncounterRecord) => enc.status === status) : encounters;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          encountersFound: filteredEncounters.length,
          patientId,
          encounters: filteredEncounters,
          source: 'Epic sandbox mock data'
        }, null, 2)
      }]
    };
  }

  // Helper method to check if patient ID is known
  private isKnownPatientId(patientId: string): boolean {
    const knownIds = [
      'erXuFYUfucBZaryVksYEcMg3',
      'Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB',
      'e63K2-FNJnCFoaGGe8dkPKI7'
    ];
    return knownIds.includes(patientId);
  }

  // Helper method to make HTTP requests
  private async makeRequest(endpoint: string): Promise<any> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/fhir+json',
      'User-Agent': 'MCP-Medical-Server/1.0.0'
    };

    // Epic sandbox configuration - try without authentication first
    if (this.config.useSandbox) {
      console.log(`🏥 Epic sandbox request: ${endpoint}`);
      
      // For Epic sandbox, some endpoints are open, others require auth
      // We'll try without auth first, then provide helpful fallback
    } else if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    } else if (this.config.clientId) {
      // If only client ID is available, add it as a parameter
      // Note: This may not work for all Epic endpoints
      console.log(`🔑 Using client ID: ${this.config.clientId}`);
    }

    console.log(`🔍 Epic FHIR Request: ${url}`);
    
    try {
      const response = await fetch(url, { 
        headers,
        method: 'GET'
      });
      
      console.log(`📊 Response status: ${response.status} ${response.statusText}`);
      
      if (response.status === 401) {
        // Handle 401 specifically for sandbox
        if (this.config.useSandbox) {
          throw new Error(`Epic sandbox authentication required for ${endpoint}. This endpoint requires OAuth2 authentication even in sandbox mode. Consider using known patient IDs directly or setting up proper OAuth2 flow.`);
        } else {
          throw new Error(`Epic FHIR API authentication failed. Please check your access token or client credentials.`);
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Epic API Error Response:`, errorText.substring(0, 500));
        throw new Error(`Epic FHIR API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
      }

      const responseText = await response.text();
      
      if (!responseText.trim()) {
        throw new Error(`Empty response from Epic FHIR API`);
      }
      
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error(`❌ Failed to parse Epic response:`, responseText.substring(0, 200));
        throw new Error(`Invalid JSON response from Epic API`);
      }
    } catch (fetchError) {
      console.error(`❌ Epic FHIR request failed:`, fetchError);
      throw fetchError;
    }
  }

  // Helper methods for formatting data
  private formatPatientName(names: any[]): string {
    if (!names || names.length === 0) return 'Unknown';
    const name = names[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    return `${given} ${family}`.trim();
  }

  private extractPhone(telecoms: any[]): string | undefined {
    return telecoms?.find(t => t.system === 'phone')?.value;
  }

  private extractEmail(telecoms: any[]): string | undefined {
    return telecoms?.find(t => t.system === 'email')?.value;
  }

  private formatAddress(addresses: any[]): any {
    if (!addresses || addresses.length === 0) return null;
    const addr = addresses[0];
    return {
      line: addr.line?.join(', '),
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country
    };
  }

  private extractMRN(identifiers: any[]): string | undefined {
    return identifiers?.find(id => id.type?.text?.toLowerCase().includes('mrn'))?.value;
  }

  private formatObservationValue(obs: any): any {
    if (obs.valueQuantity) {
      return {
        value: obs.valueQuantity.value,
        unit: obs.valueQuantity.unit,
        system: obs.valueQuantity.system
      };
    }
    if (obs.valueString) return obs.valueString;
    if (obs.valueBoolean !== undefined) return obs.valueBoolean;
    if (obs.valueCodeableConcept) return obs.valueCodeableConcept.text;
    return null;
  }

  private handleError(toolName: string, error: any): any {
    console.error(`Epic FHIR ${toolName} error:`, error);
    
    let errorMessage = error.message || 'Unknown error occurred';
    let suggestions: string[] = [];

    // Provide specific guidance based on error type
    if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
      suggestions = [
        'Epic sandbox requires OAuth2 authentication for some endpoints',
        'Try using known patient IDs directly: erXuFYUfucBZaryVksYEcMg3 (Camila Lopez)',
        'Consider setting up proper Epic OAuth2 credentials',
        'Use direct patient lookup tools for sandbox testing'
      ];
    } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      suggestions = [
        'Patient or resource not found in Epic system',
        'Verify the patient ID is correct',
        'Try searching for known Epic sandbox patients'
      ];
    } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
      suggestions = [
        'Access forbidden - check permissions',
        'Verify your Epic client credentials',
        'Some Epic sandbox endpoints require special access'
      ];
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage,
          tool: toolName,
          timestamp: new Date().toISOString(),
          suggestions: suggestions.length > 0 ? suggestions : undefined,
          epicSandboxPatients: this.config.useSandbox ? [
            'erXuFYUfucBZaryVksYEcMg3 (Camila Lopez)',
            'Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB (Jason Argonaut)'
          ] : undefined
        }, null, 2)
      }],
      isError: true
    };
  }

  // Get all Epic FHIR tools
  getAllTools(): Tool[] {
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