// src/services/embedding-service.ts
// This file is replaced by local-embedding-service.ts
// Keeping this as a stub to prevent import errors

import { EmbeddingServiceInterface } from '../interfaces/embedding-interface.js';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export class EmbeddingService implements EmbeddingServiceInterface {
  constructor(apiKey?: string, model?: string) {
    console.warn('⚠️  EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  async generateMedicalDocumentEmbedding(
    title: string, 
    content: string, 
    medicalEntities?: Array<{text: string, label: string}>
  ): Promise<number[]> {
    throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  async generateQueryEmbedding(query: string, context?: string): Promise<number[]> {
    throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  async findSimilarTexts(
    queryEmbedding: number[], 
    candidateEmbeddings: Array<{id: string, embedding: number[]}>,
    threshold: number = 0.3
  ): Promise<Array<{id: string, similarity: number}>> {
    throw new Error('EmbeddingService is deprecated. Use LocalEmbeddingService instead.');
  }

  getModelInfo(): { model: string, dimensions: number } {
    return {
      model: 'deprecated',
      dimensions: 0
    };
  }
}