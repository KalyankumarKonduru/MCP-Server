"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromPDF = extractTextFromPDF;
const pdf_parse_1 = __importDefault(require("pdf-parse"));
async function extractTextFromPDF(buffer) {
    try {
        const data = await (0, pdf_parse_1.default)(buffer);
        // Clean up the extracted text
        let text = data.text;
        // Remove excessive whitespace
        text = text.replace(/\s+/g, ' ');
        // Remove page numbers (common patterns)
        text = text.replace(/Page \d+ of \d+/gi, '');
        text = text.replace(/^\d+$/gm, '');
        return text.trim();
    }
    catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=pdf-service.js.map