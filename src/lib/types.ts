
export type LogEntry = {
  timestamp: string;
  message: string;
};

export type AppStatus = "AWAITING_MODEL" | "LOADING_LIBS" | "MODEL_LOADING" | "AWAITING_OBJECT" | "CONFIDENCE_TOO_LOW" | "READY_TO_SEND" | "CAMERA_CYCLING" | "COLLECTING_IMAGES" | "COOLDOWN" | "ANALYZING_MATERIAL";
    

    