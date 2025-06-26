"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocumentTools = registerDocumentTools;
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const mongodb_client_js_1 = require("../db/mongodb-client.js");
const pdf_service_js_1 = require("../services/pdf-service.js");
const ocr_service_js_1 = require("../services/ocr-service.js");
function registerDocumentTools(server) {
    // Upload Document Tool
    server.registerTool('upload_document', {
        title: 'Upload Medical Document',
        description: 'Upload a medical document (PDF or image) for processing',
        inputSchema: {
            filename: zod_1.z.string(),
            content: zod_1.z.string().describe('Base64 encoded file content'),
            mimeType: zod_1.z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']),
            metadata: zod_1.z.object({
                patientName: zod_1.z.string().optional(),
                sessionId: zod_1.z.string(),
                description: zod_1.z.string().optional()
            }).optional()
        }
    }, async ({ filename, content, mimeType, metadata }) => {
        try {
            const documentId = (0, uuid_1.v4)();
            const buffer = Buffer.from(content, 'base64');
            // Save document to database
            await (0, mongodb_client_js_1.saveDocument)({
                _id: documentId,
                filename,
                mimeType,
                uploadDate: new Date(),
                fileSize: buffer.length,
                content: buffer,
                status: 'uploaded',
                metadata: metadata || { sessionId: 'default' },
                extractedText: null,
                processedData: null
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            documentId,
                            message: `Document "${filename}" uploaded successfully`,
                            nextStep: 'Use extract_text tool to process the document'
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error uploading document: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
    // Extract Text Tool
    server.registerTool('extract_text', {
        title: 'Extract Text from Document',
        description: 'Extract text from an uploaded document using OCR if needed',
        inputSchema: {
            documentId: zod_1.z.string().uuid()
        }
    }, async ({ documentId }) => {
        try {
            const document = await (0, mongodb_client_js_1.getDocument)(documentId);
            if (!document) {
                throw new Error('Document not found');
            }
            await (0, mongodb_client_js_1.updateDocumentStatus)(documentId, 'processing');
            let extractedText = '';
            if (document.mimeType === 'application/pdf') {
                extractedText = await (0, pdf_service_js_1.extractTextFromPDF)(document.content);
            }
            else if (document.mimeType.startsWith('image/')) {
                extractedText = await (0, ocr_service_js_1.extractTextFromImage)(document.content);
            }
            // Update document with extracted text
            await (0, mongodb_client_js_1.updateDocumentStatus)(documentId, 'text_extracted', { extractedText });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            documentId,
                            textLength: extractedText.length,
                            preview: extractedText.substring(0, 500) + '...',
                            message: 'Text extracted successfully',
                            nextStep: 'Use extract_medical_entities to process medical information'
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error extracting text: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
    // Get Document Status Tool
    server.registerTool('get_document_status', {
        title: 'Get Document Status',
        description: 'Check the processing status of an uploaded document',
        inputSchema: {
            documentId: zod_1.z.string().uuid()
        }
    }, async ({ documentId }) => {
        try {
            const document = await (0, mongodb_client_js_1.getDocument)(documentId);
            if (!document) {
                throw new Error('Document not found');
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            documentId,
                            filename: document.filename,
                            status: document.status,
                            uploadDate: document.uploadDate,
                            hasExtractedText: !!document.extractedText,
                            hasProcessedData: !!document.processedData,
                            metadata: document.metadata
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: `Error getting document status: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=document-tools.js.map