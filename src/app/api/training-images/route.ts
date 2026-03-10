import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Using public folder so they are accessible directly if needed,
// but saving them organized by category.
const TRAINING_DIR = path.join(process.cwd(), 'public', 'training_images');

// Ensure the base directory exists
if (!fs.existsSync(TRAINING_DIR)) {
    fs.mkdirSync(TRAINING_DIR, { recursive: true });
}

export async function POST(req: Request) {
    try {
        const { category, images } = await req.json();

        if (!category || !images || !Array.isArray(images)) {
            return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
        }

        const categoryDir = path.join(TRAINING_DIR, category);
        if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
        }

        const timestamp = Date.now();
        const savedPaths = [];

        for (let i = 0; i < images.length; i++) {
            const base64Data = images[i].replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const fileName = `${timestamp}_${i}.jpg`;
            const filePath = path.join(categoryDir, fileName);
            fs.writeFileSync(filePath, buffer);
            savedPaths.push(`/training_images/${category}/${fileName}`);
        }

        return NextResponse.json({ success: true, saved: savedPaths.length });
    } catch (error: any) {
        console.error('Error saving training images locally:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const result: { correctedTo: string, imageData: string, fileName: string }[] = [];

        if (!fs.existsSync(TRAINING_DIR)) {
            return NextResponse.json(result);
        }

        const categories = fs.readdirSync(TRAINING_DIR);

        for (const category of categories) {
            const categoryDir = path.join(TRAINING_DIR, category);

            // Ensure it's a directory
            if (!fs.statSync(categoryDir).isDirectory()) continue;

            const files = fs.readdirSync(categoryDir);
            for (const file of files) {
                if (!file.endsWith('.jpg') && !file.endsWith('.png')) continue;

                const filePath = path.join(categoryDir, file);
                const fileBuffer = fs.readFileSync(filePath);

                // Convert exactly like Firebase did, to base64 so admin-dashboard JSZip handles it identically
                const base64Data = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;

                result.push({
                    correctedTo: category,
                    imageData: base64Data,
                    fileName: file
                });
            }
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error reading local training images:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        if (!fs.existsSync(TRAINING_DIR)) {
            return NextResponse.json({ success: true });
        }

        // Recursively delete directory
        fs.rmSync(TRAINING_DIR, { recursive: true, force: true });

        // Recreate the empty directory
        fs.mkdirSync(TRAINING_DIR, { recursive: true });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error clearing local training images:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
