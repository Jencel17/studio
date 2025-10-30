'use server';

import { suggestAiModelSwap as suggestAiModelSwapFlow } from '@/ai/flows/suggest-ai-model-swap';
import { interpretDetections as interpretDetectionsFlow } from '@/ai/flows/interpret-detections-flow';
import { z } from 'zod';

// Schema and types for suggestAiModelSwap
export const SuggestAiModelSwapInputSchema = z.object({
  averageConfidenceScores: z
    .record(z.number())
    .describe(
      'A record of the average confidence scores for each classification label (Plastic, Metal, Paper) over a recent period.'
    ),
  numClassifications: z
    .number()
    .describe(
      'Number of classifications made in the recent period.'
    ),
});
export type SuggestAiModelSwapInput = z.infer<
  typeof SuggestAiModelSwapInputSchema
>;

export const SuggestAiModelSwapOutputSchema = z.object({
  shouldSuggestSwap: z
    .boolean()
    .describe(
      'Whether or not the app should suggest swapping in a different trained model.'
    ),
  reason: z
    .string()
    .describe(
      'The reason for suggesting or not suggesting a model swap, providing context for the decision.'
    ),
});
export type SuggestAiModelSwapOutput = z.infer<
  typeof SuggestAiModelSwapOutputSchema
>;

// Schema and types for interpretDetections
const PredictionSchema = z.object({
  className: z.string(),
  probability: z.number(),
});

export const InterpretDetectionsInputSchema = z.object({
  predictions: z.array(PredictionSchema).describe('An array of classification predictions from the Teachable Machine model.'),
  confidenceThreshold: z.number().describe('The minimum confidence score to consider a prediction significant.'),
});
export type InterpretDetectionsInput = z.infer<typeof InterpretDetectionsInputSchema>;

export const InterpretDetectionsOutputSchema = z.object({
  detectionState: z
    .enum(['SINGLE_OBJECT', 'MULTIPLE_OBJECTS', 'NO_DETECTION', 'AMBIGUOUS'])
    .describe('The overall state of detection.'),
  primaryObject: z.string().optional().describe('The name of the single object detected, if applicable.'),
  detectedObjects: z.array(z.string()).optional().describe('A list of objects detected, if multiple are present.'),
  reason: z.string().describe('A brief explanation for the decision.'),
});
export type InterpretDetectionsOutput = z.infer<typeof InterpretDetectionsOutputSchema>;


export async function handleModelSwapCheck(input: SuggestAiModelSwapInput): Promise<SuggestAiModelSwapOutput> {
  try {
    const result = await suggestAiModelSwapFlow(input);
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
): Promise<InterpretDetectionsOutput> {
  try {
    const result = await interpretDetectionsFlow(input);
    return result;
  } catch (error) {
    console.error("Error interpreting detections:", error);
    return {
      detectionState: "NO_DETECTION",
      reason: "An error occurred while analyzing the scene.",
    };
  }
}
