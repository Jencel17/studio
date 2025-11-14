/**
 * ====================================================================
 * SortVision ESP32 Controller Code
 * ====================================================================
 * 
 * This code is designed to run on an ESP32 microcontroller and act as the
 * backend for the SortVision PWA.
 * 
 * --- HOW IT WORKS ---
 * 1.  ACCESS POINT: The ESP32 creates its own Wi-Fi network (Access Point) named "SortVision-Control".
 *     The web app should connect to this Wi-Fi network. The ESP32 will have the static IP 192.168.4.1.
 * 
 * 2.  WEB SERVER: It runs a small web server that listens for commands from the web app.
 * 
 * 3.  COMMANDS:
 *     - /light?state=ON  -> Turns an attached LED ON.
 *     - /light?state=OFF -> Turns the LED OFF.
 *     - /sort?class=PLASTIC -> Moves servos to sort plastic.
 *     - /sort?class=METAL   -> Moves servos to sort metal.
 *     - /sort?class=PAPER   -> Moves servos to sort paper.
 * 
 * --- REQUIRED LIBRARIES ---
 * You must install these libraries in your Arduino IDE (Sketch > Include Library > Manage Libraries...):
 * 1. ESPAsyncWebServer
 * 2. AsyncTCP
 * 3. ESP32Servo
 * 
 * --- HARDWARE SETUP ---
 * - Connect an LED to the 'LED_PIN'.
 * - Connect your main sorting gate servo to 'GATE_SERVO_PIN'.
 * - Connect any other servos as needed. This example assumes one gate servo.
 * 
 */

// --- Step 1: Include necessary libraries ---
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ESP32Servo.h>

// --- Step 2: Define your hardware pin numbers ---
const int LED_PIN = 2; // The pin connected to your LED/light source

// Servo motor configuration
const int GATE_SERVO_PIN = 13; // The pin for the main sorting gate servo

// Define servo positions for different materials
const int GATE_DEFAULT_POS = 90; // The servo's resting position
const int GATE_PLASTIC_POS = 30; // The angle to move to for 'Plastic'
const int GATE_METAL_POS   = 90; // The angle to move to for 'Metal'
const int GATE_PAPER_POS   = 150; // The angle to move to for 'Paper'

// --- Step 3: Global objects and variables ---
const char* ssid = "SortVision-Control"; // The name of the Wi-Fi network the ESP32 will create
const char* password = "sortvision123";  // The password for the Wi-Fi network

// Create an instance of the server on port 80
AsyncWebServer server(80);

// Create an instance of the Servo
Servo gateServo;

/**
 * @brief Moves the sorting gate to a target position and back to default.
 * @param targetPosition The angle (0-180) to move the servo to.
 */
void moveSortGate(int targetPosition) {
  Serial.print("Moving servo to position: ");
  Serial.println(targetPosition);
  
  gateServo.write(targetPosition);
  delay(1000); // Wait 1 second for the item to be sorted
  
  Serial.println("Returning servo to default position.");
  gateServo.write(GATE_DEFAULT_POS);
  delay(500); // Give the servo time to return
}


// --- Step 4: Setup function (runs once on startup) ---
void setup() {
  // Start the serial monitor for debugging
  Serial.begin(115200);
  Serial.println("SortVision ESP32 Controller Starting...");

  // Set up the LED pin as an output
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Start with the light off

  // Attach the servo and set its initial position
  gateServo.attach(GATE_SERVO_PIN);
  gateServo.write(GATE_DEFAULT_POS);
  delay(500);

  // --- Start Wi-Fi Access Point ---
  Serial.print("Creating Access Point: ");
  Serial.println(ssid);
  // The line below configures the ESP32 with its static IP address
  IPAddress local_IP(192, 168, 4, 1);
  IPAddress gateway(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(local_IP, gateway, subnet);
  // Start the access point
  WiFi.softAP(ssid, password);

  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  // --- Define Server Endpoints (The Commands) ---

  // Endpoint for controlling the light
  server.on("/light", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("state")) {
      String state = request->getParam("state")->value();
      state.toUpperCase();
      
      Serial.print("Received /light command with state: ");
      Serial.println(state);

      if (state == "ON") {
        digitalWrite(LED_PIN, HIGH);
        request->send(200, "text/plain", "Light turned ON");
      } else if (state == "OFF") {
        digitalWrite(LED_PIN, LOW);
        request->send(200, "text/plain", "Light turned OFF");
      } else {
        request->send(400, "text/plain", "Invalid state. Use ON or OFF.");
      }
    } else {
      request->send(400, "text/plain", "Missing 'state' parameter.");
    }
  });

  // Endpoint for sorting materials
  server.on("/sort", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("class")) {
      String materialClass = request->getParam("class")->value();
      materialClass.toUpperCase();

      Serial.print("Received /sort command for class: ");
      Serial.println(materialClass);

      if (materialClass == "PLASTIC") {
        moveSortGate(GATE_PLASTIC_POS);
        request->send(200, "text/plain", "Sorted PLASTIC");
      } else if (materialClass == "METAL") {
        moveSortGate(GATE_METAL_POS);
        request->send(200, "text/plain", "Sorted METAL");
      } else if (materialClass == "PAPER") {
        moveSortGate(GATE_PAPER_POS);
        request->send(200, "text/plain", "Sorted PAPER");
      } else {
        request->send(400, "text/plain", "Invalid class specified.");
      }
    } else {
      request->send(400, "text/plain", "Missing 'class' parameter.");
    }
  });

  // Start the server
  server.begin();
  Serial.println("Web Server started. Ready for commands.");
}

// --- Step 5: Loop function (runs continuously) ---
void loop() {
  // The AsyncWebServer handles requests in the background.
  // No code is needed here for this example.
}
