/*
  SortVision ESP32 Controller Code

  This sketch creates a Wi-Fi Access Point that the SortVision app can connect to.
  It listens for commands from the app to control the sorting mechanism and a light.

  - Wi-Fi Network Name (SSID): SortVision-Controller
  - Wi-Fi Password: password123
  - ESP32 IP Address: 192.168.4.1 (Static)

  Endpoints:
  - http://192.168.4.1/sort?class=[MATERIAL]
    - [MATERIAL] can be PLASTIC, METAL, or PAPER
    - Controls the servo motor to sort the item.
    - Prints the received material to the Serial Monitor.

  - http://192.168.4.1/light?state=[STATE]
    - [STATE] can be ON or OFF
    - Controls a light connected to a pin.
*/

// --- Core Libraries ---
#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// --- Pin Definitions ---
// Define the GPIO pins for your LEDs or sorting mechanism actuators
const int PLASTIC_PIN = 13; // Example pin for Plastic
const int METAL_PIN = 12;   // Example pin for Metal
const int PAPER_PIN = 14;   // Example pin for Paper
const int LIGHT_PIN = 27;   // Example pin for the control light

// --- Network Configuration ---
const char* ssid = "SortVision-Controller";
const char* password = "password123"; // 8+ character password for WPA2

// --- Web Server Initialization ---
AsyncWebServer server(80); // Create AsyncWebServer object on port 80

// --- Function Declarations ---
void handleSortRequest(AsyncWebServerRequest *request);
void handleLightRequest(AsyncWebServerRequest *request);
void handleNotFound(AsyncWebServerRequest *request);
void setupWiFi();

// =================================================================
// SETUP: Runs once on boot.
// =================================================================
void setup() {
  // Start serial communication for debugging
  Serial.begin(115200);
  Serial.println("\nESP32 Starting...");

  // Set pin modes for LEDs/actuators
  pinMode(PLASTIC_PIN, OUTPUT);
  pinMode(METAL_PIN, OUTPUT);
  pinMode(PAPER_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);

  // Set initial state to OFF
  digitalWrite(PLASTIC_PIN, LOW);
  digitalWrite(METAL_PIN, LOW);
  digitalWrite(PAPER_PIN, LOW);
  digitalWrite(LIGHT_PIN, LOW);

  // Configure and start the WiFi Access Point
  setupWiFi();

  // Define server routes
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.on("/light", HTTP_GET, handleLightRequest);
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("HTTP server started.");
}

// =================================================================
// LOOP: Runs continuously.
// =================================================================
void loop() {
  // The loop is intentionally empty.
  // The ESPAsyncWebServer library handles requests in the background.
}

// =================================================================
// Wi-Fi Setup Function
// =================================================================
void setupWiFi() {
  Serial.println("Setting up Access Point...");
  // Start the Access Point with the specified SSID and password
  WiFi.softAP(ssid, password);
  
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());
}

// =================================================================
// Web Server Request Handlers
// =================================================================

/**
 * @brief Handles incoming requests to the /sort endpoint.
 * Expects a query parameter 'class' (e.g., /sort?class=PLASTIC).
 */
void handleSortRequest(AsyncWebServerRequest *request) {
  String material = "UNKNOWN";
  
  if (request->hasParam("class")) {
    material = request->getParam("class")->value();
    material.toUpperCase();

    // Print the received command to the Serial Monitor for debugging
    Serial.print("Received sort command for: ");
    Serial.println(material);

    // --- Sorting Logic ---
    // Add your code here to control servos or actuators based on the material
    if (material == "PLASTIC") {
      digitalWrite(PLASTIC_PIN, HIGH);
      delay(1000); // Keep actuator on for 1 second
      digitalWrite(PLASTIC_PIN, LOW);
    } else if (material == "METAL") {
      digitalWrite(METAL_PIN, HIGH);
      delay(1000);
      digitalWrite(METAL_PIN, LOW);
    } else if (material == "PAPER") {
      digitalWrite(PAPER_PIN, HIGH);
      delay(1000);
      digitalWrite(PAPER_PIN, LOW);
    }
    
    String responseMessage = "Command Received: Sort " + material;
    request->send(200, "text/plain", responseMessage);
  } else {
    request->send(400, "text/plain", "Bad Request: Missing 'class' parameter.");
  }
}

/**
 * @brief Handles incoming requests to the /light endpoint.
 * Expects a query parameter 'state' (e.g., /light?state=ON).
 */-
void handleLightRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase();
    
    Serial.print("Received light command: ");
    Serial.println(state);

    if (state == "ON") {
      digitalWrite(LIGHT_PIN, HIGH);
      request->send(200, "text/plain", "Light turned ON");
    } else if (state == "OFF") {
      digitalWrite(LIGHT_PIN, LOW);
      request->send(200, "text/plain", "Light turned OFF");
    } else {
      request->send(400, "text/plain", "Bad Request: 'state' must be ON or OFF.");
    }
  } else {
    request->send(400, "text/plain", "Bad Request: Missing 'state' parameter.");
  }
}

/**
 * @brief Handles any requests to undefined endpoints.
 */
void handleNotFound(AsyncWebServerRequest *request) {
  request->send(404, "text/plain", "Not Found");
}
