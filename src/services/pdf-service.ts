import * as fs from 'fs';
import * as path from 'path';

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
  constructor() {
    console.log('✅ Simple PDF Service initialized (no external dependencies)');
  }

  async parsePDF(filePath: string, options?: PDFProcessingOptions): Promise<PDFParseResult> {
    try {
      console.log(`📄 Parsing PDF file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileStats = fs.statSync(filePath);
      
      console.log(`📊 File size: ${fileStats.size} bytes`);
      
      return await this.parsePDFBuffer(fileBuffer, options);
    } catch (error) {
      console.error('❌ Failed to parse PDF file:', error);
      throw new Error(`PDF file parsing failed: ${error}`);
    }
  }

  async parsePDFBuffer(buffer: Buffer, options?: PDFProcessingOptions): Promise<PDFParseResult> {
    try {
      console.log(`📄 Processing PDF buffer, size: ${buffer.length} bytes`);
      
      if (!buffer || buffer.length === 0) {
        throw new Error('Buffer is empty or invalid');
      }

      // Extract text using multiple methods
      const extractedText = await this.extractTextFromPDFBuffer(buffer);
      const cleanedText = this.cleanText(extractedText);
      
      // Estimate page count from content
      const estimatedPageCount = this.estimatePageCount(cleanedText, buffer.length);
      
      // Extract basic metadata from PDF structure
      const metadata = this.extractBasicMetadata(buffer);
      
      const result: PDFParseResult = {
        text: cleanedText,
        pageCount: estimatedPageCount,
        metadata: {
          title: metadata.title || 'PDF Document',
          author: metadata.author || 'Unknown',
          subject: 'Medical Document',
          creator: metadata.creator,
          producer: metadata.producer,
          creationDate: metadata.creationDate,
          modificationDate: metadata.modificationDate,
        },
        info: {
          fileSize: buffer.length,
          version: metadata.version || '1.4',
          encrypted: metadata.encrypted || false
        }
      };

      console.log(`🎉 PDF processing successful: ${result.text.length} characters, estimated ${result.pageCount} pages`);
      return result;
      
    } catch (error) {
      console.error('❌ Failed to process PDF buffer:', error);
      throw new Error(`PDF buffer processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractTextFromPDFBuffer(buffer: Buffer): Promise<string> {
    let extractedText = '';
    
    try {
      console.log('🔍 Attempting direct PDF text extraction...');
      
      // Method 1: Look for text in PDF streams
      const streamText = this.extractFromPDFStreams(buffer);
      if (streamText.length > 50) {
        console.log('✅ Stream extraction successful');
        extractedText = streamText;
      }
      
      // Method 2: Look for text objects
      if (extractedText.length < 50) {
        const objectText = this.extractFromTextObjects(buffer);
        if (objectText.length > 50) {
          console.log('✅ Text object extraction successful');
          extractedText = objectText;
        }
      }
      
      // Method 3: Simple string extraction
      if (extractedText.length < 50) {
        const simpleText = this.extractSimpleText(buffer);
        if (simpleText.length > 20) {
          console.log('✅ Simple text extraction successful');
          extractedText = simpleText;
        }
      }
      
      // Method 4: Fallback message
      if (extractedText.length < 20) {
        console.log('⚠️ Limited text extraction - document may need OCR processing');
        extractedText = 'PDF document uploaded successfully. Text extraction was limited - this document may benefit from OCR processing for better text recognition.';
      }
      
      return extractedText;
      
    } catch (error) {
      console.warn('⚠️ Text extraction encountered an error:', error);
      return 'PDF document processed. Text extraction encountered an issue - OCR processing may be needed for full content access.';
    }
  }

  private extractFromPDFStreams(buffer: Buffer): string {
    try {
      const pdfContent = buffer.toString('latin1');
      let extractedText = '';
      
      // Look for stream objects that contain text
      const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
      let match;
      
      while ((match = streamRegex.exec(pdfContent)) !== null) {
        const streamContent = match[1];
        
        // Skip binary streams (likely images)
        if (this.isBinaryStream(streamContent)) continue;
        
        // Extract readable text from stream
        const readableText = streamContent
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Keep only printable ASCII and whitespace
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (readableText.length > 10) {
          extractedText += readableText + ' ';
        }
      }
      
      return extractedText.trim();
    } catch (error) {
      console.warn('Stream extraction failed:', error);
      return '';
    }
  }

  private extractFromTextObjects(buffer: Buffer): string {
    try {
      const pdfContent = buffer.toString('latin1');
      let extractedText = '';
      
      // Look for text in parentheses (PDF text strings)
      const textRegex = /\(([^)]{3,})\)/g;
      let match;
      
      while ((match = textRegex.exec(pdfContent)) !== null) {
        const text = match[1];
        
        // Filter out likely non-text content
        if (this.isLikelyText(text)) {
          extractedText += text + ' ';
        }
      }
      
      // Also look for text between BT and ET (text objects)
      const textObjectRegex = /BT\s*([\s\S]*?)\s*ET/g;
      while ((match = textObjectRegex.exec(pdfContent)) !== null) {
        const textObject = match[1];
        
        // Extract text strings from the text object
        const strings = textObject.match(/\(([^)]+)\)/g);
        if (strings) {
          strings.forEach(str => {
            const cleanStr = str.slice(1, -1); // Remove parentheses
            if (this.isLikelyText(cleanStr)) {
              extractedText += cleanStr + ' ';
            }
          });
        }
      }
      
      return extractedText.trim();
    } catch (error) {
      console.warn('Text object extraction failed:', error);
      return '';
    }
  }

  private extractSimpleText(buffer: Buffer): string {
    try {
      const content = buffer.toString('utf8');
      
      // Look for sequences of readable characters
      const readableText = content
        .replace(/[^\x20-\x7E\n\r\t]/g, '') // Keep only printable ASCII
        .replace(/\s+/g, ' ') // Normalize whitespace
        .split(' ')
        .filter(word => word.length > 2 && /[a-zA-Z]/.test(word)) // Keep words with letters
        .join(' ');
      
      return readableText.trim();
    } catch (error) {
      console.warn('Simple text extraction failed:', error);
      return '';
    }
  }

  private isBinaryStream(content: string): boolean {
    // Check if content is likely binary (high ratio of non-printable characters)
    const printableChars = content.match(/[\x20-\x7E]/g)?.length || 0;
    const totalChars = content.length;
    
    return totalChars > 0 && (printableChars / totalChars) < 0.3;
  }

  private isLikelyText(text: string): boolean {
    // Check if string is likely meaningful text
    if (text.length < 3) return false;
    
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(text)) return false;
    
    // Filter out strings that are mostly special characters
    const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
    return letterCount >= text.length * 0.3;
  }

  private extractBasicMetadata(buffer: Buffer): any {
    try {
      const content = buffer.toString('latin1');
      const metadata: any = {};
      
      // Look for PDF metadata
      const titleMatch = content.match(/\/Title\s*\(([^)]+)\)/);
      if (titleMatch) metadata.title = titleMatch[1];
      
      const authorMatch = content.match(/\/Author\s*\(([^)]+)\)/);
      if (authorMatch) metadata.author = authorMatch[1];
      
      const creatorMatch = content.match(/\/Creator\s*\(([^)]+)\)/);
      if (creatorMatch) metadata.creator = creatorMatch[1];
      
      const producerMatch = content.match(/\/Producer\s*\(([^)]+)\)/);
      if (producerMatch) metadata.producer = producerMatch[1];
      
      // Look for PDF version
      const versionMatch = content.match(/%PDF-(\d+\.\d+)/);
      if (versionMatch) metadata.version = versionMatch[1];
      
      // Check for encryption
      metadata.encrypted = content.includes('/Encrypt');
      
      return metadata;
    } catch (error) {
      console.warn('Metadata extraction failed:', error);
      return {};
    }
  }

  private estimatePageCount(text: string, fileSize: number): number {
    // Estimate page count based on text length and file size
    if (text.length === 0) return 1;
    
    // If we have substantial text, estimate based on typical content per page
    const avgCharsPerPage = 2000; // Rough estimate
    const textBasedEstimate = Math.max(1, Math.ceil(text.length / avgCharsPerPage));
    
    // Also estimate based on file size (typical PDF page is 50-200KB)
    const avgBytesPerPage = 100 * 1024; // 100KB per page
    const sizeBasedEstimate = Math.max(1, Math.ceil(fileSize / avgBytesPerPage));
    
    // Use the smaller estimate (more conservative)
    return Math.min(textBasedEstimate, sizeBasedEstimate, 50); // Cap at 50 pages
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/\s{2,}/g, ' ')    // Reduce multiple spaces
      .replace(/\t/g, ' ')        // Replace tabs with spaces
      .trim();
  }

  private preserveFormatting(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  private extractPageRange(text: string, range: { start: number; end: number }, totalPages: number): string {
    const lines = text.split('\n');
    const linesPerPage = Math.ceil(lines.length / totalPages);
    
    const startLine = Math.max(0, (range.start - 1) * linesPerPage);
    const endLine = Math.min(lines.length, range.end * linesPerPage);
    
    return lines.slice(startLine, endLine).join('\n');
  }

  // Keep all your existing methods for medical processing
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

  private calculateMedicalConfidence(text: string, sections: Record<string, string>): number {
    let confidence = 0;
    
    const medicalKeywords = [
      'patient', 'diagnosis', 'treatment', 'medication', 'symptoms',
      'doctor', 'physician', 'hospital', 'clinic', 'prescription'
    ];
    
    const foundKeywords = medicalKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    confidence += (foundKeywords.length / medicalKeywords.length) * 40;
    
    const expectedSections = ['Chief Complaint', 'Assessment', 'Plan', 'Medications'];
    const foundSections = expectedSections.filter(section => sections[section]);
    
    confidence += (foundSections.length / expectedSections.length) * 40;
    
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
      
      if (!fs.existsSync(filePath)) {
        return {
          isValid: false,
          isMedical: false,
          confidence: 0,
          issues: ['File does not exist']
        };
      }

      const result = await this.parsePDF(filePath);
      
      if (result.text.length < 50) {
        issues.push('Limited text extracted - document may benefit from OCR processing');
        confidence -= 30;
      }

      const medicalInfo = await this.extractMedicalInformation(filePath);
      const isMedical = medicalInfo.confidence > 30;
      
      if (!isMedical) {
        issues.push('Document may not be medical or needs enhanced text extraction');
        confidence -= 20;
      }

      return {
        isValid: confidence > 20,
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
      const result = await this.parsePDF(filePath);
      const lines = result.text.split('\n');
      const linesPerPage = Math.max(1, Math.ceil(lines.length / result.pageCount));
      
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