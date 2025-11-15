
#include <WiFi.h>
#include <WebServer.h>

// -- WiFi Configuration --
const char* ssid = "SortVision-ESP32"; // The name of the WiFi network to create.
const char* password = "password123"; // The password for the WiFi network. (8 characters minimum)

// -- Web Server Configuration --
WebServer server(80); // Create a web server on port 80

// -- LED Configuration --
// const int ledPin = 2; // (Optional) The pin your status LED is connected to.

void handleRoot() {
  server.send(200, "text/plain", "ESP32 Server is running.");
}

// -- Handler for Sorting Requests --
void handleSortRequest() {
  String material = "";
  if (server.hasArg("class")) {
    material = server.arg("class");
    Serial.print("Received sort command for: ");
    Serial.println(material);

    // --- Add your sorting logic here based on the 'material' string ---
    // Example:
    // if (material == "PLASTIC") {
    //   // move servo for plastic
    // } else if (material == "METAL") {
    //   // move servo for metal
    // }

    server.send(200, "text/plain", "OK: " + material);
  } else {
    Serial.println("Sort request received without 'class' parameter.");
    server.send(400, "text/plain", "ERROR: Missing 'class' parameter.");
  }
}

// -- Handler for Light Control Requests --
void handleLightRequest() {
  String state = "";
  if (server.hasArg("state")) {
    state = server.arg("state");
    Serial.print("Received light command: ");
    Serial.println(state);

    // --- Add your light control logic here ---
    // Example:
    // if (state == "ON") {
    //   digitalWrite(ledPin, HIGH);
    // } else {
    //   digitalWrite(ledPin, LOW);
    // }

    server.send(200, "text/plain", "OK: Light " + state);
  } else {
    Serial.println("Light request received without 'state' parameter.");
    server.send(400, "text/plain", "ERROR: Missing 'state' parameter.");
  }
}

void handleNotFound() {
  server.send(404, "text/plain", "Not found");
}

void setup() {
  Serial.begin(115200);
  Serial.println("\nESP32 Starting...");

  // Optional: Configure LED pin
  // pinMode(ledPin, OUTPUT);
  // digitalWrite(ledPin, LOW);

  // Set up the ESP32 as a WiFi Access Point
  Serial.println("Setting up Access Point...");
  WiFi.softAP(ssid, password);

  IPAddress apIP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(apIP);

  // Define server routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.on("/light", HTTP_GET, handleLightRequest);
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("Web Server started.");
}

void loop() {
  // This is the core of the synchronous web server.
  // It constantly checks for and processes incoming client requests.
  server.handleClient();
}
