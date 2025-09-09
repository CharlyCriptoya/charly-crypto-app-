import express from "express";
import compression from "compression";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());

// sirve todo lo que está en la raíz (incluye Muro.jpg e index.html)
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// healthcheck para Render
app.get("/healthz", (_, res) => res.type("text").send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("UP on", PORT));
