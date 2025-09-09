// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors";
import ccxt from "ccxt";

// Paths básicos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const PUB = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.static(ROOT));
if (fs.existsSync(PUB)) app.use(express.static(PUB));

// ===== Helper para símbolos CCXT =====
const QUOTES = ["USDT","USDC","USD","ARS","BTC","ETH","DAI"];
function toCcxtPair(sym) {
  for (const q of QUOTES) {
    if (sym.endsWith(q) && sym.length > q.length) {
      const base = sym.slice(0, sym.length - q.length);
      return `${base}/${q}`;
    }
  }
  return sym.includes("/") ? sym : sym;
}

// ===== API: Cotizaciones del dólar =====
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { timeout: 8000 });
    const j = await r.json();
    const out = {
      oficial: j.oficial ?? {},
      tarjeta: j.tarjeta ?? {},
      blue:    j.blue    ?? {},
      mep:     j.mep     ?? {},
      ccl:     j.ccl     ?? {},
      cripto:  j.usdt    ?? j.cripto ?? {},
      ts: Date.now()
    };
    res.json(out);
  } catch (e) {
    console.error("dolar error", e);
    res.json({ oficial:{}, tarjeta:{}, blue:{}, mep:{}, ccl:{}, cripto:{}, ts: Date.now() });
  }
});

// ===== API: Stats 24h (Binance) =====
app.get("/api/stats24h", async (req, res) => {
  const sym = toCcxtPair((req.query.symbol || "BTCUSDT").toUpperCase());
  try {
    const ex = new ccxt.binance();
    const t = await ex.fetchTicker(sym);
    res.json({
      exchange: "Binance",
      last: t.last ?? null,
      high24h: t.high ?? null,
      low24h: t.low ?? null,
      change24hPct: t.percentage ?? null
    });
  } catch (e) {
    console.error("stats", sym, e.message);
    res.json({ exchange:"Binance", last:null, high24h:null, low24h:null, change24hPct:null, error:"stats" });
  }
});

// ===== API: Quotes multi-exchange =====
const EXS = [
  ["binance",  () => new ccxt.binance()],
  ["coinbase", () => new ccxt.coinbase()],
  ["kraken",   () => new ccxt.kraken()],
  ["bybit",    () => new ccxt.bybit()],
  ["okx",      () => new ccxt.okx()],
];

app.get("/api/quotes", async (req, res) => {
  const raw = (req.query.pair || "BTCUSDT").toUpperCase();
  const pair = toCcxtPair(raw);

  const jobs = EXS.map(async ([name, make]) => {
    try {
      const ex = make();
      const t = await ex.fetchTicker(pair);
      return { exchange: name, pair, last: t.last ?? null };
    } catch {
      return { exchange: name, pair, last: null };
    }
  });

  const rows = await Promise.all(jobs);
  res.json(rows);
});

// ===== Fallback: index.html =====
function sendIndex(res) {
  const cands = [path.join(ROOT,"index.html"), path.join(PUB,"index.html")];
  const f = cands.find(p => fs.existsSync(p));
  if (f) return res.sendFile(f);
  res.status(500).send("index.html not found");
}

app.get("/", (_req,res)=>sendIndex(res));
app.get("*", (_req,res)=>sendIndex(res));

// ===== Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`✅ Server on :${PORT}`));
