import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Request, Response } from 'express';
export declare function createMCPServer(): Promise<{
    server: McpServer;
    handleRequest: (req: Request, res: Response) => Promise<void>;
}>;
//# sourceMappingURL=server.d.ts.map