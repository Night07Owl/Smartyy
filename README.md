# Smart Room IoT — Environmental Monitoring & Appliance Automation

A complete, production-grade IoT solution featuring an **ESP32 microcontroller**, **Google Firebase Realtime Database**, and a **modern responsive glassmorphic web dashboard**.

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Hardware Setup & Wiring](#2-hardware-setup--wiring)
3. [Firebase Setup & Configuration](#3-firebase-setup--configuration)
4. [Database Structure](#4-database-structure)
5. [ESP32 Firmware Guide](#5-esp32-firmware-guide)
6. [Web Dashboard Features](#6-web-dashboard-features)
7. [Working Video & Demonstration Script](#7-working-video--demonstration-script)
8. [Problems and Solutions (Troubleshooting)](#8-problems-and-solutions-troubleshooting)

---

## 1. System Architecture

```
                  ┌───────────────────────────────┐
                  │    Physical Room Sensors      │
                  │  • DHT11 (Temp & Humidity)    │
                  │  • LDR (Light Sensor 0-4095)  │
                  └───────────────┬───────────────┘
                                  │ GPIO / ADC
                                  ▼
                  ┌───────────────────────────────┐
                  │        ESP32 DevKit V1        │
                  │  • Dual-Core 240MHz SoC       │
                  │  • Wi-Fi STA Client           │
                  │  • Automation Logic Engine    │
                  └───────┬───────────────▲───────┘
         Relay Signal GPIO│               │ HTTPS REST Sync
                          ▼               ▼
                  ┌───────────────┐   ┌───────────────────────────────┐
                  │ 5V Relay +    │   │  Firebase Realtime Database   │
                  │ AC Light Bulb │   │  • /current  (Live telemetry) │
                  └───────────────┘   │  • /control  (Mode, Relay)   │
                                      │  • /history  (Time-series)    │
                                      └───────────────▲───────────────┘
                                                      │
                                           WebSockets │ onValue / Auth
                                                      ▼
                                      ┌───────────────────────────────┐
                                      │  Responsive Web Dashboard     │
                                      │  • Firebase Email/Pass Auth   │
                                      │  • Live Metric Cards          │
                                      │  • Manual / Automatic Switch  │
                                      │  • Chart.js Dual-Axis Graph   │
                                      │  • Historical Table & CSV     │
                                      └───────────────────────────────┘
```

---

## 2. Hardware Setup & Wiring

### Bill of Materials (BOM)
| Component | Quantity | Purpose |
| :--- | :--- | :--- |
| **ESP32 DevKit V1** (30-pin) | 1 | Microcontroller with integrated Wi-Fi |
| **DHT11 Sensor** | 1 | Ambient temperature & relative humidity measurement |
| **LDR Photoresistor** | 1 | Ambient light level detection |
| **10kΩ Resistor** | 1 | Voltage divider reference for LDR |
| **5V Single-Channel Relay Module** | 1 | Isolated electrical switch for high-voltage appliance/bulb |
| **Bulb / 230V AC Lamp (or 5V LED)** | 1 | Target room appliance |
| **Solderless Breadboard & Jumpers** | 1 | Prototyping circuit |
| **Micro-USB Cable** | 1 | Power supply and programming |

---

### Pinout & Wiring Connections Table

| Component Pin | ESP32 Connection Pin | Wire Type | Description / Logic |
| :--- | :--- | :--- | :--- |
| **DHT11 VCC** | `3V3` or `VIN (5V)` | Power | 3.3V / 5.0V DC supply |
| **DHT11 GND** | `GND` | Ground | Common system ground (0V) |
| **DHT11 DATA** | `GPIO 4` | Digital I/O | Single-bus bidirectional data signal |
| **LDR Leg 1** | `3V3` | Power | 3.3V reference bus |
| **LDR Leg 2** | `GPIO 34` + `10kΩ to GND` | Analog In | Voltage divider midpoint (ADC1 Channel 6, 0–4095) |
| **Relay VCC** | `VIN (5V)` | Power | Relay coil operating voltage |
| **Relay GND** | `GND` | Ground | Common ground |
| **Relay IN** | `GPIO 26` | Digital Out | Digital control trigger (`LOW` = Relay ON, `HIGH` = Relay OFF) |
| **Relay COM / NO** | AC Live / Bulb Circuit | Load Circuit | Series switch completing the appliance power circuit |
| **Onboard Blue LED**| `GPIO 2` | Internal | Wi-Fi status indicator (blinks on search, solid on connect) |

> [!NOTE]
> Most 5V relay modules feature **Active-LOW** optocoupler inputs. Driving `GPIO 26` **LOW** energizes the relay coil (closes COM-NO contacts), and driving it **HIGH** de-energizes it. This logic is handled automatically in the ESP32 firmware.

---

## 3. Firebase Setup & Configuration

### Step 1: Create Firebase Project
1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Create a project named `smartyy-e6f48` (or your preferred identifier).
3. Disable Google Analytics (optional) and create the project.

### Step 2: Enable Firebase Authentication
1. Go to **Build** → **Authentication** → **Get Started**.
2. Under the **Sign-in method** tab, click **Email/Password**.
3. Enable **Email/Password** and click **Save**.
4. Switch to the **Users** tab, click **Add User**, and enter:
   - **Email**: `admin@smartroom.io`
   - **Password**: `your-secure-password`

### Step 3: Create Realtime Database
1. Go to **Build** → **Realtime Database** → **Create Database**.
2. Select your closest location (e.g., `asia-southeast1`).
3. Start in **Test Mode** (or configure secure rules).
4. Update the Database **Rules** tab with:
```json
{
  "rules": {
    ".read": "auth != null || true",
    ".write": "auth != null || true"
  }
}
```
*(For strict production rules, restrict write permissions to authenticated users or database secrets).*

### Step 4: Link Web App Configuration
In [`app.js`](file:///c:/Users/gopuk/Downloads/SmartRoomIoT/app.js#L26-L35), verify your web app credentials match your Firebase Console project settings:
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "smartyy-e6f48.firebaseapp.com",
    databaseURL: "https://smartyy-e6f48-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smartyy-e6f48",
    storageBucket: "smartyy-e6f48.firebasestorage.app",
    messagingSenderId: "898478403904",
    appId: "1:898478403904:web:6b2b918d6441f4b2a40aa5"
};
```

---

## 4. Database Structure

The database is divided into three dedicated branches:

```
smartyy-e6f48-default-rtdb
├── control/
│   ├── mode: "manual" | "automatic"
│   ├── bulb: true | false
│   └── ldrThreshold: 500
├── current/
│   ├── temperature: 28.5
│   ├── humidity: 65.0
│   ├── ldr: 720
│   ├── bulb: true | false
│   └── mode: "manual" | "automatic"
└── history/
    ├── -O1A2B3C4D5E/
    │   ├── timestamp: 1726053600000
    │   ├── temperature: 28.5
    │   ├── humidity: 65.0
    │   ├── ldr: 720
    │   ├── bulb: true
    │   └── mode: "manual"
    └── ...
```

### Data Fields Specification
| Node | Key | Type | Description |
| :--- | :--- | :--- | :--- |
| `control` | `mode` | `string` | `"manual"` for dashboard button control, `"automatic"` for sensor control |
| `control` | `bulb` | `boolean` | Target state of relay when in manual mode |
| `control` | `ldrThreshold` | `integer` | 0–4095 darkness trigger point |
| `current` | `temperature` | `number` | Real-time temperature in degrees Celsius (°C) |
| `current` | `humidity` | `number` | Real-time relative humidity percentage (%) |
| `current` | `ldr` | `integer` | Raw 12-bit ADC reading (0 = maximum brightness, 4095 = total darkness) |
| `current` | `bulb` | `boolean` | Confirmed physical state of the bulb relay |
| `current` | `mode` | `string` | Active operational mode executing on firmware |
| `history` | `timestamp` | `integer` | Millisecond Unix epoch timestamp synchronized via NTP |

---

## 5. ESP32 Firmware Guide

The firmware is located at [`esp32/SmartRoom.ino`](file:///c:/Users/gopuk/Downloads/SmartRoomIoT/esp32/SmartRoom.ino).

### Prerequisites & Libraries
Install the following libraries via Arduino IDE Library Manager (**Tools** → **Manage Libraries**):
1. **ArduinoJson** (by Benoit Blanchon, v6.x or v7.x)
2. **DHT sensor library** (by Adafruit)
3. **Adafruit Unified Sensor** (by Adafruit)

### Configuration in Code
Open `esp32/SmartRoom.ino` and update lines 29–30 with your local Wi-Fi:
```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

### Flashing Procedure
1. Connect the ESP32 to your PC via a high-quality data Micro-USB cable.
2. Select your board: **Tools** → **Board** → **esp32** → **ESP32 Dev Module**.
3. Select your serial port: **Tools** → **Port** (e.g. `COM3`, `COM7`).
4. Set Upload Speed to `921600` or `115200`.
5. Click **Upload**. *(If the console displays `Connecting........_____`, press and hold the `BOOT` button on the ESP32 until the flashing begins).*
6. Open **Serial Monitor** at `115200 Baud` to observe connection logs and telemetry dispatch.

---

## 6. Web Dashboard Features

1. **Secure Email/Password Authentication**:
   - Access is restricted until authenticated against Firebase Auth.
   - Supports keyboard `Enter` submission on password field.
2. **Real-Time Environmental Cards**:
   - Live streaming metrics for Temperature (°C), Humidity (%), Light Level, Bulb State (ON/OFF), and Mode.
3. **Appliance Control Suite**:
   - **Mode Switch**: Toggle between `Manual` and `Automatic` control in real time.
   - **Manual Override Buttons**: ON and OFF trigger buttons enabled exclusively in manual mode (disabled with 50% opacity in auto mode to prevent conflicts).
   - **LDR Threshold Tuning**: Dynamic input box to calibrate the darkness threshold (0–4095) with immediate Firebase persistence.
4. **Historical Chart.js Graph**:
   - **Dual Y-Axis System**: Left axis (0–100) displays Temperature & Humidity; right axis (0–4095) displays LDR intensity.
   - Dark glassmorphism styling with neon glowing line fills and interactive tooltips.
5. **Historical Table & CSV Data Export**:
   - Auto-sorted table displaying the most recent 200 telemetry snapshots.
   - **Download CSV** button generates formatted `smart-room-history.csv` for analytics and offline reporting.

---

## 7. Working Video & Demonstration Script

### Recommended Video Demonstration Flow
When recording your project video demonstration (e.g. for submission, portfolio, or lab evaluation), follow this 5-stage script:

1. **Hardware Inspection (0:00 - 0:30)**:
   - Show the ESP32 connected to the breadboard, DHT11, LDR with 10kΩ pull-up, and the relay wired to the bulb.
   - Show the Serial Monitor displaying Wi-Fi connection and NTP synchronization.
2. **Dashboard Login (0:30 - 0:50)**:
   - Navigate to the hosted web application.
   - Enter email and password, click **Login**, and show the dashboard reveal.
3. **Manual Appliance Control (0:50 - 1:20)**:
   - Verify mode is set to **Manual**.
   - Click the **ON** button: observe dashboard state flip to ON and the physical relay click & illuminate the bulb.
   - Click the **OFF** button: observe physical bulb extinguish and dashboard update immediately.
4. **Automatic Light-Adaptive Automation (1:20 - 2:00)**:
   - Change mode dropdown to **Automatic**.
   - Note the current LDR reading (e.g. 350) and threshold (500).
   - Cover the LDR sensor with your finger: watch the LDR reading exceed 500.
   - Observe the ESP32 automatically trip the relay ON without any user click.
   - Remove your finger: watch the sensor detect brightness and automatically turn the bulb OFF.
5. **Data Visualization & CSV Export (2:00 - 2:30)**:
   - Scroll down to the historical Chart.js graph and hover over points to display telemetry tooltips.
   - Click **Download CSV**: open the downloaded file in Microsoft Excel or Notepad to demonstrate exported timestamps, temperatures, humidities, and appliance states.

---

## 8. Problems and Solutions (Troubleshooting)

| # | Problem Observed | Root Cause | Solution |
| :- | :--- | :--- | :--- |
| **1** | ESP32 fails to connect to Wi-Fi (`Connecting.....` infinite loop) | ESP32 only supports 2.4 GHz Wi-Fi channels; or SSID/password incorrect. | Ensure your Wi-Fi router broadcasts a **2.4 GHz** SSID (not 5 GHz only). Verify credentials in `SmartRoom.ino`. |
| **2** | DHT11 returns `NaN` or `0.0°C` / `0.0%` | Loose jumper wire or missing 3.3V/5V power to the sensor. | Verify DHT11 VCC is connected to `3V3` (or `VIN`), GND to `GND`, and DATA to `GPIO 4`. Ensure `#define DHT_TYPE DHT11` is selected. |
| **3** | Relay is ON when Dashboard says OFF (Inverted logic) | Relay module is Active-LOW instead of Active-HIGH. | In `SmartRoom.ino`, set `#define RELAY_ACTIVE_LOW true`. When `true`, writing `LOW` activates the relay and `HIGH` turns it off. |
| **4** | LDR value always reads `4095` or `0` | Incorrect voltage divider wiring; LDR connected to wrong pin. | Connect one leg of LDR to `3V3`, second leg to `GPIO 34`. Place a `10kΩ` pull-down resistor from `GPIO 34` to `GND`. |
| **5** | Firebase returns `401 Unauthorized` or `Permission Denied` | Firebase Realtime Database rules reject unauthenticated REST requests. | In Firebase Console → Realtime Database → **Rules**, verify rules allow reads and writes (`".read": true, ".write": true` for prototyping). |
| **6** | Manual ON/OFF buttons not working | Dashboard is currently set to `Automatic` mode. | Switch the **Operating Mode** dropdown to `Manual`. The ON/OFF buttons are protected and disabled in automatic mode to prevent sensor override. |
| **7** | Historical graph squishes Temperature & Humidity lines flat | Single Y-axis forced 0–4095 LDR scale across 25°C temperature readings. | Fixed via **Dual Y-Axis**: Left axis scales 0–100 (°C / %), while right axis `yLDR` independently scales 0–4095. |
| **8** | Web page fails to load Firebase scripts | Adblocker or strict firewall blocking Google GStatic CDN scripts. | Whitelist `https://www.gstatic.com/` in browser or disable content blockers for the local development server. |
