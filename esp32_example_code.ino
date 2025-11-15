
/*
  SortVision ESP32 Companion Sketch
  =================================

  This sketch creates a Wi-Fi Access Point and runs a web server that listens for commands 
  from the SortVision PWA to control a sorting mechanism.

  -----------------------------------------------------------------------------------------
  *** IMPORTANT: COMPILATION ERROR FIX ***
  If you get a compilation error related to 'mbedtls_md5_starts_ret' not being declared,
  it means your ESPAsyncWebServer library is incompatible with your ESP32 board version.

  To fix this, you must manually edit a library file.

  STEP 1: Find the file "WebAuthentication.cpp"
  ----------------------------------------------
  This file is located inside your Arduino libraries folder. The path will be similar to:
  C:\Users\[Your_Username]\Documents\Arduino\libraries\ESPAsyncWebServer\src\WebAuthentication.cpp
  OR on macOS:
  ~/Documents/Arduino/libraries/ESPAsyncWebServer/src/WebAuthentication.cpp

  STEP 2: Replace the 'getMD5' function
  ------------------------------------------
  Open "WebAuthentication.cpp" in a text editor. Find the function that starts with:
  "static bool getMD5(uint8_t * data, uint16_t len, char * md5)"

  Delete that entire function (from "static bool getMD5" down to its closing brace '}' ).

  STEP 3: Paste the corrected code
  ---------------------------------
  Replace the function you just deleted with the following corrected code block:
  
  // --- COPY FROM HERE ---
  
  static bool getMD5(uint8_t * data, uint16_t len, char * md5) {
    int i;
    unsigned char _buf[16];
    mbedtls_md5_context _ctx;

    mbedtls_md5_init(&_ctx);
    mbedtls_md5_starts(&_ctx);
    mbedtls_md5_update(&_ctx, data, len);
    mbedtls_md5_finish(&_ctx, _buf);
    mbedtls_md5_free(&_ctx);

    for(i = 0; i < 16; i++) {
      sprintf(md5 + i * 2, "%02x", _buf[i]);
    }
    return true;
  }
  
  // --- TO HERE ---

  STEP 4: Save the file and re-compile your sketch. The error should now be gone.
  -----------------------------------------------------------------------------------------
*/

#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// --- Configuration ---
const char* ssid = "SortVision-ESP32";       // The name of the Wi-Fi network to create
const char* password = "password123";      // The password for the Wi-Fi network
AsyncWebServer server(80);                 // Create a web server on port 80

// --- Pin Definitions (ADJUST THESE TO MATCH YOUR HARDWARE) ---
const int LIGHT_PIN = 2;   // The pin connected to the control relay/MOSFET for the main light
// Define pins for your servo motors or stepper drivers
const int SERVO_PLASTIC_PIN = 12;
const int SERVO_METAL_PIN = 13;
const int SERVO_PAPER_PIN = 14;

// --- Function Prototypes ---
void setupWifi();
void setupEndpoints();
void handleLightRequest(AsyncWebServerRequest *request);
void handleSortRequest(AsyncWebServerRequest *request);
void controlLight(bool turnOn);
void sortMaterial(String material);

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB
  }
  Serial.println("ESP32 Starting...");

  // Initialize pins
  pinMode(LIGHT_PIN, OUTPUT);
  digitalWrite(LIGHT_PIN, LOW); // Start with light off

  // You would initialize your servo/motor pins here
  // For example, if using servos:
  // #include <ESP32Servo.h>
  // Servo servoPlastic;
  // servoPlastic.attach(SERVO_PLASTIC_PIN);

  // Setup networking
  setupWifi();
  setupEndpoints();

  // Start the server
  server.begin();
  Serial.println("Web server started.");
}

void loop() {
  // The AsyncWebServer handles requests in the background.
  // You can add other non-blocking tasks here if needed.
}

// --- Setup Functions ---

void setupWifi() {
  Serial.print("Setting up Access Point...");
  WiFi.softAP(ssid, password);
  Serial.println(" Done.");

  IPAddress AP_local_IP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(AP_local_IP);
}

void setupEndpoints() {
  // Endpoint to control the light
  // Example URL: http://192.168.4.1/light?state=ON
  server.on("/light", HTTP_GET, handleLightRequest);

  // Endpoint to trigger sorting
  // Example URL: http://192.168.4.1/sort?class=PLASTIC
  server.on("/sort", HTTP_GET, handleSortRequest);

  // Handle not-found requests
  server.onNotFound([](AsyncWebServerRequest *request) {
    request->send(404, "text/plain", "Not found");
  });
}


// --- Request Handlers ---

void handleLightRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase();
    if (state == "ON") {
      controlLight(true);
      request->send(200, "text/plain", "Light turned ON");
    } else if (state == "OFF") {
      controlLight(false);
      request->send(200, "text/plain", "Light turned OFF");
    } else {
      request->send(400, "text/plain", "Invalid light state. Use ON or OFF.");
    }
  } else {
    request->send(400, "text/plain", "Missing 'state' parameter.");
  }
}

void handleSortRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("class")) {
    String material = request->getParam("class")->value();
    material.toUpperCase(); // Ensure string is uppercase for reliable comparison

    Serial.print("Received sort command for: ");
    Serial.println(material);

    sortMaterial(material);
    
    String responseMessage = "OK. Sorting " + material;
    request->send(200, "text/plain", responseMessage);
  } else {
    request->send(400, "text/plain", "Missing 'class' parameter.");
  }
}

// --- Control Logic Functions ---

void controlLight(bool turnOn) {
  if (turnOn) {
    Serial.println("Turning light ON");
    digitalWrite(LIGHT_PIN, HIGH);
  } else {
    Serial.println("Turning light OFF");
    digitalWrite(LIGHT_PIN, LOW);
  }
}

void sortMaterial(String material) {
  Serial.print("Activating sorting mechanism for: ");
  Serial.println(material);

  // This is where you would put your specific logic to control servos or steppers
  if (material == "PLASTIC") {
    // Move servo for plastic
    // e.g., servoPlastic.write(90);
  } else if (material == "METAL") {
    // Move servo for metal
    // e.g., servoMetal.write(90);
  } else if (material == "PAPER") {
    // Move servo for paper
    // e.g., servoPaper.write(90);
  } else {
    Serial.println("Warning: Unknown material type received.");
  }

  // Example: Wait for a moment and then return servo to default position
  // delay(1000);
  // servoPlastic.write(0);
  // servoMetal.write(0);
  // servoPaper.write(0);
}
