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

// Multer setup (store temporarily in memory)
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --- Upload via webpage ---
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file || !req.body.serverName) {
    return res.status(400).send("Missing server name or file.");
  }

  const serverName = req.body.serverName;
  const fileName = `${serverName}-${Date.now()}${path.extname(req.file.originalname)}`;

  try {
    const { error } = await supabase.storage
      .from("saves") // the bucket name
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

    if (error) throw error;

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to upload to Supabase Storage.");
  }
});

// --- Download ---
app.get("/download/:serverName", async (req, res) => {
  const serverName = req.params.serverName;

  try {
    const { data, error } = await supabase.storage
      .from("saves")
      .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

    if (error) throw error;

    // Pick the latest file that starts with the serverName
    const file = data.find(f => f.name.startsWith(serverName));
    if (!file) return res.status(404).send("File not found");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("saves")
      .download(file.name);

    if (downloadError) throw downloadError;

    res.setHeader("Content-Disposition", `attachment; filename=${file.name}`);
    fileData.stream().pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to download file.");
  }
});

// --- List uploaded servers ---
app.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.storage
      .from("saves")
      .list("", { limit: 100 });

    if (error) throw error;

    const htmlList = data
      .map(file => `<p><b>${file.name.split("-")[0]}</b></p>`)
      .join("");

    res.send(`
      <h1>Schedule Saves</h1>
      <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="text" name="serverName" placeholder="Server name" required />
        <input type="file" name="file" accept=".zip" required />
        <button type="submit">Upload Save</button>
      </form>
      <h2>Uploaded Saves</h2>
      ${htmlList || "<p>No saves uploaded yet.</p>"}
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch list.");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
