/**
 * =====================================================================================
 * SortVision ESP32 Companion Sketch
 * =====================================================================================
 *
 * This Arduino sketch is designed to work with the SortVision Next.js application.
 * It connects your ESP32 to a Wi-Fi network and starts a web server to listen for
 * commands from the app.
 *
 * Features:
 * - Creates a Wi-Fi Access Point (AP) for initial setup.
 * - Runs a web server to handle HTTP GET requests.
 * - Listens on two primary endpoints:
 *   - /light?state=[ON|OFF]: Controls a light source (e.g., an LED or relay).
 *   - /sort?class=[MATERIAL]: Receives the sorting command with the detected material.
 * - Prints received commands to the Serial Monitor for debugging.
 *
 * Required Libraries (Install via Arduino Library Manager):
 * - WiFi
 * - ESPAsyncWebServer
 * - AsyncTCP
 *
 * Hardware Setup:
 * - An ESP32 development board.
 * - An LED or relay connected to the pin defined in 'lightPin'.
 *
 * =====================================================================================
 *
 * !!! IMPORTANT NOTE ON COMPILATION ERRORS !!!
 *
 * If you see errors related to 'mbedtls_md5_starts_ret' during compilation, it means
 * your ESPAsyncWebServer library is incompatible with your version of the ESP32
 * board package.
 *
 * THE FIX: Manually edit the library file 'WebAuthentication.cpp'.
 *
 * 1. Find the File:
 *    - In your Arduino IDE, go to File -> Preferences.
 *    - Look at your "Sketchbook location" (e.g., C:\Users\YourName\Documents\Arduino).
 *    - Navigate to that folder on your computer.
 *    - Go into the 'libraries' subfolder.
 *    - Find the 'ESPAsyncWebServer' folder.
 *    - Inside that, go into the 'src' folder.
 *    - Open the file 'WebAuthentication.cpp' in a text editor.
 *
 * 2. Edit the File:
 *    - Find the function 'getMD5'. It will look like this:
 *
 *      bool getMD5(uint8_t * data, uint16_t len, char * hashStr) {
 *        mbedtls_md5_context _ctx;
 *        uint8_t _buf[16];
 *
 *        mbedtls_md5_init(&_ctx);
 *        mbedtls_md5_starts_ret(&_ctx); // <-- PROBLEM LINE
 *        mbedtls_md5_update_ret(&_ctx, data, len); // <-- PROBLEM LINE
 *        mbedtls_md5_finish_ret(&_ctx, _buf); // <-- PROBLEM LINE
 *        mbedtls_md5_free(&_ctx);
 *
 *        for (int i=0; i<16; i++) {
 *          sprintf(hashStr + i*2, "%02x", _buf[i]);
 *        }
 *        return true;
 *      }
 *
 * 3. Apply the Fix:
 *    - Change the three function calls by removing the "_ret" suffix.
 *    - The corrected function should look like this:
 *
 *      bool getMD5(uint8_t * data, uint16_t len, char * hashStr) {
 *        mbedtls_md5_context _ctx;
 *        uint8_t _buf[16];
 *
 *        mbedtls_md5_init(&_ctx);
 *        mbedtls_md5_starts(&_ctx); // <-- CORRECTED
 *        mbedtls_md5_update(&_ctx, data, len); // <-- CORRECTED
 *        mbedtls_md5_finish(&_ctx, _buf); // <-- CORRECTED
 *        mbedtls_md5_free(&_ctx);
 *
 *        for (int i=0; i<16; i++) {
 *          sprintf(hashStr + i*2, "%02x", _buf[i]);
 *        }
 *        return true;
 *      }
 *
 * 4. Save the file and re-compile your sketch in the Arduino IDE. The error will be gone.
 *
 * =====================================================================================
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// --- Configuration ---
// Replace with your network credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// You can also run the ESP32 in Access Point mode. The Next.js app can connect to this AP.
const char* ap_ssid = "SortVision-ESP32";
const char* ap_password = "sortvision";

// Define the pin your light/relay is connected to
const int lightPin = 2; // Example: GPIO2, which is often the onboard LED

// --- Global Objects ---
AsyncWebServer server(80); // Create AsyncWebServer object on port 80

// --- Function Prototypes ---
void handleLightRequest(AsyncWebServerRequest *request);
void handleSortRequest(AsyncWebServerRequest *request);
void handleNotFound(AsyncWebServerRequest *request);
void connectToWiFi();

void setup() {
  // Start Serial communication for debugging
  Serial.begin(115200);
  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB
  }
  Serial.println("ESP32 Starting...");

  // Set up the light pin
  pinMode(lightPin, OUTPUT);
  digitalWrite(lightPin, LOW); // Start with the light off

  // Connect to Wi-Fi
  connectToWiFi();

  // --- Web Server Route Handlers ---
  server.on("/light", HTTP_GET, handleLightRequest);
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("HTTP server started.");
}

void loop() {
  // The AsyncWebServer handles requests in the background.
  // No code is needed in the loop.
}

/**
 * @brief Connects the ESP32 to the specified Wi-Fi network or starts an AP.
 */
void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  // Set a static IP if you want a predictable address
  // IPAddress local_IP(192, 168, 1, 180);
  // IPAddress gateway(192, 168, 1, 1);
  // IPAddress subnet(255, 255, 255, 0);
  // IPAddress primaryDNS(8, 8, 8, 8);
  // IPAddress secondaryDNS(8, 8, 4, 4);
  // if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
  //   Serial.println("STA Failed to configure");
  // }
  
  WiFi.mode(WIFI_AP_STA); // Set mode to both Access Point and Station
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
    Serial.println("\nCould not connect to WiFi. Starting Access Point instead.");
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ap_ssid, ap_password);
    Serial.print("AP IP address: ");
    Serial.println(WiFi.softAPIP());
  }
}

/**
 * @brief Handles requests to the /light endpoint.
 * Controls the light based on the 'state' query parameter (ON/OFF).
 */
void handleLightRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase(); // Ensure consistency

    if (state == "ON") {
      digitalWrite(lightPin, HIGH);
      Serial.println("Light turned ON");
      request->send(200, "text/plain", "OK: Light ON");
    } else if (state == "OFF") {
      digitalWrite(lightPin, LOW);
      Serial.println("Light turned OFF");
      request->send(200, "text/plain", "OK: Light OFF");
    } else {
      request->send(400, "text/plain", "Bad Request: 'state' must be ON or OFF");
    }
  } else {
    request->send(400, "text/plain", "Bad Request: Missing 'state' parameter");
  }
}

/**
 * @brief Handles requests to the /sort endpoint.
 * Receives the material type from the 'class' query parameter.
 */
void handleSortRequest(AsyncWebServerRequest *request) {
  if (request->hasParam("class")) {
    String material = request->getParam("class")->value();
    
    // Log the received material to the Serial Monitor for debugging
    Serial.println("Received sort command for: " + material);

    // Add your sorting logic here based on the 'material' string.
    // For example, move a servo or activate a specific sorter arm.
    // if (material == "PLASTIC") { ... }
    // if (material == "METAL") { ... }
    // if (material == "PAPER") { ... }
    
    request->send(200, "text/plain", "OK: Sorting " + material);
  } else {
    request->send(400, "text/plain", "Bad Request: Missing 'class' parameter");
  }
}

/**
 * @brief Handles any requests that don't match other routes.
 */
void handleNotFound(AsyncWebServerRequest *request) {
  String message = "File Not Found\n\n";
  message += "URI: ";
  message += request->url();
  message += "\nMethod: ";
  message += (request->method() == HTTP_GET) ? "GET" : "POST";
  message += "\nArguments: ";
  message += request->args();
  message += "\n";
  for (uint8_t i = 0; i < request->args(); i++) {
    message += " " + request->argName(i) + ": " + request->arg(i) + "\n";
  }
  request->send(404, "text/plain", message);
  Serial.println(message);
}
