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

// Multer setup (temporary uploads to memory)
const upload = multer({ storage: multer.memoryStorage() });

// Parse form fields
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Upload via webpage form or API
app.post("/upload", upload.single("saveFile"), async (req, res) => {
  const serverName = req.body.serverName;
  const file = req.file;

  if (!serverName || !file) {
    return res.status(400).send("Missing server name or file.");
  }

  try {
    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from("saves")
      .upload(`${serverName}.zip`, file.buffer, { upsert: true });

    if (error) {
      console.error("Supabase upload error:", error);
      return res.status(500).send("Failed to upload to Supabase.");
    }

    console.log(`File uploaded to Supabase: ${serverName}.zip`);
    res.send(`<p>Upload successful! <a href="/list">Go to list</a></p>`);
  } catch (ex) {
    console.error("Exception during upload:", ex);
    res.status(500).send("Internal server error");
  }
});

// List uploaded servers
app.get("/list", async (req, res) => {
  try {
    const { data, error } = await supabase.storage.from("saves").list();

    if (error) {
      console.error("Supabase list error:", error);
      return res.status(500).send("Failed to fetch server list.");
    }

    if (!data || data.length === 0) {
      return res.send("<p>No servers uploaded yet.</p>");
    }

    // Display server names in bold
    const htmlList = data.map(f => `<p><b>${path.basename(f.name, ".zip")}</b></p>`).join("");

    res.send(`
      <h2>Uploaded Servers</h2>
      ${htmlList}
      <br><a href="/">Back to Upload</a>
    `);
  } catch (ex) {
    console.error("Exception fetching server list:", ex);
    res.status(500).send("Internal server error");
  }
});

// Serve upload page
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
