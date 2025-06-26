import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient, MedicalDocument, MedicalEntity } from '../db/mongodb-client.js';
import { MedicalNERService } from '../services/medical-ner-service.js';
import { EmbeddingService } from '../services/embedding-service.js';

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

export class MedicalTools {
  constructor(
    private mongoClient: MongoDBClient,
    private nerService: MedicalNERService,
    private embeddingService: EmbeddingService
  ) {}

  createExtractMedicalEntitiesTool(): Tool {
    return {
      name: 'extractMedicalEntities',
      description: 'Extract medical entities (medications, conditions, procedures, etc.) from text',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to analyze for medical entities'
          },
          documentId: {
            type: 'string',
            description: 'Optional document ID to update with extracted entities'
          },
          entityTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['MEDICATION', 'CONDITION', 'PROCEDURE', 'ANATOMY', 'SYMPTOM', 'PERSON', 'DATE', 'MEASUREMENT']
            },
            description: 'Specific entity types to extract (default: all types)'
          }
        },
        required: ['text']
      }
    };
  }

  async handleExtractMedicalEntities(args: ExtractMedicalEntitiesRequest): Promise<any> {
    try {
      // Extract entities from text
      const nerResult = await this.nerService.extractEntities(args.text);
      
      // Filter by entity types if specified
      let entities = nerResult.entities;
      if (args.entityTypes && args.entityTypes.length > 0) {
        entities = entities.filter(entity => args.entityTypes!.includes(entity.label));
      }

      // Update document if ID provided
      if (args.documentId) {
        await this.mongoClient.updateDocument(args.documentId, {
          medicalEntities: entities
        });
      }

      // Group entities by type
      const entitiesByType = this.nerService.getEntityStatistics(entities);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              entitiesFound: entities.length,
              confidence: nerResult.confidence,
              entitiesByType,
              entities: entities.map(entity => ({
                text: entity.text,
                label: entity.label,
                confidence: entity.confidence,
                context: entity.context?.substring(0, 100) + '...'
              })),
              documentUpdated: !!args.documentId
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              message: 'Failed to extract medical entities'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  createFindSimilarCasesTool(): Tool {
    return {
      name: 'findSimilarCases',
      description: 'Find similar medical cases based on symptoms, conditions, or medications',
      inputSchema: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID to find similar cases for'
          },
          documentId: {
            type: 'string',
            description: 'Document ID to find similar cases for'
          },
          symptoms: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of symptoms to match'
          },
          conditions: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of conditions to match'
          },
          medications: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of medications to match'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of similar cases to return (default: 10)',
            minimum: 1,
            maximum: 50
          }
        }
      }
    };
  }

  async handleFindSimilarCases(args: FindSimilarCasesRequest): Promise<any> {
    try {
      let searchTerms: string[] = [];
      let referenceDocument: MedicalDocument | null = null;

      // Get reference data
      if (args.documentId) {
        referenceDocument = await this.mongoClient.findDocumentById(args.documentId);
        if (referenceDocument?.medicalEntities) {
          searchTerms = referenceDocument.medicalEntities.map(e => e.text);
        }
      } else if (args.patientId) {
        const patientDocs = await this.mongoClient.getPatientDocuments(args.patientId);
        if (patientDocs.length > 0) {
          // Use the most recent document
          referenceDocument = patientDocs[0];
          if (referenceDocument?.medicalEntities) {
            searchTerms = referenceDocument.medicalEntities.map(e => e.text);
          }
        }
      }

      // Add manual search terms
      if (args.symptoms) searchTerms.push(...args.symptoms);
      if (args.conditions) searchTerms.push(...args.conditions);
      if (args.medications) searchTerms.push(...args.medications);

      if (searchTerms.length === 0) {
        throw new Error('No search criteria provided');
      }

      // Create search query
      const searchQuery = searchTerms.join(' ');
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(searchQuery);

      // Exclude the reference patient/document from results
      const excludeFilter: Record<string, any> = {};
      if (args.patientId) {
        excludeFilter['metadata.patientId'] = { $ne: args.patientId };
      }
      if (args.documentId) {
        excludeFilter['_id'] = { $ne: args.documentId };
      }

      // Search for similar cases
      const similarCases = await this.mongoClient.vectorSearch(
        queryEmbedding,
        args.limit || 10,
        0.6, // Lower threshold for finding similar cases
        excludeFilter
      );

      // Analyze similarity reasons
      const analyzedCases = similarCases.map(result => {
        const commonEntities = this.findCommonEntities(
          referenceDocument?.medicalEntities || [],
          result.document.medicalEntities || []
        );

        return {
          id: result.document._id,
          title: result.document.title,
          patientId: result.document.metadata.patientId,
          documentType: result.document.metadata.documentType,
          similarity: result.score,
          commonEntities,
          summary: result.document.content.substring(0, 300) + '...'
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              searchCriteria: {
                patientId: args.patientId,
                documentId: args.documentId,
                searchTerms: searchTerms.slice(0, 10) // Limit for display
              },
              similarCasesFound: analyzedCases.length,
              cases: analyzedCases
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              message: 'Failed to find similar cases'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  createAnalyzePatientHistoryTool(): Tool {
    return {
      name: 'analyzePatientHistory',
      description: 'Analyze patient medical history and generate insights',
      inputSchema: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID to analyze'
          },
          analysisType: {
            type: 'string',
            enum: ['timeline', 'summary', 'trends'],
            description: 'Type of analysis to perform (default: summary)'
          },
          dateRange: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date' },
              end: { type: 'string', format: 'date' }
            },
            description: 'Date range for analysis'
          }
        },
        required: ['patientId']
      }
    };
  }

  async handleAnalyzePatientHistory(args: AnalyzePatientHistoryRequest): Promise<any> {
    try {
      // Get patient documents
      const patientDocs = await this.mongoClient.getPatientDocuments(args.patientId);
      
      if (patientDocs.length === 0) {
        throw new Error(`No documents found for patient ${args.patientId}`);
      }

      // Filter by date range if provided
      let filteredDocs = patientDocs;
      if (args.dateRange) {
        const startDate = new Date(args.dateRange.start);
        const endDate = new Date(args.dateRange.end);
        filteredDocs = patientDocs.filter(doc => {
          const docDate = doc.metadata.uploadedAt;
          return docDate >= startDate && docDate <= endDate;
        });
      }

      const analysisType = args.analysisType || 'summary';
      let analysis: any = {};

      switch (analysisType) {
        case 'timeline':
          analysis = this.generateTimeline(filteredDocs);
          break;
        case 'summary':
          analysis = this.generateSummary(filteredDocs);
          break;
        case 'trends':
          analysis = this.generateTrends(filteredDocs);
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              patientId: args.patientId,
              analysisType,
              documentsAnalyzed: filteredDocs.length,
              dateRange: args.dateRange,
              analysis
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              message: 'Failed to analyze patient history'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  createMedicalInsightsTool(): Tool {
    return {
      name: 'getMedicalInsights',
      description: 'Get medical insights and recommendations based on query and context',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Medical query or question'
          },
          context: {
            type: 'object',
            properties: {
              patientAge: { type: 'number' },
              gender: { type: 'string' },
              conditions: {
                type: 'array',
                items: { type: 'string' }
              },
              medications: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            description: 'Patient context for personalized insights'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of insights to return (default: 5)',
            minimum: 1,
            maximum: 20
          }
        },
        required: ['query']
      }
    };
  }

  async handleMedicalInsights(args: MedicalInsightsRequest): Promise<any> {
    try {
      // Generate query embedding with context
      let contextualQuery = args.query;
      if (args.context) {
        const contextParts = [];
        if (args.context.patientAge) contextParts.push(`Age: ${args.context.patientAge}`);
        if (args.context.gender) contextParts.push(`Gender: ${args.context.gender}`);
        if (args.context.conditions) contextParts.push(`Conditions: ${args.context.conditions.join(', ')}`);
        if (args.context.medications) contextParts.push(`Medications: ${args.context.medications.join(', ')}`);
        
        if (contextParts.length > 0) {
          contextualQuery = `${contextParts.join('; ')}. Query: ${args.query}`;
        }
      }

      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(contextualQuery);

      // Search for relevant documents
      const relevantDocs = await this.mongoClient.vectorSearch(
        queryEmbedding,
        args.limit || 5,
        0.6
      );

      // Generate insights from relevant documents
      const insights = relevantDocs.map(result => {
        const doc = result.document;
        const relevantEntities = doc.medicalEntities?.filter(entity => 
          args.query.toLowerCase().includes(entity.text.toLowerCase()) ||
          (args.context?.conditions && args.context.conditions.some(condition => 
            entity.text.toLowerCase().includes(condition.toLowerCase())
          )) ||
          (args.context?.medications && args.context.medications.some(medication => 
            entity.text.toLowerCase().includes(medication.toLowerCase())
          ))
        ) || [];

        return {
          documentId: doc._id,
          title: doc.title,
          relevanceScore: result.score,
          documentType: doc.metadata.documentType,
          insight: this.extractInsight(doc.content, args.query),
          relevantEntities: relevantEntities.slice(0, 5),
          patientContext: doc.metadata.patientId ? 'Similar case' : 'General reference'
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              query: args.query,
              context: args.context,
              insightsFound: insights.length,
              insights
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              message: 'Failed to get medical insights'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  private findCommonEntities(entities1: MedicalEntity[], entities2: MedicalEntity[]): Array<{
    text: string;
    label: string;
    frequency: number;
  }> {
    const commonEntities = new Map<string, { label: string; frequency: number }>();

    entities1.forEach(entity1 => {
      entities2.forEach(entity2 => {
        if (entity1.text.toLowerCase() === entity2.text.toLowerCase() && 
            entity1.label === entity2.label) {
          const key = `${entity1.text.toLowerCase()}-${entity1.label}`;
          const existing = commonEntities.get(key);
          commonEntities.set(key, {
            label: entity1.label,
            frequency: (existing?.frequency || 0) + 1
          });
        }
      });
    });

    return Array.from(commonEntities.entries()).map(([key, value]) => ({
      text: key.split('-')[0],
      label: value.label,
      frequency: value.frequency
    }));
  }

  private generateTimeline(documents: MedicalDocument[]): any {
    const timeline = documents
      .sort((a, b) => a.metadata.uploadedAt.getTime() - b.metadata.uploadedAt.getTime())
      .map(doc => ({
        date: doc.metadata.uploadedAt.toISOString().split('T')[0],
        documentType: doc.metadata.documentType,
        title: doc.title,
        keyEntities: doc.medicalEntities?.slice(0, 5).map(e => e.text) || []
      }));

    return { timeline };
  }

  private generateSummary(documents: MedicalDocument[]): any {
    const allEntities = documents.flatMap(doc => doc.medicalEntities || []);
    const entityStats = this.nerService.getEntityStatistics(allEntities);
    
    const conditions = this.nerService.filterEntitiesByType(allEntities, 'CONDITION');
    const medications = this.nerService.filterEntitiesByType(allEntities, 'MEDICATION');
    const procedures = this.nerService.filterEntitiesByType(allEntities, 'PROCEDURE');

    return {
      totalDocuments: documents.length,
      documentTypes: this.getDocumentTypeDistribution(documents),
      entityStatistics: entityStats,
      topConditions: this.getTopEntities(conditions, 5),
      topMedications: this.getTopEntities(medications, 5),
      topProcedures: this.getTopEntities(procedures, 5)
    };
  }

  private generateTrends(documents: MedicalDocument[]): any {
    // Group documents by month
    const monthlyData = new Map<string, MedicalDocument[]>();
    
    documents.forEach(doc => {
      const monthKey = doc.metadata.uploadedAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, []);
      }
      monthlyData.get(monthKey)!.push(doc);
    });

    const trends = Array.from(monthlyData.entries()).map(([month, docs]) => {
      const allEntities = docs.flatMap(doc => doc.medicalEntities || []);
      const conditions = this.nerService.filterEntitiesByType(allEntities, 'CONDITION');
      const medications = this.nerService.filterEntitiesByType(allEntities, 'MEDICATION');

      return {
        month,
        documentCount: docs.length,
        conditionCount: conditions.length,
        medicationCount: medications.length,
        topConditions: this.getTopEntities(conditions, 3),
        topMedications: this.getTopEntities(medications, 3)
      };
    });

    return { trends: trends.sort((a, b) => a.month.localeCompare(b.month)) };
  }

  private getDocumentTypeDistribution(documents: MedicalDocument[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    documents.forEach(doc => {
      const type = doc.metadata.documentType || 'other';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    return distribution;
  }

  private getTopEntities(entities: MedicalEntity[], limit: number): Array<{ text: string; count: number }> {
    const entityCounts = new Map<string, number>();
    
    entities.forEach(entity => {
      const text = entity.text.toLowerCase();
      entityCounts.set(text, (entityCounts.get(text) || 0) + 1);
    });

    return Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([text, count]) => ({ text, count }));
  }

  private extractInsight(content: string, query: string): string {
    // Simple insight extraction - find sentences containing query terms
    const sentences = content.split(/[.!?]+/);
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    const relevantSentences = sentences.filter(sentence => 
      queryTerms.some(term => sentence.toLowerCase().includes(term))
    );

    return relevantSentences.slice(0, 2).join('. ').trim() + '.';
  }

  getAllTools(): Tool[] {
    return [
      this.createExtractMedicalEntitiesTool(),
      this.createFindSimilarCasesTool(),
      this.createAnalyzePatientHistoryTool(),
      this.createMedicalInsightsTool()
    ];
  }
}

