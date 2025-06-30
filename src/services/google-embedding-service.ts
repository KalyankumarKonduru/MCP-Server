// src/services/google-embedding-service.ts

import { GoogleGenAI } from "@google/genai";
import { EmbeddingServiceInterface } from '../interfaces/embedding-interface.js';

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
}

export class GoogleEmbeddingService implements EmbeddingServiceInterface {
  private client: GoogleGenAI;
  private model: string;
  private isInitialized = false;

  constructor(apiKey?: string, model: string = "gemini-embedding-exp-03-07") {
    if (!apiKey) {
      throw new Error('Google AI API key is required');
    }
    
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      console.log(`🧠 Initializing Google Embedding Service with model: ${this.model}`);
      // Test the connection with a simple embedding
      await this.generateEmbedding("test");
      this.isInitialized = true;
      console.log(`✅ Google Embedding Service initialized successfully`);
    } catch (error) {
      console.error('❌ Failed to initialize Google Embedding Service:', error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Clean and prepare text for embedding
      const cleanedText = this.preprocessText(text);
      
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: cleanedText,
        config: {
          taskType: "SEMANTIC_SIMILARITY",
        }
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('No embeddings returned from Google API');
      }

      return response.embeddings[0]?.values || [];
    } catch (error) {
      console.error('Failed to generate Google embedding:', error);
      throw new Error(`Google embedding generation failed: ${error}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const embeddings: number[][] = [];
      
      // Process in batches to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(text => this.generateEmbedding(text));
        const batchResults = await Promise.all(batchPromises);
        embeddings.push(...batchResults);
        
        // Add small delay between batches to respect rate limits
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return embeddings;
    } catch (error) {
      console.error('Failed to generate batch Google embeddings:', error);
      throw new Error(`Batch Google embedding generation failed: ${error}`);
    }
  }

  async generateMedicalDocumentEmbedding(
    title: string, 
    content: string, 
    medicalEntities?: Array<{text: string, label: string}>
  ): Promise<number[]> {
    try {
      // Create a comprehensive text representation for medical documents
      let embeddingText = `Title: ${title}\n\nContent: ${content}`;
      
      if (medicalEntities && medicalEntities.length > 0) {
        const entitiesText = medicalEntities
          .map(entity => `${entity.label}: ${entity.text}`)
          .join(', ');
        embeddingText += `\n\nMedical Entities: ${entitiesText}`;
      }

      return await this.generateEmbedding(embeddingText);
    } catch (error) {
      console.error('Failed to generate medical document embedding:', error);
      throw error;
    }
  }

  async generateQueryEmbedding(query: string, context?: string): Promise<number[]> {
    try {
      let queryText = query;
      
      if (context) {
        queryText = `Context: ${context}\n\nQuery: ${query}`;
      }

      return await this.generateEmbedding(queryText);
    } catch (error) {
      console.error('Failed to generate query embedding:', error);
      throw error;
    }
  }

  private preprocessText(text: string): string {
    // Clean and normalize text for better embeddings
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\-.,;:!?()]/g, '') // Remove special characters except basic punctuation
      .trim()
      .substring(0, 8000); // Limit length for Google API
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    try {
      if (embedding1.length !== embedding2.length) {
        throw new Error('Embeddings must have the same dimensions');
      }

      // Calculate cosine similarity
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
      }

      const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
      return similarity;
    } catch (error) {
      console.error('Failed to calculate similarity:', error);
      throw error;
    }
  }

  async findSimilarTexts(
    queryEmbedding: number[], 
    candidateEmbeddings: Array<{id: string, embedding: number[]}>,
    threshold: number = 0.3
  ): Promise<Array<{id: string, similarity: number}>> {
    try {
      const similarities = await Promise.all(
        candidateEmbeddings.map(async candidate => ({
          id: candidate.id,
          similarity: await this.calculateSimilarity(queryEmbedding, candidate.embedding)
        }))
      );

      return similarities
        .filter(item => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error('Failed to find similar texts:', error);
      throw error;
    }
  }

  getModelInfo(): { model: string, dimensions: number, isLocal: boolean } {
    return {
      model: this.model,
      dimensions: 768, // Google Gemini embedding dimensions
      isLocal: false
    };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async shutdown(): Promise<void> {
    // Clean up if needed
    this.isInitialized = false;
    console.log('Google Embedding Service shut down');
  }
}