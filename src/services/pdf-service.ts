import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

export interface PDFParseResult {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  info: {
    fileSize: number;
    version?: string;
    encrypted: boolean;
  };
}

export interface PDFProcessingOptions {
  maxPages?: number;
  pageRange?: { start: number; end: number };
  extractImages?: boolean;
  preserveFormatting?: boolean;
}

export class PDFService {
  constructor() {}

  async parsePDF(filePath: string, options?: PDFProcessingOptions): Promise<PDFParseResult> {
    try {
      console.log(`Parsing PDF: ${filePath}`);
      
      const fileBuffer = fs.readFileSync(filePath);
      const fileStats = fs.statSync(filePath);
      
      const pdfData = await pdfParse(fileBuffer, {
        max: options?.maxPages || 0, // 0 means no limit
        version: 'v1.10.100'
      });

      // Process text based on options
      let processedText = pdfData.text;
      
      if (options?.preserveFormatting) {
        processedText = this.preserveFormatting(processedText);
      } else {
        processedText = this.cleanText(processedText);
      }

      // Apply page range if specified
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
    } catch (error) {
      console.error('Failed to parse PDF:', error);
      throw new Error(`PDF parsing failed: ${error}`);
    }
  }

  async parsePDFBuffer(buffer: Buffer, options?: PDFProcessingOptions): Promise<PDFParseResult> {
    try {
      console.log('Parsing PDF from buffer');
      
      const pdfData = await pdfParse(buffer, {
        max: options?.maxPages || 0,
        version: 'v1.10.100'
      });

      let processedText = pdfData.text;
      
      if (options?.preserveFormatting) {
        processedText = this.preserveFormatting(processedText);
      } else {
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
    } catch (error) {
      console.error('Failed to parse PDF buffer:', error);
      throw new Error(`PDF buffer parsing failed: ${error}`);
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')   // Handle old Mac line endings
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/\s{2,}/g, ' ') // Reduce multiple spaces
      .replace(/\t/g, ' ')     // Replace tabs with spaces
      .trim();
  }

  private preserveFormatting(text: string): string {
    // Minimal cleaning while preserving structure
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  private extractPageRange(text: string, range: { start: number; end: number }, totalPages: number): string {
    // This is a simplified implementation
    // In a real scenario, you'd need to track page boundaries during parsing
    const lines = text.split('\n');
    const linesPerPage = Math.ceil(lines.length / totalPages);
    
    const startLine = (range.start - 1) * linesPerPage;
    const endLine = Math.min(range.end * linesPerPage, lines.length);
    
    return lines.slice(startLine, endLine).join('\n');
  }

  async extractMedicalInformation(filePath: string): Promise<{
    text: string;
    medicalSections: Record<string, string>;
    confidence: number;
  }> {
    try {
      const result = await this.parsePDF(filePath);
      const medicalSections = this.identifyMedicalSections(result.text);
      const confidence = this.calculateMedicalConfidence(result.text, medicalSections);

      return {
        text: result.text,
        medicalSections,
        confidence
      };
    } catch (error) {
      console.error('Failed to extract medical information:', error);
      throw error;
    }
  }

  private identifyMedicalSections(text: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = text.split('\n');
    
    // Common medical document section headers
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
    let currentContent: string[] = [];

    for (const line of lines) {
      let foundSection = false;
      
      for (const [sectionName, pattern] of Object.entries(sectionPatterns)) {
        if (pattern.test(line.trim())) {
          // Save previous section
          if (currentSection && currentContent.length > 0) {
            sections[currentSection] = currentContent.join('\n').trim();
          }
          
          // Start new section
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

    // Save last section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  private calculateMedicalConfidence(text: string, sections: Record<string, string>): number {
    let confidence = 0;
    
    // Base confidence from medical keywords
    const medicalKeywords = [
      'patient', 'diagnosis', 'treatment', 'medication', 'symptoms',
      'doctor', 'physician', 'hospital', 'clinic', 'prescription'
    ];
    
    const foundKeywords = medicalKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    confidence += (foundKeywords.length / medicalKeywords.length) * 40;
    
    // Confidence from identified sections
    const expectedSections = ['Chief Complaint', 'Assessment', 'Plan', 'Medications'];
    const foundSections = expectedSections.filter(section => sections[section]);
    
    confidence += (foundSections.length / expectedSections.length) * 40;
    
    // Confidence from document structure
    if (text.length > 100) confidence += 10;
    if (text.includes('Date:') || text.includes('DOB:')) confidence += 10;
    
    return Math.min(100, confidence);
  }

  async validatePDF(filePath: string): Promise<{
    isValid: boolean;
    isMedical: boolean;
    confidence: number;
    issues: string[];
  }> {
    try {
      const issues: string[] = [];
      let confidence = 100;
      
      // Check if file exists and is readable
      if (!fs.existsSync(filePath)) {
        return {
          isValid: false,
          isMedical: false,
          confidence: 0,
          issues: ['File does not exist']
        };
      }

      const result = await this.parsePDF(filePath);
      
      // Check if PDF was encrypted
      if (result.info.encrypted) {
        issues.push('PDF is encrypted');
        confidence -= 30;
      }

      // Check text extraction quality
      if (result.text.length < 50) {
        issues.push('Very little text extracted');
        confidence -= 40;
      }

      // Check for medical content
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
    } catch (error) {
      return {
        isValid: false,
        isMedical: false,
        confidence: 0,
        issues: [`Validation failed: ${error}`]
      };
    }
  }

  async extractTextByPages(filePath: string): Promise<Array<{ pageNumber: number; text: string }>> {
    try {
      // This is a simplified implementation
      // For true page-by-page extraction, you'd need a more sophisticated PDF library
      const result = await this.parsePDF(filePath);
      const lines = result.text.split('\n');
      const linesPerPage = Math.ceil(lines.length / result.pageCount);
      
      const pages: Array<{ pageNumber: number; text: string }> = [];
      
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
    } catch (error) {
      console.error('Failed to extract text by pages:', error);
      throw error;
    }
  }

  getSupportedFormats(): string[] {
    return ['.pdf'];
  }

  async getDocumentInfo(filePath: string): Promise<{
    fileName: string;
    fileSize: number;
    pageCount: number;
    isEncrypted: boolean;
    metadata: any;
  }> {
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
    } catch (error) {
      console.error('Failed to get document info:', error);
      throw error;
    }
  }
}

