import * as fs from 'fs';
import * as path from 'path';
export class PDFService {
    constructor() { }
    async parsePDF(filePath, options) {
        try {
            console.log(`Parsing PDF: ${filePath}`);
            const fileBuffer = fs.readFileSync(filePath);
            const fileStats = fs.statSync(filePath);
            // Use dynamic import for pdf-parse to handle ES module compatibility
            const { default: pdfParseModule } = await import('pdf-parse');
            const pdfData = await pdfParseModule(fileBuffer, {
                max: options?.maxPages || 0,
                version: 'v1.10.100'
            });
            let processedText = pdfData.text;
            if (options?.preserveFormatting) {
                processedText = this.preserveFormatting(processedText);
            }
            else {
                processedText = this.cleanText(processedText);
            }
            if (options?.pageRange) {
                processedText = this.extractPageRange(processedText, options.pageRange, pdfData.numpages);
            }
            return {
                text: processedText,
                pageCount: pdfData.numpages,
                metadata: {
                    title: pdfData.info?.Title,
                    author: pdfData.info?.Author,
                    subject: pdfData.info?.Subject,
                    creator: pdfData.info?.Creator,
                    producer: pdfData.info?.Producer,
                    creationDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : undefined,
                    modificationDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : undefined,
                },
                info: {
                    fileSize: fileStats.size,
                    version: pdfData.version,
                    encrypted: pdfData.info?.IsEncrypted || false
                }
            };
        }
        catch (error) {
            console.error('Failed to parse PDF:', error);
            throw new Error(`PDF parsing failed: ${error}`);
        }
    }
    async parsePDFBuffer(buffer, options) {
        try {
            console.log('Parsing PDF from buffer');
            // Use dynamic import for pdf-parse
            const { default: pdfParseModule } = await import('pdf-parse');
            const pdfData = await pdfParseModule(buffer, {
                max: options?.maxPages || 0,
                version: 'v1.10.100'
            });
            let processedText = pdfData.text;
            if (options?.preserveFormatting) {
                processedText = this.preserveFormatting(processedText);
            }
            else {
                processedText = this.cleanText(processedText);
            }
            if (options?.pageRange) {
                processedText = this.extractPageRange(processedText, options.pageRange, pdfData.numpages);
            }
            return {
                text: processedText,
                pageCount: pdfData.numpages,
                metadata: {
                    title: pdfData.info?.Title,
                    author: pdfData.info?.Author,
                    subject: pdfData.info?.Subject,
                    creator: pdfData.info?.Creator,
                    producer: pdfData.info?.Producer,
                    creationDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : undefined,
                    modificationDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : undefined,
                },
                info: {
                    fileSize: buffer.length,
                    version: pdfData.version,
                    encrypted: pdfData.info?.IsEncrypted || false
                }
            };
        }
        catch (error) {
            console.error('Failed to parse PDF buffer:', error);
            throw new Error(`PDF buffer parsing failed: ${error}`);
        }
    }
    cleanText(text) {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s{2,}/g, ' ')
            .replace(/\t/g, ' ')
            .trim();
    }
    preserveFormatting(text) {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
    }
    extractPageRange(text, range, totalPages) {
        const lines = text.split('\n');
        const linesPerPage = Math.ceil(lines.length / totalPages);
        const startLine = (range.start - 1) * linesPerPage;
        const endLine = Math.min(range.end * linesPerPage, lines.length);
        return lines.slice(startLine, endLine).join('\n');
    }
    async extractMedicalInformation(filePath) {
        try {
            const result = await this.parsePDF(filePath);
            const medicalSections = this.identifyMedicalSections(result.text);
            const confidence = this.calculateMedicalConfidence(result.text, medicalSections);
            return {
                text: result.text,
                medicalSections,
                confidence
            };
        }
        catch (error) {
            console.error('Failed to extract medical information:', error);
            throw error;
        }
    }
    identifyMedicalSections(text) {
        const sections = {};
        const lines = text.split('\n');
        const sectionPatterns = {
            'Chief Complaint': /^(chief complaint|cc):/i,
            'History of Present Illness': /^(history of present illness|hpi):/i,
            'Past Medical History': /^(past medical history|pmh):/i,
            'Medications': /^(medications?|meds?):/i,
            'Allergies': /^(allergies|nkda):/i,
            'Physical Examination': /^(physical exam|pe):/i,
            'Assessment': /^(assessment|impression):/i,
            'Plan': /^(plan|treatment):/i,
            'Diagnosis': /^(diagnosis|dx):/i,
            'Vital Signs': /^(vital signs|vitals):/i
        };
        let currentSection = '';
        let currentContent = [];
        for (const line of lines) {
            let foundSection = false;
            for (const [sectionName, pattern] of Object.entries(sectionPatterns)) {
                if (pattern.test(line.trim())) {
                    if (currentSection && currentContent.length > 0) {
                        sections[currentSection] = currentContent.join('\n').trim();
                    }
                    currentSection = sectionName;
                    currentContent = [line];
                    foundSection = true;
                    break;
                }
            }
            if (!foundSection && currentSection) {
                currentContent.push(line);
            }
        }
        if (currentSection && currentContent.length > 0) {
            sections[currentSection] = currentContent.join('\n').trim();
        }
        return sections;
    }
    calculateMedicalConfidence(text, sections) {
        let confidence = 0;
        const medicalKeywords = [
            'patient', 'diagnosis', 'treatment', 'medication', 'symptoms',
            'doctor', 'physician', 'hospital', 'clinic', 'prescription'
        ];
        const foundKeywords = medicalKeywords.filter(keyword => text.toLowerCase().includes(keyword));
        confidence += (foundKeywords.length / medicalKeywords.length) * 40;
        const expectedSections = ['Chief Complaint', 'Assessment', 'Plan', 'Medications'];
        const foundSections = expectedSections.filter(section => sections[section]);
        confidence += (foundSections.length / expectedSections.length) * 40;
        if (text.length > 100)
            confidence += 10;
        if (text.includes('Date:') || text.includes('DOB:'))
            confidence += 10;
        return Math.min(100, confidence);
    }
    async validatePDF(filePath) {
        try {
            const issues = [];
            let confidence = 100;
            if (!fs.existsSync(filePath)) {
                return {
                    isValid: false,
                    isMedical: false,
                    confidence: 0,
                    issues: ['File does not exist']
                };
            }
            const result = await this.parsePDF(filePath);
            if (result.info.encrypted) {
                issues.push('PDF is encrypted');
                confidence -= 30;
            }
            if (result.text.length < 50) {
                issues.push('Very little text extracted');
                confidence -= 40;
            }
            const medicalInfo = await this.extractMedicalInformation(filePath);
            const isMedical = medicalInfo.confidence > 50;
            if (!isMedical) {
                issues.push('Document does not appear to be medical');
                confidence -= 20;
            }
            return {
                isValid: confidence > 30,
                isMedical,
                confidence: Math.max(0, confidence),
                issues
            };
        }
        catch (error) {
            return {
                isValid: false,
                isMedical: false,
                confidence: 0,
                issues: [`Validation failed: ${error}`]
            };
        }
    }
    async extractTextByPages(filePath) {
        try {
            const result = await this.parsePDF(filePath);
            const lines = result.text.split('\n');
            const linesPerPage = Math.ceil(lines.length / result.pageCount);
            const pages = [];
            for (let i = 0; i < result.pageCount; i++) {
                const startLine = i * linesPerPage;
                const endLine = Math.min((i + 1) * linesPerPage, lines.length);
                const pageText = lines.slice(startLine, endLine).join('\n');
                pages.push({
                    pageNumber: i + 1,
                    text: pageText
                });
            }
            return pages;
        }
        catch (error) {
            console.error('Failed to extract text by pages:', error);
            throw error;
        }
    }
    getSupportedFormats() {
        return ['.pdf'];
    }
    async getDocumentInfo(filePath) {
        try {
            const result = await this.parsePDF(filePath);
            const fileName = path.basename(filePath);
            return {
                fileName,
                fileSize: result.info.fileSize,
                pageCount: result.pageCount,
                isEncrypted: result.info.encrypted,
                metadata: result.metadata
            };
        }
        catch (error) {
            console.error('Failed to get document info:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=pdf-service.js.map