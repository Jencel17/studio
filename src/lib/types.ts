
export type LogEntry = {
  id: string;
  timestamp: string;
  message: string;
};

export type AppStatus = "AWAITING_MODEL" | "LOADING_LIBS" | "MODEL_LOADING" | "AWAITING_OBJECT" | "CONFIDENCE_TOO_LOW" | "READY_TO_SEND" | "CAMERA_CYCLING" | "COLLECTING_IMAGES" | "COOLDOWN" | "ANALYZING_MATERIAL" | "CAMERA_WARMING_UP" | "DETECTED" | "SORTING" | "THANK_YOU" | "AI_FALLBACK";

export type Prediction = {
  className: string;
  probability: number;
};

export type ROI = {
  enabled: boolean;
  x: number;      // 0–1, percentage offset from left
  y: number;      // 0–1, percentage offset from top
  width: number;  // 0–1, percentage of video width
  height: number; // 0–1, percentage of video height
};

export const DEFAULT_ROI: ROI = {
  enabled: false,
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
};
