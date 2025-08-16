import { MongoDBClient, MedicalDocument, MedicalEntity } from '../db/mongodb-client.js';
import { LocalEmbeddingService } from './local-embedding-service.js';
import { BioClinicalServerConnection } from './bioclinical-server-connection.js';

export interface AnalyticsMetrics {
  patientRiskScore: number;
  medicationInteractions: MedicationInteraction[];
  diagnosisConfidence: number;
  treatmentRecommendations: TreatmentRecommendation[];
  temporalTrends: TemporalTrend[];
  populationComparisons: PopulationMetric[];
}

export interface MedicationInteraction {
  medications: string[];
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description: string;
  recommendation: string;
  evidenceScore: number;
}

export interface TreatmentRecommendation {
  condition: string;
  treatments: {
    name: string;
    efficacyScore: number;
    contraindications: string[];
    evidenceLevel: 'A' | 'B' | 'C' | 'D';
  }[];
  reasoning: string;
}

export interface TemporalTrend {
  metric: string;
  timeline: {
    date: Date;
    value: number;
    context?: string;
  }[];
  trend: 'improving' | 'stable' | 'declining' | 'fluctuating';
  significance: number;
}

export interface PopulationMetric {
  category: string;
  patientValue: number;
  populationMean: number;
  percentile: number;
  normalRange: [number, number];
  riskLevel: 'low' | 'normal' | 'elevated' | 'high';
}

export interface ClinicalAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'medication' | 'diagnosis' | 'lab' | 'followup';
  message: string;
  evidence: string[];
  actionRequired: boolean;
  timestamp: Date;
}

export class MedicalAnalyticsService {
  private mongoClient: MongoDBClient;
  private embeddingService: LocalEmbeddingService;
  private bioClinicalConnection: BioClinicalServerConnection;
  private isInitialized = false;

  constructor(
    mongoClient: MongoDBClient,
    embeddingService: LocalEmbeddingService,
    bioClinicalConnection: BioClinicalServerConnection
  ) {
    this.mongoClient = mongoClient;
    this.embeddingService = embeddingService;
    this.bioClinicalConnection = bioClinicalConnection;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🧠 Initializing Medical Analytics Service...');
    
    // Ensure dependencies are initialized
    if (!this.embeddingService.isInitialized()) {
      await this.embeddingService.initialize();
    }

    if (!this.bioClinicalConnection.isConnected()) {
      await this.bioClinicalConnection.connect();
    }

    this.isInitialized = true;
    console.log('✅ Medical Analytics Service initialized');
  }

  /**
   * Generate comprehensive analytics for a patient
   */
  async generatePatientAnalytics(patientId: string): Promise<AnalyticsMetrics> {
    this.ensureInitialized();

    console.log(`📊 Generating analytics for patient: ${patientId}`);

    // Fetch patient documents and entities
    const documents = await this.mongoClient.searchDocuments({
      'metadata.patientId': patientId
    });

    const allEntities = documents.flatMap(doc => doc.medicalEntities || []);
    
    // Generate all analytics components
    const [
      riskScore,
      interactions,
      confidence,
      recommendations,
      trends,
      populationData
    ] = await Promise.all([
      this.calculateRiskScore(allEntities, documents),
      this.analyzeMedicationInteractions(allEntities),
      this.calculateDiagnosisConfidence(allEntities),
      this.generateTreatmentRecommendations(allEntities),
      this.analyzeTemporalTrends(documents),
      this.compareToPopulation(allEntities, patientId)
    ]);

    return {
      patientRiskScore: riskScore,
      medicationInteractions: interactions,
      diagnosisConfidence: confidence,
      treatmentRecommendations: recommendations,
      temporalTrends: trends,
      populationComparisons: populationData
    };
  }

  /**
   * Generate clinical alerts for immediate attention
   */
  async generateClinicalAlerts(patientId: string): Promise<ClinicalAlert[]> {
    this.ensureInitialized();

    const documents = await this.mongoClient.searchDocuments({
      'metadata.patientId': patientId
    });

    const allEntities = documents.flatMap(doc => doc.medicalEntities || []);
    const alerts: ClinicalAlert[] = [];

    // Check for critical medication interactions
    const interactions = await this.analyzeMedicationInteractions(allEntities);
    interactions
      .filter(interaction => interaction.severity === 'critical' || interaction.severity === 'high')
      .forEach(interaction => {
        alerts.push({
          id: `med-interaction-${Date.now()}-${Math.random()}`,
          severity: interaction.severity === 'critical' ? 'critical' : 'warning',
          category: 'medication',
          message: `${interaction.severity.toUpperCase()} interaction detected: ${interaction.medications.join(' + ')}`,
          evidence: [interaction.description, interaction.recommendation],
          actionRequired: interaction.severity === 'critical',
          timestamp: new Date()
        });
      });

    // Check for missing follow-ups
    const followUpAlerts = await this.checkMissingFollowUps(documents);
    alerts.push(...followUpAlerts);

    // Check for abnormal lab trends
    const labAlerts = await this.checkAbnormalLabTrends(allEntities);
    alerts.push(...labAlerts);

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Analyze medication cohort outcomes
   */
  async analyzeCohortOutcomes(condition: string, medication: string): Promise<{
    totalPatients: number;
    outcomeMetrics: {
      efficacy: number;
      adverseEvents: number;
      discontinuationRate: number;
    };
    comparativeAnalysis: {
      betterThanAverage: boolean;
      confidenceInterval: [number, number];
    };
  }> {
    this.ensureInitialized();

    // Search for patients with the condition and medication
    const query = await this.embeddingService.generateEmbedding(
      `${condition} ${medication} treatment outcome`
    );

    const similarDocuments = await this.embeddingService.searchSimilarDocuments(
      query,
      { limit: 100 }
    );

    // Analyze outcomes from similar cases
    const outcomes = await this.extractOutcomeMetrics(similarDocuments, medication);
    
    return {
      totalPatients: similarDocuments.length,
      outcomeMetrics: outcomes,
      comparativeAnalysis: {
        betterThanAverage: outcomes.efficacy > 0.7, // 70% efficacy threshold
        confidenceInterval: [outcomes.efficacy - 0.1, outcomes.efficacy + 0.1]
      }
    };
  }

  // Private helper methods
  private async calculateRiskScore(entities: MedicalEntity[], documents: MedicalDocument[]): Promise<number> {
    // Risk scoring algorithm based on conditions, medications, and document patterns
    let riskScore = 0;

    const conditions = entities.filter(e => e.label === 'CONDITION');
    const medications = entities.filter(e => e.label === 'MEDICATION');

    // High-risk conditions
    const highRiskConditions = ['diabetes', 'hypertension', 'cardiac', 'cancer'];
    const highRiskCount = conditions.filter(c => 
      highRiskConditions.some(risk => c.text.toLowerCase().includes(risk))
    ).length;

    riskScore += highRiskCount * 15;

    // Medication complexity
    const uniqueMedications = new Set(medications.map(m => m.text.toLowerCase())).size;
    riskScore += Math.min(uniqueMedications * 2, 20);

    // Recent emergency visits
    const recentEmergencyDocs = documents.filter(doc => {
      const isRecent = (Date.now() - doc.metadata.uploadedAt.getTime()) < (30 * 24 * 60 * 60 * 1000);
      const isEmergency = doc.content.toLowerCase().includes('emergency') || 
                         doc.content.toLowerCase().includes('urgent');
      return isRecent && isEmergency;
    }).length;

    riskScore += recentEmergencyDocs * 10;

    // Normalize to 0-100 scale
    return Math.min(Math.max(riskScore, 0), 100);
  }

  private async analyzeMedicationInteractions(entities: MedicalEntity[]): Promise<MedicationInteraction[]> {
    const medications = entities
      .filter(e => e.label === 'MEDICATION')
      .map(e => e.text.toLowerCase())
      .filter((med, index, array) => array.indexOf(med) === index); // Remove duplicates

    const interactions: MedicationInteraction[] = [];

    // Check for known dangerous combinations
    const dangerousCombinations = [
      {
        meds: ['warfarin', 'aspirin'],
        severity: 'high' as const,
        description: 'Increased bleeding risk',
        recommendation: 'Monitor INR closely and consider PPI'
      },
      {
        meds: ['metformin', 'contrast'],
        severity: 'moderate' as const,
        description: 'Risk of lactic acidosis',
        recommendation: 'Hold metformin 48h before and after contrast'
      }
    ];

    for (const combo of dangerousCombinations) {
      if (combo.meds.every(med => medications.some(patientMed => patientMed.includes(med)))) {
        interactions.push({
          medications: combo.meds,
          severity: combo.severity,
          description: combo.description,
          recommendation: combo.recommendation,
          evidenceScore: 0.85
        });
      }
    }

    return interactions;
  }

  private async calculateDiagnosisConfidence(entities: MedicalEntity[]): Promise<number> {
    const conditions = entities.filter(e => e.label === 'CONDITION');
    
    if (conditions.length === 0) return 0;

    // Calculate confidence based on entity confidence scores and supporting evidence
    const avgConfidence = conditions.reduce((sum, condition) => 
      sum + (condition.confidence || 0.5), 0) / conditions.length;

    return Math.round(avgConfidence * 100);
  }

  private async generateTreatmentRecommendations(entities: MedicalEntity[]): Promise<TreatmentRecommendation[]> {
    const conditions = entities.filter(e => e.label === 'CONDITION');
    const recommendations: TreatmentRecommendation[] = [];

    for (const condition of conditions.slice(0, 3)) { // Top 3 conditions
      // Use clinical knowledge base to get treatment options
      const treatments = await this.getEvidenceBasedTreatments(condition.text);
      
      recommendations.push({
        condition: condition.text,
        treatments,
        reasoning: `Evidence-based treatments for ${condition.text} based on current clinical guidelines`
      });
    }

    return recommendations;
  }

  private async analyzeTemporalTrends(documents: MedicalDocument[]): Promise<TemporalTrend[]> {
    // Group documents by time periods and analyze trends
    const sortedDocs = documents.sort((a, b) => 
      a.metadata.uploadedAt.getTime() - b.metadata.uploadedAt.getTime()
    );

    const trends: TemporalTrend[] = [];

    // Analyze medication changes over time
    const medicationTimeline = sortedDocs.map(doc => ({
      date: doc.metadata.uploadedAt,
      medications: doc.medicalEntities?.filter(e => e.label === 'MEDICATION').length || 0
    }));

    if (medicationTimeline.length > 1) {
      const trend = this.calculateTrendDirection(medicationTimeline.map(t => t.medications));
      trends.push({
        metric: 'Medication Complexity',
        timeline: medicationTimeline.map(t => ({ date: t.date, value: t.medications })),
        trend,
        significance: 0.8
      });
    }

    return trends;
  }

  private async compareToPopulation(entities: MedicalEntity[], patientId: string): Promise<PopulationMetric[]> {
    // Compare patient metrics to population averages
    const metrics: PopulationMetric[] = [];

    const conditionCount = entities.filter(e => e.label === 'CONDITION').length;
    const medicationCount = entities.filter(e => e.label === 'MEDICATION').length;

    // Mock population data - in real implementation, query from database
    metrics.push({
      category: 'Condition Count',
      patientValue: conditionCount,
      populationMean: 2.3,
      percentile: this.calculatePercentile(conditionCount, 2.3, 1.2),
      normalRange: [1, 4],
      riskLevel: conditionCount > 4 ? 'high' : conditionCount > 2 ? 'elevated' : 'normal'
    });

    metrics.push({
      category: 'Medication Count',
      patientValue: medicationCount,
      populationMean: 3.1,
      percentile: this.calculatePercentile(medicationCount, 3.1, 1.8),
      normalRange: [1, 5],
      riskLevel: medicationCount > 5 ? 'high' : medicationCount > 3 ? 'elevated' : 'normal'
    });

    return metrics;
  }

  // Additional helper methods
  private async checkMissingFollowUps(documents: MedicalDocument[]): Promise<ClinicalAlert[]> {
    const alerts: ClinicalAlert[] = [];
    
    // Check for recent procedures requiring follow-up
    const recentProcedures = documents.filter(doc => {
      const isRecent = (Date.now() - doc.metadata.uploadedAt.getTime()) < (14 * 24 * 60 * 60 * 1000);
      const hasProcedure = doc.medicalEntities?.some(e => e.label === 'PROCEDURE');
      return isRecent && hasProcedure;
    });

    if (recentProcedures.length > 0 && documents.length === recentProcedures.length) {
      alerts.push({
        id: `followup-${Date.now()}`,
        severity: 'warning',
        category: 'followup',
        message: 'Recent procedure may require follow-up appointment',
        evidence: ['No follow-up documentation found'],
        actionRequired: true,
        timestamp: new Date()
      });
    }

    return alerts;
  }

  private async checkAbnormalLabTrends(entities: MedicalEntity[]): Promise<ClinicalAlert[]> {
    // In real implementation, analyze lab values and trends
    return [];
  }

  private async extractOutcomeMetrics(documents: MedicalDocument[], medication: string) {
    // Analyze documents for outcome indicators
    let efficacyCount = 0;
    let adverseEventCount = 0;
    let discontinuationCount = 0;

    documents.forEach(doc => {
      const content = doc.content.toLowerCase();
      if (content.includes('improved') || content.includes('better')) efficacyCount++;
      if (content.includes('side effect') || content.includes('adverse')) adverseEventCount++;
      if (content.includes('discontinue') || content.includes('stop')) discontinuationCount++;
    });

    return {
      efficacy: documents.length > 0 ? efficacyCount / documents.length : 0,
      adverseEvents: documents.length > 0 ? adverseEventCount / documents.length : 0,
      discontinuationRate: documents.length > 0 ? discontinuationCount / documents.length : 0
    };
  }

  private async getEvidenceBasedTreatments(condition: string) {
    // Mock clinical guidelines - in real implementation, query medical knowledge base
    const treatmentMap: Record<string, any[]> = {
      'diabetes': [
        {
          name: 'Metformin',
          efficacyScore: 0.85,
          contraindications: ['kidney disease', 'heart failure'],
          evidenceLevel: 'A' as const
        },
        {
          name: 'Lifestyle modification',
          efficacyScore: 0.75,
          contraindications: [],
          evidenceLevel: 'A' as const
        }
      ],
      'hypertension': [
        {
          name: 'ACE inhibitor',
          efficacyScore: 0.80,
          contraindications: ['pregnancy', 'hyperkalemia'],
          evidenceLevel: 'A' as const
        }
      ]
    };

    const conditionKey = Object.keys(treatmentMap).find(key => 
      condition.toLowerCase().includes(key)
    );

    return treatmentMap[conditionKey] || [];
  }

  private calculateTrendDirection(values: number[]): 'improving' | 'stable' | 'declining' | 'fluctuating' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / firstAvg;

    if (Math.abs(change) < 0.1) return 'stable';
    if (change > 0.1) return 'improving';
    if (change < -0.1) return 'declining';
    return 'fluctuating';
  }

  private calculatePercentile(value: number, mean: number, stdDev: number): number {
    // Simplified percentile calculation assuming normal distribution
    const zScore = (value - mean) / stdDev;
    return Math.round(Math.max(0, Math.min(100, 50 + (zScore * 15))));
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Medical Analytics Service not initialized. Call initialize() first.');
    }
  }

  // Public getters
  isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  getServiceInfo() {
    return {
      initialized: this.isInitialized,
      capabilities: [
        'patient-risk-scoring',
        'medication-interaction-analysis',
        'temporal-trend-analysis',
        'population-comparison',
        'clinical-alerts',
        'treatment-recommendations',
        'cohort-analysis'
      ]
    };
  }
}