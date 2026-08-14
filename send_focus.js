const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
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
  next();
});
app.use(express.json());

// Persistent Local Auth Directory
const AUTH_DIR = path.join(__dirname, "baileys_auth_info");

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`⚡ Starting Baileys WhatsApp Engine (v${version.join(".")})...`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
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
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log(
        "⚠️ Connection closed due to:",
        lastDisconnect?.error || "Unknown Reason",
        "Reconnecting:",
        shouldReconnect
      );

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

// Serve QR Image
app.get("/qr", (req, res) => {
  if (isConnected) {
    return res.send("<h2>✅ WhatsApp is ALREADY connected and active!</h2>");
  }
  if (!latestQrData) {
    return res.send("<h2>⏳ Generating QR code... Refresh in 3 seconds.</h2>");
  }
  const qrStream = qrImage.image(latestQrData, { type: "png" });
  res.type("png");
  qrStream.pipe(res);
});

app.get("/", (req, res) => {
  res.send('<h2>⚡ Light-speed Baileys Engine Running!</h2><p>Check QR at <a href="/qr">/qr</a></p>');
});

// Default Configuration State
let config = {
  time: "09:00",
  template: `⚔️ *AIESEC Daily Focus List*\nHi {NAME}! Here are your priorities for today:\n\n{TASKS}\n\n*Make it happen!*`,
  team: []
};

// Dispatch logic
async function executeDispatch() {
  console.log("🚀 Starting WhatsApp Focus Dispatch...");

  if (!sock || !isConnected) {
    console.error("❌ Cannot send: Baileys WhatsApp client is not connected yet!");
    return;
  }

  for (const member of config.team) {
    try {
      let taskList = member.tasks.map((task, i) => `${i + 1}. 🔸 ${task}`).join("\n");
      let message = config.template.replace("{NAME}", member.name).replace("{TASKS}", taskList);

      let cleanPhone = member.phone.replace(/[^0-9]/g, "");
      if (cleanPhone.startsWith("00")) cleanPhone = cleanPhone.substring(2);

      let jid = cleanPhone + "@s.whatsapp.net";

      await sock.sendMessage(jid, { text: message });
      console.log(`✅ Sent focus list to ${member.name} (${cleanPhone})`);
    } catch (err) {
      console.error(`❌ Failed to send to ${member.name}:`, err.message || err);
    }
  }
}

// API Endpoints
app.post("/api/send-now", (req, res) => {
  const { template, team } = req.body;
  if (template) config.template = template;
  if (team && team.length > 0) config.team = team;

  executeDispatch();
  res.json({ status: "success", message: "Dispatch initiated!" });
});

let currentCronTask = null;
app.post("/api/save-config", (req, res) => {
  const { time, template, team } = req.body;
  if (time) config.time = time;
  if (template) config.template = template;
  if (team && team.length > 0) config.team = team;

  if (currentCronTask) currentCronTask.stop();

  const [hour, minute] = config.time.split(":");
  currentCronTask = cron.schedule(`${minute} ${hour} * * *`, () => {
    console.log(`⏰ Executing Scheduled Dispatch at ${config.time}...`);
    executeDispatch();
  });

  console.log(`⏰ Daily Schedule set to ${config.time}`);
  res.json({ status: "success", message: "Schedule updated!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🖥️ Server running on port ${PORT}`);
  connectToWhatsApp();
});
