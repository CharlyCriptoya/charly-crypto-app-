// server.js (final, robusto)
import express from "express";
import compression from "compression";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());

// 1) Servir estáticos desde la raíz
app.use(express.static(__dirname, { index: "index.html" }));

// 2) Ruta raíz explícita
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 3) Proxy para CORS
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "url param required" });
  try {
    const r = await fetch(url);
    const ct = r.headers.get("content-type") || "text/plain";
    const body = await r.text();
    res.set("content-type", ct).send(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4) Healthcheck
app.get(["/health", "/healthz"], (_req, res) => res.send("ok"));

// 5) Catch-all (por si navegás a /otra-ruta)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on " + PORT));
