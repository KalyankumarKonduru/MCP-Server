import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MongoDBClient } from '../db/mongodb-client.js';
export declare class DocumentToAidboxIntegration {
    private mongoClient;
    private aidboxServerUrl;
    private requestId;
    constructor(mongoClient: MongoDBClient, aidboxServerUrl?: string);
    private sendMCPRequest;
    private callAidboxTool;
    createDocumentToAidboxTool(): Tool;
    handleSyncDocumentToAidbox(args: any): Promise<any>;
    private updateDocumentWithAidboxRefs;
    createBatchSyncTool(): Tool;
    handleBatchSync(args: any): Promise<any>;
    createSyncStatusTool(): Tool;
    handleGetSyncStatus(args: any): Promise<any>;
    getAllTools(): Tool[];
}
//# sourceMappingURL=document-to-aidbox-integration.d.ts.map