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

// Multer setup for temporary storage
const upload = multer({ dest: "tmp/" });

// Parse form fields
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Home page with upload form
app.get("/", (req, res) => {
  res.send(`
    <h2>Upload Save</h2>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <label>Server Name: <input type="text" name="serverName" required></label><br><br>
      <label>Save File (zip): <input type="file" name="saveFile" required></label><br><br>
      <button type="submit">Upload</button>
    </form>
    <br>
    <a href="/list">View Uploaded Servers</a>
  `);
});

// Upload via webpage form
app.post("/upload", upload.single("saveFile"), async (req, res) => {
  if (!req.file || !req.body.serverName) {
    return res.status(400).send("Missing server name or file.");
  }

  const serverName = req.body.serverName;
  const filePath = req.file.path;
  const fileBuffer = fs.readFileSync(filePath);

  // Upload to Supabase
  const { data, error } = await supabase.storage
    .from("saves")
    .upload(`${serverName}.zip`, fileBuffer, { upsert: true });

  // Remove temp file
  fs.unlinkSync(filePath);

  if (error) {
    console.error("Supabase upload error:", error);
    return res.status(500).send("Failed to upload to Supabase.");
  }

  res.send(`<p>Upload successful! <a href="/list">Go to list</a></p>`);
});

// API upload
app.post("/upload/:serverName", upload.single("saveFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file" });

  const serverName = req.params.serverName;
  const fileBuffer = fs.readFileSync(req.file.path);

  const { data, error } = await supabase.storage
    .from("saves")
    .upload(`${serverName}.zip`, fileBuffer, { upsert: true });

  fs.unlinkSync(req.file.path);

  if (error) {
    console.error("Supabase upload error:", error);
    return res.status(500).json({ success: false, message: "Failed to upload to Supabase" });
  }

  res.json({ success: true, message: "File uploaded" });
});

// List all servers
app.get("/list", async (req, res) => {
  const { data: files, error } = await supabase.storage.from("saves").list();

  if (error) return res.status(500).send("Failed to list files.");

  const htmlList = files.map(f => `<p><b>${path.basename(f.name, ".zip")}</b></p>`).join("");

  res.send(`
    <h2>Uploaded Servers</h2>
    ${htmlList || "<p>No servers uploaded yet.</p>"}
    <br><a href="/">Back to Upload</a>
  `);
});

// Download by server name
app.get("/download/:serverName", async (req, res) => {
  const serverName = req.params.serverName;

  const { data, error } = await supabase.storage
    .from("saves")
    .download(`${serverName}.zip`);

  if (error) return res.status(404).send("Server not found");

  res.setHeader("Content-Disposition", `attachment; filename=${serverName}.zip`);
  data.body.pipe(res);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
