import { BioClinicalEntity } from './bioclinical-server-connection.js';
export interface MappedEntity {
    text: string;
    label: string;
    confidence: number;
    start: number;
    end: number;
    context?: string;
}
export declare class EntityMappingService {
    static mapBioClinicalToLegacy(entities: BioClinicalEntity[]): MappedEntity[];
    private static mapBioClinicalLabel;
    static getEntityStatistics(entities: MappedEntity[]): Record<string, number>;
    static filterEntitiesByType(entities: MappedEntity[], type: string): MappedEntity[];
}
//# sourceMappingURL=entity-mapping-service.d.ts.map