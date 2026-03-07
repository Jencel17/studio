import { ROI } from "./types";

const TM_INPUT_SIZE = 224;

/**
 * Prepares a 224×224 canvas for model.predict(), matching Teachable Machine's
 * preprocessing exactly: center-crop to square, then resize to 224×224.
 *
 * If ROI is enabled, the ROI region is extracted first, then center-cropped.
 * If ROI is disabled, the full video frame is center-cropped.
 */
export function prepareModelInput(
    video: HTMLVideoElement,
    roi: ROI
): HTMLCanvasElement | null {
    if (video.readyState < video.HAVE_ENOUGH_DATA) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    // Determine the source rectangle
    let sx: number, sy: number, sw: number, sh: number;

    if (roi.enabled) {
        sx = Math.round(roi.x * vw);
        sy = Math.round(roi.y * vh);
        sw = Math.min(Math.round(roi.width * vw), vw - sx);
        sh = Math.min(Math.round(roi.height * vh), vh - sy);
        if (sw <= 0 || sh <= 0) return null;
    } else {
        sx = 0;
        sy = 0;
        sw = vw;
        sh = vh;
    }

    // Center-crop to square (matching Teachable Machine behavior)
    const cropSize = Math.min(sw, sh);
    const cropX = sx + Math.round((sw - cropSize) / 2);
    const cropY = sy + Math.round((sh - cropSize) / 2);

    // Draw into a 224×224 canvas
    const canvas = document.createElement("canvas");
    canvas.width = TM_INPUT_SIZE;
    canvas.height = TM_INPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, TM_INPUT_SIZE, TM_INPUT_SIZE);
    return canvas;
}

/**
 * Legacy: Creates an off-screen canvas with the cropped ROI region of the video.
 * Now always outputs 224×224 to match Teachable Machine expectations.
 * Returns null if ROI is disabled.
 */
export function cropVideoFrame(
    video: HTMLVideoElement,
    roi: ROI
): HTMLCanvasElement | null {
    if (!roi.enabled) return null;
    return prepareModelInput(video, roi);
}

/**
 * Captures a JPEG data URI of the cropped ROI region.
 * If ROI is disabled, captures the full frame.
 */
export function cropCanvasCapture(
    video: HTMLVideoElement,
    roi: ROI
): string | null {
    if (video.readyState < video.HAVE_ENOUGH_DATA) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (roi.enabled) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const sx = Math.round(roi.x * vw);
        const sy = Math.round(roi.y * vh);
        const sw = Math.min(Math.round(roi.width * vw), vw - sx);
        const sh = Math.min(Math.round(roi.height * vh), vh - sy);

        if (sw <= 0 || sh <= 0) return null;

        canvas.width = sw;
        canvas.height = sh;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
    }

    return canvas.toDataURL("image/jpeg");
}
