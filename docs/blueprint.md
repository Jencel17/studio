# **App Name**: SortVision

## Core Features:

- Live Camera Feed: Display a real-time camera preview for object detection.
- AI Object Classification: Use an on-device AI model (TensorFlow Lite, ML Kit, or similar) to classify objects as Plastic, Metal, or Paper.
- Classification Confidence Display: Display the predicted label and confidence percentage (e.g., 'Plastic - 92%') on the screen.
- MQTT Communication: Publish the classification result to an ESP32 microcontroller via MQTT when confidence is above 80%.
- WiFi Auto-Connect: Automatically connect to WiFi and the MQTT broker on startup.
- MQTT Reconnect Button: Include a 'Reconnect' button to reinitialize the MQTT connection if needed.
- AI Model Tool: Reason and decide to swap in a different trained model using Teachable Machine (if supported by builder)

## Style Guidelines:

- Primary color: Forest green (#4CAF50) to evoke associations with recycling and nature.
- Background color: Light beige (#F5F5DC) to provide a neutral and clean backdrop.
- Accent color: Teal (#008080) to provide contrast and highlight important information.
- Body and headline font: 'PT Sans', a humanist sans-serif for a balance of modernity and warmth.
- Use minimalist icons to represent Plastic, Metal, and Paper.
- Simple layout with camera feed occupying most of the screen, and classification results displayed on top.