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

  // ✅ Validate server name: only letters (A-Z, a-z) and numbers (0-9), no spaces or special characters
  if (!serverName || !/^[A-Za-z0-9]+$/.test(serverName)) {
    console.error("Upload failed: Invalid server name");
    return res.status(400).send("Server name must only contain letters and numbers (no spaces or special characters).");
  }

  if (!req.file) {
    console.error("Upload failed: Missing file");
    return res.status(400).send("Missing file");
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

// ===== GET PLAYER COUNT =====
app.get("/playercount/:serverName", (req, res) => {
    const { serverName } = req.params;
    if (!serverName) return res.status(400).json({ success: false, message: "Server name required" });

    const count = playerCounts[serverName] || 0;
    res.json({ success: true, serverName, count });
});

app.post("/plrcount/:serverName", (req, res) => {
    const { serverName } = req.params;
    const { count } = req.body;

    if (!serverName || typeof count !== "number") {
        return res.status(400).json({ success: false, message: "Invalid input" });
    }

    playerCounts[serverName] = count;
    res.json({ success: true });
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
      .map(name => {
        const count = playerCounts[name] || 0;
        const lobby = lobbyIDs[name] || "Not set";
        return `
          <p>
            <b>${name}</b><br/>
            Players: ${count}<br/>
          </p>`;
      })
      .join("");

    res.send(`
<html>
<head>
  <title>Schedule Servers</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f2f2f2;
      display: flex;
      justify-content: center;
      padding: 30px;
    }

    .container {
      background-color: #fff;
      padding: 30px 40px;
      border-radius: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      max-width: 400px;
      width: 100%;
    }

    h1, h2 {
      text-align: center;
      color: #333;
    }

    form {
      display: flex;
      flex-direction: column;
      margin-bottom: 20px;
    }

    input[type="text"], input[type="file"] {
      padding: 10px;
      margin-bottom: 15px;
      border-radius: 8px;
      border: 1px solid #ccc;
      font-size: 16px;
    }

    button {
      padding: 12px;
      border: none;
      border-radius: 10px;
      background-color: #4CAF50;
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: background-color 0.2s;
      margin-bottom: 10px;
    }

    button:hover {
      background-color: #45a049;
    }

    .server-list {
      max-height: 300px; /* scrollable container */
      overflow-y: auto;
      padding-right: 5px;
    }

    .server-list p {
      background-color: #f9f9f9;
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Schedule Servers</h1>
    <form id="uploadForm" action="/upload" method="post" enctype="multipart/form-data">
      <input type="text" name="serverName" placeholder="Server name" required />
      <input type="file" id="saveFile" name="saveFile" accept=".zip" required />
      <button type="submit" id="uploadBtn" style="display:none;">Upload Save</button>
    </form>

    <button id="refreshBtn">Refresh List</button>

    <h2>Servers</h2>
    <div class="server-list" id="serverList">
      ${htmlList || "<p>No servers uploaded yet.</p>"}
    </div>
  </div>

  <script>
    const fileInput = document.getElementById('saveFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const serverList = document.getElementById('serverList');

    fileInput.addEventListener('change', () => {
      uploadBtn.style.display = fileInput.files.length > 0 ? 'inline-block' : 'none';
    });

    refreshBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/');
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newList = doc.getElementById('serverList');
        if (newList) serverList.innerHTML = newList.innerHTML;
      } catch (err) {
        alert('Failed to refresh list.');
        console.error(err);
      }
    });
  </script>
</body>
</html>
`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load servers");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
