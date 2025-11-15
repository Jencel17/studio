/*
  ESP32 Example Code for SortVision

  This sketch creates a Wi-Fi Access Point and a web server to control LEDs
  based on commands received from the SortVision application.

  - It creates a Wi-Fi network with the SSID "SortVision-ESP32".
  - It starts a web server on IP address 192.168.4.1.
  - The server listens for two commands on port 80:
    1. /sort?class=[MATERIAL] - Controls LEDs for sorting.
    2. /light?state=[ON/OFF]  - Controls a white light for illumination.

  To use this code:
  1. Open it in the Arduino IDE.
  2. Select your ESP32 board from the Tools > Board menu.
  3. Select the correct COM port from the Tools > Port menu.
  4. Install the "ESPAsyncWebServer" and "AsyncTCP" libraries via the Library Manager.
     - Go to Sketch > Include Library > Manage Libraries.
     - Search for and install "ESPAsyncWebServer".
     - Search for and install "AsyncTCP".
  5. Upload the code to your ESP32.
  6. In the SortVision app, go to Settings and set the "ESP32 IP Address" to "http://192.168.4.1".
*/

#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// --- PIN DEFINITIONS ---
// Define the GPIO pins connected to your LEDs.
// Using common pin numbers, but change them to match your wiring.
const int LIGHT_PIN = 2;       // General illumination light (e.g., a white LED)
const int PLASTIC_PIN = 13;    // LED for Plastic
const int METAL_PIN = 12;      // LED for Metal
const int PAPER_PIN = 14;      // LED for Paper

// Define the duration the sorting LEDs will stay on (in milliseconds)
const int ledOnDuration = 2000;

// --- NETWORK CONFIGURATION ---
// Set the name (SSID) of the Wi-Fi network the ESP32 will create.
const char* ssid = "SortVision-ESP32";
// Set the password for the Wi-Fi network. MUST be at least 8 characters.
const char* password = "sortvision";

// Create an instance of the Asynchronous Web Server on port 80
AsyncWebServer server(80);

// --- FUNCTION DECLARATIONS ---
// The Arduino compiler needs to know about these functions before they are used in `setup()`.
void handleSortRequest(AsyncWebServerRequest *request);
void handleLightRequest(AsyncWebServerRequest *request);
void handleNotFound(AsyncWebServerRequest *request);
void blinkLed(int pin, int times, int delay_ms);


void setup() {
  // Start the serial communication at 115200 baud rate for debugging
  Serial.begin(115200);
  Serial.println("\nESP32 Starting...");

  // Set the LED pins as outputs
  pinMode(LIGHT_PIN, OUTPUT);
  pinMode(PLASTIC_PIN, OUTPUT);
  pinMode(METAL_PIN, OUTPUT);
  pinMode(PAPER_PIN, OUTPUT);

  // Ensure all LEDs are off at the start
  digitalWrite(LIGHT_PIN, LOW);
  digitalWrite(PLASTIC_PIN, LOW);
  digitalWrite(METAL_PIN, LOW);
  digitalWrite(PAPER_PIN, LOW);

  // --- START WI-FI ACCESS POINT ---
  Serial.print("Setting up Access Point...");
  // The second argument enables the Access Point. 
  // The 'password' argument creates a secure WPA2 network.
  WiFi.softAP(ssid, password);

  // The IP address of the ESP32 in Access Point mode is 192.168.4.1 by default
  IPAddress apIP = WiFi.softAPIP();
  Serial.print(" AP IP address: ");
  Serial.println(apIP);

  // --- DEFINE SERVER ROUTES ---
  // Define what function to call when the server receives a request to a specific URL.

  // Route for sorting command: /sort?class=...
  server.on("/sort", HTTP_GET, handleSortRequest);

  // Route for light command: /light?state=...
  server.on("/light", HTTP_GET, handleLightRequest);

  // Route for any other page (404 Not Found)
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("HTTP server started.");

  // Blink the light pin twice to indicate that the setup is complete and the server is running.
  blinkLed(LIGHT_PIN, 2, 200);
}

void loop() {
  // The main loop is empty because the AsyncWebServer handles requests in the background.
  // Using delay() in the loop can interfere with the server's performance.
}

/**
 * @brief Handles incoming requests to the /sort endpoint.
 * 
 * It expects a query parameter 'class' which specifies the material to sort.
 * Example: http://192.168.4.1/sort?class=PLASTIC
 * 
 * @param request The request object from the web server.
 */
void handleSortRequest(AsyncWebServerRequest *request) {
  // Check if the 'class' parameter exists in the request
  if (request->hasParam("class")) {
    // Get the value of the 'class' parameter
    String material = request->getParam("class")->value();
    
    // Convert the received material string to uppercase for consistent matching
    material.toUpperCase();

    // Print the received command to the Serial Monitor for debugging
    Serial.print("Received sort command for: ");
    Serial.println(material);

    int targetPin = -1; // Use -1 to indicate no pin was matched

    // Determine which LED pin to activate based on the material
    if (material == "PLASTIC") {
      targetPin = PLASTIC_PIN;
    } else if (material == "METAL") {
      targetPin = METAL_PIN;
    } else if (material == "PAPER") {
      targetPin = PAPER_PIN;
    }

    // If a valid material was found, blink the corresponding LED
    if (targetPin != -1) {
      blinkLed(targetPin, 1, ledOnDuration);
      // Send a success response back to the client (the phone app)
      request->send(200, "text/plain", "OK: Sorting " + material);
    } else {
      // If the material is not recognized, send an error response
      Serial.print("Unknown material: ");
      Serial.println(material);
      request->send(400, "text/plain", "Bad Request: Unknown class '" + material + "'");
    }
  } else {
    // If the 'class' parameter is missing, send an error response
    Serial.println("Bad Request: 'class' parameter missing.");
    request->send(400, "text/plain", "Bad Request: Missing 'class' parameter.");
  }
}

/**
 * @brief Handles incoming requests to the /light endpoint.
 * 
 * It expects a query parameter 'state' which can be 'ON' or 'OFF'.
 * Example: http://192.168.4.1/light?state=ON
 * 
 * @param request The request object from the web server.
 */
void handleLightRequest(AsyncWebServerRequest *request) {
  // Check if the 'state' parameter exists
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase(); // Standardize to uppercase

    // Turn the light ON or OFF based on the state
    if (state == "ON") {
      digitalWrite(LIGHT_PIN, HIGH);
      Serial.println("Light turned ON");
      request->send(200, "text/plain", "OK: Light ON");
    } else if (state == "OFF") {
      digitalWrite(LIGHT_PIN, LOW);
      Serial.println("Light turned OFF");
      request->send(200, "text/plain", "OK: Light OFF");
    } else {
      // If the state is not recognized, send an error
      Serial.print("Unknown light state: ");
      Serial.println(state);
      request->send(400, "text/plain", "Bad Request: Unknown state '" + state + "'");
    }
  } else {
    // If the 'state' parameter is missing, send an error
    Serial.println("Bad Request: 'state' parameter missing.");
    request->send(400, "text/plain", "Bad Request: Missing 'state' parameter.");
  }
}

/**
 * @brief Handles any requests to URLs that have not been defined.
 * 
 * This function sends a 404 Not Found error message back to the client.
 * 
 * @param request The request object from the web server.
 */
void handleNotFound(AsyncWebServerRequest *request) {
  Serial.print("URI Not Found: ");
  Serial.println(request->url());
  request->send(404, "text/plain", "Not Found");
}

/**
 * @brief Blinks a specified LED for a given duration.
 * 
 * @param pin The GPIO pin number of the LED to blink.
 * @param times The number of times to blink the LED.
 * @param delay_ms The total duration for each on/off cycle.
 */
void blinkLed(int pin, int times, int delay_ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(delay_ms);
    digitalWrite(pin, LOW);
    if (i < times - 1) {
      delay(delay_ms / 2); // A short pause between blinks if blinking multiple times
    }
  }
}
