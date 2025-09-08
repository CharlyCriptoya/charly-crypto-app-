// server.js — Backend robusto para Render
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fetch from "node-fetch";           // Node 18+ ya tiene fetch, pero lo dejamos por compat
import ccxt from "ccxt";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const ROOT = __dirname;
const PUB  = path.join(__dirname, "public");

app.use(cors());

// ======== ESTÁTICOS: sirve raíz y /public (evita ENOENT del index) ========
app.use(express.static(ROOT));
if (fs.existsSync(PUB)) app.use(express.static(PUB));

// ----------------------- HELPERS -----------------------
async function j(url) {
  const r = await fetch(url, { headers: { accept: "application/json" }, timeout: 15000 });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const num = (v) => (v == null ? null : +v);

// ----------------------- 1) DÓLAR ----------------------
app.get("/api/dolar", async (_req, res) => {
  try {
    const d = await j("https://criptoya.com/api/dolar");
    const pick = (o) => ({ ask: num(o?.venta), bid: num(o?.compra) });
    res.json({
      oficial: pick(d.oficial || d.official || {}),
      tarjeta: pick(d.tarjeta || d.solidario || {}),
      blue:    pick(d.blue || {}),
      mep:     pick(d.mep || {}),
      ccl:     pick(d.ccl || {}),
      cripto:  pick(d.cripto || d.crypto || {}),
      ts: Date.now()
    });
  } catch (e) {
    console.error("usd:", e.message);
    res.status(200).json({ oficial:{}, tarjeta:{}, blue:{}, mep:{}, ccl:{}, cripto:{}, ts: Date.now(), error: "usd_fetch" });
  }
});

// -------------------- 2) Stats 24h (Binance) --------------------
app.get("/api/stats24h", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  try {
    const d = await j(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    res.json({
      exchange: "Binance",
      last:    num(d.lastPrice),
      high24h: num(d.highPrice),
      low24h:  num(d.lowPrice),
      change24hPct: d.priceChangePercent ? +(+d.priceChangePercent).toFixed(2) : null
    });
  } catch (e) {
    console.error("stats:", e.message);
    res.status(200).json({ exchange:"Binance", last:null, high24h:null, low
