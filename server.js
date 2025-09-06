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

  if (!serverName || !/^[A-Za-z0-9]+$/.test(serverName)) {
    return res.status(400).send("Server name must only contain letters and numbers.");
  }

  if (!req.file) return res.status(400).send("Missing file");

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const { data, error } = await supabase.storage
      .from("saves")
      .upload(`${serverName}.zip`, fileBuffer, { upsert: true });
    fs.unlinkSync(req.file.path);

    if (error) return res.status(500).send("Failed to upload to Supabase");

    if (!playerCounts[serverName]) playerCounts[serverName] = 0;

    res.json({ success: true, message: "Upload successful" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed due to server error");
  }
});

// ===== CREATE NEW SAVE FROM TEMPLATE =====
app.post("/create-save", async (req, res) => {
  const { serverName } = req.body;

  if (!serverName || !/^[A-Za-z0-9]+$/.test(serverName)) {
    return res.status(400).json({ success: false, message: "Server name must only contain letters and numbers." });
  }

  try {
    const templatePath = path.join(__dirname, "template_saves", "template.zip");
    if (!fs.existsSync(templatePath)) return res.status(500).json({ success: false, message: "Template zip not found." });

    const fileBuffer = fs.readFileSync(templatePath);
    const { data, error } = await supabase.storage
      .from("saves")
      .upload(`${serverName}.zip`, fileBuffer, { upsert: true });

    if (error) return res.status(500).json({ success: false, message: "Failed to upload new save." });

    if (!playerCounts[serverName]) playerCounts[serverName] = 0;

    res.json({ success: true, message: "New save created successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error while creating save." });
  }
});

// ===== GET PLAYER COUNT =====
app.get("/playercount/:serverName", (req, res) => {
  const { serverName } = req.params;
  const count = playerCounts[serverName] || 0;
  res.json({ success: true, serverName, count });
});

app.post("/plrcount/:serverName", (req, res) => {
  const { serverName } = req.params;
  const { count } = req.body;

  if (!serverName || typeof count !== "number") return res.status(400).json({ success: false, message: "Invalid input" });

  playerCounts[serverName] = count;
  res.json({ success: true });
});

// ===== DOWNLOAD (for mod) =====
app.get("/download/:serverName", async (req, res) => {
  const serverName = req.params.serverName;

  try {
    const { data, error } = await supabase.storage.from("saves").download(`${serverName}.zip`);
    if (error || !data) return res.status(404).send("Save not found");

    res.setHeader("Content-Disposition", `attachment; filename="${serverName}.zip"`);
    res.setHeader("Content-Type", "application/zip");
    data.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Download failed");
  }
});

const lobbyIDs = {};

// ===== UPDATE LOBBY ID =====
app.post("/lobbyid/:serverName", (req, res) => {
  const { serverName } = req.params;
  const { lobbyID } = req.body;
  if (!serverName || !lobbyID) return res.status(400).json({ success: false });

  lobbyIDs[serverName] = lobbyID;
  res.json({ success: true });
});

// ===== GET LOBBY ID =====
app.get("/lobbyid/:serverName", (req, res) => {
  const { serverName } = req.params;
  const lobbyID = lobbyIDs[serverName] || null;
  res.json({ success: true, serverName, lobbyID });
});

// ===== WEBSITE =====
app.get("/", async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage.from("saves").list("");
    if (error) throw error;

    const servers = files.filter(f => !f.name.endsWith(".emptyFolderPlaceholder")).map(f => f.name.replace(".zip", ""));

    const htmlList = servers.map(name => {
      const count = playerCounts[name] || 0;
      return `<p><b>${name}</b><br/>Players: ${count}</p>`;
    }).join("");

    res.send(`
<html>
<head>
  <title>Schedule Servers</title>
  <style>
    body { font-family: Arial; background:#f2f2f2; display:flex; justify-content:center; padding:30px; }
    .container { background:#fff; padding:30px 40px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.1); max-width:400px; width:100%; }
    h1,h2{text-align:center;color:#333;}
    form { display:flex; flex-direction:column; margin-bottom:20px; }
    input[type=text],input[type=file]{padding:10px;margin-bottom:15px;border-radius:8px;border:1px solid #ccc;font-size:16px;}
    button{padding:12px;border:none;border-radius:10px;background:#4CAF50;color:white;font-size:16px;cursor:pointer;transition:0.2s;margin-bottom:10px;}
    button:hover{background:#45a049;}
    .server-list{max-height:300px; overflow-y:auto; padding-right:5px;}
    .server-list p{background:#f9f9f9;padding:10px;border-radius:8px;margin-bottom:8px;box-shadow:0 2px 5px rgba(0,0,0,0.05);}
  </style>
</head>
<body>
  <div class="container">
    <h1>Schedule Servers</h1>
    <form id="saveForm">
      <input type="text" id="serverNameInput" placeholder="Server name" required />
      <input type="file" id="saveFile" name="saveFile" accept=".zip" />
      <button type="button" id="uploadBtn">Upload Save</button>
      <button type="button" id="createBtn">Create New Save</button>
    </form>
    <button id="refreshBtn">Refresh List</button>
    <h2>Servers</h2>
    <div class="server-list" id="serverList">${htmlList || "<p>No servers uploaded yet.</p>"}</div>
  </div>

  <script>
    const serverInput = document.getElementById('serverNameInput');
    const fileInput = document.getElementById('saveFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const createBtn = document.getElementById('createBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const serverList = document.getElementById('serverList');

    uploadBtn.addEventListener('click', async () => {
      const serverName = serverInput.value.trim();
      if (!serverName) return alert("Enter a server name.");
      if (!fileInput.files.length) return alert("Select a zip file.");
      const formData = new FormData();
      formData.append("serverName", serverName);
      formData.append("saveFile", fileInput.files[0]);
      const res = await fetch('/upload', { method:'POST', body:formData });
      const data = await res.json();
      alert(data.message || "Done");
      serverInput.value=""; fileInput.value=""; refreshBtn.click();
    });

    createBtn.addEventListener('click', async () => {
      const serverName = serverInput.value.trim();
      if (!serverName) return alert("Enter a server name.");
      const res = await fetch('/create-save', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({serverName})
      });
      const data = await res.json();
      alert(data.message || "Done");
      serverInput.value=""; fileInput.value=""; refreshBtn.click();
    });

    refreshBtn.addEventListener('click', async () => {
      const res = await fetch('/');
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html,'text/html');
      const newList = doc.getElementById('serverList');
      if(newList) serverList.innerHTML = newList.innerHTML;
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
