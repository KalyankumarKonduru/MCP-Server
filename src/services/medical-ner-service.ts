import nlp from 'compromise';

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

export class MedicalNERService {
  private medicalTerms: Map<string, string>;
  private drugPatterns: RegExp[];
  private conditionPatterns: RegExp[];
  private procedurePatterns: RegExp[];

  constructor() {
    this.medicalTerms = new Map();
    this.drugPatterns = [];
    this.conditionPatterns = [];
    this.procedurePatterns = [];
    this.initializeMedicalTerms();
    this.initializePatterns();
  }

  private initializeMedicalTerms(): void {
    // Common medical terms and their categories
    const terms = {
      // Medications
      'aspirin': 'MEDICATION',
      'ibuprofen': 'MEDICATION',
      'acetaminophen': 'MEDICATION',
      'metformin': 'MEDICATION',
      'lisinopril': 'MEDICATION',
      'atorvastatin': 'MEDICATION',
      'amlodipine': 'MEDICATION',
      'omeprazole': 'MEDICATION',
      'levothyroxine': 'MEDICATION',
      'albuterol': 'MEDICATION',

      // Conditions
      'diabetes': 'CONDITION',
      'hypertension': 'CONDITION',
      'pneumonia': 'CONDITION',
      'asthma': 'CONDITION',
      'depression': 'CONDITION',
      'anxiety': 'CONDITION',
      'arthritis': 'CONDITION',
      'cancer': 'CONDITION',
      'heart disease': 'CONDITION',
      'stroke': 'CONDITION',

      // Procedures
      'surgery': 'PROCEDURE',
      'biopsy': 'PROCEDURE',
      'endoscopy': 'PROCEDURE',
      'colonoscopy': 'PROCEDURE',
      'mri': 'PROCEDURE',
      'ct scan': 'PROCEDURE',
      'x-ray': 'PROCEDURE',
      'ultrasound': 'PROCEDURE',
      'ecg': 'PROCEDURE',
      'ekg': 'PROCEDURE',

      // Anatomy
      'heart': 'ANATOMY',
      'lung': 'ANATOMY',
      'liver': 'ANATOMY',
      'kidney': 'ANATOMY',
      'brain': 'ANATOMY',
      'stomach': 'ANATOMY',
      'chest': 'ANATOMY',
      'abdomen': 'ANATOMY',
      'head': 'ANATOMY',
      'neck': 'ANATOMY',

      // Symptoms
      'pain': 'SYMPTOM',
      'fever': 'SYMPTOM',
      'cough': 'SYMPTOM',
      'nausea': 'SYMPTOM',
      'fatigue': 'SYMPTOM',
      'headache': 'SYMPTOM',
      'dizziness': 'SYMPTOM',
      'shortness of breath': 'SYMPTOM',
      'chest pain': 'SYMPTOM',
      'abdominal pain': 'SYMPTOM'
    };

    for (const [term, category] of Object.entries(terms)) {
      this.medicalTerms.set(term.toLowerCase(), category);
    }
  }

  private initializePatterns(): void {
    // Medication patterns
    this.drugPatterns = [
      /\b\w+cillin\b/gi, // Antibiotics ending in -cillin
      /\b\w+statin\b/gi, // Statins
      /\b\w+pril\b/gi,   // ACE inhibitors
      /\b\w+sartan\b/gi, // ARBs
      /\b\w+olol\b/gi,   // Beta blockers
      /\b\w+pine\b/gi,   // Calcium channel blockers
      /\b\w+zole\b/gi,   // Proton pump inhibitors
    ];

    // Condition patterns
    this.conditionPatterns = [
      /\b\w+itis\b/gi,   // Inflammatory conditions
      /\b\w+osis\b/gi,   // Disease conditions
      /\b\w+emia\b/gi,   // Blood conditions
      /\b\w+pathy\b/gi,  // Disease of organs
    ];

    // Procedure patterns
    this.procedurePatterns = [
      /\b\w+scopy\b/gi,  // Scope procedures
      /\b\w+ectomy\b/gi, // Surgical removals
      /\b\w+plasty\b/gi, // Surgical repairs
      /\b\w+tomy\b/gi,   // Surgical incisions
    ];
  }

  async extractEntities(text: string): Promise<NERResult> {
    try {
      const entities: MedicalEntity[] = [];
      const processedText = text.toLowerCase();
      
      // Extract entities using different methods
      const termEntities = this.extractByTerms(text);
      const patternEntities = this.extractByPatterns(text);
      const nlpEntities = this.extractByNLP(text);

      // Combine and deduplicate entities
      entities.push(...termEntities, ...patternEntities, ...nlpEntities);
      const uniqueEntities = this.deduplicateEntities(entities);

      // Calculate overall confidence
      const confidence = uniqueEntities.length > 0 
        ? uniqueEntities.reduce((sum, entity) => sum + entity.confidence, 0) / uniqueEntities.length
        : 0;

      return {
        entities: uniqueEntities,
        processedText: text,
        confidence
      };
    } catch (error) {
      console.error('Failed to extract medical entities:', error);
      throw error;
    }
  }

  private extractByTerms(text: string): MedicalEntity[] {
    const entities: MedicalEntity[] = [];
    const lowerText = text.toLowerCase();

    for (const [term, label] of this.medicalTerms.entries()) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        entities.push({
          text: match[0],
          label,
          confidence: 0.9,
          start: match.index,
          end: match.index + match[0].length,
          context: this.getContext(text, match.index, match[0].length)
        });
      }
    }

    return entities;
  }

  private extractByPatterns(text: string): MedicalEntity[] {
    const entities: MedicalEntity[] = [];

    // Check medication patterns
    for (const pattern of this.drugPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          label: 'MEDICATION',
          confidence: 0.7,
          start: match.index,
          end: match.index + match[0].length,
          context: this.getContext(text, match.index, match[0].length)
        });
      }
    }

    // Check condition patterns
    for (const pattern of this.conditionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          label: 'CONDITION',
          confidence: 0.6,
          start: match.index,
          end: match.index + match[0].length,
          context: this.getContext(text, match.index, match[0].length)
        });
      }
    }

    // Check procedure patterns
    for (const pattern of this.procedurePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          label: 'PROCEDURE',
          confidence: 0.6,
          start: match.index,
          end: match.index + match[0].length,
          context: this.getContext(text, match.index, match[0].length)
        });
      }
    }

    return entities;
  }

  private extractByNLP(text: string): MedicalEntity[] {
    const entities: MedicalEntity[] = [];
    
    try {
      const doc = nlp(text);
      
      // Extract people (could be doctors, patients)
      const people = doc.people().out('array');
      people.forEach((person: string) => {
        const index = text.toLowerCase().indexOf(person.toLowerCase());
        if (index !== -1) {
          entities.push({
            text: person,
            label: 'PERSON',
            confidence: 0.8,
            start: index,
            end: index + person.length,
            context: this.getContext(text, index, person.length)
          });
        }
      });

      // Extract dates (appointment dates, symptom onset)
      const dates = doc.dates().out('array');
      dates.forEach((date: string) => {
        const index = text.toLowerCase().indexOf(date.toLowerCase());
        if (index !== -1) {
          entities.push({
            text: date,
            label: 'DATE',
            confidence: 0.9,
            start: index,
            end: index + date.length,
            context: this.getContext(text, index, date.length)
          });
        }
      });

      // Extract numbers (could be dosages, measurements)
      const numbers = doc.numbers().out('array');
      numbers.forEach((number: string) => {
        const index = text.toLowerCase().indexOf(number.toLowerCase());
        if (index !== -1 && this.isMedicalMeasurement(text, index)) {
          entities.push({
            text: number,
            label: 'MEASUREMENT',
            confidence: 0.7,
            start: index,
            end: index + number.length,
            context: this.getContext(text, index, number.length)
          });
        }
      });

    } catch (error) {
      console.warn('NLP processing failed:', error);
    }

    return entities;
  }

  private getContext(text: string, start: number, length: number): string {
    const contextStart = Math.max(0, start - 50);
    const contextEnd = Math.min(text.length, start + length + 50);
    return text.substring(contextStart, contextEnd);
  }

  private isMedicalMeasurement(text: string, numberIndex: number): boolean {
    const context = this.getContext(text, numberIndex, 10);
    const medicalUnits = ['mg', 'ml', 'cc', 'units', 'mcg', 'g', 'kg', 'lbs', 'mmHg', 'bpm'];
    return medicalUnits.some(unit => context.toLowerCase().includes(unit));
  }

  private deduplicateEntities(entities: MedicalEntity[]): MedicalEntity[] {
    const unique = new Map<string, MedicalEntity>();

    entities.forEach(entity => {
      const key = `${entity.text.toLowerCase()}-${entity.start}-${entity.end}`;
      const existing = unique.get(key);
      
      if (!existing || entity.confidence > existing.confidence) {
        unique.set(key, entity);
      }
    });

    return Array.from(unique.values()).sort((a, b) => a.start - b.start);
  }

  async extractMedicalEntitiesFromDocument(
    title: string, 
    content: string
  ): Promise<MedicalEntity[]> {
    try {
      const fullText = `${title}\n\n${content}`;
      const result = await this.extractEntities(fullText);
      return result.entities;
    } catch (error) {
      console.error('Failed to extract entities from document:', error);
      throw error;
    }
  }

  getEntityTypes(): string[] {
    return [
      'MEDICATION',
      'CONDITION', 
      'PROCEDURE',
      'ANATOMY',
      'SYMPTOM',
      'PERSON',
      'DATE',
      'MEASUREMENT'
    ];
  }

  filterEntitiesByType(entities: MedicalEntity[], type: string): MedicalEntity[] {
    return entities.filter(entity => entity.label === type);
  }

  getEntityStatistics(entities: MedicalEntity[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    entities.forEach(entity => {
      stats[entity.label] = (stats[entity.label] || 0) + 1;
    });

    return stats;
  }
}

