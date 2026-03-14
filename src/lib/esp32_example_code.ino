#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <Ticker.h>
#include <ServoEasing.hpp>

// -- UUIDs (MUST MATCH web app) --
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define STATUS_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a9"

BLECharacteristic *pStatusCharacteristic = nullptr;

// -- Sorter Status --
const char* sorterStatus = "READY";
const char* alcoholStatus = "FULL";
const char* trashStatus = "EMPTY";

// -- Servo & Pins --
ServoEasing servoChute;
ServoEasing servoSorter;

const byte SERVO_CHUTE_PIN = 32;
const byte SERVO_SORTER_PIN = 33;
// -- Alcohol --
const byte TRIG_PIN2 = 25;
const byte ECHO_PIN2 = 26;
// -- Trash --
const byte TRIG_PIN3 = 18;
const byte ECHO_PIN3 = 19;
const byte BUZZER_PIN = 14;

// -- Target Positions --
const byte BIO_POS = 0;
const byte NON_BIO_POS = 90;
const byte E_WASTE_POS = 175;
const byte CHUTE_OPEN = 90;
const byte CHUTE_CLOSED = 150;
const byte SORTER_DEFAULT = 92;

// -- Ticker for CheckAlcohol level --
int alcoholPercentage = 0;
Ticker checkAlcoholLevel;

// -- Ticker for Trash level --
Ticker checkTrashLevel;
bool doCheckAlcohol = false;
bool doCheckTrash = false;

void tickAlcohol() { doCheckAlcohol = true; }
void tickTrash()   { doCheckTrash = true; }

// -- Trash Capacity Check Level --
int bioTrashPercentage = 0;
int nonBioTrashPercentage = 0;
int eWasteTrashPercentage = 0;
int trashPercentage = 0;

// Forward declarations
void performCheckAlcohol();
void performCheckTrash();
void ultrasonicCheckTrash();
void sortingBeep();
void updateBLEStatus();

// -- BLE Status Update --
void updateBLEStatus() {
  if (!pStatusCharacteristic) return;
  String statusStr = String("STATUS:") + sorterStatus 
                   + ",ALCOHOL:" + alcoholStatus 
                   + ",LEVEL:" + String(alcoholPercentage)
                   + ",BIO:" + String(bioTrashPercentage)
                   + ",NONBIO:" + String(nonBioTrashPercentage)
                   + ",EWASTE:" + String(eWasteTrashPercentage);
  pStatusCharacteristic->setValue(statusStr.c_str());
  pStatusCharacteristic->notify();
  Serial.print("BLE Status: ");
  Serial.println(statusStr);
}

void performSort(byte position, const char* materialName) {
  sorterStatus = "BUSY";
  updateBLEStatus();
  Serial.printf("\n--- Sorting %s ---\n", materialName);

  sortingBeep();

  if (position != NON_BIO_POS) {
    servoSorter.attach(SERVO_SORTER_PIN, 400, 2500);

    servoSorter.easeTo(position);
    while (servoSorter.isMoving());

    servoChute.easeTo(CHUTE_OPEN);
    delay(1000);
    while (servoChute.isMoving());

    servoChute.easeTo(CHUTE_CLOSED);
    while (servoChute.isMoving());
    delay(1000);

    servoSorter.easeTo(SORTER_DEFAULT);
    while (servoSorter.isMoving());
    servoSorter.detach();
  } else {
    servoSorter.detach();
    servoChute.easeTo(CHUTE_OPEN);
    delay(1000);
    while (servoChute.isMoving());

    servoChute.easeTo(CHUTE_CLOSED);
    while (servoChute.isMoving());
    delay(300);
  }

  sorterStatus = "READY";
  updateBLEStatus();
  Serial.println("--- Done ---");
}

void sortingBeep() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
  delay(100);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
}
class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    Serial.println("Client connected");
  }
  void onDisconnect(BLEServer* pServer) {
    Serial.println("Client disconnected — restarting advertising");
    delay(500);
    BLEDevice::startAdvertising();
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue();
      if (value.length() > 0) {
        String material = "";
        for (int i = 0; i < value.length(); i++) material += value[i];
        material.trim();
        material.toUpperCase();

        if (strcmp(sorterStatus, "READY") == 0) {
          if (material == "NON-BIODEGRADABLE") performSort(NON_BIO_POS, "NON-BIODEGRADABLE");
          else if (material == "BIODEGRADABLE")  performSort(BIO_POS, "BIODEGRADABLE");
          else if (material == "E-WASTE")         performSort(E_WASTE_POS, "E-WASTE");
          else if (material == "MULTIPLE")        performSort(SORTER_DEFAULT, "MULTIPLE");
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  btStop();    
  Serial.println("Starting...");

  servoChute.attach(SERVO_CHUTE_PIN, 400, 2500);
  servoSorter.attach(SERVO_SORTER_PIN, 400, 2500);

  servoSorter.setSpeed(50);
  servoChute.setSpeed(50);

  servoSorter.setEasingType(EASE_LINEAR);
  servoChute.setEasingType(EASE_QUADRATIC_IN_OUT);
  servoChute.write(CHUTE_CLOSED);
  servoSorter.write(SORTER_DEFAULT);
  delay(1000);

    // BLE Setup
  BLEDevice::init("ESP32_Sorter_BLE");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                                         CHARACTERISTIC_UUID,
                                         BLECharacteristic::PROPERTY_READ |
                                         BLECharacteristic::PROPERTY_WRITE
                                       );
  pCharacteristic->setCallbacks(new MyCallbacks());

  pStatusCharacteristic = pService->createCharacteristic(
                            STATUS_CHARACTERISTIC_UUID,
                            BLECharacteristic::PROPERTY_READ |
                            BLECharacteristic::PROPERTY_NOTIFY
                          );
  pStatusCharacteristic->addDescriptor(new BLE2902());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN2, OUTPUT);
  pinMode(ECHO_PIN2, INPUT);
  pinMode(TRIG_PIN3, OUTPUT);
  pinMode(ECHO_PIN3, INPUT);

  // -- TICKER: Alcohol --
  performCheckAlcohol();
  checkAlcoholLevel.attach_ms(30000, tickAlcohol);

  performCheckTrash();
  checkTrashLevel.attach_ms(600000, tickTrash);

  sortingBeep();
  updateBLEStatus();

  Serial.println("BLE Sorter Ready! Connect via Web App.");
  delay(500);
}

void loop() {
  if (doCheckAlcohol) {
    doCheckAlcohol = false;
    performCheckAlcohol();
  }
  if (doCheckTrash) {
    doCheckTrash = false;
    performCheckTrash();
  }

  // Reserved for future use
}

void performCheckTrash() {
  sorterStatus = "BUSY";
  updateBLEStatus();

  servoSorter.attach(SERVO_SORTER_PIN, 400, 2500);

  servoSorter.easeTo(SORTER_DEFAULT);
  while (servoSorter.isMoving());
  delay(500);

  servoSorter.easeTo(E_WASTE_POS);
  while (servoSorter.isMoving());
  delay(1000);
  ultrasonicCheckTrash();
  bioTrashPercentage = trashPercentage;
  Serial.print("BIO: ");
  Serial.print(bioTrashPercentage);
  Serial.println("%");

  servoSorter.easeTo(NON_BIO_POS);
  while (servoSorter.isMoving());
  delay(1000);
  ultrasonicCheckTrash();
  nonBioTrashPercentage = trashPercentage;
  Serial.print("NON-BIO: ");
  Serial.print(nonBioTrashPercentage);
  Serial.println("%");

  servoSorter.easeTo(BIO_POS);
  while (servoSorter.isMoving());
  delay(1000);
  ultrasonicCheckTrash();
  eWasteTrashPercentage = trashPercentage;
  Serial.print("E-WASTE: ");
  Serial.print(eWasteTrashPercentage);
  Serial.println("%");

  servoSorter.easeTo(NON_BIO_POS);
  while (servoSorter.isMoving());
  servoSorter.detach();

  sorterStatus = "READY";
  updateBLEStatus();
  Serial.println("--- Done ---");
}

void ultrasonicCheckTrash() {
  digitalWrite(TRIG_PIN3, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN3, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN3, LOW);

  long duration = pulseIn(ECHO_PIN3, HIGH, 10000);
  if (duration == 0) {
    Serial.println("Trash sensor timeout!");
    trashStatus = "UNKNOWN";
    updateBLEStatus();
    return;
  }

  int distance = duration * 0.034 / 2;
  int trashHeight = 32;
  Serial.print("Distance=");
  Serial.println(distance);
  trashPercentage = ((trashHeight - distance) * 100) / trashHeight;
  trashPercentage = constrain(trashPercentage, 0, 100);
}

void performCheckAlcohol() {
  digitalWrite(TRIG_PIN2, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN2, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN2, LOW);

  long duration = pulseIn(ECHO_PIN2, HIGH, 10000);
  if (duration == 0) {
    Serial.println("Alcohol sensor timeout!");
    alcoholStatus = "UNKNOWN";
    updateBLEStatus();
    return;
  }

  int distance = duration * 0.034 / 2;
  int tankHeight = 12;
  alcoholPercentage = ((tankHeight - distance) * 100) / tankHeight;
  alcoholPercentage = constrain(alcoholPercentage, 0, 100);

  if (alcoholPercentage >= 0 && alcoholPercentage <= 5) {
    Serial.print("Distance: ");
    Serial.println(distance);
    Serial.print("Alcohol Level: ");
    Serial.print(alcoholPercentage);
    Serial.println("% - EMPTY");
    alcoholStatus = "ALCOHOLEMPTY";
  } else {
    Serial.print("Alcohol Level: ");
    Serial.print(alcoholPercentage);
    Serial.println("%");
    alcoholStatus = "FULL";
  }

  updateBLEStatus();
}