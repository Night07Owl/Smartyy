/* =========================================================
   FIREBASE IMPORTS
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    onValue,
    set
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";


/* =========================================================
   FIREBASE CONFIGURATION
   ========================================================= */

const firebaseConfig = {
    apiKey: "AIzaSyBLR1FVu7EawVAkLLgbhpL0F36iL0k9kZo",
    authDomain: "smartyy-e6f48.firebaseapp.com",
    databaseURL: "https://smartyy-e6f48-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smartyy-e6f48",
    storageBucket: "smartyy-e6f48.firebasestorage.app",
    messagingSenderId: "898478403904",
    appId: "1:898478403904:web:6b2b918d6441f4b2a40aa5",
    measurementId: "G-P60CL20WK9"
};


/* =========================================================
   INITIALIZE FIREBASE
   ========================================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


/* =========================================================
   HTML ELEMENTS
   ========================================================= */

const loginPage = document.getElementById("loginPage");
const dashboardPage = document.getElementById("dashboardPage");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const loginMessage = document.getElementById("loginMessage");
const controlMessage = document.getElementById("controlMessage");

const modeSelect = document.getElementById("modeSelect");
const bulbOnBtn = document.getElementById("bulbOnBtn");
const bulbOffBtn = document.getElementById("bulbOffBtn");
const thresholdInput = document.getElementById("thresholdInput");
const saveThresholdBtn = document.getElementById("saveThresholdBtn");

let chart = null;
let historyForCSV = [];
let monitoringStarted = false;


/* =========================================================
   LOGIN
   ========================================================= */

loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        loginMessage.textContent = "Enter email and password.";
        return;
    }

    loginMessage.textContent = "Logging in...";

    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginMessage.textContent = "";
    } catch (error) {
        console.error(error);
        loginMessage.textContent = "Login failed: " + error.message;
    }
});

[emailInput, passwordInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            loginBtn.click();
        }
    });
});


/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginPage.classList.add("hidden");
        dashboardPage.classList.remove("hidden");

        if (!monitoringStarted) {
            monitoringStarted = true;
            startRealtimeMonitoring();
        }
    } else {
        monitoringStarted = false;
        dashboardPage.classList.add("hidden");
        loginPage.classList.remove("hidden");
    }
});


/* =========================================================
   LOGOUT
   ========================================================= */

logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error(error);
    }
});


/* =========================================================
   REALTIME MONITORING
   ========================================================= */

function startRealtimeMonitoring() {

    // Current sensor / appliance values
    onValue(ref(db, "current"), (snapshot) => {
        const data = snapshot.val();

        if (!data) {
            return;
        }

        document.getElementById("temperature").textContent =
            data.temperature ?? "--";

        document.getElementById("humidity").textContent =
            data.humidity ?? "--";

        document.getElementById("ldr").textContent =
            data.ldr ?? "--";

        const isBulbOn = Boolean(data.bulb);
        document.getElementById("bulbStatus").textContent =
            isBulbOn ? "ON" : "OFF";

        const bulbCard = document.getElementById("bulbCard");
        if (bulbCard) {
            bulbCard.classList.toggle("active-on", isBulbOn);
        }

        document.getElementById("modeDisplay").textContent =
            data.mode ?? "--";
    });

    // Control values
    onValue(ref(db, "control"), (snapshot) => {
        const data = snapshot.val();

        if (!data) {
            return;
        }

        modeSelect.value = data.mode ?? "manual";
        thresholdInput.value = data.ldrThreshold ?? 500;

        updateManualButtonState((data.mode ?? "manual") === "manual");
    });

    // History
    onValue(ref(db, "history"), (snapshot) => {
        const data = snapshot.val();

        if (!data) {
            historyForCSV = [];
            updateHistory({});
            return;
        }

        updateHistory(data);
    });
}


/* =========================================================
   MODE CONTROL
   ========================================================= */

modeSelect.addEventListener("change", async (event) => {
    const mode = event.target.value;

    try {
        await set(ref(db, "control/mode"), mode);
        controlMessage.textContent = "Mode changed to " + mode + ".";
        updateManualButtonState(mode === "manual");
    } catch (error) {
        controlMessage.textContent = error.message;
    }
});


/* =========================================================
   MANUAL BULB CONTROL
   ========================================================= */

bulbOnBtn.addEventListener("click", async () => {

    if (modeSelect.value !== "manual") {
        controlMessage.textContent =
            "Change to Manual mode to use the ON/OFF buttons.";
        return;
    }

    try {
        await set(ref(db, "control/bulb"), true);
        controlMessage.textContent = "Bulb ON command sent.";
    } catch (error) {
        controlMessage.textContent = error.message;
    }
});


bulbOffBtn.addEventListener("click", async () => {

    if (modeSelect.value !== "manual") {
        controlMessage.textContent =
            "Change to Manual mode to use the ON/OFF buttons.";
        return;
    }

    try {
        await set(ref(db, "control/bulb"), false);
        controlMessage.textContent = "Bulb OFF command sent.";
    } catch (error) {
        controlMessage.textContent = error.message;
    }
});


function updateManualButtonState(isManual) {
    bulbOnBtn.disabled = !isManual;
    bulbOffBtn.disabled = !isManual;

    bulbOnBtn.style.opacity = isManual ? "1" : "0.5";
    bulbOffBtn.style.opacity = isManual ? "1" : "0.5";
}


/* =========================================================
   LDR THRESHOLD
   ========================================================= */

saveThresholdBtn.addEventListener("click", async () => {

    const threshold = Number(thresholdInput.value);

    if (
        Number.isNaN(threshold) ||
        threshold < 0 ||
        threshold > 4095
    ) {
        controlMessage.textContent =
            "Enter a threshold from 0 to 4095.";
        return;
    }

    try {
        await set(
            ref(db, "control/ldrThreshold"),
            Math.round(threshold)
        );

        controlMessage.textContent =
            "Threshold saved to Firebase.";
    } catch (error) {
        controlMessage.textContent = error.message;
    }
});


/* =========================================================
   HISTORY TABLE + GRAPH
   ========================================================= */

function updateHistory(history) {

    const table = document.getElementById("historyTable");
    table.innerHTML = "";

    historyForCSV = [];

    const timestamps = [];
    const temperatures = [];
    const humidities = [];
    const ldrValues = [];

    const entries = Object.entries(history || {})
        .sort((a, b) => {
            return Number(a[1].timestamp || 0)
                - Number(b[1].timestamp || 0);
        })
        .slice(-200);

    entries.forEach(([key, item]) => {

        const rawTimestamp = Number(item.timestamp || key || 0);

        const date = rawTimestamp > 100000000000
            ? new Date(rawTimestamp)
            : new Date(rawTimestamp * 1000);

        const dateText = isNaN(date.getTime())
            ? "Unknown"
            : date.toLocaleString();

        // Table
        const row = document.createElement("tr");

        const cells = [
            dateText,
            `${item.temperature ?? ""} °C`,
            `${item.humidity ?? ""} %`,
            item.ldr ?? "",
            item.bulb ? "ON" : "OFF",
            item.mode ?? ""
        ];

        cells.forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        table.appendChild(row);

        // Graph
        timestamps.push(
            isNaN(date.getTime())
                ? String(rawTimestamp)
                : date.toLocaleTimeString()
        );

        temperatures.push(Number(item.temperature ?? 0));
        humidities.push(Number(item.humidity ?? 0));
        ldrValues.push(Number(item.ldr ?? 0));

        // CSV
        historyForCSV.push({
            timestamp: dateText,
            temperature: item.temperature ?? "",
            humidity: item.humidity ?? "",
            ldr: item.ldr ?? "",
            bulb: item.bulb ? "ON" : "OFF",
            mode: item.mode ?? ""
        });
    });

    updateChart(
        timestamps,
        temperatures,
        humidities,
        ldrValues
    );
}


/* =========================================================
   CHART
   ========================================================= */

function updateChart(
    labels,
    temperatures,
    humidities,
    ldrValues
) {
    const canvas = document.getElementById("historyChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (chart) {
        chart.destroy();
    }

    // Warm Flame & Light Orange Gradients for dataset fills
    const tempGradient = ctx.createLinearGradient(0, 0, 0, 350);
    tempGradient.addColorStop(0, "rgba(234, 88, 12, 0.28)");
    tempGradient.addColorStop(0.7, "rgba(234, 88, 12, 0.06)");
    tempGradient.addColorStop(1, "rgba(234, 88, 12, 0)");

    const humGradient = ctx.createLinearGradient(0, 0, 0, 350);
    humGradient.addColorStop(0, "rgba(2, 132, 199, 0.28)");
    humGradient.addColorStop(0.7, "rgba(2, 132, 199, 0.06)");
    humGradient.addColorStop(1, "rgba(2, 132, 199, 0)");

    const ldrGradient = ctx.createLinearGradient(0, 0, 0, 350);
    ldrGradient.addColorStop(0, "rgba(245, 158, 11, 0.25)");
    ldrGradient.addColorStop(0.7, "rgba(245, 158, 11, 0.05)");
    ldrGradient.addColorStop(1, "rgba(245, 158, 11, 0)");

    chart = new Chart(ctx, {
        type: "line",

        data: {
            labels: labels,
            datasets: [
                {
                    label: "Temperature (°C)",
                    data: temperatures,
                    borderColor: "#ea580c",
                    backgroundColor: tempGradient,
                    borderWidth: 2.5,
                    pointBackgroundColor: "#ea580c",
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 1,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.35,
                    fill: true,
                    yAxisID: "y"
                },
                {
                    label: "Humidity (%)",
                    data: humidities,
                    borderColor: "#0284c7",
                    backgroundColor: humGradient,
                    borderWidth: 2.5,
                    pointBackgroundColor: "#0284c7",
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 1,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.35,
                    fill: true,
                    yAxisID: "y"
                },
                {
                    label: "LDR Light",
                    data: ldrValues,
                    borderColor: "#f59e0b",
                    backgroundColor: ldrGradient,
                    borderWidth: 2,
                    pointBackgroundColor: "#f59e0b",
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 1,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.35,
                    fill: true,
                    yAxisID: "yLDR"
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        color: "#1c1917",
                        font: { family: "'Outfit', 'Google Sans', sans-serif", size: 12, weight: 600 },
                        usePointStyle: true,
                        padding: 16
                    }
                },

                tooltip: {
                    backgroundColor: "rgba(255, 255, 255, 0.98)",
                    titleColor: "#c2410c",
                    bodyColor: "#1c1917",
                    borderColor: "#fdba74",
                    borderWidth: 1.5,
                    padding: 12,
                    boxPadding: 6,
                    cornerRadius: 10,
                    displayColors: true
                }
            },

            scales: {
                x: {
                    grid: {
                        color: "rgba(249, 115, 22, 0.08)"
                    },
                    ticks: {
                        color: "#57534e",
                        maxRotation: 45,
                        minRotation: 0,
                        font: { family: "'Inter', sans-serif" }
                    }
                },

                y: {
                    type: "linear",
                    display: true,
                    position: "left",
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Temp (°C) / Humidity (%)",
                        color: "#ea580c",
                        font: { family: "'Outfit', 'Google Sans', sans-serif", size: 11, weight: 600 }
                    },
                    grid: {
                        color: "rgba(249, 115, 22, 0.08)"
                    },
                    ticks: {
                        color: "#57534e",
                        font: { family: "'Inter', sans-serif" }
                    }
                },

                yLDR: {
                    type: "linear",
                    display: true,
                    position: "right",
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "LDR Raw (0-4095)",
                        color: "#b45309",
                        font: { family: "'Outfit', 'Google Sans', sans-serif", size: 11, weight: 600 }
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: "#b45309",
                        font: { family: "'Inter', sans-serif" }
                    }
                }
            }
        }
    });
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

document.getElementById("csvBtn").addEventListener("click", () => {

    if (historyForCSV.length === 0) {
        alert("No historical data available.");
        return;
    }

    const headers = [
        "Timestamp",
        "Temperature",
        "Humidity",
        "LDR",
        "Bulb State",
        "Operating Mode"
    ];

    const rows = historyForCSV.map(item => [
        item.timestamp,
        item.temperature,
        item.humidity,
        item.ldr,
        item.bulb,
        item.mode
    ]);

    const csv = [headers, ...rows]
        .map(row =>
            row.map(value =>
                `"${String(value).replaceAll('"', '""')}"`
            ).join(",")
        )
        .join("\n");

    const blob = new Blob(
        [csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "smartyy-room-history.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
});
