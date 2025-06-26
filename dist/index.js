"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const server_js_1 = require("./server.js");
const mongodb_client_js_1 = require("./db/mongodb-client.js");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Check if running in stdio mode
const isStdioMode = process.argv.includes('--stdio') || !process.stdout.isTTY;
async function startStdioServer() {
    try {
        console.error('Starting Medical MCP Server in stdio mode...');
        // Connect to MongoDB
        console.error('Connecting to MongoDB...');
        await (0, mongodb_client_js_1.connectToMongoDB)();
        console.error('MongoDB connected successfully');
        // Create MCP server
        const { server } = await (0, server_js_1.createMCPServer)();
        // Use stdio transport
        const transport = new stdio_js_1.StdioServerTransport();
        await server.connect(transport);
        console.error('Medical MCP Server running on stdio transport');
        console.error('Ready to accept commands');
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.error('Shutting down stdio server...');
            await (0, mongodb_client_js_1.closeConnection)();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Failed to start stdio server:', error);
        process.exit(1);
    }
}
async function startHttpServer() {
    // Middleware
    app.use((0, cors_1.default)({
        origin: true, // Allow all origins in development
        credentials: true,
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
        exposedHeaders: ['mcp-session-id']
    }));
    app.use(express_1.default.json({ limit: '50mb' }));
    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            service: 'medical-document-mcp',
            mode: 'http',
            timestamp: new Date().toISOString()
        });
    });
    try {
        console.log('Starting Medical MCP Server in HTTP mode...');
        console.log(JSON.stringify({ type: "status", message: "Connected to MongoDB" }));
        await (0, mongodb_client_js_1.connectToMongoDB)();
        console.log('MongoDB connected successfully');
        // Create and configure MCP server for HTTP
        const { handleRequest } = await (0, server_js_1.createMCPServer)();
        // MCP endpoints
        app.post('/mcp', handleRequest);
        app.get('/mcp', handleRequest);
        app.delete('/mcp', handleRequest);
        // 404 handler
        app.use((req, res) => {
            res.status(404).json({
                error: 'Not found',
                message: `Cannot ${req.method} ${req.path}`
            });
        });
        // Error handler
        app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message
            });
        });
        app.listen(PORT, () => {
            console.log(`Medical Document MCP Server running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/health`);
            console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
        });
        // Graceful shutdown for HTTP server
        process.on('SIGINT', async () => {
            console.log('\nShutting down HTTP server...');
            await (0, mongodb_client_js_1.closeConnection)();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Failed to start HTTP server:', error);
        process.exit(1);
    }
}
// Main entry point
async function main() {
    if (isStdioMode) {
        // Running via stdio (called from Meteor)
        await startStdioServer();
    }
    else {
        // Running standalone as HTTP server
        await startHttpServer();
    }
}
// Start the appropriate server
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
//# sourceMappingURL=index.js.map