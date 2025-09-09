// server.js  —  todo en RAÍZ
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import ccxt from "ccxt";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = __dirname;

const app = express();
app.use(cors());
app.use(express.static(ROOT)); // sirve index.html, Muro.jpg, etc.

// --------- API DÓLAR (proxy a CryptoYa) ----------
app.get("/api/dolar", async (_req, res) => {
  try {
    // Endpoint público de CryptoYa (no requiere API key)
    const r = await fetch("https://criptoya.com/api/dolar");
    if (!r.ok) throw new Error("dolar fetch");
    const j = await r.json();

    // Normalizo a la forma que está esperando tu index
    const out = {
      oficial: { ask: j.oficial?.price ?? j?.oficial, bid: j.oficial?.price ?? j?.oficial },
      tarjeta: { ask: j.tarjeta?.price ?? j?.tarjeta, bid: j.tarjeta?.price ?? j?.tarjeta },
      blue:   { ask: j.blue?.ask ?? j.blue?.price ?? j?.blue, bid: j.blue?.bid ?? j?.blue },
      mep:    { ask: j.mep?.al30?.["24hs"]?.price ?? j.mep?.price ?? j?.mep, bid: j.mep?.al30?.["24hs"]?.price ?? j.mep?.price ?? j?.mep },
      ccl:    { ask: j.ccl?.al30?.["24hs"]?.price ?? j.ccl?.price ?? j?.ccl, bid: j.ccl?.al30?.["24hs"]?.price ?? j.ccl?.price ?? j?.ccl },
      cripto: {
        ask: j.cripto?.usdt?.ask ?? j.cripto?.ccb?.ask ?? null,
        bid: j.cripto?.usdt?.bid ?? j.cripto?.ccb?.bid ?? null
      },
      ts: Date.now()
    };
    res.json(out);
  } catch (e) {
    res.json({
      oficial:{ask:null,bid:null}, tarjeta:{ask:null,bid:null}, blue:{ask:null,bid:null},
      mep:{ask:null,bid:null}, ccl:{ask:null,bid:null}, cripto:{ask:null,bid:null}, ts:Date.now()
    });
  }
});

// --------- STATS 24h (siempre BINANCE) ----------
app.get("/api/stats24h", async (req, res) => {
  const raw = (req.query.symbol || "BTCUSDT").toString();
  const symbol = raw.includes("/") ? raw : raw.replace(/(\w+)(USDT|USD|ARS)$/i, "$1/$2");
  try {
    const ex = new ccxt.binance({ enableRateLimit: true });
    await ex.loadMarkets();
    const m = ex.market(symbol);
    const t = await ex.fetchTicker(m.symbol);
    const out = {
      exchange: "Binance",
      last: t.last ?? null,
      high24h: t.high ?? null,
      low24h:  t.low ?? null,
      change24hPct: (t.percentage ?? ((t.open && t.last) ? ((t.last - t.open) / t.open) * 100 : null))
    };
    res.json(out);
  } catch (e) {
    res.json({ exchange: "Binance", last: null, high24h: null, low24h: null, change24hPct: null, error: "stats" });
  }
});

// --------- COTIZACIONES MULTI-EXCHANGE ----------
const EX_IDS = ["binance","coinbase","kraken","bybit","okx"]; // podés sumar luego
function normPair(p){
  if (!p) return "BTC/USDT";
  if (p.includes("/")) return p.toUpperCase();
  const m = p.toUpperCase().match(/^([A-Z]+)(USDT|USD|ARS)$/);
  return m ? `${m[1]}/${m[2]}` : p.toUpperCase();
}
app.get("/api/quotes", async (req, res) => {
  const pair = normPair((req.query.pair || "BTCUSDT").toString());
  const abort = async (exid) => {
    try {
      const ex = new ccxt[exid]({ enableRateLimit: true });
      await ex.loadMarkets();
      if (!ex.markets[pair]) throw 0;
      const t = await ex.fetchTicker(pair);
      return { exchange: exid, pair, last: t.last ?? null };
    } catch {
      return { exchange: exid, pair, last: null };
    }
  };
  const results = await Promise.all(EX_IDS.map(abort));
  res.json(results);
});

// --------- RUTA RAÍZ: sirve index.html ----------
function sendIndex(res){
  const candidates = [path.join(ROOT, "index.html"), path.join(ROOT, "Index.html")];
  const f = candidates.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });
  if (f) return res.sendFile(f);
  res.status(404).send("index.html no encontrado");
}
import fs from "fs";
app.get("/", (_req,res)=>sendIndex(res));
app.get("*", (_req,res)=>sendIndex(res));

// --------- START ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on :${PORT}`));
