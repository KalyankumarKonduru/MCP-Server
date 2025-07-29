export class EntityMappingService {
    // Map BioClinical entities to legacy format for backward compatibility
    static mapBioClinicalToLegacy(entities) {
        return entities.map(entity => ({
            text: entity.text,
            label: this.mapBioClinicalLabel(entity.label),
            confidence: entity.confidence,
            start: entity.start,
            end: entity.end,
            context: entity.context
        }));
    }
    static mapBioClinicalLabel(label) {
        const mapping = {
            'PROBLEM': 'CONDITION',
            'TREATMENT': 'MEDICATION',
            'TEST': 'PROCEDURE'
        };
        return mapping[label] || label;
    }
    // Get entity statistics for compatibility
    static getEntityStatistics(entities) {
        const stats = {};
        entities.forEach(entity => {
            stats[entity.label] = (stats[entity.label] || 0) + 1;
        });
        return stats;
    }
    // Filter entities by type for compatibility
    static filterEntitiesByType(entities, type) {
        return entities.filter(entity => entity.label === type);
    }
}
//# sourceMappingURL=entity-mapping-service.js.map