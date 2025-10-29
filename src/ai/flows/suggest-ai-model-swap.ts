'use server';

/**
 * @fileOverview An AI model suggestion flow.
 *
 * - suggestAiModelSwap - A function that determines whether to suggest swapping the AI model.
 * - SuggestAiModelSwapInput - The input type for the suggestAiModelSwap function.
 * - SuggestAiModelSwapOutput - The return type for the suggestAiModelSwap function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAiModelSwapInputSchema = z.object({
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

const SuggestAiModelSwapOutputSchema = z.object({
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

export async function suggestAiModelSwap(
  input: SuggestAiModelSwapInput
): Promise<SuggestAiModelSwapOutput> {
  return suggestAiModelSwapFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestAiModelSwapPrompt',
  input: {schema: SuggestAiModelSwapInputSchema},
  output: {schema: SuggestAiModelSwapOutputSchema},
  prompt: `You are an AI assistant helping to optimize a trash sorting app. The app uses an AI model to classify trash into Plastic, Metal, and Paper.

  You are given the average confidence scores for each category over the last {{numClassifications}} classifications.  Your job is to decide, based on these scores, whether the app should suggest swapping in a different trained model from Teachable Machine. The goal is to improve classification accuracy over time.

  Here are the average confidence scores:
  {{#each averageConfidenceScores}}
  {{@key}}: {{this}}
  {{/each}}

  Consider these factors:
  - If the confidence scores are consistently low (below 70% on average) across all categories, it indicates the current model is not performing well.
  - If one or two categories have low confidence scores while others are high, it might indicate the model needs more training data for those specific categories.
  - Always ensure that there have been sufficient classifications made before suggesting a swap (at least 20 classifications).

  Output a JSON object indicating whether a model swap should be suggested (shouldSuggestSwap: true or false) and provide a brief reason for your decision.
  Be concise.

  Example 1:
  Input: { averageConfidenceScores: { Plastic: 0.65, Metal: 0.60, Paper: 0.55 }, numClassifications: 50 }
  Output: { shouldSuggestSwap: true, reason: "Confidence scores are consistently low across all categories, indicating the current model is underperforming." }

  Example 2:
  Input: { averageConfidenceScores: { Plastic: 0.90, Metal: 0.85, Paper: 0.70 }, numClassifications: 30 }
  Output: { shouldSuggestSwap: false, reason: "Confidence scores are generally high, with Paper slightly lower but still acceptable." }

  Example 3:
  Input: { averageConfidenceScores: { Plastic: 0.30, Metal: 0.90, Paper: 0.90 }, numClassifications: 40 }
  Output: { shouldSuggestSwap: true, reason: "Plastic confidence is very low indicating the model needs more training data for plastic." }

  Now, analyze the given data and output the JSON object:
  `,
})

const suggestAiModelSwapFlow = ai.defineFlow(
  {
    name: 'suggestAiModelSwapFlow',
    inputSchema: SuggestAiModelSwapInputSchema,
    outputSchema: SuggestAiModelSwapOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
