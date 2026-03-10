export interface LocalTrainingImage {
    correctedTo: string;
    imageData: string; // base64 data url
    fileName: string;
}

/**
 * Uploads an array of base64 images to the local Next.js server.
 */
export const uploadTrainingImagesToLocal = async (
    category: string,
    base64Images: string[]
): Promise<void> => {
    try {
        console.log(`[local-sync] Uploading ${base64Images.length} images to local server for ${category}...`);
        const response = await fetch('/api/training-images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ category, images: base64Images }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to upload images locally');
        }

        const data = await response.json();
        console.log(`[local-sync] Successfully saved ${data.saved} images locally.`);
    } catch (error) {
        console.error("Error uploading training images locally:", error);
    }
};

/**
 * Fetches all training images saved on the local Next.js server.
 */
export const getAllLocalTrainingImages = async (): Promise<LocalTrainingImage[]> => {
    try {
        const response = await fetch('/api/training-images');
        if (!response.ok) {
            throw new Error('Failed to fetch local images');
        }
        const images: LocalTrainingImage[] = await response.json();
        return images;
    } catch (error) {
        console.error("Error getting all local training images:", error);
        return [];
    }
};

/**
 * Deletes all training images saved on the local Next.js server.
 */
export const clearLocalTrainingImages = async (): Promise<void> => {
    try {
        const response = await fetch('/api/training-images', {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to clear local images');
        }
        console.log(`[local-sync] Successfully cleared all local training images.`);
    } catch (error) {
        console.error("Error clearing local training images:", error);
    }
};
