/*
  SortVision - ESP32 Sorting Mechanism Controller
  
  This sketch creates a Wi-Fi Access Point that the SortVision app can connect to.
  It listens for commands to control a light and a servo motor for sorting.
  
  - Wi-Fi Network (AP): SortVision-ESP32
  - Password: a_secure_password
  - ESP32 IP Address: 192.168.4.1 (by default)

  Endpoints:
  - GET /sort?class=[MATERIAL] : Moves the servo to a specific position.
    - MATERIAL can be "PLASTIC", "METAL", or "PAPER".
  - GET /light?state=[STATE] : Turns the LED light on or off.
    - STATE can be "ON" or "OFF".
*/

// Required Libraries for WiFi and Async Web Server
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Servo.h>

// --- Configuration ---

// WiFi Access Point credentials
const char* WIFI_SSID = "SortVision-ESP32";
const char* WIFI_PASSWORD = "a_secure_password";

// Pin definitions
const int SERVO_PIN = 13; // The pin the servo is connected to
const int LED_PIN = 12;   // The pin the control transistor for the light is connected to

// Servo positions for each material type
const int SERVO_HOME_POS = 90;
const int SERVO_PLASTIC_POS = 45;
const int SERVO_METAL_POS = 135;
const int SERVO_PAPER_POS = 0;
const int SERVO_UNKNOWN_POS = 90; // Default position for unknowns

// --- Global Objects ---

// Create an instance of the Servo library
Servo sorterServo;

// Create an instance of the Asynchronous Web Server on port 80
AsyncWebServer server(80);

// --- Request Handlers ---

/**
 * @brief Handles incoming requests to /sort
 * Moves the servo motor to the correct position based on the 'class' query parameter.
 */
void handleSortRequest(AsyncWebServerRequest *request) {
  String material = "UNKNOWN"; // Default to UNKNOWN

  // Check if the 'class' parameter exists in the request
  if (request->hasParam("class")) {
    material = request->getParam("class")->value();
    material.toUpperCase(); // Ensure the string is uppercase for reliable comparison

    Serial.print("Received sort command for: ");
    Serial.println(material);

    int targetPosition = SERVO_UNKNOWN_POS;

    if (material == "PLASTIC") {
      targetPosition = SERVO_PLASTIC_POS;
    } else if (material == "METAL") {
      targetPosition = SERVO_METAL_POS;
    } else if (material == "PAPER") {
      targetPosition = SERVO_PAPER_POS;
    } else {
      Serial.println("Warning: Received unknown material type. Moving to default position.");
    }
    
    // Move the servo to the target position
    sorterServo.write(targetPosition);
    
    // Send a success response back to the client
    request->send(200, "text/plain", "OK: Sorted " + material);

    // After a short delay, return the servo to the home position
    delay(1000); 
    sorterServo.write(SERVO_HOME_POS);

  } else {
    // If the 'class' parameter is missing, send an error response
    Serial.println("Error: /sort request received without 'class' parameter.");
    request->send(400, "text/plain", "Bad Request: Missing 'class' parameter.");
  }
}

/**
 * @brief Handles incoming requests to /light
 * Turns the LED light ON or OFF based on the 'state' query parameter.
 */
void handleLightRequest(AsyncWebServerRequest *request) {
  // Check if the 'state' parameter exists in the request
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase(); // Ensure uppercase for comparison

    if (state == "ON") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("Light turned ON");
      request->send(200, "text/plain", "OK: Light ON");
    } else if (state == "OFF") {
      digitalWrite(LED_PIN, LOW);
      Serial.println("Light turned OFF");
      request->send(200, "text/plain", "OK: Light OFF");
    } else {
      // If the 'state' parameter has an invalid value
      request->send(400, "text/plain", "Bad Request: Invalid 'state'. Use ON or OFF.");
    }
  } else {
    // If the 'state' parameter is missing
    request->send(400, "text/plain", "Bad Request: Missing 'state' parameter.");
  }
}

// --- Main Setup and Loop ---

/**
 * @brief Sets up the Wi-Fi Access Point.
 */
void setupWiFi() {
  Serial.println("Setting up Access Point...");
  
  // Start the Access Point with the defined SSID and password
  WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
  
  // Print the IP address of the Access Point to the Serial Monitor
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());
}

/**
 * @brief Main setup function, runs once on boot.
 */
void setup() {
  // Start serial communication for debugging
  Serial.begin(115200);
  Serial.println("\nESP32 Starting...");

  // Set up the GPIO pins for the servo and LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Ensure light is off initially

  // Attach the servo to its pin and move to the home position
  sorterServo.attach(SERVO_PIN);
  sorterServo.write(SERVO_HOME_POS);
  
  // Set up the WiFi Access Point
  setupWiFi();

  // Define the server routes and their corresponding handler functions
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.on("/light", HTTP_GET, handleLightRequest);
}

/**
 * @brief Main loop, runs continuously.
 * We add a flag to ensure server.begin() is only called once.
 */
void loop() {
  // Flag to ensure server.begin() is only called once.
  static bool server_setup_complete = false;

  if (!server_setup_complete) {
    server.begin();
    server_setup_complete = true;
    Serial.println("Web Server started.");
  }
  
  // The ESPAsyncWebServer library handles client requests in the background.
  // The main loop can be left empty or used for other non-blocking tasks.
}
