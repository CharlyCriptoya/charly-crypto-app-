// server.js
import express from "express";
import fetch from "node-fetch";
import compression from "compression";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());

// estáticos (sirve index.html + Muro.jpeg)
app.use(express.static(__dirname));

// health
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// index
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

/* ====== DÓLAR (ARS) — compra/venta + timestamp ====== */
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { timeout: 12000 });
    const j = await r.json();

    const toNum = (x) => {
      if (x == null) return null;
      if (typeof x === "number") return x;
      if (typeof x === "string") {
        const s = x.replace(/[^\d.,-]/g, "");
        const norm = s.replace(/\./g, "").replace(",", ".");
        const n = Number(norm);
        return isFinite(n) ? n : null;
      }
      if (typeof x === "object") {
        return toNum(x.venta ?? x.sell ?? x.ask ?? x.v ?? x.price ?? x.promedio ?? null);
      }
      return null;
    };
    const both = (node) => ({
      venta: toNum(node?.venta ?? node?.seller ?? node?.ask ?? node?.v ?? node),
      compra: toNum(node?.compra ?? node?.buyer ?? node?.bid ?? node?.p ?? node)
    });

    res.json({
      oficial: both(j?.oficial),
      tarjeta: both(j?.tarjeta ?? j?.solidario ?? j?.qatar),
      blue:    both(j?.blue),
      mep:     both(j?.mep),
      ccl:     both(j?.ccl),
      cripto:  both(j?.cripto ?? j?.crypto ?? j?.usdt ?? j?.usdc),
      ts: Date.now()
    });
  } catch (e) {
    console.error("DOLAR FAIL:", e);
    res.status(500).json({ error: "dolar_fail" });
  }
});

/* ====== Proxy genérico a CriptoYa por par ======
   Ej: /api/cripto/btc/ars  /api/cripto/usdt/ars  /api/cripto/sol/ars */
app.get("/api/cripto/:symbol/:fiat", async (req, res) => {
  const { symbol, fiat } = req.params; // ej: usdt / ars
  try {
    const url = `https://criptoya.com/api/${symbol}/${fiat}`;
    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) throw new Error("http_" + r.status);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    console.error("CRIPTOYA FAIL:", req.params, e);
    res.status(500).json({ error: "criptoya_fail" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Charly Cripto • MVP en :${PORT}`));
