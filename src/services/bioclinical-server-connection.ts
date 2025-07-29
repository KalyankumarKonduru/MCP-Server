interface BioClinicalRequest {
  jsonrpc: '2.0';
  method: string;
  params: any;
  id: string | number;
}

interface BioClinicalResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id: string | number;
}

export interface BioClinicalEntity {
  text: string;
  label: 'PROBLEM' | 'TREATMENT' | 'TEST';
  confidence: number;
  start: number;
  end: number;
  context?: string;
}

export interface BioClinicalResult {
  success: boolean;
  entitiesFound: number;
  confidence: number;
  processingTimeMs: number;
  model: string;
  entities: BioClinicalEntity[];
}

export class BioClinicalServerConnection {
  private baseUrl: string;
  private sessionId: string | null = null;
  private isInitialized = false;
  private requestId = 1;

  constructor(baseUrl: string = 'http://localhost:8001') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async connect(): Promise<void> {
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
    } catch (error) {
      console.error('❌ Failed to connect to BioClinical Server:', error);
      throw error;
    }
  }

  async extractMedicalEntities(
    text: string,
    confidenceThreshold: number = 0.5,
    entityTypes?: string[]
  ): Promise<BioClinicalResult> {
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
    } catch (error) {
      console.error('Failed to extract medical entities:', error);
      throw error;
    }
  }

  async getModelInfo(): Promise<any> {
    const result = await this.sendRequest('tools/call', {
      name: 'getModelInfo',
      arguments: {}
    });

    return JSON.parse(result.content[0].text);
  }

  private async checkServerHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return { ok: response.ok };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    const id = this.requestId++;
    const request: BioClinicalRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    const headers: Record<string, string> = {
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

    const result = await response.json() as BioClinicalResponse;
    
    if (result.error) {
      throw new Error(`BioClinical Server error: ${result.error.message}`);
    }

    return result.result;
  }

  private async sendNotification(method: string, params: any): Promise<void> {
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