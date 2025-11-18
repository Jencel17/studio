
#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

// -- WiFi Configuration --
const char* ssid = "Research Test";        // The name of the WiFi network to create.
const char* password = "reseachcapstone";  // The password for the WiFi network. (8 characters minimum)

// -- Web Server Configuration --
WebServer server(80);  // Create a web server on port 80

// -- Sorter Status --
// This variable tracks the state of the sorter machine.
// "READY" = The sorter is idle and can accept a new command.
// "BUSY"  = The sorter is currently in the middle of a sort sequence.
const char* sorterStatus = "READY";

// -- LED Configuration --
// const int ledPin = 2; // (Optional) The pin your status LED is connected to.

// Servo -----------------------------------------------------------|
Servo servoChute;
Servo servoSorter;
// Ultrasonic Value ------------------------------------------------|
float timing = 0.0;
float distance = 0.0;

// Pins ------------------------------------------------------------|
const byte SERVO_CHUTE_PIN = 25;
const byte SERVO_SORTER_PIN = 26;
const byte TRIG_PIN = 9;
const byte ECHO_PIN = 10;
const byte LED_PIN = 20;

// Servo Position --------------------------------------------------|
const byte METAL_POS= 0;
const byte PLASTIC_POS = 90;
const byte PAPER_POS = 180;
const byte CHUTE_OPEN = 180;
const byte CHUTE_CLOSED = 90;
const byte SORTER_DEFAULT = 90; // Default position for the sorter

const unsigned int ROTATION_DELAY = 2000;
const unsigned int CHUTE_DELAY = 2000;
const unsigned int RETURN_DELAY = 1000;

void performSort(byte position, const char* materialName) {
  Serial.println("\n--- Starting Sort Sequence ---");
  
  // Rotate sorter to position
  servoSorter.write(position);
  Serial.print("Rotating to ");
  Serial.println(materialName);
  delay(ROTATION_DELAY);
  
  // Open chute
  servoChute.write(CHUTE_OPEN);
  Serial.println("Opening Chute");
  delay(CHUTE_DELAY);
  
  // Close chute
  servoChute.write(CHUTE_CLOSED);
  Serial.println("Closing Chute");
  delay(RETURN_DELAY);
  
  // Return to default
  servoSorter.write(SORTER_DEFAULT);
  Serial.println("Returning to Default Position");
  Serial.println("--- Sort Sequence Complete ---\n");
}

void handleRoot() {
  server.send(200, "text/plain", "ESP32 Server is running.");
}

// -- Handler for Sorting Requests --
void handleSortRequest() {
  // Only process sort command if the sorter is READY
  if (strcmp(sorterStatus, "READY") != 0) {
    server.send(503, "text/plain", "BUSY"); // 503 Service Unavailable
    return;
  }
  
  String material = "";
  
  if (server.hasArg("class")) {
    sorterStatus = "BUSY"; // Set status to BUSY before starting sort
    
    material = server.arg("class");
    material.toUpperCase();
    
    Serial.print("Received sort command for: ");
    Serial.println(material);

    // =============Perform sorting based on material type detected=======================|
    if (material == "PLASTIC") {
      performSort(PLASTIC_POS, "PLASTIC");
      server.send(200, "text/plain", "OK: Sorted PLASTIC");
    } 
    else if (material == "METAL") {
      performSort(METAL_POS, "METAL");
      server.send(200, "text/plain", "OK: Sorted METAL");
    } 
    else if (material == "PAPER") {
      performSort(PAPER_POS, "PAPER");
      server.send(200, "text/plain", "OK: Sorted PAPER");
    } 
    else {
      Serial.print("ERROR: Unknown material type: ");
      Serial.println(material);
      server.send(400, "text/plain", "ERROR: Unknown material type");
    }

    sorterStatus = "READY"; // Set status back to READY after sort is complete
    
  } else {
    Serial.println("Sort request received without 'class' parameter.");
    server.send(400, "text/plain", "ERROR: Missing 'class' parameter.");
  }
}

// -- Handler for Status Requests --
// This allows the app to check if the ESP32 is busy or ready.
void handleStatusRequest() {
  server.send(200, "text/plain", sorterStatus);
}

// -- Handler for Ping Requests --
// This allows the app to confirm it's connected to the ESP32.
void handlePingRequest() {
  server.send(200, "text/plain", "pong");
}

void handleNotFound() {
  server.send(404, "text/plain", "Not found");
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=================================");
  Serial.println("ESP32 Waste Sorter Starting...");
  Serial.println("=================================\n");

  servoChute.attach(SERVO_CHUTE_PIN, 400 , 2600);
  servoSorter.attach(SERVO_SORTER_PIN, 400 , 2600);

  //Default Positions on Startup
  servoChute.write(CHUTE_CLOSED);
  servoSorter.write(SORTER_DEFAULT);
  Serial.println("Servos set to default positions");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(ECHO_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Set up the ESP32 as a WiFi Access Point
  Serial.println("Setting up Access Point...");
  WiFi.softAP(ssid, password);

  IPAddress apIP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(apIP);

  // Define server routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.on("/status", HTTP_GET, handleStatusRequest); // New endpoint for status
  server.on("/ping", HTTP_GET, handlePingRequest);     // New endpoint for ping
  server.onNotFound(handleNotFound);

  // Start the server
  server.begin();
  Serial.println("Web Server started.");
  sorterStatus = "READY"; // Ensure status is READY on startup
}

void loop() {

  digitalWrite(TRIG_PIN , LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN , HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN , LOW);

  timing = pulseIn(ECHO_PIN, HIGH);
  distance = (timing * 0.034) / 2;

  if (distance > 0 && distance <= 50) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  } 

  // This is the core of the synchronous web server.
  // It constantly checks for and processes incoming client requests.
  server.handleClient();
}
