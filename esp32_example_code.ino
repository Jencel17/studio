/**
 * SortVision ESP32 Control Code
 *
 * This code sets up an ESP32 as a WiFi Access Point and runs a web server.
 * It's designed to receive commands from the SortVision PWA to control servo motors.
 *
 * REQUIRED LIBRARIES:
 * - WiFi.h (Comes with ESP32 board package)
 * - WebServer.h (Comes with ESP32 board package)
 * - ESP32Servo.h (Install from Arduino Library Manager)
 * 
 * CLASS NAME REQUIREMENTS FOR TEACHABLE MACHINE:
 * Your Teachable Machine model MUST use these exact class names for the app to work:
 * 1. Plastic
 * 2. Metal
 * 3. Paper
 * 4. Background
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

// --- Configuration ---

// WiFi Access Point Settings
const char* ssid = "SortVision-AP";
const char* password = "password123";

// Web Server
WebServer server(80);

// Servo motor setup
Servo plasticServo;
Servo metalServo;
Servo paperServo;

// Define GPIO pins for the servos
const int PLASTIC_SERVO_PIN = 13;
const int METAL_SERVO_PIN = 12;
const int PAPER_SERVO_PIN = 14;

// Define servo positions
const int SERVO_OPEN_POS = 90;  // Angle for when the gate is "open"
const int SERVO_CLOSED_POS = 0; // Angle for when the gate is "closed"
const int SERVO_DELAY = 500;    // Time in ms for the servo to move and object to drop

// LED pin for visual feedback
const int LED_PIN = 2;

// --- Function Prototypes ---
void handleSortRequest();
void handleLightRequest();
void handleNotFound();
void setupWiFi();
void moveServo(Servo &servo);
void resetServos();

// --- Main Setup ---
void setup() {
  Serial.begin(115200);
  while (!Serial) { }
  Serial.println("\nESP32 Starting...");

  // Attach servos and set to initial position
  plasticServo.attach(PLASTIC_SERVO_PIN);
  metalServo.attach(METAL_SERVO_PIN);
  paperServo.attach(PAPER_SERVO_PIN);
  resetServos();
  
  // Configure the built-in LED pin
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Setup WiFi and server
  setupWiFi();

  // Define server routes (what to do on which URL)
  server.on("/sort", HTTP_POST, handleSortRequest);
  server.on("/light", HTTP_POST, handleLightRequest);
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("HTTP server started");
}

// --- Main Loop ---
unsigned long previousMillis = 0;
const long interval = 1; // A minimal, safe delay interval in milliseconds

void loop() {
  // server.handleClient() needs to run as often as possible to be responsive.
  server.handleClient();

  // --- NON-BLOCKING DELAY PATTERN ---
  // This is a safe way to perform actions at a set interval without using
  // the blocking `delay()` function, which would freeze the web server.
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    // Save the last time you did something
    previousMillis = currentMillis;

    // You can add other non-blocking code here.
    // For example, blinking an LED or reading a sensor.
    // For now, we will leave it empty to ensure the server is as responsive as possible.
  }
}

// --- Functions ---

/**
 * @brief Sets up the ESP32 as a WiFi Access Point.
 */
void setupWiFi() {
  Serial.println("Setting up Access Point...");
  // Set a static IP for the AP
  IPAddress local_ip(192, 168, 4, 1);
  IPAddress gateway(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);

  WiFi.softAPConfig(local_ip, gateway, subnet);
  // Start the Access Point with the given SSID and password
  bool apStarted = WiFi.softAP(ssid, password);

  if (apStarted) {
    Serial.print("AP IP address: ");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("Failed to start Access Point!");
  }
}

/**
 * @brief Handles incoming requests to /sort.
 * Expects a POST request with a 'class' argument (e.g., 'PLASTIC').
 */
void handleSortRequest() {
  if (server.hasArg("class")) {
    String material = server.arg("class");
    material.toUpperCase(); // Ensure string is uppercase for reliable comparison
    
    // Print to serial monitor for debugging
    Serial.print("Received sort command for: ");
    Serial.println(material);

    if (material == "PLASTIC") {
      moveServo(plasticServo);
      server.send(200, "text/plain", "OK: Plastic sorted");
    } else if (material == "METAL") {
      moveServo(metalServo);
      server.send(200, "text/plain", "OK: Metal sorted");
    } else if (material == "PAPER") {
      moveServo(paperServo);
      server.send(200, "text/plain", "OK: Paper sorted");
    } else {
      server.send(400, "text/plain", "Error: Unknown class");
    }
  } else {
    server.send(400, "text/plain", "Error: Missing 'class' parameter");
  }
}

/**
 * @brief Moves a specified servo to open a gate, waits, then closes it.
 * @param servo The servo motor to actuate.
 */
void moveServo(Servo &servo) {
  servo.write(SERVO_OPEN_POS);
  delay(SERVO_DELAY); // This delay is safe here as it's inside a specific request, not the main loop
  servo.write(SERVO_CLOSED_POS);
}

/**
 * @brief Resets all servos to their initial closed position.
 */
void resetServos() {
    plasticServo.write(SERVO_CLOSED_POS);
    metalServo.write(SERVO_CLOSED_POS);
    paperServo.write(SERVO_CLOSED_POS);
}

/**
 * @brief Handles incoming requests to /light.
 * Expects a POST request with a 'state' argument ('ON' or 'OFF').
 */
void handleLightRequest() {
  if (server.hasArg("state")) {
    String state = server.arg("state");
    if (state == "ON") {
      digitalWrite(LED_PIN, HIGH);
      server.send(200, "text/plain", "OK: Light ON");
    } else if (state == "OFF") {
      digitalWrite(LED_PIN, LOW);
      server.send(200, "text/plain", "OK: Light OFF");
    } else {
      server.send(400, "text/plain", "Error: Invalid state");
    }
  } else {
    server.send(400, "text/plain", "Error: Missing 'state' parameter");
  }
}

/**
 * @brief Handles requests to routes that are not found.
 */
void handleNotFound() {
  server.send(404, "text/plain", "Not found");
}
