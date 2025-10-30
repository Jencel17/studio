// @/app/actions/ai.ts
"use server";
import { z } from "zod";

import {
  suggestAiModelSwap,
  type SuggestAiModelSwapInput,
} from "@/ai/flows/suggest-ai-model-swap";

import { interpretDetections } from "@/ai/flows/interpret-detections-flow";

const PredictionSchema = z.object({
  className: z.string(),
  probability: z.number(),
});

export const InterpretDetectionsInputSchema = z.object({
  predictions: z.array(PredictionSchema).describe('An array of classification predictions from the Teachable Machine model.'),
  confidenceThreshold: z.number().describe('The minimum confidence score to consider a prediction significant.'),
});
export type InterpretDetectionsInput = z.infer<typeof InterpretDetectionsInputSchema>;

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
