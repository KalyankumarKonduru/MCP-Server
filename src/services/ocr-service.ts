import { createWorker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

export interface OCRResult {
  text: string;
  confidence: number;
  words?: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

export interface DocumentProcessingResult {
  extractedText: string;
  confidence: number;
  pageCount?: number;
  processingTime: number;
  metadata: {
    fileType: string;
    fileSize: number;
    processedAt: Date;
  };
}

export class OCRService {
  private worker: any;
  private isInitialized: boolean = false;

  constructor() {
    this.worker = null;
  }

  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) return;

      console.log('Initializing OCR worker...');
      this.worker = await createWorker('eng');
      
      // Configure for better medical document recognition
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?()[]{}/-+= \n\t',
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        preserve_interword_spaces: '1'
      });

      this.isInitialized = true;
      console.log('OCR worker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OCR worker:', error);
      throw error;
    }
  }

  async processImage(imagePath: string): Promise<OCRResult> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log(`Processing image: ${imagePath}`);
      const startTime = Date.now();

      const { data } = await this.worker.recognize(imagePath);
      
      const processingTime = Date.now() - startTime;
      console.log(`OCR completed in ${processingTime}ms with confidence: ${data.confidence}%`);

      return {
        text: data.text,
        confidence: data.confidence,
        words: data.words?.map((word: any) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox
        }))
      };
    } catch (error) {
      console.error('Failed to process image:', error);
      throw error;
    }
  }

  async processImageBuffer(imageBuffer: Buffer, fileType: string): Promise<OCRResult> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log(`Processing image buffer of type: ${fileType}`);
      const startTime = Date.now();

      const { data } = await this.worker.recognize(imageBuffer);
      
      const processingTime = Date.now() - startTime;
      console.log(`OCR completed in ${processingTime}ms with confidence: ${data.confidence}%`);

      return {
        text: data.text,
        confidence: data.confidence,
        words: data.words?.map((word: any) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox
        }))
      };
    } catch (error) {
      console.error('Failed to process image buffer:', error);
      throw error;
    }
  }

  async processDocument(filePath: string): Promise<DocumentProcessingResult> {
    try {
      const startTime = Date.now();
      const fileStats = fs.statSync(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      let extractedText = '';
      let confidence = 0;
      let pageCount = 1;

      switch (fileExtension) {
        case '.pdf':
          const pdfResult = await this.processPDF(filePath);
          extractedText = pdfResult.text;
          confidence = pdfResult.confidence;
          pageCount = pdfResult.pageCount || 1;
          break;
          
        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.bmp':
        case '.tiff':
        case '.gif':
          const imageResult = await this.processImage(filePath);
          extractedText = imageResult.text;
          confidence = imageResult.confidence;
          break;
          
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      const processingTime = Date.now() - startTime;

      return {
        extractedText: this.cleanExtractedText(extractedText),
        confidence,
        pageCount,
        processingTime,
        metadata: {
          fileType: fileExtension,
          fileSize: fileStats.size,
          processedAt: new Date()
        }
      };
    } catch (error) {
      console.error('Failed to process document:', error);
      throw error;
    }
  }

  private async processPDF(pdfPath: string): Promise<{ text: string; confidence: number; pageCount: number }> {
    try {
      // For PDF processing, we would typically use pdf2pic to convert to images
      // then process each page with OCR. For now, we'll simulate this.
      
      // This is a simplified implementation - in production you'd want to:
      // 1. Convert PDF pages to images using pdf2pic
      // 2. Process each image with OCR
      // 3. Combine results
      
      console.log('PDF processing not fully implemented - treating as single page');
      const result = await this.processImage(pdfPath);
      
      return {
        text: result.text,
        confidence: result.confidence,
        pageCount: 1
      };
    } catch (error) {
      console.error('Failed to process PDF:', error);
      throw error;
    }
  }

  private cleanExtractedText(text: string): string {
    return text
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/\s{2,}/g, ' ') // Reduce multiple spaces
      .replace(/[^\w\s\-.,;:!?()[\]{}\/\n]/g, '') // Remove unusual characters
      .trim();
  }

  async extractTextFromMedicalDocument(
    filePath: string,
    documentType?: 'prescription' | 'lab_report' | 'clinical_note' | 'discharge_summary'
  ): Promise<DocumentProcessingResult> {
    try {
      const result = await this.processDocument(filePath);
      
      // Apply medical document specific processing
      if (documentType) {
        result.extractedText = this.enhanceTextForMedicalType(result.extractedText, documentType);
      }

      return result;
    } catch (error) {
      console.error('Failed to extract text from medical document:', error);
      throw error;
    }
  }

  private enhanceTextForMedicalType(text: string, documentType: string): string {
    switch (documentType) {
      case 'prescription':
        // Enhance prescription text recognition
        return this.enhancePrescriptionText(text);
      case 'lab_report':
        // Enhance lab report text recognition
        return this.enhanceLabReportText(text);
      case 'clinical_note':
        // Enhance clinical note text recognition
        return this.enhanceClinicalNoteText(text);
      case 'discharge_summary':
        // Enhance discharge summary text recognition
        return this.enhanceDischargeText(text);
      default:
        return text;
    }
  }

  private enhancePrescriptionText(text: string): string {
    // Common prescription corrections
    return text
      .replace(/\bmg\b/gi, 'mg')
      .replace(/\bml\b/gi, 'ml')
      .replace(/\btablet[s]?\b/gi, 'tablets')
      .replace(/\bcapsule[s]?\b/gi, 'capsules')
      .replace(/\bonce daily\b/gi, 'once daily')
      .replace(/\btwice daily\b/gi, 'twice daily');
  }

  private enhanceLabReportText(text: string): string {
    // Common lab report corrections
    return text
      .replace(/\bmg\/dl\b/gi, 'mg/dL')
      .replace(/\bmmol\/l\b/gi, 'mmol/L')
      .replace(/\bnormal\b/gi, 'Normal')
      .replace(/\bhigh\b/gi, 'High')
      .replace(/\blow\b/gi, 'Low');
  }

  private enhanceClinicalNoteText(text: string): string {
    // Common clinical note corrections
    return text
      .replace(/\bpt\b/gi, 'patient')
      .replace(/\bhx\b/gi, 'history')
      .replace(/\bdx\b/gi, 'diagnosis')
      .replace(/\btx\b/gi, 'treatment');
  }

  private enhanceDischargeText(text: string): string {
    // Common discharge summary corrections
    return text
      .replace(/\badmission\b/gi, 'Admission')
      .replace(/\bdischarge\b/gi, 'Discharge')
      .replace(/\bfollow.?up\b/gi, 'Follow-up')
      .replace(/\bmedications?\b/gi, 'Medications');
  }

  async terminate(): Promise<void> {
    try {
      if (this.worker && this.isInitialized) {
        await this.worker.terminate();
        this.isInitialized = false;
        console.log('OCR worker terminated');
      }
    } catch (error) {
      console.error('Failed to terminate OCR worker:', error);
    }
  }

  getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 80) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
  }

  async validateMedicalDocument(text: string): Promise<{
    isValid: boolean;
    confidence: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let confidence = 100;

    // Check for common medical document indicators
    const medicalIndicators = [
      'patient', 'diagnosis', 'treatment', 'medication', 'doctor', 'physician',
      'hospital', 'clinic', 'prescription', 'dosage', 'symptoms'
    ];

    const foundIndicators = medicalIndicators.filter(indicator => 
      text.toLowerCase().includes(indicator)
    );

    if (foundIndicators.length < 2) {
      issues.push('Document may not be medical in nature');
      confidence -= 30;
    }

    // Check text length
    if (text.length < 50) {
      issues.push('Document text is very short');
      confidence -= 20;
    }

    // Check for garbled text (too many single characters)
    const singleChars = text.match(/\b\w\b/g);
    if (singleChars && singleChars.length > text.split(' ').length * 0.3) {
      issues.push('Text may be garbled or poorly recognized');
      confidence -= 25;
    }

    return {
      isValid: confidence > 50,
      confidence: Math.max(0, confidence),
      issues
    };
  }
}

