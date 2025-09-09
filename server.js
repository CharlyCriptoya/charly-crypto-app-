// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ====== STATIC (sirve index.html, muro.jpg, etc. desde la raíz) ======
app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ---------- HELPERS ----------
const toPairPath = (symbol = "BTCUSDT") => {
  // BTCUSDT, ETHUSDT, USDTARS, USDCARS, etc.
  const s = symbol.toUpperCase();
  const knownQuotes = ["USDT", "USDC", "BTC", "ETH", "ARS", "BUSD"];
  const quote = knownQuotes.find(q => s.endsWith(q)) || "USDT";
  const base = s.slice(0, s.length - quote.length);
  return `${base.toLowerCase()}/${quote.toLowerCase()}`; // ej: btc/usdt
};

// ---------- ENDPOINTS ----------

// Dólar (dejamos tu endpoint tal como lo tenías; si ya te funciona, mantenelo)
// Si lo querés desde CryptoYa, descomentá esto y comentá tu versión:
/*
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar");
    const j = await r.json();
    // Normalizo a tu frontend (ask/bid en cada tipo)
    const out = {
      oficial: { ask: j.oficial?.venta, bid: j.oficial?.compra },
      tarjeta: { ask: j.tarjeta?.venta, bid: j.tarjeta?.compra },
      blue:    { ask: j.blue?.venta,    bid: j.blue?.compra },
      mep:     { ask: j.mep?.venta,     bid: j.mep?.compra },
      ccl:     { ask: j.ccl?.venta,     bid: j.ccl?.compra },
      cripto:  { ask: j.crypto?.venta,  bid: j.crypto?.compra },
      ts: Date.now()
    };
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "dolar_fail" });
  }
});
*/

// QUOTES multi-exchange desde CryptoYa
// GET /api/quotes?pair=BTCUSDT
app.get("/api/quotes", async (req, res) => {
  const pair = String(req.query.pair || "BTCUSDT").toUpperCase();
  const pp = toPairPath(pair); // ej: btc/usdt
  try {
    const url = `https://criptoya.com/api/${pp}/0.1`;
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json(); // objeto por exchange

    // Lo transformo a filas homogéneas para tu tabla
    const rows = Object.entries(data).map(([exchange, o]) => ({
      exchange,
      pair: `${pair.slice(0, pair.length - (pp.endsWith("ars") ? 3 : 4))}/${pp.endsWith("ars") ? "ARS" : "USDT"}`,
      last: o.last ?? o.price ?? o.venta ?? o.compra ?? null, // lo más común en CryptoYa
      ask:  o.ask  ?? o.venta ?? null,
      bid:  o.bid  ?? o.compra ?? null
    }));

    // Ordeno por last desc (si existe)
    rows.sort((a,b) => (b.last ?? 0) - (a.last ?? 0));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "quotes_fail" });
  }
});

// (Opcional) stats 24h si lo querés seguir usando desde tu server
// lo dejamos como lo tenías; no toco nada aquí.

// ---------- START ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server on :${PORT}`));
