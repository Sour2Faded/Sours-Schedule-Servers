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

// Parse form fields
app.use(express.urlencoded({ extended: true }));

// Upload save via webpage
app.post("/upload", upload.single("saveFile"), async (req, res) => {
  const { serverName } = req.body;
  if (!req.file || !serverName) return res.status(400).send("Missing file or server name");

  try {
    const filePath = req.file.path;
    const fileStream = fs.createReadStream(filePath);
    const fileName = `${serverName}.zip`;

    // Upload to Supabase storage
    const { error } = await supabase.storage
      .from("saves")
      .upload(fileName, fileStream, { upsert: true });

    fs.unlinkSync(filePath); // remove temp file

    if (error) {
      console.error("Supabase upload error:", error.message);
      return res.status(500).send("Failed to upload to Supabase");
    }

    // Initialize player count if not exists
    if (!playerCounts[serverName]) playerCounts[serverName] = 0;

    res.redirect("/"); // back to website
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

// Update player count via API
app.post("/playercount/:serverName", express.json(), (req, res) => {
  const { serverName } = req.params;
  const { count } = req.body;

  if (!serverName || typeof count !== "number") return res.status(400).json({ success: false });

  playerCounts[serverName] = count;
  res.json({ success: true });
});

// Webpage showing server names + player counts
app.get("/", async (req, res) => {
  try {
    // List all saves from Supabase
    const { data, error } = await supabase.storage.from("saves").list("");
    if (error) throw error;

    const servers = data
      .filter(f => !f.name.endsWith(".emptyFolderPlaceholder"))
      .map(f => f.name.replace(".zip", ""));

    const htmlList = servers
      .map(name => `<p><b>${name}</b> - Players: ${playerCounts[name] || 0}</p>`)
      .join("");

    res.send(`
      <h1>Schedule Saves</h1>
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
