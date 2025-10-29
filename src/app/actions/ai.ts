// @/app/actions/ai.ts
"use server";

import {
  suggestAiModelSwap,
  type SuggestAiModelSwapInput,
} from "@/ai/flows/suggest-ai-model-swap";

export async function handleModelSwapCheck(input: SuggestAiModelSwapInput) {
  try {
    const result = await suggestAiModelSwap(input);
    return result;
  } catch (error) {
    console.error("Error suggesting AI model swap:", error);
    // Gracefully handle potential errors from the AI flow
    return {
      shouldSuggestSwap: false,
      reason: "An error occurred while analyzing model performance.",
    };
  }
}
