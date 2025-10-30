// @/app/actions/ai.ts
"use server";

import {
  suggestAiModelSwap,
  type SuggestAiModelSwapInput,
} from "@/ai/flows/suggest-ai-model-swap";

import { interpretDetections, type InterpretDetectionsInput as FlowInput } from "@/ai/flows/interpret-detections-flow";

export type InterpretDetectionsInput = FlowInput;

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

export async function handleInterpretDetections(
  input: InterpretDetectionsInput
) {
  try {
    const result = await interpretDetections(input);
    return result;
  } catch (error) {
    console.error("Error interpreting detections:", error);
    return {
      detectionState: "NO_DETECTION",
      reason: "An error occurred while analyzing the scene.",
    };
  }
}
