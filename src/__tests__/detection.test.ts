import { describe, it, expect } from 'vitest';
import { interpretDetectionsLocal } from '@/lib/detection';

const makePrediction = (className: string, probability: number) => ({ className, probability });

describe('interpretDetectionsLocal', () => {
  const threshold = 0.7;

  it('returns NO_DETECTION when all predictions are below 0.5', () => {
    const predictions = [
      makePrediction('plastic', 0.3),
      makePrediction('metal', 0.2),
    ];
    const result = interpretDetectionsLocal(predictions, threshold);
    expect(result.detectionState).toBe('NO_DETECTION');
    expect(result.primaryObject).toBeUndefined();
  });

  it('returns SINGLE_OBJECT with very high confidence (>0.90)', () => {
    const predictions = [
      makePrediction('plastic', 0.95),
      makePrediction('metal', 0.03),
      makePrediction('paper', 0.02),
    ];
    const result = interpretDetectionsLocal(predictions, threshold);
    expect(result.detectionState).toBe('SINGLE_OBJECT');
    expect(result.primaryObject).toBe('plastic');
  });

  it('returns SINGLE_OBJECT when one prediction exceeds threshold', () => {
    const predictions = [
      makePrediction('plastic', 0.75),
      makePrediction('metal', 0.15),
      makePrediction('paper', 0.10),
    ];
    const result = interpretDetectionsLocal(predictions, threshold);
    expect(result.detectionState).toBe('SINGLE_OBJECT');
    expect(result.primaryObject).toBe('plastic');
  });

  it('returns MULTIPLE_OBJECTS with split confidence', () => {
    const predictions = [
      makePrediction('plastic', 0.5),
      makePrediction('metal', 0.4),
      makePrediction('paper', 0.1),
    ];
    // 0.5 + 0.4 = 0.9 > 0.85, and 0.4 > 0.15 → split confidence
    const result = interpretDetectionsLocal(predictions, threshold);
    expect(result.detectionState).toBe('MULTIPLE_OBJECTS');
    expect(result.detectedObjects).toContain('plastic');
    expect(result.detectedObjects).toContain('metal');
  });

  it('returns AMBIGUOUS when top prediction is between 0.5 and threshold', () => {
    const predictions = [
      makePrediction('plastic', 0.6),
      makePrediction('metal', 0.1),
      makePrediction('paper', 0.1),
    ];
    const result = interpretDetectionsLocal(predictions, threshold);
    expect(result.detectionState).toBe('AMBIGUOUS');
  });

  it('handles empty predictions array', () => {
    const result = interpretDetectionsLocal([], threshold);
    expect(result.detectionState).toBe('NO_DETECTION');
    expect(result.primaryObject).toBeUndefined();
  });

  it('uses custom threshold correctly', () => {
    const predictions = [
      makePrediction('plastic', 0.6),
      makePrediction('metal', 0.1),
    ];
    // With 0.7 threshold, 0.6 is below → AMBIGUOUS (since 0.6 >= 0.5)
    expect(interpretDetectionsLocal(predictions, 0.7).detectionState).toBe('AMBIGUOUS');
    // With 0.5 threshold, 0.6 is above → SINGLE_OBJECT
    expect(interpretDetectionsLocal(predictions, 0.5).detectionState).toBe('SINGLE_OBJECT');
  });
});
