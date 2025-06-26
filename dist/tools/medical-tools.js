"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMedicalTools = registerMedicalTools;
const zod_1 = require("zod");
const mongodb_client_js_1 = require("../db/mongodb-client.js");
const medical_ner_service_js_1 = require("../services/medical-ner-service.js");
const embedding_service_js_1 = require("../services/embedding-service.js");
function registerMedicalTools(server) {
    // Extract Medical Entities Tool
    server.registerTool('extract_medical_entities', {
        title: 'Extract Medical Information',
        description: 'Extract medical entities (diagnoses, medications, lab results) from document',
        inputSchema: {
            documentId: zod_1.z.string().uuid(),
            includeConfidence: zod_1.z.boolean().default(true)
        }
    }, async ({ documentId, includeConfidence }) => {
        try {
            const document = await (0, mongodb_client_js_1.getDocument)(documentId);
            if (!document) {
                throw new Error('Document not found');
            }
            if (!document.extractedText) {
                throw new Error('Text not extracted yet. Run extract_text first.');
            }
            // Extract medical entities
            const entities = await (0, medical_ner_service_js_1.extractMedicalEntities)(document.extractedText, includeConfidence);
            // Generate embeddings for the document
            const embedding = await (0, embedding_service_js_1.generateEmbedding)(document.extractedText);
            // Update document with processed data
            await (0, mongodb_client_js_1.updateDocumentStatus)(documentId, 'processed', {
                processedData: entities,
                embedding
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            documentId,
                            entities: {
                                patientInfo: entities.patientInfo,
                                diagnoses: entities.diagnoses,
                                medications: entities.medications,
                                labResults: entities.labResults,
                                vitalSigns: entities.vitalSigns
                            },
                            summary: {
                                diagnosisCount: entities.diagnoses.length,
                                medicationCount: entities.medications.length,
                                labResultCount: entities.labResults.length
                            }
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error extracting medical entities: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
    // Search by Diagnosis Tool
    server.registerTool('search_by_diagnosis', {
        title: 'Search Patient Diagnosis',
        description: 'Search for specific diagnosis information for a patient',
        inputSchema: {
            patientIdentifier: zod_1.z.string(),
            diagnosisQuery: zod_1.z.string().optional(),
            sessionId: zod_1.z.string()
        }
    }, async ({ patientIdentifier, diagnosisQuery, sessionId }) => {
        try {
            const documents = await (0, mongodb_client_js_1.getPatientDocuments)(patientIdentifier, sessionId);
            if (documents.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: 'No documents found for this patient.'
                        }]
                };
            }
            // Filter documents with diagnoses
            const relevantDocs = documents
                .filter(doc => doc.processedData?.diagnoses?.length > 0)
                .map(doc => ({
                documentId: doc._id,
                filename: doc.filename,
                uploadDate: doc.uploadDate,
                diagnoses: doc.processedData.diagnoses.filter((diag) => !diagnosisQuery ||
                    diag.condition.toLowerCase().includes(diagnosisQuery.toLowerCase()))
            }))
                .filter(doc => doc.diagnoses.length > 0);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            patient: patientIdentifier,
                            query: diagnosisQuery || 'all diagnoses',
                            results: relevantDocs,
                            totalDocuments: documents.length,
                            documentsWithDiagnoses: relevantDocs.length
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error searching diagnoses: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
    // Semantic Search Tool
    server.registerTool('semantic_search', {
        title: 'Semantic Search',
        description: 'Search medical documents using natural language queries',
        inputSchema: {
            query: zod_1.z.string(),
            patientId: zod_1.z.string().optional(),
            limit: zod_1.z.number().int().positive().default(5)
        }
    }, async ({ query, patientId, limit }) => {
        try {
            const results = await (0, embedding_service_js_1.semanticSearch)(query, { patientId, limit });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            query,
                            resultCount: results.length,
                            results: results.map(r => ({
                                documentId: r.documentId,
                                filename: r.filename,
                                relevanceScore: r.score,
                                excerpt: r.excerpt,
                                metadata: r.metadata
                            }))
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error performing semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
    // Get Patient Summary Tool
    server.registerTool('get_patient_summary', {
        title: 'Get Patient Summary',
        description: 'Generate a comprehensive summary of patient medical records',
        inputSchema: {
            patientIdentifier: zod_1.z.string(),
            summaryType: zod_1.z.enum(['brief', 'detailed']).default('brief')
        }
    }, async ({ patientIdentifier, summaryType }) => {
        try {
            const documents = await (0, mongodb_client_js_1.getPatientDocuments)(patientIdentifier);
            if (documents.length === 0) {
                return {
                    content: [{
                            type: 'text',
                            text: 'No documents found for this patient.'
                        }]
                };
            }
            // Aggregate medical data
            const allDiagnoses = [];
            const allMedications = [];
            const allLabResults = [];
            documents.forEach(doc => {
                if (doc.processedData) {
                    allDiagnoses.push(...(doc.processedData.diagnoses || []));
                    allMedications.push(...(doc.processedData.medications || []));
                    allLabResults.push(...(doc.processedData.labResults || []));
                }
            });
            // Create summary based on type
            const summary = {
                patient: patientIdentifier,
                totalDocuments: documents.length,
                dateRange: {
                    earliest: documents[documents.length - 1]?.uploadDate,
                    latest: documents[0]?.uploadDate
                },
                diagnoses: {
                    total: allDiagnoses.length,
                    unique: [...new Set(allDiagnoses.map(d => d.condition))],
                    chronic: allDiagnoses.filter(d => d.severity === 'chronic')
                },
                medications: {
                    total: allMedications.length,
                    active: [...new Set(allMedications.map(m => m.name))]
                },
                labResults: {
                    total: allLabResults.length,
                    abnormal: allLabResults.filter(l => l.abnormal).length
                }
            };
            if (summaryType === 'detailed') {
                Object.assign(summary, {
                    recentDiagnoses: allDiagnoses.slice(0, 5),
                    currentMedications: allMedications.slice(0, 10),
                    recentLabResults: allLabResults.slice(0, 10)
                });
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify(summary, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error generating patient summary: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=medical-tools.js.map