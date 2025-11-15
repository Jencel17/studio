/*
  ESP32 SortVision Companion
  
  This sketch creates a WiFi Access Point that the SortVision app can connect to.
  It listens for commands from the app to control the sorting mechanism and an indicator light.

  - SSID: The name of the WiFi network created by the ESP32.
  - Password: The password for the WiFi network.
  - IP Address: The static IP address of the ESP32 on its own network.
*/

#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// --- WiFi Network Configuration ---
const char* ssid = "SortVision-ESP32";
const char* password = "password123";

// --- Static IP Configuration ---
// The app will connect to this IP address.
IPAddress local_ip(192, 168, 4, 1);
IPAddress gateway(192, 168, 4, 1);
IPAddress subnet(255, 255, 255, 0);

// --- Web Server on Port 80 ---
AsyncWebServer server(80);

// --- Pin Definitions ---
// Define the GPIO pins connected to the servo motors for each category.
const int PLASTIC_SERVO_PIN = 13; 
const int METAL_SERVO_PIN = 14; 
const int PAPER_SERVO_PIN = 15;
// Define the GPIO pin for the indicator light.
const int LIGHT_PIN = 2;


// =================================================================
//                      REQUEST HANDLERS
// =================================================================

/**
 * @brief Handles incoming requests to /sort to control the sorting servos.
 * 
 * Expects a URL parameter 'class' (e.g., /sort?class=PLASTIC).
 * Controls the servo motor corresponding to the identified material.
 */
void handleSortRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("class")) {
    String material = request->getParam("class")->value();
    material.toUpperCase();
    
    // Print the received material to the Serial Monitor for debugging.
    Serial.print("Received sort command for: ");
    Serial.println(material);

    if (material == "PLASTIC") {
      // TODO: Add your logic to move the 'PLASTIC' servo
      // For example:
      // plasticServo.write(90);
      // delay(500);
      // plasticServo.write(0);
      request->send(200, "text/plain", "OK: Sorted as PLASTIC");

    } else if (material == "METAL") {
      // TODO: Add your logic to move the 'METAL' servo
      request->send(200, "text/plain", "OK: Sorted as METAL");

    } else if (material == "PAPER") {
      // TODO: Add your logic to move the 'PAPER' servo
      request->send(200, "text/plain", "OK: Sorted as PAPER");

    } else {
      request->send(400, "text/plain", "Error: Unknown class '" + material + "'");
    }
  } else {
    request->send(400, "text/plain", "Error: Missing 'class' parameter");
  }
}

/**
 * @brief Handles incoming requests to /light to control the indicator light.
 * 
 * Expects a URL parameter 'state' (e.g., /light?state=ON).
 * Turns the indicator light ON or OFF.
 */
void handleLightRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("state")) {
    String lightState = request->getParam("state")->value();
    lightState.toUpperCase();
    
    if (lightState == "ON") {
      digitalWrite(LIGHT_PIN, HIGH);
      Serial.println("Light turned ON");
      request->send(200, "text/plain", "OK: Light ON");
    } else if (lightState == "OFF") {
      digitalWrite(LIGHT_PIN, LOW);
      Serial.println("Light turned OFF");
      request->send(200, "text/plain", "OK: Light OFF");
    } else {
      request->send(400, "text/plain", "Error: Invalid light state. Use ON or OFF.");
    }
  } else {
    request->send(400, "text/plain", "Error: Missing 'state' parameter.");
  }
}

// =================================================================
//                      WEB SERVER TASK
// =================================================================

/**
 * @brief This task contains all logic for setting up and running the web server.
 * 
 * Running the server in a dedicated task with a larger stack is more stable
 * and prevents stack overflow crashes when using async libraries.
 * @param pvParameters Function parameters (not used).
 */
void webServerTask(void *pvParameters) {
  Serial.println("Setting up Access Point...");
  
  // Configure and start the WiFi Access Point.
  WiFi.softAPConfig(local_ip, gateway, subnet);
  if (!WiFi.softAP(ssid, password)) {
    Serial.println("AP Config failed.");
    return; // Cannot proceed.
  }

  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  // --- Define Server Routes ---
  // Route for sorting command
  server.on("/sort", HTTP_GET, handleSortRequest);
  
  // Route for light control
  server.on("/light", HTTP_GET, handleLightRequest);

  // Route for root (/) to confirm the server is running
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/plain", "ESP32 SortVision Server is running!");
  });

  // Start the server.
  server.begin();
  Serial.println("Web Server started.");

  // This task has completed its setup, so we can delete it.
  // The web server runs in its own background tasks.
  vTaskDelete(NULL);
}


// =================================================================
//                      MAIN ARDUINO SKETCH
// =================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\nESP32 Starting...");

  // Initialize GPIO pins
  pinMode(PLASTIC_SERVO_PIN, OUTPUT);
  pinMode(METAL_SERVO_PIN, OUTPUT);
  pinMode(PAPER_SERVO_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);

  // Create the dedicated task for our web server.
  // The stack size (10000) is increased to prevent overflows.
  xTaskCreatePinnedToCore(
    webServerTask,      // Function to implement the task
    "WebServerTask",    // Name of the task
    10000,              // Stack size in words
    NULL,               // Task input parameter
    1,                  // Priority of the task
    NULL,               // Task handle
    0                   // Core where the task should run (0 or 1)
  );
}

void loop() {
  // The loop is intentionally left empty.
  // All work is handled by the ESPAsyncWebServer library in the background
  // and our one-time setup in the webServerTask.
  // Adding delay() here can cause the server to crash.
}
