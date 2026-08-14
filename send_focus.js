const { Client, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");
const cron = require("node-cron");
const express = require("express");

const app = express();
let latestQrData = null;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(express.json());

const MONGO_URI = "mongodb+srv://huzaifasuhail_db_user:NUfpDGVCyK8jwMti@cluster0.b0fqrkt.mongodb.net/whatsapp_bot?retryWrites=true&w=majority";

console.log("⏳ Connecting to MongoDB Session Store...");

mongoose.connect(MONGO_URI).then(() => {
  console.log("🍃 Successfully connected to MongoDB Session Store!");

  const store = new MongoStore({ mongoose: mongoose });

  const client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000
    }),
    // FIX: Forces WhatsApp Web to use a stable, cached remote version
    // preventing headless Chrome from freezing during page load.
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
    },
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--unhandled-rejections=strict"
      ]
    }
  });

  client.on("qr", (qr) => {
    latestQrData = qr;
    console.log("⚡ New QR Code generated! View and scan it at /qr");
  });

  client.on("authenticated", () => {
    console.log("🔐 WhatsApp Session Authenticated Successfully!");
  });

  client.on("ready", () => {
    latestQrData = null;
    console.log("✅ WhatsApp Engine is Fully Connected & Listening for Commands!");
  });

  client.on("remote_session_saved", () => {
    console.log("💾 Persistent Session Saved to MongoDB Database!");
  });

  app.get("/", (req, res) => {
    res.send('<h2>🤖 AIESEC WhatsApp Bot is running live!</h2><p>Go to <a href="/qr">/qr</a> to scan your WhatsApp QR code.</p>');
  });

  app.get("/qr", (req, res) => {
    if (!latestQrData) {
      return res.send("<h2>✅ WhatsApp is already connected or QR code is generating... check Render logs!</h2>");
    }
    const qrImage = require("qr-image");
    const qrStream = qrImage.image(latestQrData, { type: "png" });
    res.type("png");
    qrStream.pipe(res);
  });

  let config = {
    time: "09:00",
    template: `⚔️ *AIESEC Daily Focus List*\nHi {NAME}! Here are your priorities for today:\n\n{TASKS}\n\n*Make it happen!*`,
    team: []
  };

  async function executeDispatch() {
    console.log("🚀 Starting WhatsApp Focus Dispatch...");

    if (!client.info || !client.info.wid) {
      console.error("❌ Cannot send message: WhatsApp engine is not logged in or ready yet! Please scan the QR code first.");
      return;
    }

    for (const member of config.team) {
      try {
        let taskList = member.tasks.map((task, i) => `${i + 1}. 🔸 ${task}`).join("\n");
        let message = config.template.replace("{NAME}", member.name).replace("{TASKS}", taskList);

        let cleanPhone = member.phone.replace(/[^0-9]/g, "");
        if (cleanPhone.startsWith("00")) cleanPhone = cleanPhone.substring(2);

        let recipientId = cleanPhone + "@c.us";
        await client.sendMessage(recipientId, message);
        console.log(`✅ Sent focus list to ${member.name} (${cleanPhone})`);
      } catch (err) {
        console.error(`❌ Failed to send to ${member.name}:`, err.message || err);
      }
    }
  }

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
      console.log(`⏰ Executing Scheduled Daily Dispatch at ${config.time}...`);
      executeDispatch();
    });

    console.log(`⏰ Updated Daily Schedule to ${config.time}`);
    res.json({ status: "success", message: "Schedule updated successfully!" });
  });

  client.initialize();
}).catch((err) => {
  console.error("❌ Failed to connect to MongoDB Atlas:", err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🖥️ Server listening on port ${PORT}`));
