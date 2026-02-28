import { describe, it, expect } from 'vitest';
import { getMaterialConfig, getCategoryLabel } from '@/lib/material-config';

describe('getMaterialConfig', () => {
    it('returns config for e-waste', () => {
        const ewaste = getMaterialConfig('e-waste');
        expect(ewaste).toBeDefined();
        expect(ewaste.label).toBe('E-WASTE');
        expect(ewaste.color).toBe('bg-purple-600');
    });

    it('returns config for non-biodegradable', () => {
        const nonBio = getMaterialConfig('non-biodegradable');
        expect(nonBio).toBeDefined();
        expect(nonBio.label).toBe('NON-BIODEGRADABLE');
    });

    it('returns config for biodegradable', () => {
        const bio = getMaterialConfig('biodegradable');
        expect(bio).toBeDefined();
        expect(bio.label).toBe('BIODEGRADABLE');
    });

    it('returns default config for unknown materials', () => {
        const unknown = getMaterialConfig('alien_material');
        expect(unknown).toBeDefined();
        expect(unknown.label).toBe('Unknown');
    });

    it('is case-insensitive', () => {
        const upper = getMaterialConfig('E-WASTE');
        const lower = getMaterialConfig('e-waste');
        expect(upper.label).toBe(lower.label);
    });
});

describe('getCategoryLabel', () => {
    it('returns "E-Waste" for e-waste', () => {
        expect(getCategoryLabel('e-waste')).toBe('E-Waste');
    });

    it('returns "Biodegradable" for biodegradable', () => {
        expect(getCategoryLabel('biodegradable')).toBe('Biodegradable');
    });

    it('returns "Non-Biodegradable" for non-biodegradable', () => {
        expect(getCategoryLabel('non-biodegradable')).toBe('Non-Biodegradable');
    });

    it('returns "Unknown Category" for unknown materials', () => {
        expect(getCategoryLabel('unknown_item')).toBe('Unknown Category');
    });
});
