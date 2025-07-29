export class BioClinicalServerConnection {
    baseUrl;
    sessionId = null;
    isInitialized = false;
    requestId = 1;
    constructor(baseUrl = 'http://localhost:8001') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    async connect() {
        try {
            console.log(`🧬 Connecting to BioClinical Server at: ${this.baseUrl}`);
            // Health check
            const healthCheck = await this.checkServerHealth();
            if (!healthCheck.ok) {
                throw new Error(`BioClinical Server not responding at ${this.baseUrl}`);
            }
            // Initialize MCP connection
            const initResult = await this.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: { listChanged: false }
                },
                clientInfo: {
                    name: 'medical-mcp-client',
                    version: '1.0.0'
                }
            });
            await this.sendNotification('notifications/initialized', {});
            // List available tools
            const toolsResult = await this.sendRequest('tools/list', {});
            console.log(`✅ BioClinical Server connected with ${toolsResult.tools?.length || 0} tools`);
            this.isInitialized = true;
        }
        catch (error) {
            console.error('❌ Failed to connect to BioClinical Server:', error);
            throw error;
        }
    }
    async extractMedicalEntities(text, confidenceThreshold = 0.5, entityTypes) {
        if (!this.isInitialized) {
            throw new Error('BioClinical Server not connected');
        }
        try {
            const result = await this.sendRequest('tools/call', {
                name: 'extractMedicalEntities',
                arguments: {
                    text,
                    confidenceThreshold,
                    entityTypes
                }
            });
            return JSON.parse(result.content[0].text);
        }
        catch (error) {
            console.error('Failed to extract medical entities:', error);
            throw error;
        }
    }
    async getModelInfo() {
        const result = await this.sendRequest('tools/call', {
            name: 'getModelInfo',
            arguments: {}
        });
        return JSON.parse(result.content[0].text);
    }
    async checkServerHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            return { ok: response.ok };
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    async sendRequest(method, params) {
        const id = this.requestId++;
        const request = {
            jsonrpc: '2.0',
            method,
            params,
            id
        };
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
        }
        const response = await fetch(`${this.baseUrl}/mcp`, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(30000)
        });
        const responseSessionId = response.headers.get('mcp-session-id');
        if (responseSessionId && !this.sessionId) {
            this.sessionId = responseSessionId;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(`BioClinical Server error: ${result.error.message}`);
        }
        return result.result;
    }
    async sendNotification(method, params) {
        const request = {
            jsonrpc: '2.0',
            method,
            params
        };
        await fetch(`${this.baseUrl}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.sessionId && { 'mcp-session-id': this.sessionId })
            },
            body: JSON.stringify(request)
        });
    }
}
//# sourceMappingURL=bioclinical-server-connection.js.map