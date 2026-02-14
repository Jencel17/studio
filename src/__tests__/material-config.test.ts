import { describe, it, expect } from 'vitest';
import { getMaterialConfig, getRecyclableLabel } from '@/lib/material-config';

describe('getMaterialConfig', () => {
    it('returns config for known materials (plastic)', () => {
        const plastic = getMaterialConfig('plastic');
        expect(plastic).toBeDefined();
        expect(plastic.label).toBe('RECYCLABLE');
        expect(plastic.color).toBe('bg-blue-500');
    });

    it('returns config for metal', () => {
        const metal = getMaterialConfig('metal');
        expect(metal).toBeDefined();
        expect(metal.label).toBe('NON-BIODEGRADABLE');
    });

    it('returns config for paper', () => {
        const paper = getMaterialConfig('paper');
        expect(paper).toBeDefined();
        expect(paper.label).toBe('BIODEGRADABLE');
    });

    it('returns default config for unknown materials', () => {
        const unknown = getMaterialConfig('alien_material');
        expect(unknown).toBeDefined();
        expect(unknown.label).toBe('Unknown');
    });

    it('is case-insensitive', () => {
        const upper = getMaterialConfig('PLASTIC');
        const lower = getMaterialConfig('plastic');
        expect(upper.label).toBe(lower.label);
    });
});

describe('getRecyclableLabel', () => {
    it('returns "Recyclable" for recyclable materials', () => {
        expect(getRecyclableLabel('plastic')).toBe('Recyclable');
        expect(getRecyclableLabel('metal')).toBe('Recyclable');
        expect(getRecyclableLabel('paper')).toBe('Recyclable');
        expect(getRecyclableLabel('glass')).toBe('Recyclable');
    });

    it('returns "Compostable" for organic materials', () => {
        expect(getRecyclableLabel('organic')).toBe('Compostable');
    });

    it('returns "Special Disposal" for e-waste and hazardous', () => {
        expect(getRecyclableLabel('ewaste')).toBe('Special Disposal');
        expect(getRecyclableLabel('hazardous')).toBe('Special Disposal');
    });

    it('returns "General Waste" for unknown materials', () => {
        expect(getRecyclableLabel('unknown_item')).toBe('General Waste');
    });
});
