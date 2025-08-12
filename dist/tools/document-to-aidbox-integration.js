export class DocumentToAidboxIntegration {
    mongoClient;
    aidboxServerUrl;
    requestId = 1;
    constructor(mongoClient, aidboxServerUrl = 'http://localhost:3002') {
        this.mongoClient = mongoClient;
        this.aidboxServerUrl = aidboxServerUrl.replace(/\/$/, ''); // Remove trailing slash
    }
    // Helper: Send MCP request to Aidbox server
    async sendMCPRequest(method, params) {
        const request = {
            jsonrpc: '2.0',
            method,
            params,
            id: this.requestId++
        };
        const response = await fetch(`${this.aidboxServerUrl}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request)
        });
        if (!response.ok) {
            throw new Error(`Aidbox MCP request failed: ${response.statusText}`);
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(`Aidbox MCP error: ${result.error.message}`);
        }
        return result.result;
    }
    // Helper: Call Aidbox tool via MCP
    async callAidboxTool(toolName, toolArguments) {
        return await this.sendMCPRequest('tools/call', {
            name: toolName,
            arguments: toolArguments
        });
    }
    // Main integration tool
    createDocumentToAidboxTool() {
        return {
            name: 'syncDocumentToAidbox',
            description: 'Extract medical information from uploaded document and create corresponding FHIR resources in Aidbox via MCP',
            inputSchema: {
                type: 'object',
                properties: {
                    documentId: {
                        type: 'string',
                        description: 'MongoDB document ID to process'
                    },
                    patientId: {
                        type: 'string',
                        description: 'Aidbox patient ID to associate resources with'
                    },
                    patientSearch: {
                        type: 'object',
                        description: 'Search criteria to find patient if ID not provided',
                        properties: {
                            name: { type: 'string' },
                            birthDate: { type: 'string' },
                            identifier: { type: 'string' }
                        }
                    },
                    createPatientIfNotFound: {
                        type: 'boolean',
                        description: 'Create new patient if search finds none',
                        default: false
                    },
                    resourceTypes: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: ['conditions', 'observations', 'medications', 'all']
                        },
                        description: 'Types of FHIR resources to create (default: all)'
                    }
                },
                required: ['documentId']
            }
        };
    }
    async handleSyncDocumentToAidbox(args) {
        const result = {
            documentId: args.documentId,
            created: {
                conditions: [],
                observations: [],
                medications: []
            },
            errors: []
        };
        try {
            // Step 1: Retrieve document and medical entities from MongoDB
            console.log(`📄 Retrieving document ${args.documentId} from MongoDB...`);
            const document = await this.mongoClient.getDocument(args.documentId);
            if (!document) {
                throw new Error(`Document ${args.documentId} not found`);
            }
            const medicalEntities = document.medicalEntities || [];
            console.log(`🔍 Found ${medicalEntities.length} medical entities in document`);
            // Step 2: Resolve patient ID via Aidbox MCP
            let patientId = args.patientId;
            if (!patientId && args.patientSearch) {
                console.log(`👤 Searching for patient via Aidbox MCP...`);
                const searchResult = await this.callAidboxTool('aidboxSearchPatients', args.patientSearch);
                const patients = searchResult.patients;
                if (patients && patients.length > 0) {
                    patientId = patients[0].id;
                    console.log(`✅ Found patient: ${patientId}`);
                }
                else if (args.createPatientIfNotFound && args.patientSearch.name) {
                    console.log(`➕ Creating new patient via Aidbox MCP...`);
                    const names = args.patientSearch.name.split(' ');
                    const createResult = await this.callAidboxTool('aidboxCreatePatient', {
                        given: names[0],
                        family: names[names.length - 1],
                        birthDate: args.patientSearch.birthDate
                    });
                    patientId = createResult.patientId;
                }
            }
            if (!patientId) {
                throw new Error('Patient ID required but not found or created');
            }
            result.patientId = patientId;
            // Step 3: Process medical entities and create FHIR resources via MCP
            const resourceTypes = args.resourceTypes || ['all'];
            const shouldCreate = (type) => resourceTypes.includes('all') || resourceTypes.includes(type);
            // Group entities by type
            const conditions = medicalEntities.filter(e => e.label === 'DIAGNOSIS' || e.label === 'CONDITION' || e.label === 'DISEASE');
            const medications = medicalEntities.filter(e => e.label === 'MEDICATION' || e.label === 'DRUG' || e.label === 'TREATMENT');
            const labResults = medicalEntities.filter(e => e.label === 'LAB_RESULT' || e.label === 'TEST' || e.label === 'MEASUREMENT');
            // Create Conditions in Aidbox via MCP
            if (shouldCreate('conditions') && conditions.length > 0) {
                console.log(`🏥 Creating ${conditions.length} conditions in Aidbox via MCP...`);
                for (const condition of conditions) {
                    try {
                        const conditionArgs = {
                            patientId,
                            display: condition.text,
                            clinicalStatus: 'active',
                            onsetDateTime: document.metadata?.uploadedAt?.toISOString() || new Date().toISOString()
                        };
                        const createResult = await this.callAidboxTool('aidboxCreateCondition', conditionArgs);
                        result.created.conditions.push(createResult.condition.id);
                    }
                    catch (error) {
                        result.errors.push(`Failed to create condition "${condition.text}": ${error.message}`);
                    }
                }
            }
            // Create Medication Requests in Aidbox via MCP
            if (shouldCreate('medications') && medications.length > 0) {
                console.log(`💊 Creating ${medications.length} medication requests in Aidbox via MCP...`);
                for (const medication of medications) {
                    try {
                        const medicationArgs = {
                            patientId,
                            medication: medication.text,
                            dosageText: 'As directed',
                            status: 'active',
                            intent: 'order',
                            authoredOn: document.metadata?.uploadedAt?.toISOString() || new Date().toISOString()
                        };
                        const createResult = await this.callAidboxTool('aidboxCreateMedicationRequest', medicationArgs);
                        result.created.medications.push(createResult.medicationRequest.id);
                    }
                    catch (error) {
                        result.errors.push(`Failed to create medication "${medication.text}": ${error.message}`);
                    }
                }
            }
            // Create Observations in Aidbox via MCP
            if (shouldCreate('observations') && labResults.length > 0) {
                console.log(`🔬 Creating ${labResults.length} observations in Aidbox via MCP...`);
                for (const labResult of labResults) {
                    try {
                        // Parse value if present (e.g., "Glucose 95 mg/dL")
                        const valueMatch = labResult.text.match(/(\d+\.?\d*)\s*([a-zA-Z/%]+)?/);
                        const observationArgs = {
                            patientId,
                            code: labResult.text.replace(/\d+\.?\d*\s*[a-zA-Z/%]+/, '').trim(),
                            status: 'final',
                            effectiveDateTime: document.metadata?.uploadedAt?.toISOString() || new Date().toISOString()
                        };
                        if (valueMatch) {
                            observationArgs.value = parseFloat(valueMatch[1]);
                            if (valueMatch[2]) {
                                observationArgs.unit = valueMatch[2];
                            }
                        }
                        const createResult = await this.callAidboxTool('aidboxCreateObservation', observationArgs);
                        result.created.observations.push(createResult.observation.id);
                    }
                    catch (error) {
                        result.errors.push(`Failed to create observation "${labResult.text}": ${error.message}`);
                    }
                }
            }
            // Step 4: Update document metadata with Aidbox references
            await this.updateDocumentWithAidboxRefs(args.documentId, result);
            // Return comprehensive result
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Document successfully synced to Aidbox via MCP',
                            documentId: args.documentId,
                            patientId: result.patientId,
                            resourcesCreated: {
                                conditions: result.created.conditions.length,
                                medications: result.created.medications.length,
                                observations: result.created.observations.length,
                                total: result.created.conditions.length +
                                    result.created.medications.length +
                                    result.created.observations.length
                            },
                            createdIds: result.created,
                            errors: result.errors,
                            timestamp: new Date().toISOString()
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            console.error('Document to Aidbox sync failed:', error);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error.message,
                            documentId: args.documentId,
                            partial: result,
                            timestamp: new Date().toISOString()
                        }, null, 2)
                    }],
                isError: true
            };
        }
    }
    // Helper: Update document with Aidbox references
    async updateDocumentWithAidboxRefs(documentId, result) {
        try {
            const updateData = {
                aidboxSync: {
                    synced: true,
                    syncedAt: new Date(),
                    patientId: result.patientId,
                    resources: result.created,
                    errors: result.errors
                }
            };
            await this.mongoClient.updateDocument(documentId, updateData);
            console.log(`✅ Updated document with Aidbox references`);
        }
        catch (error) {
            console.error('Failed to update document with Aidbox refs:', error);
        }
    }
    // Batch sync tool for multiple documents
    createBatchSyncTool() {
        return {
            name: 'batchSyncDocumentsToAidbox',
            description: 'Sync multiple documents to Aidbox in batch via MCP',
            inputSchema: {
                type: 'object',
                properties: {
                    documentIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of document IDs to sync'
                    },
                    patientId: {
                        type: 'string',
                        description: 'Single patient ID for all documents'
                    },
                    patientMapping: {
                        type: 'object',
                        description: 'Map of documentId to patientId',
                        additionalProperties: { type: 'string' }
                    }
                },
                required: ['documentIds']
            }
        };
    }
    async handleBatchSync(args) {
        const results = [];
        for (const documentId of args.documentIds) {
            const patientId = args.patientMapping?.[documentId] || args.patientId;
            const syncArgs = {
                documentId,
                patientId,
                resourceTypes: ['all']
            };
            const result = await this.handleSyncDocumentToAidbox(syncArgs);
            results.push(JSON.parse(result.content[0].text));
        }
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        message: `Batch sync completed for ${results.length} documents`,
                        results,
                        summary: {
                            total: results.length,
                            successful: results.filter(r => r.success).length,
                            failed: results.filter(r => !r.success).length
                        }
                    }, null, 2)
                }]
        };
    }
    // Query tool to check sync status
    createSyncStatusTool() {
        return {
            name: 'getDocumentSyncStatus',
            description: 'Check if a document has been synced to Aidbox',
            inputSchema: {
                type: 'object',
                properties: {
                    documentId: {
                        type: 'string',
                        description: 'Document ID to check'
                    }
                },
                required: ['documentId']
            }
        };
    }
    async handleGetSyncStatus(args) {
        try {
            const document = await this.mongoClient.getDocument(args.documentId);
            if (!document) {
                throw new Error(`Document ${args.documentId} not found`);
            }
            const syncInfo = document.aidboxSync || { synced: false };
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            documentId: args.documentId,
                            filename: document.title,
                            syncStatus: syncInfo,
                            medicalEntitiesCount: document.medicalEntities?.length || 0
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error.message
                        }, null, 2)
                    }],
                isError: true
            };
        }
    }
    // Get all integration tools
    getAllTools() {
        return [
            this.createDocumentToAidboxTool(),
            this.createBatchSyncTool(),
            this.createSyncStatusTool()
        ];
    }
}
//# sourceMappingURL=document-to-aidbox-integration.js.map