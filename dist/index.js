#!/usr/bin/env node
import { MedicalMCPServer } from './server.js';
/**
 * Medical MCP Server Entry Point
 *
 * This server provides medical document processing capabilities including:
 * - Document upload and text extraction (PDF, images)
 * - Medical Named Entity Recognition (NER)
 * - Vector search with embeddings
 * - Patient history analysis
 * - Similar case finding
 * - Medical insights generation
 */
// Detect if running in stdio mode
const isStdioMode = process.argv.includes('--stdio') ||
    process.stdin.isTTY === false ||
    process.env.MCP_STDIO_MODE === 'true';
// Set stdio mode environment variable for other modules
if (isStdioMode) {
    process.env.MCP_STDIO_MODE = 'true';
}
async function main() {
    try {
        // Create and start the server
        const server = new MedicalMCPServer();
        // Setup graceful shutdown
        let isShuttingDown = false;
        const gracefulShutdown = async (signal) => {
            if (isShuttingDown)
                return;
            isShuttingDown = true;
            if (!isStdioMode) {
                console.log(`\n📡 Received ${signal}, initiating graceful shutdown...`);
            }
            try {
                await server.stop();
                if (!isStdioMode) {
                    console.log('✅ Server shutdown completed');
                }
                process.exit(0);
            }
            catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };
        // Register shutdown handlers
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        // Start the server
        await server.start();
        // Only show detailed info if not in stdio mode
        if (!isStdioMode) {
            // Log server information
            console.log('\n📊 Server Information:');
            console.log('======================');
            try {
                const stats = await server.getStatistics();
                console.log(`📄 Documents in database: ${stats.documentsCount}`);
                console.log(`🔧 Tools available: ${stats.toolsAvailable}`);
                console.log(`🤖 Embedding model: ${stats.embeddingModel}`);
                console.log(`⏱️  Server uptime: ${Math.round(stats.uptime)}s`);
            }
            catch (error) {
                console.log('📊 Statistics unavailable during startup');
            }
            console.log('\n🚀 Server is ready to accept connections');
            console.log('📝 Available tools:');
            console.log('   📤 uploadDocument - Upload and process medical documents');
            console.log('   🔍 searchDocuments - Search documents with semantic similarity');
            console.log('   📋 listDocuments - List documents with filtering');
            console.log('   🏷️  extractMedicalEntities - Extract medical entities from text');
            console.log('   🔗 findSimilarCases - Find similar medical cases');
            console.log('   📈 analyzePatientHistory - Analyze patient medical history');
            console.log('   💡 getMedicalInsights - Get medical insights and recommendations');
            console.log('\n💬 The server is now listening for MCP client connections...');
            // Keep the process alive
            process.stdin.resume();
        }
    }
    catch (error) {
        console.error('❌ Fatal error starting server:', error);
        if (error instanceof Error) {
            console.error('Error details:', error.message);
            if (error.stack) {
                console.error('Stack trace:', error.stack);
            }
        }
        process.exit(1);
    }
}
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    console.error('This is a fatal error. The server will exit.');
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Promise Rejection at:', promise);
    console.error('Reason:', reason);
    console.error('This is a fatal error. The server will exit.');
    process.exit(1);
});
// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('💥 Failed to start server:', error);
        process.exit(1);
    });
}
export { MedicalMCPServer };
//# sourceMappingURL=index.js.map