const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Multer setup
const upload = multer({ dest: "uploads/" });

// Directory to store saves
const saveDir = path.join(__dirname, "saves");
if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// Upload via webpage form
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file || !req.body.serverName) {
    return res.status(400).send("Missing server name or file.");
  }

  const targetPath = path.join(saveDir, `${req.body.serverName}.zip`);
  fs.renameSync(req.file.path, targetPath);

  res.redirect("/"); // back to homepage after upload
});

// API upload for mod
app.post("/upload/:serverName", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file" });

  const targetPath = path.join(saveDir, `${req.params.serverName}.zip`);
  fs.renameSync(req.file.path, targetPath);

  res.json({ success: true, message: "File uploaded", path: targetPath });
});

// Download by server name
app.get("/download/:serverName", (req, res) => {
  const filePath = path.join(saveDir, `${req.params.serverName}.zip`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "Not found" });

  res.download(filePath);
});

// Homepage with upload form
app.get("/", (req, res) => {
  let html = `
    <h1>Upload a Schedule Save</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="text" name="serverName" placeholder="Server name" required />
      <input type="file" name="file" accept=".zip" required />
      <button type="submit">Upload Save</button>
    </form>
    <br>
    <a href="/list">View Uploaded Servers</a>
  `;
  res.send(html);
});

// List all uploaded servers
app.get("/list", (req, res) => {
  const files = fs.readdirSync(saveDir).filter(f => f.endsWith(".zip"));

  let htmlList = files.map(f => {
    const name = path.basename(f, ".zip");
    return `<li><b>${name}</b> - <a href="/download/${name}">Download</a></li>`;
  }).join("");

  res.send(`
    <h1>Uploaded Servers</h1>
    <ul>
      ${htmlList || "<li>No saves uploaded yet.</li>"}
    </ul>
    <br>
    <a href="/">Back to Upload</a>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
