import * as fs from 'fs';
import * as path from 'path';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';

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
  private pdfExtract: PDFExtract;

  constructor() {
    this.pdfExtract = new PDFExtract();
    console.log('✅ PDF Service initialized with pdf.js-extract');
  }

  async parsePDF(filePath: string, options?: PDFProcessingOptions): Promise<PDFParseResult> {
    try {
      console.log(`📄 Parsing PDF file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const fileStats = fs.statSync(filePath);
      console.log(`📊 File size: ${fileStats.size} bytes`);
      
      // Extract using pdf.js-extract
      const extractOptions: PDFExtractOptions = {
        firstPage: options?.pageRange?.start,
        lastPage: options?.pageRange?.end || options?.maxPages,
        verbosity: -1 // Suppress warnings
      };

      const data = await this.pdfExtract.extract(filePath, extractOptions);
      
      return this.processExtractedData(data, fileStats.size);
    } catch (error) {
      console.error('❌ Failed to parse PDF file:', error);
      throw new Error(`PDF file parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async parsePDFBuffer(buffer: Buffer, options?: PDFProcessingOptions): Promise<PDFParseResult> {
    try {
      console.log(`📄 Processing PDF buffer, size: ${buffer.length} bytes`);
      
      if (!buffer || buffer.length === 0) {
        throw new Error('Buffer is empty or invalid');
      }

      // pdf.js-extract requires options for buffer processing
      const extractOptions: PDFExtractOptions = {
        firstPage: options?.pageRange?.start,
        lastPage: options?.pageRange?.end || options?.maxPages,
        verbosity: -1 // Suppress warnings
      };

      const data = await this.pdfExtract.extractBuffer(buffer, extractOptions);
      
      return this.processExtractedData(data, buffer.length);
    } catch (error) {
      console.error('❌ Failed to process PDF buffer:', error);
      throw new Error(`PDF buffer processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private processExtractedData(data: any, fileSize: number): PDFParseResult {
    console.log(`✅ PDF parsed successfully`);
    console.log(`📄 Pages: ${data.pages.length}`);
    
    // Extract text from all pages
    let fullText = '';
    
    for (const page of data.pages) {
      const pageText = this.extractTextFromPage(page);
      if (pageText) {
        fullText += pageText + '\n\n';
      }
    }
    
    // Clean the extracted text
    const cleanedText = this.cleanText(fullText);
    
    console.log(`📝 Text length: ${cleanedText.length} characters`);
    
    // Log preview
    if (cleanedText.length > 0) {
      const preview = cleanedText.substring(0, 500).replace(/\n+/g, ' ');
      console.log(`📖 Text preview: "${preview}..."`);
    }

    // Extract metadata
    const metadata = this.extractMetadata(data.meta?.info);

    const result: PDFParseResult = {
      text: cleanedText,
      pageCount: data.pages.length,
      metadata: metadata,
      info: {
        fileSize: fileSize,
        version: data.meta?.metadata?.['pdf:PDFVersion'] || '1.4',
        encrypted: data.meta?.info?.IsEncrypted || false
      }
    };

    console.log(`🎉 PDF processing successful: ${result.text.length} characters, ${result.pageCount} pages`);
    
    // Validate extraction
    if (result.text.length < 10 && fileSize > 1000) {
      console.warn('⚠️ Very little text extracted from a large PDF. The PDF might be image-based or encrypted.');
    }
    
    return result;
  }

  private extractTextFromPage(page: any): string {
    if (!page.content) return '';
    
    let pageText = '';
    let lastY = null;
    let lastX = null;
    
    // Sort content by position (top to bottom, left to right)
    const sortedContent = page.content.sort((a: any, b: any) => {
      if (Math.abs(a.y - b.y) > 5) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });
    
    for (const item of sortedContent) {
      // Add line break if Y position changed significantly
      if (lastY !== null && Math.abs(lastY - item.y) > item.height * 0.5) {
        pageText += '\n';
        lastX = null;
      }
      // Add space if X position indicates a gap
      else if (lastX !== null && item.x - lastX > item.width * 0.2) {
        pageText += ' ';
      }
      
      pageText += item.str;
      
      lastY = item.y;
      lastX = item.x + item.width;
    }
    
    return pageText;
  }

  private extractMetadata(info: any): PDFParseResult['metadata'] {
    const metadata: PDFParseResult['metadata'] = {};
    
    if (info) {
      metadata.title = info.Title || undefined;
      metadata.author = info.Author || undefined;
      metadata.subject = info.Subject || undefined;
      metadata.creator = info.Creator || undefined;
      metadata.producer = info.Producer || undefined;
      
      // Parse dates
      if (info.CreationDate) {
        try {
          metadata.creationDate = this.parsePDFDate(info.CreationDate);
        } catch (e) {
          console.warn('Failed to parse creation date:', e);
        }
      }
      
      if (info.ModDate) {
        try {
          metadata.modificationDate = this.parsePDFDate(info.ModDate);
        } catch (e) {
          console.warn('Failed to parse modification date:', e);
        }
      }
    }
    
    return metadata;
  }

  private parsePDFDate(dateStr: string): Date {
    // PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm
    const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (match) {
      const [_, year, month, day, hour = '0', minute = '0', second = '0'] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
    return new Date(dateStr);
  }

  private cleanText(text: string): string {
    if (!text) return '';
    
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive whitespace
      .replace(/[^\S\n]+/g, ' ')
      // Remove excessive newlines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Trim each line
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Remove leading/trailing whitespace
      .trim();
  }
}