/*
  ======================================================================================================================
  === ESP32-CAM EXAMPLE CODE for SortVision App
  ======================================================================================================================

  This code is designed to work with the Next.js SortVision application.
  It creates a Wi-Fi Access Point that your phone can connect to, and then runs a web server
  that listens for commands from the app to control sorting mechanisms (servos, lights, etc.).

  ----------------------------------------------------------------------------------------------------------------------
  --- HOW TO FIX "mbedtls" COMPILATION ERRORS ---
  ----------------------------------------------------------------------------------------------------------------------
  If you see compilation errors related to `mbedtls_md5_starts_ret` or `genRandomMD5`, it is because of an
  incompatibility between your ESP32 board version and the ESPAsyncWebServer library.

  You must manually patch a library file.

  STEP 1: Find the file "WebAuthentication.cpp"
    - This file is inside your installed Arduino libraries.
    - A typical path on Windows is:
      C:\Users\[Your_Username]\Documents\Arduino\libraries\ESPAsyncWebServer\src\WebAuthentication.cpp
    - A typical path on macOS is:
      ~/Documents/Arduino/libraries/ESPAsyncWebServer/src/WebAuthentication.cpp

  STEP 2: Replace the ENTIRE content of the file
    - Open `WebAuthentication.cpp` in a text editor.
    - Delete ALL the text inside it.
    - Copy the C++ code block below and paste it into the empty file.
    - Save the file.

  STEP 3: Re-compile this sketch.
    - The errors should now be gone.

  --- START OF C++ CODE TO COPY ---
  /*
  Asynchronous WebServer library for Espressif MCUs

  Copyright (c) 2016 Hristo Gochkov. All rights reserved.
  This file is part of the esp8266 core for Arduino environment.

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
  */
  #include "WebAuthentication.h"
  #include <libb64/cencode.h>
  #ifdef ESP32
  #include "mbedtls/md5.h"
  #include <esp_random.h>
  #else
  #include "md5.h"
  #endif

  // Basic Auth hash = base64("username:password")
  bool checkBasicAuthentication(const char * hash, const char * username, const char * password){
    if(username == NULL || password == NULL || hash == NULL)
      return false;

    size_t toencodeLen = strlen(username)+strlen(password)+1;
    size_t encodedLen = base64_encode_expected_len(toencodeLen);
    if(strlen(hash) != encodedLen)
      return false;

    char *toencode = new char[toencodeLen+1];
    if(toencode == NULL){
      return false;
    }
    char *encoded = new char[base64_encode_expected_len(toencodeLen)+1];
    if(encoded == NULL){
      delete[] toencode;
      return false;
    }
    sprintf(toencode, "%s:%s", username, password);
    if(base64_encode_chars(toencode, toencodeLen, encoded) > 0 && memcmp(hash, encoded, encodedLen) == 0){
      delete[] toencode;
      delete[] encoded;
      return true;
    }
    delete[] toencode;
    delete[] encoded;
    return false;
  }

  #if defined(ESP32)
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
  #else
  static bool getMD5(uint8_t * data, uint16_t len, char * md5){
    MD5_CTX ctx;
    MD5Init(&ctx);
    MD5Update(&ctx, data, len);
    unsigned char digest[16];
    MD5Final(digest, &ctx);
    int i;
    for(i=0; i<16; i++){
      sprintf(md5+i*2, "%02x", digest[i]);
    }
    return true;
  }
  #endif

  // Digest Auth
  static String stringMD5(String str){
    char buff[33];
    getMD5((uint8_t*)str.c_str(), str.length(), buff);
    return String(buff);
  }

  static String genRandomMD5(){
    uint32_t r = 0;
    char buff[33];
  #ifdef ESP32
    r = esp_random();
  #else
    r = rand();
  #endif
    getMD5((uint8_t*)&r, sizeof(r), buff);
    return String(buff);
  }

  String requestDigestAuthentication(const char * realm){
    String header = "realm=\"";
    if(realm == NULL)
      header.concat("asyncesp");
    else
      header.concat(realm);
    header.concat( "\", qop=\"auth\", nonce=\"");
    header.concat(genRandomMD5());
    header.concat("\", opaque=\"");
    header.concat(genRandomMD5());
    header.concat("\"");
    return header;
  }

  bool checkDigestAuthentication(const char * header, const char * method, const char * username, const char * password, const char * realm, bool passwordIsHash, const char * nonce, const char * opaque, const char * uri){
    if(username == NULL || password == NULL || header == NULL || method == NULL){
      //os_printf("AUTH FAIL: missing requred fields\n");
      return false;
    }

    String myHeader = String(header);
    int nextBreak = myHeader.indexOf(",");
    if(nextBreak < 0){
      //os_printf("AUTH FAIL: no variables\n");
      return false;
    }

    String myUsername = String();
    String myRealm = String();
    String myNonce = String();
    String myUri = String();
    String myResponse = String();
    String myQop = String();
    String myNc = String();
    String myCnonce = String();

    myHeader += ", ";
    do {
      String avLine = myHeader.substring(0, nextBreak);
      avLine.trim();
      myHeader = myHeader.substring(nextBreak+1);
      nextBreak = myHeader.indexOf(",");

      int eqSign = avLine.indexOf("=");
      if(eqSign < 0){
        //os_printf("AUTH FAIL: no = sign\n");
        return false;
      }
      String varName = avLine.substring(0, eqSign);
      avLine = avLine.substring(eqSign + 1);
      if(avLine.startsWith("\"")){
        avLine = avLine.substring(1, avLine.length() - 1);
      }

      if(varName.equals("username")){
        if(!avLine.equals(username)){
          //os_printf("AUTH FAIL: username\n");
          return false;
        }
        myUsername = avLine;
      } else if(varName.equals("realm")){
        if(realm != NULL && !avLine.equals(realm)){
          //os_printf("AUTH FAIL: realm\n");
          return false;
        }
        myRealm = avLine;
      } else if(varName.equals("nonce")){
        if(nonce != NULL && !avLine.equals(nonce)){
          //os_printf("AUTH FAIL: nonce\n");
          return false;
        }
        myNonce = avLine;
      } else if(varName.equals("opaque")){
        if(opaque != NULL && !avLine.equals(opaque)){
          //os_printf("AUTH FAIL: opaque\n");
          return false;
        }
      } else if(varName.equals("uri")){
        if(uri != NULL && !avLine.equals(uri)){
          //os_printf("AUTH FAIL: uri\n");
          return false;
        }
        myUri = avLine;
      } else if(varName.equals("response")){
        myResponse = avLine;
      } else if(varName.equals("qop")){
        myQop = avLine;
      } else if(varName.equals("nc")){
        myNc = avLine;
      } else if(varName.equals("cnonce")){
        myCnonce = avLine;
      }
    } while(nextBreak > 0);

    String ha1 = (passwordIsHash) ? String(password) : stringMD5(myUsername + ":" + myRealm + ":" + String(password));
    String ha2 = stringMD5(String(method) + ":" + myUri);
    String response = stringMD5(ha1 + ":" + myNonce + ":" + myNc + ":" + myCnonce + ":" + myQop + ":" + ha2);

    if(myResponse.equals(response)){
      //os_printf("AUTH SUCCESS\n");
      return true;
    }

    //os_printf("AUTH FAIL: password\n");
    return false;
  }

  --- END OF C++ CODE TO COPY ---
*/

#include <WiFi.h>
#include <ESPAsyncWebServer.h>

// =======================================================================
// === 1. CONFIGURE YOUR SETTINGS
// =======================================================================

// --- Wi-Fi Access Point Settings ---
// This is the name of the Wi-Fi network the ESP32 will create.
// Your phone will connect to this network.
const char* ssid = "SortVision-ESP32"; 
// Leave the password blank for an open network.
const char* password = ""; 

// --- Pin Definitions ---
// IMPORTANT: Change these pin numbers to match your ESP32's wiring.
const int PLASTIC_PIN = 13; // Pin for the "Plastic" sorting mechanism
const int METAL_PIN = 12;   // Pin for the "Metal" sorting mechanism
const int PAPER_PIN = 14;   // Pin for the "Paper" sorting mechanism
const int LIGHT_PIN = 15;   // Pin to control the lighting

// =======================================================================
// === 2. SERVER AND LOGIC (Usually no need to edit below this line)
// =======================================================================

// Create an instance of the server on port 80
AsyncWebServer server(80);

void handleSortRequest(AsyncWebServerRequest *request) {
  // Check if a "class" parameter exists in the request (e.g., /sort?class=PLASTIC)
  if (request->hasParam("class")) {
    String material = request->getParam("class")->value();
    
    // Convert the received material string to uppercase to make comparisons case-insensitive
    material.toUpperCase(); 

    Serial.print("Received sort command for: ");
    Serial.println(material);

    if (material == "PLASTIC") {
      Serial.println("Activating PLASTIC mechanism.");
      digitalWrite(PLASTIC_PIN, HIGH);
      delay(1000); // Keep it active for 1 second
      digitalWrite(PLASTIC_PIN, LOW);
    } else if (material == "METAL") {
      Serial.println("Activating METAL mechanism.");
      digitalWrite(METAL_PIN, HIGH);
      delay(1000);
      digitalWrite(METAL_PIN, LOW);
    } else if (material == "PAPER") {
      Serial.println("Activating PAPER mechanism.");
      digitalWrite(PAPER_PIN, HIGH);
      delay(1000);
      digitalWrite(PAPER_PIN, LOW);
    } else {
      // If the class is not recognized
      Serial.println("Unknown material class received.");
      request->send(400, "text/plain", "Error: Unknown class");
      return;
    }
    // If successful, send a confirmation response back to the app
    request->send(200, "text/plain", "OK: Sorted " + material);
  } else {
    // If the 'class' parameter is missing
    Serial.println("Error: 'class' parameter missing in sort request.");
    request->send(400, "text/plain", "Error: Missing 'class' parameter");
  }
}

void handleLightRequest(AsyncWebServerRequest *request) {
  // Check if a "state" parameter exists (e.g., /light?state=ON)
  if (request->hasParam("state")) {
    String state = request->getParam("state")->value();
    state.toUpperCase(); // Case-insensitive matching

    if (state == "ON") {
      Serial.println("Turning light ON.");
      digitalWrite(LIGHT_PIN, HIGH);
      request->send(200, "text/plain", "OK: Light is ON");
    } else if (state == "OFF") {
      Serial.println("Turning light OFF.");
      digitalWrite(LIGHT_PIN, LOW);
      request->send(200, "text/plain", "OK: Light is OFF");
    } else {
      Serial.println("Error: Invalid 'state' for light command.");
      request->send(400, "text/plain", "Error: Invalid 'state'. Use ON or OFF.");
    }
  } else {
    Serial.println("Error: 'state' parameter missing in light request.");
    request->send(400, "text/plain", "Error: Missing 'state' parameter");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PLASTIC_PIN, OUTPUT);
  pinMode(METAL_PIN, OUTPUT);
  pinMode(PAPER_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);

  digitalWrite(PLASTIC_PIN, LOW);
  digitalWrite(METAL_PIN, LOW);
  digitalWrite(PAPER_PIN, LOW);
  digitalWrite(LIGHT_PIN, LOW);

  WiFi.softAP(ssid, password);
  Serial.println("Access Point started");
  Serial.print("IP Address: ");
  Serial.println(WiFi.softAPIP());

  // Define server routes
  server.on("/sort", HTTP_GET, handleSortRequest);
  server.on("/light", HTTP_GET, handleLightRequest);
  
  // Start the server
  server.begin();
  Serial.println("Web server started");
}

void loop() {
  // The main loop is empty because the async web server handles requests in the background.
  // Using delay() in here can cause the server to crash.
}
