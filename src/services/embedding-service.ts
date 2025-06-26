import OpenAI from 'openai';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "text-embedding-3-small") {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Clean and prepare text for embedding
      const cleanedText = this.preprocessText(text);
      
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: cleanedText,
        encoding_format: "float"
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const cleanedTexts = texts.map(text => this.preprocessText(text));
      
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: cleanedTexts,
        encoding_format: "float"
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Failed to generate batch embeddings:', error);
      throw new Error(`Batch embedding generation failed: ${error}`);
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
      .substring(0, 8000); // Limit length to avoid token limits
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
    threshold: number = 0.7
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

  getModelInfo(): { model: string, dimensions: number } {
    const dimensions = this.model === "text-embedding-3-small" ? 1536 : 
                     this.model === "text-embedding-3-large" ? 3072 : 1536;
    
    return {
      model: this.model,
      dimensions
    };
  }
}

