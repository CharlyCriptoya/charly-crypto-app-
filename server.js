// server.js
import express from "express";
import fetch from "node-fetch";
import compression from "compression";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

// estáticos + index
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// ──────────────────────────────────────────────────────────────
// EXCHANGES y ADAPTERS (precio en USD/USDT de pares)
// ──────────────────────────────────────────────────────────────
const EXCHANGES = [
  { id:"binance", name:"Binance" },
  { id:"bybit",   name:"Bybit" },
  { id:"okx",     name:"OKX" },
  { id:"kucoin",  name:"KuCoin" },
  { id:"bitget",  name:"Bitget" },
  { id:"mexc",    name:"MEXC" }
];
app.get("/api/exchanges", (_, res) => res.json(EXCHANGES));

const ok = r => r && r.status >= 200 && r.status < 300;
const j  = r => r.json();

const adapters = {
  binance: async (symbol) => {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!ok(r)) throw new Error("binance");
    const { price } = await j(r); return +price;
  },
  bybit: async (symbol) => {
    const r = await fetch(`https://api.bybit.com/v2/public/tickers?symbol=${symbol}`);
    if (!ok(r)) throw new Error("bybit");
    const d = await j(r); return +d.result[0].last_price;
  },
  okx: async (symbol) => {
    const instId = symbol.replace("USDT","-USDT");
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    if (!ok(r)) throw new Error("okx");
    const d = await j(r); return +d.data[0].last;
  },
  kucoin: async (symbol) => {
    const inst = symbol.replace("USDT","-USDT");
    const r = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${inst}`);
    if (!ok(r)) throw new Error("kucoin");
    const d = await j(r); return +d.data.price;
  },
  bitget: async (symbol) => {
    const r = await fetch(`https://api.bitget.com/api/spot/v1/market/ticker?symbol=${symbol}`);
    if (!ok(r)) throw new Error("bitget");
    const d = await j(r); return +d.data.close;
  },
  mexc: async (symbol) => {
    const r = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!ok(r)) throw new Error("mexc");
    const d = await j(r); return +d.price;
  }
};

// GET /api/price?exchange=binance&pair=BTCUSDT
app.get("/api/price", async (req, res) => {
  try {
    const ex   = String(req.query.exchange||"").toLowerCase();
    const pair = String(req.query.pair||"BTCUSDT").toUpperCase();
    if (!adapters[ex]) return res.status(400).json({ error:"exchange no soportado" });
    const usd = await adapters[ex](pair);
    res.json({ exchange: ex, pair, usd });
  } catch (e) {
    res.status(500).json({ error: e.message||"fetch error" });
  }
});

// ──────────────────────────────────────────────────────────────
// TASAS DÓLAR (para ARS). Base simple + modo manual.
// ──────────────────────────────────────────────────────────────
let manualRate = null;
// GET /api/rates  ó  /api/rates?source=manual&value=1500
app.get("/api/rates", (req, res) => {
  const src = String(req.query.source||"default");
  const val = req.query.value ? Number(req.query.value) : null;

  if (src==="manual" && val){
    manualRate = val;
    return res.json({
      source:"manual",
      oficial: Math.round(val*0.85),
      blue:    Math.round(val*0.92),
      mep:     Math.round(val*0.98),
      ccl:     Math.round(val*1.02),
      cripto:  val
    });
  }

  const base = manualRate || 1400; // valor inicial
  res.json({
    source: manualRate?"manual":"default",
    oficial: Math.round(base*0.85),
    blue:    Math.round(base*0.92),
    mep:     Math.round(base*0.98),
    ccl:     Math.round(base*1.02),
    cripto:  base
  });
});

// healthcheck
app.get("/healthz", (_, res) => res.type("text").send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("UP on", PORT));
