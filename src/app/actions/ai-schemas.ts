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

    