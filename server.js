const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase setup
const supabaseUrl = "https://dyifvnvtegtuchrkqsqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aWZ2bnZ0ZWd0dWNocmtxc3FwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk0ODY0MiwiZXhwIjoyMDcyNTI0NjQyfQ.YYc9iyinArjf1eiH3zD1jiUZ0THCfMPepnPkDKE3xTs"; // use a Service Role key
const supabase = createClient(supabaseUrl, supabaseKey);
const SUPABASE_BUCKET = "saves";

// --- Multer setup ---
const upload = multer({ dest: "temp_uploads/" }); // temp folder for processing
if (!fs.existsSync("temp_uploads")) fs.mkdirSync("temp_uploads");

// --- Parse form fields ---
app.use(express.urlencoded({ extended: true }));

// --- Webpage upload form ---
app.get("/", (req, res) => {
  res.send(`
    <h1>Schedule Saves</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="text" name="serverName" placeholder="Server name" required />
      <input type="file" name="saveFile" accept=".zip" required />
      <button type="submit">Upload Save</button>
    </form>
    <br>
    <a href="/list">View Uploaded Servers</a>
  `);
});

// --- Upload handler (webpage form) ---
app.post("/upload", upload.single("saveFile"), async (req, res) => {
  if (!req.file || !req.body.serverName) {
    return res.status(400).send("Missing server name or file.");
  }

  const serverName = req.body.serverName;
  const filePath = req.file.path;
  const fileName = `${serverName}.zip`;

  try {
    // Upload to Supabase storage
    const fileBuffer = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, fileBuffer, { upsert: true });

    fs.unlinkSync(filePath); // remove temp file

    if (error) throw error;

    res.redirect("/list");
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed: " + err.message);
  }
});

// --- API upload for mods ---
app.post("/upload/:serverName", upload.single("saveFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file" });

  const serverName = req.params.serverName;
  const filePath = req.file.path;
  const fileName = `${serverName}.zip`;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, fileBuffer, { upsert: true });

    fs.unlinkSync(filePath);

    if (error) throw error;

    res.json({ success: true, message: "Upload successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Download by server name ---
app.get("/download/:serverName", async (req, res) => {
  const fileName = `${req.params.serverName}.zip`;

  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .download(fileName);

  if (error || !data) return res.status(404).send("Server not found");

  res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
  data.stream().pipe(res);
});

// --- List servers ---
app.get("/list", async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list("", { limit: 100 });

    if (error) throw error;

    const visibleFiles = files.filter(f => f.name.endsWith(".zip") && !f.name.startsWith("."));

    const htmlList = visibleFiles
      .map(f => {
        const serverName = path.basename(f.name, ".zip");
        return `<p><b>${serverName}</b> - <a href="/download/${serverName}">Download</a></p>`;
      })
      .join("");

    res.send(`
      <h2>Uploaded Servers</h2>
      ${htmlList || "<p>No servers uploaded yet.</p>"}
      <br><a href="/">Back to Upload</a>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to list servers: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
