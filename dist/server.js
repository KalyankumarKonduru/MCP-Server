"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMCPServer = createMCPServer;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const crypto_1 = require("crypto");
const document_tools_js_1 = require("./tools/document-tools.js");
const medical_tools_js_1 = require("./tools/medical-tools.js");
// Store transports by session ID (for HTTP mode)
const transports = {};
// Create server for stdio mode
async function createMCPServer() {
    const server = new mcp_js_1.McpServer({
        name: process.env.MCP_SERVER_NAME || 'medical-document-processor',
        version: process.env.MCP_SERVER_VERSION || '1.0.0'
    });
    // Register all tools
    (0, document_tools_js_1.registerDocumentTools)(server);
    (0, medical_tools_js_1.registerMedicalTools)(server);
    // For HTTP mode, create request handler
    const handleRequest = async (req, res) => {
        const sessionId = req.headers['mcp-session-id'];
        let transport;
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport
            transport = transports[sessionId];
        }
        else if (!sessionId && (0, types_js_1.isInitializeRequest)(req.body)) {
            // New initialization request
            transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
                sessionIdGenerator: () => (0, crypto_1.randomUUID)(),
                onsessioninitialized: (newSessionId) => {
                    transports[newSessionId] = transport;
                    console.log(`New session initialized: ${newSessionId}`);
                }
            });
            // Clean up on close
            transport.onclose = () => {
                if (transport.sessionId) {
                    delete transports[transport.sessionId];
                    console.log(`Session closed: ${transport.sessionId}`);
                }
            };
            // Create new MCP server for this session
            const sessionServer = new mcp_js_1.McpServer({
                name: process.env.MCP_SERVER_NAME || 'medical-document-processor',
                version: process.env.MCP_SERVER_VERSION || '1.0.0'
            });
            // Register tools for this session
            (0, document_tools_js_1.registerDocumentTools)(sessionServer);
            (0, medical_tools_js_1.registerMedicalTools)(sessionServer);
            // Connect server to transport
            await sessionServer.connect(transport);
        }
        else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                },
                id: null,
            });
            return;
        }
        // Handle the request
        await transport.handleRequest(req, res, req.body);
    };
    return { server, handleRequest };
}
//# sourceMappingURL=server.js.map