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

// Multer setup (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Parse form fields
app.use(express.urlencoded({ extended: true }));

// Home page
app.get("/", (req, res) => {
  res.send(`
    <h2>Upload Save</h2>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <label>Server Name: <input type="text" name="serverName" required></label><br><br>
      <label>Save File (.zip): <input type="file" name="saveFile" required></label><br><br>
      <button type="submit">Upload</button>
    </form>
    <br>
    <a href="/list">View Uploaded Servers</a>
  `);
});

// Upload handler (web form)
app.post("/upload", upload.single("saveFile"), async (req, res) => {
  try {
    const serverName = req.body.serverName;
    const file = req.file;

    if (!serverName || !file) {
      return res.status(400).send("Missing server name or file.");
    }

    const fileName = `${serverName}.zip`;

    const { data, error } = await supabase.storage
      .from("saves")
      .upload(fileName, file.buffer, { upsert: true });

    if (error) {
      console.error("Supabase upload error:", error);
      return res.status(500).send("Supabase upload failed: " + JSON.stringify(error));
    }

    console.log(`Upload successful: ${fileName}`);
    res.send(`<p>Upload successful! <a href="/list">View servers</a></p>`);
  } catch (ex) {
    console.error("Upload exception:", ex);
    res.status(500).send("Internal server error");
  }
});

// List all servers
app.get("/list", async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage.from("saves").list();

    if (error) {
      console.error("Supabase list error:", error);
      return res.status(500).send("Failed to list servers: " + JSON.stringify(error));
    }

    if (!files || files.length === 0) {
      return res.send("<p>No servers uploaded yet.</p><br><a href='/'>Back to Upload</a>");
    }

    const htmlList = files
      .map(f => `<p><b>${f.name.replace(".zip", "")}</b> - <a href="/download/${f.name}">Download</a></p>`)
      .join("");

    res.send(`<h2>Uploaded Servers</h2>${htmlList}<br><a href="/">Back to Upload</a>`);
  } catch (ex) {
    console.error("List exception:", ex);
    res.status(500).send("Internal server error");
  }
});

// Download by file name
app.get("/download/:fileName", async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const { data, error } = await supabase.storage.from("saves").download(fileName);

    if (error || !data) {
      console.error("Supabase download error:", error);
      return res.status(404).send("File not found");
    }

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    data.arrayBuffer().then(buffer => {
      res.send(Buffer.from(buffer));
    });
  } catch (ex) {
    console.error("Download exception:", ex);
    res.status(500).send("Internal server error");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
