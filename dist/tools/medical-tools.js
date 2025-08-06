import { EntityMappingService } from '../services/entity-mapping-service.js';
/**
 * Medical Tools using BioClinical-Server for enhanced medical entity extraction
 * Provides backward compatibility with legacy interfaces while using state-of-the-art models
 */
export class MedicalTools {
    mongoClient;
    bioClinicalConnection;
    embeddingService;
    constructor(mongoClient, bioClinicalConnection, embeddingService) {
        this.mongoClient = mongoClient;
        this.bioClinicalConnection = bioClinicalConnection;
        this.embeddingService = embeddingService;
    }
    createExtractMedicalEntitiesTool() {
        return {
            name: 'extractMedicalEntities',
            description: 'Extract medical entities from text or a stored document using Clinical-AI-Apollo/Medical-NER model',
            inputSchema: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Text to analyze for medical entities'
                    },
                    documentId: {
                        type: 'string',
                        description: 'ID of a stored document to analyze'
                    },
                    entityTypes: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: ['MEDICATION', 'CONDITION', 'PROCEDURE', 'ANATOMY', 'SYMPTOM', 'PERSON', 'DATE', 'MEASUREMENT']
                        },
                        description: 'Specific entity types to extract (mapped from BioClinical types)'
                    },
                    confidenceThreshold: {
                        type: 'number',
                        minimum: 0.0,
                        maximum: 1.0,
                        default: 0.5,
                        description: 'Minimum confidence threshold for entity extraction'
                    }
                },
                oneOf: [
                    { required: ['text'] },
                    { required: ['documentId'] }
                ]
            }
        };
    }
    async handleExtractMedicalEntities(args) {
        try {
            let textToProcess = args.text;
            let documentTitle = '';
            // If no text provided but documentId is present, fetch the document
            if (!textToProcess && args.documentId) {
                console.log(`📄 Fetching document with ID: ${args.documentId}`);
                // Fetch the document from MongoDB
                const document = await this.mongoClient.getDocument(args.documentId);
                if (!document) {
                    throw new Error(`Document not found with ID: ${args.documentId}`);
                }
                textToProcess = document.content;
                documentTitle = document.title;
                // If entities were already extracted during upload, return them
                if (document.medicalEntities && document.medicalEntities.length > 0) {
                    console.log(`✅ Returning previously extracted entities for document: ${args.documentId}`);
                    // Map to MappedEntity format for consistency
                    const mappedEntities = document.medicalEntities.map(entity => ({
                        text: entity.text,
                        label: entity.label,
                        confidence: entity.confidence,
                        start: entity.start,
                        end: entity.end,
                        context: undefined
                    }));
                    // Filter by entity types if specified
                    let filteredEntities = mappedEntities;
                    if (args.entityTypes && args.entityTypes.length > 0) {
                        filteredEntities = mappedEntities.filter(entity => args.entityTypes.includes(entity.label));
                    }
                    const entitiesByType = EntityMappingService.getEntityStatistics(filteredEntities);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    success: true,
                                    documentId: args.documentId,
                                    documentTitle: documentTitle,
                                    entitiesFound: filteredEntities.length,
                                    entitiesByType,
                                    entities: filteredEntities.map(entity => ({
                                        text: entity.text,
                                        label: entity.label,
                                        confidence: entity.confidence,
                                        start: entity.start,
                                        end: entity.end
                                    })),
                                    message: 'Entities retrieved from stored document',
                                    cached: true,
                                    processingModel: 'Clinical-AI-Apollo/Medical-NER'
                                }, null, 2)
                            }
                        ]
                    };
                }
            }
            // Validate that we have text to process
            if (!textToProcess || textToProcess.trim().length === 0) {
                throw new Error('Text cannot be empty. Please provide text or a valid documentId.');
            }
            console.log('🧬 Extracting medical entities using BioClinical-Server...');
            console.log(`🧬 Extracting medical entities from ${textToProcess.length} characters...`);
            // Extract entities using BioClinical server
            const confidenceThreshold = args.confidenceThreshold || 0.5;
            const bioClinicalResult = await this.bioClinicalConnection.extractMedicalEntities(textToProcess, confidenceThreshold);
            if (!bioClinicalResult.success) {
                throw new Error(bioClinicalResult.error || 'BioClinical extraction failed');
            }
            // Map BioClinical entities to legacy format for compatibility
            let mappedEntities = EntityMappingService.mapBioClinicalToLegacy(bioClinicalResult.entities);
            // Filter by entity types if specified (using mapped labels)
            if (args.entityTypes && args.entityTypes.length > 0) {
                mappedEntities = mappedEntities.filter(entity => args.entityTypes.includes(entity.label));
            }
            // Update document if ID provided
            if (args.documentId) {
                // Convert MappedEntity[] to MedicalEntity[] for storage
                const medicalEntities = mappedEntities.map(entity => ({
                    text: entity.text,
                    label: entity.label,
                    confidence: entity.confidence,
                    start: entity.start,
                    end: entity.end
                }));
                await this.mongoClient.updateDocumentEntities(args.documentId, medicalEntities);
                console.log(`💾 Updated document ${args.documentId} with ${medicalEntities.length} entities`);
            }
            // Generate statistics
            const entitiesByType = EntityMappingService.getEntityStatistics(mappedEntities);
            const result = {
                success: true,
                documentId: args.documentId,
                documentTitle: documentTitle || undefined,
                entitiesFound: mappedEntities.length,
                confidence: bioClinicalResult.confidence,
                entitiesByType,
                entities: mappedEntities.map(entity => ({
                    text: entity.text,
                    label: entity.label,
                    confidence: entity.confidence,
                    start: entity.start,
                    end: entity.end,
                    context: entity.context?.substring(0, 100) + ((entity.context?.length || 0) > 100 ? '...' : '')
                })),
                documentUpdated: !!args.documentId,
                cached: false,
                processingModel: 'Clinical-AI-Apollo/Medical-NER',
                processingTimeMs: bioClinicalResult.processingTimeMs,
                modelInfo: {
                    name: bioClinicalResult.model,
                    originalEntityTypes: ['PROBLEM', 'TREATMENT', 'TEST'],
                    mappedEntityTypes: Object.keys(entitiesByType)
                }
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            console.error('❌ Medical entity extraction failed:', error);
            const errorResult = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                documentId: args.documentId,
                processingModel: 'Clinical-AI-Apollo/Medical-NER',
                timestamp: new Date().toISOString()
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorResult, null, 2)
                    }
                ]
            };
        }
    }
    createFindSimilarCasesTool() {
        return {
            name: 'findSimilarCases',
            description: 'Find similar medical cases based on patient data or document content',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'Patient identifier'
                    },
                    documentId: {
                        type: 'string',
                        description: 'Document identifier'
                    },
                    symptoms: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of symptoms'
                    },
                    conditions: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of conditions'
                    },
                    medications: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of medications'
                    },
                    limit: {
                        type: 'number',
                        default: 5,
                        description: 'Maximum number of similar cases to return'
                    }
                }
            }
        };
    }
    async handleFindSimilarCases(args) {
        try {
            const searchTerms = [];
            // Collect search terms
            if (args.symptoms)
                searchTerms.push(...args.symptoms);
            if (args.conditions)
                searchTerms.push(...args.conditions);
            if (args.medications)
                searchTerms.push(...args.medications);
            // Search documents using proper MongoDB client method
            const documents = await this.mongoClient.getDocumentsByFilter({
                $text: { $search: searchTerms.join(' ') },
                ...(args.patientId && { 'metadata.patientId': args.patientId })
            }, args.limit || 5);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            casesFound: documents.length,
                            cases: documents.map(doc => ({
                                id: doc._id,
                                title: doc.title,
                                patientId: doc.metadata.patientId,
                                documentType: doc.metadata.documentType,
                                relevantEntities: doc.medicalEntities?.slice(0, 10) || [],
                                uploadDate: doc.metadata.uploadedAt
                            }))
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }
                ]
            };
        }
    }
    createAnalyzePatientHistoryTool() {
        return {
            name: 'analyzePatientHistory',
            description: 'Analyze patient medical history with timeline, summary, or trend analysis',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: {
                        type: 'string',
                        description: 'Patient identifier'
                    },
                    analysisType: {
                        type: 'string',
                        enum: ['timeline', 'summary', 'trends'],
                        default: 'summary',
                        description: 'Type of analysis to perform'
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
    async handleAnalyzePatientHistory(args) {
        try {
            const documents = await this.mongoClient.getPatientDocuments(args.patientId);
            let analysis;
            switch (args.analysisType) {
                case 'timeline':
                    analysis = this.generateTimeline(documents);
                    break;
                case 'trends':
                    analysis = this.generateTrends(documents);
                    break;
                default:
                    analysis = this.generateSummary(documents);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            patientId: args.patientId,
                            analysisType: args.analysisType || 'summary',
                            documentsAnalyzed: documents.length,
                            analysis
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }
                ]
            };
        }
    }
    createGetMedicalInsightsTool() {
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
                        default: 10,
                        description: 'Maximum number of insights to return'
                    }
                },
                required: ['query']
            }
        };
    }
    async handleGetMedicalInsights(args) {
        try {
            // Search for relevant documents using proper method
            const documents = await this.mongoClient.getDocumentsByFilter({ $text: { $search: args.query } }, args.limit || 10);
            // Extract insights from documents
            const insights = documents.map((doc) => {
                const relevantSentences = this.extractInsight(doc.content, args.query);
                return {
                    documentId: doc._id,
                    title: doc.title,
                    insight: relevantSentences,
                    relevantEntities: doc.medicalEntities?.filter((entity) => entity.text.toLowerCase().includes(args.query.toLowerCase())) || [],
                    confidence: this.calculateRelevanceScore(doc.content, args.query)
                };
            }).filter((insight) => insight.insight.length > 0);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            query: args.query,
                            insightsFound: insights.length,
                            insights: insights.slice(0, args.limit || 10)
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }
                ]
            };
        }
    }
    // Helper methods using EntityMappingService for compatibility
    generateTimeline(documents) {
        const timeline = documents
            .sort((a, b) => a.metadata.uploadedAt.getTime() - b.metadata.uploadedAt.getTime())
            .map(doc => ({
            date: doc.metadata.uploadedAt,
            documentType: doc.metadata.documentType,
            title: doc.title,
            entities: doc.medicalEntities?.map(e => e.text) || []
        }));
        return { timeline };
    }
    generateSummary(documents) {
        const allEntities = documents.flatMap(doc => doc.medicalEntities || []);
        const entityStats = EntityMappingService.getEntityStatistics(allEntities);
        const conditions = EntityMappingService.filterEntitiesByType(allEntities, 'CONDITION');
        const medications = EntityMappingService.filterEntitiesByType(allEntities, 'MEDICATION');
        const procedures = EntityMappingService.filterEntitiesByType(allEntities, 'PROCEDURE');
        return {
            totalDocuments: documents.length,
            documentTypes: this.getDocumentTypeDistribution(documents),
            entityStatistics: entityStats,
            topConditions: this.getTopEntities(conditions, 5),
            topMedications: this.getTopEntities(medications, 5),
            topProcedures: this.getTopEntities(procedures, 5)
        };
    }
    generateTrends(documents) {
        const monthlyData = new Map();
        documents.forEach(doc => {
            const monthKey = doc.metadata.uploadedAt.toISOString().substring(0, 7);
            if (!monthlyData.has(monthKey)) {
                monthlyData.set(monthKey, []);
            }
            monthlyData.get(monthKey).push(doc);
        });
        const trends = Array.from(monthlyData.entries()).map(([month, docs]) => {
            const allEntities = docs.flatMap(doc => doc.medicalEntities || []);
            const conditions = EntityMappingService.filterEntitiesByType(allEntities, 'CONDITION');
            const medications = EntityMappingService.filterEntitiesByType(allEntities, 'MEDICATION');
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
    getDocumentTypeDistribution(documents) {
        const distribution = {};
        documents.forEach(doc => {
            const type = doc.metadata.documentType || 'other';
            distribution[type] = (distribution[type] || 0) + 1;
        });
        return distribution;
    }
    getTopEntities(entities, limit) {
        const entityCounts = new Map();
        entities.forEach(entity => {
            const text = entity.text.toLowerCase();
            entityCounts.set(text, (entityCounts.get(text) || 0) + 1);
        });
        return Array.from(entityCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([text, count]) => ({ text, count }));
    }
    extractInsight(content, query) {
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const queryTerms = query.toLowerCase().split(/\s+/);
        const relevantSentences = sentences.filter(sentence => {
            const lowerSentence = sentence.toLowerCase();
            return queryTerms.some(term => lowerSentence.includes(term));
        });
        return relevantSentences.slice(0, 3).join('. ').trim();
    }
    calculateRelevanceScore(content, query) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const contentLower = content.toLowerCase();
        let score = 0;
        queryTerms.forEach(term => {
            const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
            score += matches;
        });
        return Math.min(score / queryTerms.length / 10, 1); // Normalize to 0-1
    }
    // Method to get all tools for server registration
    getAllTools() {
        return [
            this.createExtractMedicalEntitiesTool(),
            this.createFindSimilarCasesTool(),
            this.createAnalyzePatientHistoryTool(),
            this.createGetMedicalInsightsTool()
        ];
    }
}
//# sourceMappingURL=medical-tools.js.map