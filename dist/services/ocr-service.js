"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromImage = extractTextFromImage;
exports.cleanupOCR = cleanupOCR;
const tesseract_js_1 = require("tesseract.js");
let worker = null;
async function getWorker() {
    if (!worker) {
        worker = await (0, tesseract_js_1.createWorker)('eng');
    }
    return worker;
}
async function extractTextFromImage(buffer) {
    try {
        const tesseractWorker = await getWorker();
        const { data: { text } } = await tesseractWorker.recognize(buffer);
        // Clean up OCR text
        let cleanedText = text;
        // Fix common OCR errors
        cleanedText = cleanedText.replace(/[|l](\d)/g, '1$1'); // l or | to 1
        cleanedText = cleanedText.replace(/[oO](\d)/g, '0$1'); // o or O to 0
        // Remove excessive whitespace
        cleanedText = cleanedText.replace(/\s+/g, ' ');
        return cleanedText.trim();
    }
    catch (error) {
        console.error('OCR extraction error:', error);
        throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// Cleanup function
async function cleanupOCR() {
    if (worker) {
        await worker.terminate();
        worker = null;
    }
}
//# sourceMappingURL=ocr-service.js.map