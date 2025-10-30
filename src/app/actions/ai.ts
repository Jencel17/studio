'use server';

import {suggestAiModelSwap as suggestAiModelSwapFlow} from '@/ai/flows/suggest-ai-model-swap';
import {interpretDetections as interpretDetectionsFlow} from '@/ai/flows/interpret-detections-flow';

import {
  type SuggestAiModelSwapInput,
  type SuggestAiModelSwapOutput,
  type InterpretDetectionsInput,
  type InterpretDetectionsOutput,
} from './ai-schemas';

export async function handleModelSwapCheck(
  input: SuggestAiModelSwapInput
): Promise<SuggestAiModelSwapOutput> {
  try {
    const result = await suggestAiModelSwapFlow(input);
    return result;
  } catch (error) {
    console.error('Error suggesting AI model swap:', error);
    // Gracefully handle potential errors from the AI flow
    return {
      shouldSuggestSwap: false,
      reason: 'An error occurred while analyzing model performance.',
    };
  }
}

export async function handleInterpretDetections(
  input: InterpretDetectionsInput
): Promise<InterpretDetectionsOutput> {
  try {
    const result = await interpretDetectionsFlow(input);
    return result;
  } catch (error) {
    console.error('Error interpreting detections:', error);
    // Fallback in case of AI error
    return {
      detectionState: 'AMBIGUOUS',
      reason: 'An error occurred during AI analysis.',
    };
  }
}
