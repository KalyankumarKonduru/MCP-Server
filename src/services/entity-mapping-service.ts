import { BioClinicalEntity } from './bioclinical-server-connection.js';

export interface MappedEntity {
  text: string;
  label: string;
  confidence: number;
  start: number;
  end: number;
  context?: string;
}

export class EntityMappingService {
  // Map BioClinical entities to legacy format for backward compatibility
  static mapBioClinicalToLegacy(entities: BioClinicalEntity[]): MappedEntity[] {
    return entities.map(entity => ({
      text: entity.text,
      label: this.mapBioClinicalLabel(entity.label),
      confidence: entity.confidence,
      start: entity.start,
      end: entity.end,
      context: entity.context
    }));
  }

  private static mapBioClinicalLabel(label: 'PROBLEM' | 'TREATMENT' | 'TEST'): string {
    const mapping: Record<string, string> = {
      'PROBLEM': 'CONDITION',
      'TREATMENT': 'MEDICATION', 
      'TEST': 'PROCEDURE'
    };
    
    return mapping[label] || label;
  }

  // Get entity statistics for compatibility
  static getEntityStatistics(entities: MappedEntity[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    entities.forEach(entity => {
      stats[entity.label] = (stats[entity.label] || 0) + 1;
    });
    
    return stats;
  }

  // Filter entities by type for compatibility
  static filterEntitiesByType(entities: MappedEntity[], type: string): MappedEntity[] {
    return entities.filter(entity => entity.label === type);
  }
}