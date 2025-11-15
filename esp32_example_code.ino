/*
  ======================================================================================================================
  === URGENT: ARDUINO COMPILATION ERROR FIX ============================================================================
  ======================================================================================================================
  
  If you are seeing compilation errors like:
  
  'mbedtls_md5_starts_ret' was not declared in this scope; did you mean 'mbedtls_md5_starts'?
  'mbedtls_md5_update_ret' was not declared in this scope; did you mean 'mbedtls_md5_update'?
  'mbedtls_md5_finish_ret' was not declared in this scope; did you mean 'mbedtls_md5_finish'?
  
  ...it means your ESPAsyncWebServer library is incompatible with your version of the ESP32 board package.
  
  This is a common, known issue. To fix it, you must manually edit one of the library's files.
  
  --- INSTRUCTIONS ---
  
  1.  FIND THE FILE:
      The file you need to edit is called "WebAuthentication.cpp".
      Based on your error message, it is located here:
      
      c:\Users\Jencel\Documents\Arduino\libraries\ESPAsyncWebServer\src\WebAuthentication.cpp
  
  2.  OPEN THE FILE:
      Open this file in a text editor or directly in the Arduino IDE.
  
  3.  REPLACE THE FAULTY FUNCTION:
      Find the function named `getMD5`. It will look like the "OLD CODE" below.
      DELETE the entire function and REPLACE it with the "NEW, CORRECTED CODE" provided below.
  
  4.  SAVE AND RE-COMPILE:
      Save the changes to `WebAuthentication.cpp` and re-compile your sketch. The errors will be gone.
  
  --- OLD CODE (To be replaced) ---
  
  #if defined(ESP32)
  bool getMD5(uint8_t * data, uint16_t len, char * output){
    mbedtls_md5_context _ctx;
    uint8_t _buf[16];
  
    mbedtls_md5_init(&_ctx);
    mbedtls_md5_starts_ret(&_ctx);
    mbedtls_md5_update_ret(&_ctx, data, len);
    mbedtls_md5_finish_ret(&_ctx, _buf);
    mbedtls_md5_free(&_ctx);
  
    for(int i=0; i<16; i++){
      sprintf(output + i*2, "%02x", _buf[i]);
    }
    return true;
  }
  #endif

  --- NEW, CORRECTED CODE (Paste this in) ---

  #if defined(ESP32)
  bool getMD5(uint8_t * data, uint16_t len, char * output){
    mbedtls_md5_context _ctx;
    uint8_t _buf[16];
  
    mbedtls_md5_init(&_ctx);
    mbedtls_md5_starts(&_ctx);
    mbedtls_md5_update(&_ctx, data, len);
    mbedtls_md5_finish(&_ctx, _buf);
    mbedtls_md5_free(&_ctx);
  
    for(int i=0; i<16; i++){
      sprintf(output + i*2, "%02x", _buf[i]);
    }
    return true;
  }
  #endif
  
  ======================================================================================================================
  === END OF FIX =======================================================================================================
  ======================================================================================================================
*/


// Import required libraries
#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// --- HARDWARE PIN DEFINITIONS (ADJUST AS NEEDED) ---
// Define the GPIO pins connected to your servo motors.
const int SERVO_PIN_PLASTIC = 13; // Example pin for Plastic sorter
const int SERVO_PIN_METAL = 12;   // Example pin for Metal sorter
const int SERVO_PIN_PAPER = 14;   // Example pin for Paper sorter

// Define the GPIO pin for the control light (e.g., an LED or a relay for a larger light).
const int LIGHT_PIN = 2; // Using the built-in LED on many ESP32 boards as an example

// --- SERVO CONFIGURATION ---
// These are the angles your servo will move to.
// You will need to fine-tune these values for your physical setup.
const int SERVO_ANGLE_OPEN = 90;  // Angle for when the sorting gate is "open"
const int SERVO_ANGLE_CLOSED = 0; // Angle for when the sorting gate is "closed"
const int SERVO_DELAY = 500;      // Time in milliseconds to wait for the servo to move

// --- WI-FI CONFIGURATION ---
// Set the ESP32 to run in Access Point (AP) mode.
// The Next.js app will connect to this Wi-Fi network.
const char *ssid = "SortVisionESP32"; // The name of the Wi-Fi network the ESP32 will create.
const char *password = "sortvision";  // The password for the Wi-Fi network.

// Create an instance of the Asynchronous Web Server on port 80 (the default for HTTP).
AsyncWebServer server(80);

// --- FUNCTION PROTOTYPES ---
void setupServo(int pin);
void moveServo(int pin);
void handleSortCommand(AsyncWebServerRequest *request);
void handleLightCommand(AsyncWebServerRequest *request);
void handleNotFound(AsyncWebServerRequest *request);

// =================================================
//  SETUP: Runs once when the ESP32 boots up.
// =================================================
void setup() {
  // Start the Serial Monitor for debugging purposes.
  Serial.begin(115200);
  Serial.println("\nESP32 SortVision Controller Initializing...");

  // --- Initialize Hardware Pins ---
  Serial.println("Setting up hardware pins...");
  setupServo(SERVO_PIN_PLASTIC);
  setupServo(SERVO_PIN_METAL);
  setupServo(SERVO_PIN_PAPER);
  pinMode(LIGHT_PIN, OUTPUT);
  digitalWrite(LIGHT_PIN, LOW); // Ensure light is off initially.
  Serial.println("Hardware pins configured.");

  // --- Setup Wi-Fi Access Point ---
  Serial.print("Setting up Wi-Fi AP with SSID: ");
  Serial.println(ssid);
  WiFi.softAP(ssid, password);
  IPAddress apIP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(apIP); // This should be 192.168.4.1 by default.

  // --- Define Web Server Routes ---
  // This route handles the sorting command. e.g., /sort?class=PLASTIC
  server.on("/sort", HTTP_GET, handleSortCommand);

  // This route handles the light control command. e.g., /light?state=ON
  server.on("/light", HTTP_GET, handleLightCommand);
  
  // This handles any other request and returns a "Not Found" error.
  server.onNotFound(handleNotFound);

  // --- Start the Web Server ---
  server.begin();
  Serial.println("HTTP server started. Awaiting commands.");
}

// =================================================
//  LOOP: Runs continuously after setup().
// =================================================
void loop() {
  // The ESPAsyncWebServer library handles client requests in the background.
  // No code is needed in the main loop for the server to function.
}

// =================================================
//  HELPER FUNCTIONS
// =================================================

/**
 * @brief Configures a servo pin and attaches it.
 * @param pin The GPIO pin the servo is connected to.
 */
void setupServo(int pin) {
  // NOTE: The ESP32Servo library is required for this to work.
  // If you are using a different servo library, adjust accordingly.
  // For this example, we assume you have a way to control servos,
  // so we'll use basic PWM which might work for some servos.
  ledcSetup(pin, 50, 16); // Setup PWM channel, 50Hz, 16-bit resolution
  ledcAttachPin(pin, pin); // Attach the pin to the channel
  
  // A helper function to set angle might look like this:
  // setAngle(pin, SERVO_ANGLE_CLOSED);
  // For simplicity, we directly write values in moveServo.
}

/**
 * @brief Moves a servo to the open position and back to closed.
 * @param pin The GPIO pin of the servo to move.
 */
void moveServo(int pin) {
  Serial.print("Actuating servo on pin: ");
  Serial.println(pin);
  
  // This is a simplified example. You'll likely need a proper servo library
  // (like ESP32Servo) to map angles (0-180) to PWM duty cycles (e.g., 500-2500).
  // The following values are placeholders.
  int dutyCycleOpen = 130;  // Placeholder PWM value for 90 degrees
  int dutyCycleClosed = 30; // Placeholder PWM value for 0 degrees

  ledcWrite(pin, dutyCycleOpen);
  delay(SERVO_DELAY);
  ledcWrite(pin, dutyCycleClosed);
  delay(SERVO_DELAY/2); // A small delay to ensure it's settled
  ledcWrite(pin, 0); // Detach servo to prevent jitter
}

/**
 * @brief Handles the /sort GET request from the app.
 * It checks for the 'class' parameter and actuates the correct servo.
 */
void handleSortCommand(AsyncWebServerRequest *request) {
  Serial.println("Received /sort command.");
  String classification = "";

  // Check if the 'class' parameter exists in the request.
  if (request->hasParam("class")) {
    classification = request->getParam("class")->value();
    Serial.print("Classification parameter: ");
    Serial.println(classification);

    // Compare the string and move the correct servo.
    if (classification.equalsIgnoreCase("PLASTIC")) {
      moveServo(SERVO_PIN_PLASTIC);
      request->send(200, "text/plain", "OK: Sorted Plastic");
    } else if (classification.equalsIgnoreCase("METAL")) {
      moveServo(SERVO_PIN_METAL);
      request->send(200, "text/plain", "OK: Sorted Metal");
    } else if (classification.equalsIgnoreCase("PAPER")) {
      moveServo(SERVO_PIN_PAPER);
      request->send(200, "text/plain", "OK: Sorted Paper");
    } else {
      Serial.println("Error: Unknown class.");
      request->send(400, "text/plain", "Error: Unknown class specified.");
    }
  } else {
    Serial.println("Error: 'class' parameter missing.");
    request->send(400, "text/plain", "Error: Missing 'class' parameter.");
  }
}

/**
 * @brief Handles the /light GET request from the app.
 * It checks for the 'state' parameter and turns the light ON or OFF.
 */
void handleLightCommand(AsyncWebServerRequest *request) {
  Serial.println("Received /light command.");

  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    Serial.print("State parameter: ");
    Serial.println(state);

    if (state.equalsIgnoreCase("ON")) {
      digitalWrite(LIGHT_PIN, HIGH);
      request->send(200, "text/plain", "OK: Light is ON");
    } else if (state.equalsIgnoreCase("OFF")) {
      digitalWrite(LIGHT_PIN, LOW);
      request->send(200, "text/plain", "OK: Light is OFF");
    } else {
      Serial.println("Error: Invalid state.");
      request->send(400, "text/plain", "Error: Invalid state specified. Use ON or OFF.");
    }
  } else {
    Serial.println("Error: 'state' parameter missing.");
    request->send(400, "text/plain", "Error: Missing 'state' parameter.");
  }
}

/**
 * @brief Handles any request that doesn't match the defined routes.
 */
void handleNotFound(AsyncWebServerRequest *request) {
    Serial.print("Not Found: ");
    Serial.println(request->url());
    request->send(404, "text/plain", "Not found");
}
