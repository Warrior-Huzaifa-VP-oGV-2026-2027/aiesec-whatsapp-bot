const express = require("express");
const cron = require("node-cron");
const qrImage = require("qr-image");
const fs = require("fs");
const path = require("path");

const app = express();
let sock = null;
let latestQrData = null;
let isConnected = false;

// Enable CORS for dashboard
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});
app.use(express.json());

// File Paths
const AUTH_DIR = path.join(__dirname, "baileys_auth_info");
const CONFIG_FILE = path.join(__dirname, "config.json");

// Default Configuration State
let config = {
  enabled: true, // TOGGLE FEATURE
  time: "09:00",
  timezone: "Asia/Bahrain",
  template: `⚔️ *AIESEC Daily Focus List*\nHi {NAME}! Here are your priorities for today:\n\n{TASKS}\n\n*Make it happen!*`,
  team: []
};

// --- DATA PERSISTENCE HELPERS ---
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedData = fs.readFileSync(CONFIG_FILE, "utf-8");
      config = { ...config, ...JSON.parse(savedData) };
      console.log("💾 Config loaded from disk successfully.");
    }
  } catch (err) {
    console.error("⚠️ Failed to load config.json, using defaults:", err.message);
  }
}

function saveConfigToDisk() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log("💾 Config saved to disk.");
  } catch (err) {
    console.error("❌ Failed to write config.json:", err.message);
  }
}

// Initialize config on launch
loadConfig();

// --- BAILEYS ENGINE ---
async function connectToWhatsApp() {
  const baileys = await import("@whiskeysockets/baileys");
  
  const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
  const useMultiFileAuthState = baileys.useMultiFileAuthState;
  const DisconnectReason = baileys.DisconnectReason;

  const pino = require("pino");
  const logger = pino({ level: "silent" });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  console.log("⚡ Starting Baileys WhatsApp Engine...");

  sock = makeWASocket({
    auth: state,
    logger: logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQrData = qr;
      console.log("⚡ New QR Code generated! View it at /qr");
    }

    if (connection === "open") {
      latestQrData = null;
      isConnected = true;
      console.log("✅ Baileys Engine Connected & Ready to Send Messages!");
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️ Connection closed (code: ${statusCode || 'unknown'}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log("❌ Logged out. Clearing session files...");
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        setTimeout(connectToWhatsApp, 3000);
      }
    }
  });
}

// --- CORE DISPATCH ROUTINE ---
async function executeDispatch() {
  if (!config.enabled) {
    console.log("⏸️ Dispatch skipped: Automation toggle is OFF.");
    return;
  }

  console.log("🚀 Starting WhatsApp Focus Dispatch...");

  if (!sock || !isConnected) {
    console.error("❌ Cannot send: Baileys WhatsApp client is not connected yet!");
    return;
  }

  if (!config.team || config.team.length === 0) {
    console.warn("⚠️ Dispatch skipped: No team members found in configuration.");
    return;
  }

  for (const member of config.team) {
    try {
      // Safe fallback if tasks array is missing or empty
      const safeTasks = Array.isArray(member.tasks) ? member.tasks : [];
      let taskList = safeTasks.length > 0 
        ? safeTasks.map((task, i) => `${i + 1}. 🔸 ${task}`).join("\n")
        : "No tasks assigned for today!";

      let message = config.template
        .replace(/{NAME}/g, member.name || "Member")
        .replace(/{TASKS}/g, taskList);

      let cleanPhone = (member.phone || "").replace(/[^0-9]/g, "");
      if (cleanPhone.startsWith("00")) cleanPhone = cleanPhone.substring(2);

      if (!cleanPhone) {
        console.error(`⚠️ Missing phone number for ${member.name}`);
        continue;
      }

      let jid = cleanPhone + "@s.whatsapp.net";

      await sock.sendMessage(jid, { text: message });
      console.log(`✅ Sent focus list to ${member.name} (${cleanPhone})`);
    } catch (err) {
      console.error(`❌ Failed to send to ${member.name}:`, err.message || err);
    }
  }
}

// --- CRON MANAGEMENT ---
let currentCronTask = null;

function applyCronSchedule() {
  if (currentCronTask) currentCronTask.stop();

  if (!config.time || typeof config.time !== "string") return;

  const [hour, minute] = config.time.split(":");
  const cronExpression = `${parseInt(minute)} ${parseInt(hour)} * * *`;

  currentCronTask = cron.schedule(
    cronExpression,
    () => {
      console.log(`⏰ Executing Scheduled Dispatch at ${config.time}...`);
      executeDispatch();
    },
    {
      scheduled: true,
      timezone: config.timezone || "Asia/Bahrain"
    }
  );

  console.log(`⏰ Daily Schedule active for ${config.time} (${config.timezone || 'Asia/Bahrain'})`);
}

// --- API ROUTES ---

// Serve QR Code
app.get("/qr", (req, res) => {
  if (isConnected) return res.send("<h2>✅ WhatsApp is ALREADY connected and active!</h2>");
  if (!latestQrData) return res.send("<h2>⏳ Generating QR code... Refresh in 3 seconds.</h2>");
  
  const qrStream = qrImage.image(latestQrData, { type: "png" });
  res.type("png");
  qrStream.pipe(res);
});

// Root check
app.get("/", (req, res) => {
  res.send('<h2>⚡ Light-speed Baileys Engine Running!</h2><p>Check QR at <a href="/qr">/qr</a></p>');
});

// GET Current Configuration (FOR DASHBOARD SYNC)
app.get("/api/config", (req, res) => {
  res.json({
    status: "success",
    isConnected: isConnected,
    config: config
  });
});

// Manual Instant Send Endpoint
app.post("/api/send-now", (req, res) => {
  const { template, team } = req.body;
  if (template) config.template = template;
  if (team && Array.isArray(team)) config.team = team;

  saveConfigToDisk();
  executeDispatch();
  res.json({ status: "success", message: "Manual dispatch initiated!" });
});

// Save Schedule Endpoint (Handles Toggles, Teams, Schedules)
app.post("/api/save-config", (req, res) => {
  const { time, template, team, enabled, timezone } = req.body;

  if (typeof enabled === "boolean") config.enabled = enabled;
  if (time) config.time = time;
  if (timezone) config.timezone = timezone;
  if (template) config.template = template;
  if (team && Array.isArray(team)) config.team = team;

  saveConfigToDisk();
  applyCronSchedule();

  res.json({
    status: "success",
    message: "Configuration saved and schedule updated!",
    config: config
  });
});

// --- SERVER INITIALIZATION ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🖥️ Server running on port ${PORT}`);
  applyCronSchedule(); // Load saved schedule at server start
  connectToWhatsApp();
});
