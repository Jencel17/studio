'use server';

/**
 * @fileOverview An AI flow to analyze the material of an object in an image.
 * 
 * - analyzeMaterialFlow - A Genkit flow that uses a vision model to determine if an object
 *   is made of Plastic, Metal, or Paper.
 * - AnalyzeMaterialInputSchema - The Zod schema for the flow's input (a data URI of a photo).
 * - AnalyzeMaterialOutputSchema - The Zod schema for the flow's output (the identified material and a reason).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Define the input schema with a photo data URI
export const AnalyzeMaterialInputSchema = z.object({
  photoDataUri: z.string().describe(
    "A photo of an object, provided as a data URI. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
  ),
});
export type AnalyzeMaterialInput = z.infer<typeof AnalyzeMaterialInputSchema>;

// Define the output schema for the material analysis
export const AnalyzeMaterialOutputSchema = z.object({
  material: z.enum(['Plastic', 'Metal', 'Paper', 'Unknown']).describe(
    "The primary material of the object identified in the photo."
  ),
  reason: z.string().describe(
    "A brief explanation for the material identification."
  ),
});
export type AnalyzeMaterialOutput = z.infer<typeof AnalyzeMaterialOutputSchema>;


const analyzeMaterialPrompt = ai.definePrompt({
    name: 'analyzeMaterialPrompt',
    input: { schema: AnalyzeMaterialInputSchema },
    output: { schema: AnalyzeMaterialOutputSchema },
    prompt: `You are an expert in waste material identification. Your task is to analyze the provided image and determine the primary material of the main object shown.

    The only valid materials are: 'Plastic', 'Metal', 'Paper'.

    Even if you do not recognize the object itself, you must make a best-effort guess based on its visual properties:
    - **Plastic**: Look for uniform color, smooth or slightly textured surfaces, and potential for translucency. It often has a dull or semi-gloss sheen.
    - **Metal**: Look for high reflectivity, metallic sheen (silver, gold, etc.), signs of rust or oxidation, and hard, rigid surfaces.
    - **Paper**: Look for fibrous textures, matte surfaces, and evidence of being foldable or tearable, like cardboard or printed paper.

    If you cannot confidently determine the material from the image, classify it as 'Unknown'.

    Analyze the following image and provide your output as a JSON object with the 'material' and a brief 'reason' for your decision.

    Image to analyze: {{media url=photoDataUri}}
    `,
});


export const analyzeMaterialFlow = ai.defineFlow(
  {
    name: 'analyzeMaterialFlow',
    inputSchema: AnalyzeMaterialInputSchema,
    outputSchema: AnalyzeMaterialOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeMaterialPrompt(input);
    return output!;
  }
);
