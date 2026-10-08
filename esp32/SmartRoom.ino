/* =========================================================================
   SMART ROOM IOT — ESP32 FIRMWARE
   System: Environmental Telemetry & Automatic/Manual Appliance Automation
   Target: ESP32 DevKit V1
   Database: Firebase Realtime Database (Asia-Southeast1)
   ========================================================================= */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

/* =========================================================================
   1. HARDWARE PIN DEFINITIONS & SENSOR CONFIGURATION
   ========================================================================= */
#define DHT_PIN          4        // GPIO 4 -> DHT11 / DHT22 Data Pin
#define DHT_TYPE         DHT11    // Change to DHT22 if using AM2302 / DHT22 sensor
#define LDR_PIN          34       // GPIO 34 (ADC1 Channel 6) -> LDR Analog Out
#define RELAY_PIN        26       // GPIO 26 -> 5V Relay IN Signal (Bulb Actuator)
#define STATUS_LED_PIN   2        // GPIO 2  -> Onboard Blue Status LED

// Relay Trigger Logic (Most relay modules are Active-LOW)
#define RELAY_ACTIVE_LOW true

/* =========================================================================
   2. NETWORK & FIREBASE CONFIGURATION
   ========================================================================= */
// Replace with your local Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Firebase Realtime Database Host (No https:// or trailing slashes)
const char* FIREBASE_HOST = "smartyy-e6f48-default-rtdb.asia-southeast1.firebasedatabase.app";

// Optional: Firebase Database Secret or Auth Token (leave empty "" if test rules open)
const char* FIREBASE_AUTH = ""; 

// NTP Server Configuration for accurate millisecond timestamps in /history
const char* NTP_SERVER       = "pool.ntp.org";
const long  GMT_OFFSET_SEC   = 19800;  // IST (+5:30) = 5.5 * 3600 = 19800 (adjust if needed)
const int   DAYLIGHT_OFFSET  = 0;

/* =========================================================================
   3. GLOBAL INSTANCES & SYSTEM STATE
   ========================================================================= */
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClientSecure client;

// Operating State
String currentMode       = "manual";   // "manual" or "automatic"
bool   bulbState         = false;      // true = ON, false = OFF
int    ldrThreshold      = 500;        // Default darkness threshold

// Sensor Readings
float  temperature       = 0.0;
float  humidity          = 0.0;
int    ldrValue          = 0;

// Non-blocking Timing Loops
unsigned long lastControlPoll   = 0;
const unsigned long CONTROL_INTERVAL = 2000;   // Poll control state every 2 seconds

unsigned long lastCurrentPush   = 0;
const unsigned long CURRENT_INTERVAL = 5000;   // Update /current every 5 seconds

unsigned long lastHistoryPush   = 0;
const unsigned long HISTORY_INTERVAL = 30000;  // Push time-series /history every 30s

/* =========================================================================
   4. HELPER: RELAY SWITCHING
   ========================================================================= */
void setRelay(bool state) {
  bulbState = state;
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, state ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PIN, state ? HIGH : LOW);
  }
}

/* =========================================================================
   5. HELPER: GET CURRENT UNIX TIMESTAMP (MILLISECONDS)
   ========================================================================= */
unsigned long long getEpochMillis() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return (unsigned long long)millis(); // Fallback if NTP not yet synced
  }
  time(&now);
  return ((unsigned long long)now) * 1000ULL;
}

/* =========================================================================
   6. FIREBASE REST: FETCH CONTROL STATE (/control.json)
   ========================================================================= */
void pollFirebaseControl() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "https://" + String(FIREBASE_HOST) + "/control.json";
  if (strlen(FIREBASE_AUTH) > 0) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  http.begin(client, url);
  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      if (doc.containsKey("mode")) {
        currentMode = doc["mode"].as<String>();
      }
      if (doc.containsKey("ldrThreshold")) {
        ldrThreshold = doc["ldrThreshold"].as<int>();
      }
      
      // If manual mode, follow the user's manual bulb command
      if (currentMode == "manual") {
        if (doc.containsKey("bulb")) {
          bool requestedBulb = doc["bulb"].as<bool>();
          setRelay(requestedBulb);
        }
      }
    }
  } else {
    Serial.printf("[HTTP] GET /control.json failed, code: %d\n", httpCode);
  }
  http.end();
}

/* =========================================================================
   7. FIREBASE REST: UPDATE LIVE STATE (/current.json)
   ========================================================================= */
void pushCurrentValues() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "https://" + String(FIREBASE_HOST) + "/current.json";
  if (strlen(FIREBASE_AUTH) > 0) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  StaticJsonDocument<256> doc;
  doc["temperature"] = serialized(String(temperature, 1));
  doc["humidity"]    = serialized(String(humidity, 1));
  doc["ldr"]         = ldrValue;
  doc["bulb"]        = bulbState;
  doc["mode"]        = currentMode;

  String requestBody;
  serializeJson(doc, requestBody);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(requestBody); // PUT updates / replaces /current

  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[HTTP] PUT /current.json failed, code: %d\n", httpCode);
  }
  http.end();
}

/* =========================================================================
   8. FIREBASE REST: LOG HISTORICAL RECORD (/history.json)
   ========================================================================= */
void pushHistoryLog() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "https://" + String(FIREBASE_HOST) + "/history.json";
  if (strlen(FIREBASE_AUTH) > 0) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  StaticJsonDocument<256> doc;
  doc["timestamp"]   = getEpochMillis();
  doc["temperature"] = serialized(String(temperature, 1));
  doc["humidity"]    = serialized(String(humidity, 1));
  doc["ldr"]         = ldrValue;
  doc["bulb"]        = bulbState;
  doc["mode"]        = currentMode;

  String requestBody;
  serializeJson(doc, requestBody);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(requestBody); // POST generates a unique push-key in /history

  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[HTTP] POST /history.json failed, code: %d\n", httpCode);
  } else {
    Serial.println("[FIREBASE] Telemetry snapshot saved to /history");
  }
  http.end();
}

/* =========================================================================
   9. HARDWARE SETUP
   ========================================================================= */
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== SMART ROOM IOT INITIALIZATION ===");

  // Pin Configurations
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(LDR_PIN, INPUT);

  // Initial actuator state: OFF
  setRelay(false);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Initialize DHT Sensor
  dht.begin();

  // Insecure TLS (bypasses CA verification for simplicity & reliability on ESP32)
  client.setInsecure();

  // Wi-Fi Connection
  Serial.printf("[WIFI] Connecting to SSID: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN)); // Blink while connecting
    delay(400);
    Serial.print(".");
  }

  digitalWrite(STATUS_LED_PIN, HIGH); // Solid ON when connected
  Serial.println("\n[WIFI] Connected successfully!");
  Serial.printf("[WIFI] Assigned ESP32 IP: %s\n", WiFi.localIP().toString().c_str());

  // Initialize NTP time for timestamps
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET, NTP_SERVER);
  Serial.println("[NTP] Time synchronization service initialized.");
}

/* =========================================================================
   10. MAIN EVENT LOOP
   ========================================================================= */
void loop() {
  unsigned long now = millis();

  // 1. Read Physical Environmental Sensors
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) temperature = t;
  if (!isnan(h)) humidity = h;

  ldrValue = analogRead(LDR_PIN);

  // 2. Poll Firebase /control (Manual/Auto mode, bulb toggle, threshold)
  if (now - lastControlPoll >= CONTROL_INTERVAL) {
    lastControlPoll = now;
    pollFirebaseControl();
  }

  // 3. Automation Engine (Automatic Mode)
  // Logic: When LDR >= threshold -> Dark -> Turn Bulb ON
  //        When LDR <  threshold -> Bright -> Turn Bulb OFF
  if (currentMode == "automatic") {
    bool shouldBulbBeOn = (ldrValue >= ldrThreshold);
    if (bulbState != shouldBulbBeOn) {
      setRelay(shouldBulbBeOn);
      Serial.printf("[AUTO] LDR: %d vs Threshold: %d -> Bulb toggled %s\n", 
                    ldrValue, ldrThreshold, shouldBulbBeOn ? "ON" : "OFF");
    }
  }

  // 4. Periodically update Firebase /current
  if (now - lastCurrentPush >= CURRENT_INTERVAL) {
    lastCurrentPush = now;
    pushCurrentValues();
  }

  // 5. Periodically log time-series entry to Firebase /history
  if (now - lastHistoryPush >= HISTORY_INTERVAL) {
    lastHistoryPush = now;
    pushHistoryLog();
  }

  delay(50); // Small loop yield for ESP32 background tasks (Wi-Fi watchdog)
}
