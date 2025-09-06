const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Supabase setup
const SUPABASE_URL = "https://dyifvnvtegtuchrkqsqp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aWZ2bnZ0ZWd0dWNocmtxc3FwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk0ODY0MiwiZXhwIjoyMDcyNTI0NjQyfQ.YYc9iyinArjf1eiH3zD1jiUZ0THCfMPepnPkDKE3xTs"; // use a Service Role key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Express setup
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory player counts
const playerCounts = {}; // { serverName: count }

// Multer config for temporary uploads
const upload = multer({ dest: "temp_uploads/" });
if (!fs.existsSync("temp_uploads")) fs.mkdirSync("temp_uploads");

// Parse form fields and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== UPLOAD (from web or mod) =====
app.post("/upload", upload.single("saveFile"), async (req, res) => {
  const { serverName } = req.body;
  if (!req.file || !serverName) {
    console.error("Upload failed: Missing file or server name");
    return res.status(400).send("Missing file or server name");
  }

  try {
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath); // Read as Buffer
    const fileName = `${serverName}.zip`;

    console.log(`Uploading '${fileName}' to Supabase...`);

    const { data, error } = await supabase.storage
      .from("saves")
      .upload(fileName, fileBuffer, { upsert: true });

    fs.unlinkSync(filePath); // Remove temp file

    if (error) {
      console.error("Supabase upload error:", error.message);
      console.error("Error details:", JSON.stringify(error, null, 2));
      return res.status(500).send("Failed to upload to Supabase");
    }

    console.log("Supabase upload successful:", data);

    // Initialize player count if not exists
    if (!playerCounts[serverName]) playerCounts[serverName] = 0;

    res.json({ success: true, message: "Upload successful" });
  } catch (err) {
    console.error("Upload exception:", err);
    res.status(500).send("Upload failed due to server error");
  }
});
// ===== UPDATE PLAYER COUNT =====
app.post("/plrcount/:serverName", (req, res) => {
  const { serverName } = req.params;
  const { count } = req.body;

  if (!serverName || typeof count !== "number") return res.status(400).json({ success: false });

  playerCounts[serverName] = count;
  res.json({ success: true });
});

// ===== GET PLAYER COUNT =====
app.get("/playercount/:serverName", (req, res) => {
    const { serverName } = req.params;
    if (!serverName) return res.status(400).json({ success: false, message: "Server name required" });

    const count = playerCounts[serverName] || 0;
    res.json({ success: true, serverName, count });
});

// ===== DOWNLOAD (for mod) =====
app.get("/download/:serverName", async (req, res) => {
  const serverName = req.params.serverName;

  try {
    const { data, error } = await supabase.storage
      .from("saves")
      .download(`${serverName}.zip`);

    if (error || !data) {
      console.error("Supabase download error:", error?.message || "File not found");
      return res.status(404).send("Save not found");
    }

    res.setHeader("Content-Disposition", `attachment; filename="${serverName}.zip"`);
    res.setHeader("Content-Type", "application/zip");
    data.pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).send("Download failed");
  }
});

const lobbyIDs = {};     // { serverName: lobbyID }

// ===== UPDATE LOBBY ID =====
app.post("/lobbyid/:serverName", (req, res) => {
    const { serverName } = req.params;
    const { lobbyID } = req.body;

    if (!serverName || !lobbyID) return res.status(400).json({ success: false });

    lobbyIDs[serverName] = lobbyID;
    res.json({ success: true });
});

// ===== GET LOBBY ID ===== (optional, for mod use, not displayed on website)
app.get("/lobbyid/:serverName", (req, res) => {
    const { serverName } = req.params;
    if (!serverName) return res.status(400).json({ success: false });

    const lobbyID = lobbyIDs[serverName] || null;
    res.json({ success: true, serverName, lobbyID });
});

// ===== WEBSITE =====
app.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.storage.from("saves").list("");
    if (error) throw error;

    const servers = data
      .filter(f => !f.name.endsWith(".emptyFolderPlaceholder"))
      .map(f => f.name.replace(".zip", ""));

    const htmlList = servers
      .map(name => `<p><b>${name}</b> - Players: ${playerCounts[name] || 0}</p>`)
      .join("");

    res.send(`
      <h1>Schedule Servers</h1>
      <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="text" name="serverName" placeholder="Server name" required />
        <input type="file" name="saveFile" accept=".zip" required />
        <button type="submit">Upload Save</button>
      </form>
      <h2>Servers</h2>
      ${htmlList || "<p>No servers uploaded yet.</p>"}
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load servers");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
