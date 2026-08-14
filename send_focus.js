const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const express = require("express");

const app = express();

// Enable CORS so HTML file can talk seamlessly to local port 3000
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  next();
});

app.use(express.json());

// Initialize WhatsApp Web Client using local macOS Chrome
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("Scan this QR Code with your WhatsApp (Linked Devices):");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log(
    "✅ WhatsApp Engine is Connected & Listening for Dashboard Commands!",
  );
});

// Default Configuration State
let config = {
  time: "09:00",
  template: `⚔️ *AIESEC Daily Focus List*\nHi {NAME}! Here are your priorities for today:\n\n{TASKS}\n\n*Make it happen!*`,
  team: [
    {
      name: "Layan",
      phone: "97333000000",
      tasks: [
        "Noor Naser - Fill Info Session Comment",
        "Raghad Aldossary - Follow-up Application",
      ],
    },
    {
      name: "Ali",
      phone: "97333111111",
      tasks: ["Ali Hammad - Pending Call"],
    },
  ],
};

// Core Sending Function
function executeDispatch() {
  console.log("🚀 Starting WhatsApp Focus Dispatch...");
  config.team.forEach((member) => {
    let taskList = member.tasks
      .map((task, i) => `${i + 1}. 🔸 ${task}`)
      .join("\n");
    let message = config.template
      .replace("{NAME}", member.name)
      .replace("{TASKS}", taskList);

    // Sanitize phone number (strip spaces/plus signs)
    let cleanPhone = member.phone.replace(/[^0-9]/g, "");
    let recipientId = cleanPhone + "@c.us";

    client
      .sendMessage(recipientId, message)
      .then(() =>
        console.log(`✅ Sent focus list to ${member.name} (${cleanPhone})`),
      )
      .catch((err) =>
        console.error(`❌ Failed to send to ${member.name}:`, err),
      );
  });
}

// API Endpoint: Manual Trigger From Admin Button
app.post("/api/send-now", (req, res) => {
  const { template, team } = req.body;
  if (template) config.template = template;
  if (team && team.length > 0) config.team = team;

  executeDispatch();
  res.json({ status: "success", message: "Dispatch initiated!" });
});

// API Endpoint: Save Time & Cron Schedule
let currentCronTask = null;

app.post("/api/save-config", (req, res) => {
  const { time, template, team } = req.body;
  if (time) config.time = time;
  if (template) config.template = template;
  if (team && team.length > 0) config.team = team;

  // Destroy existing scheduled trigger if present
  if (currentCronTask) {
    currentCronTask.stop();
  }

  // Schedule new daily Cron trigger
  const [hour, minute] = config.time.split(":");
  currentCronTask = cron.schedule(`${minute} ${hour} * * *`, () => {
    console.log(`⏰ Scheduled Daily Cron Executing at ${config.time}...`);
    executeDispatch();
  });

  console.log(`⏰ Updated Daily Schedule to ${config.time}`);
  res.json({ status: "success", message: "Schedule updated successfully!" });
});

client.initialize();
app.listen(3000, () =>
  console.log("🖥️ Local Server listening on http://localhost:3000"),
);
