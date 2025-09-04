const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// === Supabase config ===
const SUPABASE_URL = "https://dyifvnvtegtuchrkqsqp.supabase.co"; // replace with your URL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aWZ2bnZ0ZWd0dWNocmtxc3FwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njk0ODY0MiwiZXhwIjoyMDcyNTI0NjQyfQ.YYc9iyinArjf1eiH3zD1jiUZ0THCfMPepnPkDKE3xTs"; // replace with your anon or service key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET_NAME = "saves"; // create this bucket in Supabase Storage

// === Multer setup for temp storage ===
const upload = multer({ dest: "temp/" });

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Upload via webpage form
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file || !req.body.serverName) {
    return res.status(400).send("Missing server name or file.");
  }

  const filePath = req.file.path;
  const fileName = `${req.body.serverName}.zip`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, require("fs").createReadStream(filePath), { upsert: true });

    if (error) throw error;

    // Remove temp file
    require("fs").unlinkSync(filePath);

    res.redirect("/"); // back to list
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed: " + err.message);
  }
});

// API upload for your mod
app.post("/upload/:serverName", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file" });

  const fileName = `${req.params.serverName}.zip`;
  const filePath = req.file.path;

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, require("fs").createReadStream(filePath), { upsert: true });

    if (error) throw error;

    require("fs").unlinkSync(filePath);

    res.json({ success: true, message: "File uploaded", name: fileName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download
app.get("/download/:serverName", async (req, res) => {
  const fileName = `${req.params.serverName}.zip`;

  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(fileName);
  if (error) return res.status(404).send("Not found");

  // Stream file to client
  data.stream().pipe(res);
});

// Webpage list
app.get("/", async (req, res) => {
  const { data: files, error } = await supabase.storage.from(BUCKET_NAME).list();

  if (error) return res.status(500).send("Failed to fetch files");

  let html = `
    <h1>Schedule Saves</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="text" name="serverName" placeholder="Server name" required />
      <input type="file" name="file" accept=".zip" required />
      <button type="submit">Upload Save</button>
    </form>
    <h2>Uploaded Saves</h2>
    <ul>
      ${files.map(f => `<li><a href="/download/${path.basename(f.name, ".zip")}">${f.name}</a></li>`).join("")}
    </ul>
  `;

  res.send(html);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
