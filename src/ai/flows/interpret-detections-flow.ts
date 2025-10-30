'use server';

/**
 * @fileOverview An AI flow to interpret results from an image classification model.
 *
 * - interpretDetections - A function that analyzes a list of predictions to determine the overall state.
 */

import { ai } from '@/ai/genkit';
import { InterpretDetectionsInputSchema, InterpretDetectionsOutputSchema, type InterpretDetectionsInput } from '@/app/actions/ai';


export async function interpretDetections(
  input: InterpretDetectionsInput
) {
  return interpretDetectionsFlow(input);
}


const prompt = ai.definePrompt({
    name: 'interpretDetectionsPrompt',
    input: { schema: InterpretDetectionsInputSchema },
    output: { schema: InterpretDetectionsOutputSchema },
    prompt: `You are an expert system that analyzes the output of a real-time image classification model. Your job is to interpret a list of predictions and determine if there is a single clear object, multiple distinct objects, or no significant detection.

The confidence threshold for a prediction to be considered significant is {{confidenceThreshold}}.

Here are the rules for your decision:
1.  **SINGLE_OBJECT**: If there is ONE prediction clearly above the confidence threshold, and all other predictions are significantly lower (e.g., less than half the top score), the state is SINGLE_OBJECT.
2.  **MULTIPLE_OBJECTS**: If there are TWO OR MORE predictions from DIFFERENT categories that are both above the confidence threshold, the state is MULTIPLE_OBJECTS.
3.  **AMBIGUOUS**: If multiple predictions are clustered near the confidence threshold but none are clearly dominant, the state is AMBIGUOUS.
4.  **NO_DETECTION**: If no predictions meet the confidence threshold, the state is NO_DETECTION.

Here are the predictions from the model:
{{#each predictions}}
- {{className}}: {{probability}}
{{/each}}

Analyze the predictions based on the rules and the confidence threshold of {{confidenceThreshold}}. Provide your output as a JSON object.

Example 1:
Input: { predictions: [{className: 'Plastic', probability: 0.95}, {className: 'Metal', probability: 0.1}], confidenceThreshold: 0.8 }
Output: { "detectionState": "SINGLE_OBJECT", "primaryObject": "Plastic", "reason": "Plastic has a very high confidence score, and other predictions are negligible." }

Example 2:
Input: { predictions: [{className: 'Plastic', probability: 0.88}, {className: 'Metal', probability: 0.85}], confidenceThreshold: 0.8 }
Output: { "detectionState": "MULTIPLE_OBJECTS", "detectedObjects": ["Plastic", "Metal"], "reason": "Both Plastic and Metal have high confidence scores, indicating multiple objects." }

Example 3:
Input: { predictions: [{className: 'Paper', probability: 0.6}, {className: 'Plastic', probability: 0.55}], confidenceThreshold: 0.8 }
Output: { "detectionState": "NO_DETECTION", "reason": "No prediction meets the confidence threshold." }

Now, analyze the given data and provide your JSON output.
`,
});

const interpretDetectionsFlow = ai.defineFlow(
  {
    name: 'interpretDetectionsFlow',
    inputSchema: InterpretDetectionsInputSchema,
    outputSchema: InterpretDetectionsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
