/**
 * Connection service for BioClinical-Server MCP integration
 * Handles communication with the Clinical-AI-Apollo/Medical-NER model server
 */
export class BioClinicalServerConnection {
    baseUrl;
    sessionId = null;
    isInitialized = false;
    requestId = 1;
    connectionTimeout = 30000; // 30 seconds
    healthCheckTimeout = 5000; // 5 seconds
    constructor(baseUrl = 'http://localhost:8001') {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        console.log(`🧬 BioClinical Server Connection initialized for: ${this.baseUrl}`);
    }
    /**
     * Establish connection to BioClinical-Server
     * Performs health check, MCP initialization, and tool discovery
     */
    async connect() {
        try {
            console.log(`🔗 Connecting to BioClinical Server at: ${this.baseUrl}`);
            // Step 1: Health check
            const healthCheck = await this.checkServerHealth();
            if (!healthCheck.ok) {
                throw new Error(`BioClinical Server not responding at ${this.baseUrl}: ${healthCheck.error}`);
            }
            console.log('✅ BioClinical Server health check passed');
            // Step 2: Initialize MCP connection
            const initResult = await this.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: false
                    }
                },
                clientInfo: {
                    name: 'medical-mcp-client',
                    version: '1.0.0'
                }
            });
            console.log('📡 MCP initialization successful:', initResult);
            // Step 3: Send initialized notification
            await this.sendNotification('notifications/initialized', {});
            // Step 4: Discover available tools
            const toolsResult = await this.sendRequest('tools/list', {});
            const toolCount = toolsResult.tools?.length || 0;
            console.log(`🛠️ BioClinical Server connected successfully!`);
            console.log(`📊 Available tools: ${toolCount}`);
            if (toolsResult.tools) {
                console.log('🔧 Tool details:');
                toolsResult.tools.forEach((tool, index) => {
                    console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
                });
            }
            this.isInitialized = true;
        }
        catch (error) {
            console.error('❌ Failed to connect to BioClinical Server:', error);
            throw error;
        }
    }
    /**
     * Extract medical entities from text using BioClinical-Server
     * @param text - Text to analyze for medical entities
     * @param confidenceThreshold - Minimum confidence score (0.0-1.0)
     * @param entityTypes - Optional filter for specific entity types
     * @returns Promise<BioClinicalResult>
     */
    async extractMedicalEntities(text, confidenceThreshold = 0.5, entityTypes) {
        if (!this.isInitialized) {
            throw new Error('BioClinical Server not connected. Call connect() first.');
        }
        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }
        if (confidenceThreshold < 0 || confidenceThreshold > 1) {
            throw new Error('Confidence threshold must be between 0.0 and 1.0');
        }
        try {
            console.log(`🧬 Extracting medical entities from ${text.length} characters...`);
            const result = await this.sendRequest('tools/call', {
                name: 'extractMedicalEntities',
                arguments: {
                    text,
                    confidenceThreshold,
                    entityTypes
                }
            });
            // Parse the result from the tool call
            const parsedResult = JSON.parse(result.content[0].text);
            console.log(`✅ Entity extraction completed: ${parsedResult.entitiesFound} entities found`);
            return parsedResult;
        }
        catch (error) {
            console.error('❌ Failed to extract medical entities:', error);
            throw error;
        }
    }
    /**
     * Get information about the loaded BioClinical model
     * @returns Promise<BioClinicalModelInfo>
     */
    async getModelInfo() {
        if (!this.isInitialized) {
            throw new Error('BioClinical Server not connected. Call connect() first.');
        }
        try {
            console.log('📊 Retrieving BioClinical model information...');
            const result = await this.sendRequest('tools/call', {
                name: 'getModelInfo',
                arguments: {}
            });
            const modelInfo = JSON.parse(result.content[0].text);
            console.log(`✅ Model info retrieved: ${modelInfo.modelName}`);
            return modelInfo;
        }
        catch (error) {
            console.error('❌ Failed to get model info:', error);
            throw error;
        }
    }
    /**
     * Check if the connection is active and healthy
     * @returns Promise<boolean>
     */
    async isConnected() {
        if (!this.isInitialized) {
            return false;
        }
        try {
            const health = await this.checkServerHealth();
            return health.ok;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Disconnect from the BioClinical server
     */
    async disconnect() {
        this.isInitialized = false;
        this.sessionId = null;
        console.log('🔌 Disconnected from BioClinical Server');
    }
    /**
     * Get connection status and statistics
     */
    getConnectionInfo() {
        return {
            baseUrl: this.baseUrl,
            isInitialized: this.isInitialized,
            hasSession: this.sessionId !== null,
            sessionId: this.sessionId
        };
    }
    // Private helper methods
    /**
     * Check server health and availability
     */
    async checkServerHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(this.healthCheckTimeout)
            });
            if (response.ok) {
                const health = await response.json();
                console.log('💚 BioClinical Server health check passed:', health);
                return { ok: true };
            }
            else {
                return { ok: false, error: `Server returned ${response.status}: ${response.statusText}` };
            }
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    /**
     * Send MCP request to the server
     */
    async sendRequest(method, params) {
        if (!this.baseUrl) {
            throw new Error('BioClinical Server not configured');
        }
        const id = this.requestId++;
        const request = {
            jsonrpc: '2.0',
            method,
            params,
            id
        };
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            };
            // Add session ID if available
            if (this.sessionId) {
                headers['mcp-session-id'] = this.sessionId;
            }
            console.log(`📤 Sending BioClinical request: ${method}`, {
                id,
                sessionId: this.sessionId,
                paramsKeys: Object.keys(params || {})
            });
            const response = await fetch(`${this.baseUrl}/mcp`, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(this.connectionTimeout)
            });
            // Extract session ID from response headers if present
            const responseSessionId = response.headers.get('mcp-session-id');
            if (responseSessionId && !this.sessionId) {
                this.sessionId = responseSessionId;
                console.log('🔑 Received session ID:', this.sessionId);
            }
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
            }
            const result = await response.json();
            if (result.error) {
                throw new Error(`BioClinical Server error [${result.error.code}]: ${result.error.message}`);
            }
            console.log(`📥 BioClinical response received for: ${method}`);
            return result.result;
        }
        catch (error) {
            console.error(`❌ BioClinical request failed [${method}]:`, error);
            throw error;
        }
    }
    /**
     * Send MCP notification (no response expected)
     */
    async sendNotification(method, params) {
        const request = {
            jsonrpc: '2.0',
            method,
            params
        };
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            if (this.sessionId) {
                headers['mcp-session-id'] = this.sessionId;
            }
            console.log(`📢 Sending BioClinical notification: ${method}`);
            await fetch(`${this.baseUrl}/mcp`, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(this.connectionTimeout)
            });
            console.log(`✅ BioClinical notification sent: ${method}`);
        }
        catch (error) {
            console.error(`❌ BioClinical notification failed [${method}]:`, error);
            // Don't throw for notifications - they're fire-and-forget
        }
    }
    /**
     * Validate text input for entity extraction
     */
    validateTextInput(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text must be a non-empty string');
        }
        if (text.trim().length === 0) {
            throw new Error('Text cannot be empty or only whitespace');
        }
        if (text.length > 100000) { // 100KB limit
            throw new Error('Text is too long (max 100,000 characters)');
        }
    }
    /**
     * Retry mechanism for failed requests
     */
    async retryRequest(operation, maxRetries = 3, delay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    break;
                }
                console.warn(`⚠️ BioClinical request attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
        throw lastError;
    }
    /**
     * Batch entity extraction for multiple texts
     */
    async extractMedicalEntitiesBatch(texts, confidenceThreshold = 0.5, entityTypes) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error('Texts must be a non-empty array');
        }
        console.log(`🧬 Starting batch entity extraction for ${texts.length} texts...`);
        const results = [];
        const batchSize = 5; // Process in chunks to avoid overwhelming the server
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
            const batchPromises = batch.map(text => this.extractMedicalEntities(text, confidenceThreshold, entityTypes));
            try {
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
            catch (error) {
                console.error(`❌ Batch processing failed at batch ${Math.floor(i / batchSize) + 1}:`, error);
                throw error;
            }
            // Small delay between batches to be server-friendly
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        console.log(`✅ Batch entity extraction completed: ${results.length} results`);
        return results;
    }
}
//# sourceMappingURL=bioclinical-server-connection.js.map