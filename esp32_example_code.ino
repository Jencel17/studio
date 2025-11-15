
#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// =======================================================================
// IMPORTANT: PLEASE READ
// =======================================================================
// This Arduino sketch is the counterpart to the SortVision Next.js web application.
// It is designed to run on an ESP32 microcontroller.
//
// HOW TO USE:
// 1. HARDWARE SETUP:
//    - Connect your LEDs to the GPIO pins defined below (PLASTIC_LED_PIN, etc.).
//      If you don't have LEDs, you can watch the Serial Monitor for output.
//    - Power your ESP32.
//
// 2. SOFTWARE SETUP:
//    - Open this file in the Arduino IDE.
//    - Go to "Tools" > "Board" and select your specific ESP32 board model.
//    - Go to "Tools" > "Port" and select the COM port your ESP32 is connected to.
//    - UPDATE WIFI CREDENTIALS: Change the `ssid` and `password` variables below
//      to match your local WiFi network.
//
// 3. LIBRARIES:
//    - Make sure you have the "ESPAsyncWebServer" library installed.
//    - In the Arduino IDE, go to "Sketch" > "Include Library" > "Manage Libraries...".
//    - Search for "ESPAsyncWebServer" and install it.
//    - This library also requires the "AsyncTCP" library. Search for and install it as well.
//
// 4. UPLOAD & RUN:
//    - Click the "Upload" button in the Arduino IDE.
//    - After uploading, open the "Serial Monitor" (Tools > Serial Monitor) and
//      set the baud rate to 115200.
//    - The ESP32 will print its IP address once connected to your WiFi.
//    - Enter this IP address into the SortVision app's settings panel.
// =======================================================================


// --- PIN DEFINITIONS ---
// IMPORTANT: Change these pin numbers to match your ESP32's wiring.
const int PLASTIC_LED_PIN = 13;
const int METAL_LED_PIN   = 12;
const int PAPER_LED_PIN   = 14;
const int LIGHT_PIN       = 27; // General purpose light/flash

// --- WIFI CREDENTIALS ---
// IMPORTANT: Replace with your WiFi network SSID and password.
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Create an instance of the Asynchronous Web Server on port 80
AsyncWebServer server(80);

void connectToWiFi() {
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFailed to connect to WiFi. Please check credentials and restart.");
  }
}

// Function to handle the /sort command
void handleSortRequest(AsyncWebServerRequest *request) {
  String material = "";
  if (request->hasParam("class")) {
    material = request->getParam("class")->value();
    material.toUpperCase(); // Ensure consistency

    Serial.print("Received sort command for: ");
    Serial.println(material);

    // Turn off all LEDs first
    digitalWrite(PLASTIC_LED_PIN, LOW);
    digitalWrite(METAL_LED_PIN, LOW);
    digitalWrite(PAPER_LED_PIN, LOW);

    // Turn on the correct LED
    if (material == "PLASTIC") {
      digitalWrite(PLASTIC_LED_PIN, HIGH);
      Serial.println("Activating PLASTIC sorter mechanism.");
    } else if (material == "METAL") {
      digitalWrite(METAL_LED_PIN, HIGH);
      Serial.println("Activating METAL sorter mechanism.");
    } else if (material == "PAPER") {
      digitalWrite(PAPER_LED_PIN, HIGH);
      Serial.println("Activating PAPER sorter mechanism.");
    } else {
      Serial.println("Unknown material received.");
      request->send(400, "text/plain", "Unknown material");
      return;
    }

    request->send(200, "text/plain", "OK: Sorted " + material);

    // Optional: Turn the LED off after a delay
    delay(1000);
    digitalWrite(PLASTIC_LED_PIN, LOW);
    digitalWrite(METAL_LED_PIN, LOW);
    digitalWrite(PAPER_LED_PIN, LOW);
    
  } else {
    Serial.println("Sort command received without 'class' parameter.");
    request->send(400, "text/plain", "Bad Request: Missing 'class' parameter");
  }
}

// Function to handle the /light command
void handleLightRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase();
    if (state == "ON") {
      digitalWrite(LIGHT_PIN, HIGH);
      Serial.println("Light turned ON");
      request->send(200, "text/plain", "OK: Light ON");
    } else if (state == "OFF") {
      digitalWrite(LIGHT_PIN, LOW);
      Serial.println("Light turned OFF");
      request->send(200, "text/plain", "OK: Light OFF");
    } else {
      request->send(400, "text/plain", "Bad Request: Invalid state");
    }
  } else {
    request->send(400, "text/plain", "Bad Request: Missing 'state' parameter");
  }
}

void handleNotFound(AsyncWebServerRequest *request) {
  Serial.print("Client requested unknown URL: ");
  Serial.println(request->url());
  request->send(404, "text/plain", "Not found");
}

void setup() {
  // Start the Serial Monitor
  Serial.begin(115200);
  Serial.println("\nSortVision ESP32 Initializing...");

  // Set up the GPIO pins for the LEDs
  pinMode(PLASTIC_LED_PIN, OUTPUT);
  pinMode(METAL_LED_PIN, OUTPUT);
  pinMode(PAPER_LED_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);

  // Ensure all LEDs are off at startup
  digitalWrite(PLASTIC_LED_PIN, LOW);
  digitalWrite(METAL_LED_PIN, LOW);
  digitalWrite(PAPER_LED_PIN, LOW);
  digitalWrite(LIGHT_PIN, LOW);

  // Connect to the WiFi network
  connectToWiFi();

  // Define the server routes
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.on("/light", HTTP_get, handleLightRequest);

  // Define a catch-all for 404 Not Found errors
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("HTTP server started. Awaiting commands from the app.");
}

void loop() {
  // The loop is intentionally kept empty.
  // The ESPAsyncWebServer library handles client requests in the background.
  // Using delay() in the loop can cause the web server to become unresponsive.
}
