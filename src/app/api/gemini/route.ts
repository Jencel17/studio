import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

const SYSTEM_PROMPT = `You are a waste classification AI for a smart trash sorting machine.
Look at the image and classify the item into exactly ONE of these three categories:
- BIODEGRADABLE (organic waste: food scraps, paper, cardboard, leaves, wood, fabric)
- NON-BIODEGRADABLE (non-recyclable trash: plastic bags, styrofoam, candy wrappers, mixed waste)
- E-WASTE (electronic waste: circuit boards, cables, batteries, phones, light bulbs, chargers)

Rules:
1. Respond with ONLY the category name in ALL CAPS. Nothing else.
2. If you cannot determine the category, respond with UNKNOWN.
3. Do not include any explanation or punctuation.`;

export async function POST(req: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json(
            { error: "Gemini API key not configured." },
            { status: 500 }
        );
    }

    let imageBase64: string;
    let mimeType: string;

    try {
        const body = await req.json();
        imageBase64 = body.imageBase64;
        mimeType = body.mimeType || "image/jpeg";

        if (!imageBase64) {
            return NextResponse.json({ error: "No image provided." }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: SYSTEM_PROMPT },
                            {
                                inlineData: {
                                    mimeType,
                                    data: imageBase64,
                                },
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 20,
                },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Gemini API error:", errorData);
            return NextResponse.json(
                { error: "Gemini API request failed.", details: errorData },
                { status: response.status }
            );
        }

        const data = await response.json();
        const rawText: string =
            data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() ??
            "UNKNOWN";

        const validCategories = ["BIODEGRADABLE", "NON-BIODEGRADABLE", "E-WASTE"];
        const category = validCategories.includes(rawText) ? rawText : "UNKNOWN";

        return NextResponse.json({ category });
    } catch (err: any) {
        console.error("Gemini fallback error:", err);
        return NextResponse.json(
            { error: "Internal server error.", message: err.message },
            { status: 500 }
        );
    }
}
