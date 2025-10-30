import {z} from 'zod';

// Schema and types for suggestAiModelSwap
export const SuggestAiModelSwapInputSchema = z.object({
  averageConfidenceScores: z
    .record(z.number())
    .describe(
      'A record of the average confidence scores for each classification label (Plastic, Metal, Paper) over a recent period.'
    ),
  numClassifications: z
    .number()
    .describe('Number of classifications made in the recent period.'),
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
export const PredictionSchema = z.object({
  className: z.string(),
  probability: z.number(),
});

export const InterpretDetectionsInputSchema = z.object({
  predictions: z
    .array(PredictionSchema)
    .describe('An array of predictions from the image classification model.'),
  confidenceThreshold: z
    .number()
    .describe(
      'The confidence threshold to consider a prediction as significant.'
    ),
});
export type InterpretDetectionsInput = z.infer<
  typeof InterpretDetectionsInputSchema
>;

export const InterpretDetectionsOutputSchema = z.object({
  detectionState: z
    .enum(['SINGLE_OBJECT', 'MULTIPLE_OBJECTS', 'NO_DETECTION', 'AMBIGUOUS'])
    .describe(
      'The overall state of detection based on the analyzed predictions.'
    ),
  primaryObject: z
    .string()
    .optional()
    .describe(
      'The class name of the primary detected object, if any. Only present for SINGLE_OBJECT.'
    ),
  detectedObjects: z
    .array(z.string())
    .optional()
    .describe(
      'A list of detected object class names. Only present for MULTIPLE_OBJECTS.'
    ),
  reason: z
    .string()
    .describe(
      'A brief explanation for the resulting detection state, for logging or debugging.'
    ),
});
export type InterpretDetectionsOutput = z.infer<
  typeof InterpretDetectionsOutputSchema
>;
