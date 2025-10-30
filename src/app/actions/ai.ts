'use server';

import {suggestAiModelSwap as suggestAiModelSwapFlow} from '@/ai/flows/suggest-ai-model-swap';
import {
  type SuggestAiModelSwapInput,
  type SuggestAiModelSwapOutput,
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

    