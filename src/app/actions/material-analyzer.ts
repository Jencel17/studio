"use server";

import { analyzeMaterialFlow } from '@/ai/flows/analyze-material-flow';
import {
  type AnalyzeMaterialInput,
  type AnalyzeMaterialOutput,
} from '@/ai/flows/analyze-material-flow';

export async function handleMaterialAnalysis(
  input: AnalyzeMaterialInput
): Promise<AnalyzeMaterialOutput> {
  try {
    const result = await analyzeMaterialFlow(input);
    return result;
  } catch (error) {
    console.error('Error analyzing material with AI:', error);
    // Gracefully handle potential errors from the AI flow
    return {
      material: 'Unknown',
      reason: 'An error occurred during the AI material analysis.',
    };
  }
}
