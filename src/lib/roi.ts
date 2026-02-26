import { ROI } from "./types";

/**
 * Creates an off-screen canvas with the cropped ROI region of the video.
 * Returns the canvas element for use with model.predict().
 * Returns null if ROI is disabled.
 */
export function cropVideoFrame(
    video: HTMLVideoElement,
    roi: ROI
): HTMLCanvasElement | null {
    if (!roi.enabled) return null;
    if (video.readyState < video.HAVE_ENOUGH_DATA) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const sx = Math.round(roi.x * vw);
    const sy = Math.round(roi.y * vh);
    const sw = Math.round(roi.width * vw);
    const sh = Math.round(roi.height * vh);

    // Safety: clamp to valid bounds
    const clampedSw = Math.min(sw, vw - sx);
    const clampedSh = Math.min(sh, vh - sy);

    if (clampedSw <= 0 || clampedSh <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = clampedSw;
    canvas.height = clampedSh;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, sx, sy, clampedSw, clampedSh, 0, 0, clampedSw, clampedSh);
    return canvas;
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
