// server.js (ESM)
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import ccxt from "ccxt";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = __dirname;

const app = express();
app.use(cors());
app.use(express.static(ROOT)); // sirve index.html y Muro.jpg si están en la raíz

// -------- utils ----------
const timeout = (ms) => new Promise((_, rej)=>setTimeout(()=>rej(new Error("timeout")), ms));
const jfetch = async (url, ms=8000) => {
  const r = await Promise.race([fetch(url, {headers:{'User-Agent':'charly-app'}}), timeout(ms)]);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const toSlashPair = (p) => p?.includes("/") ? p : (p || "").replace("USDT","USDT").replace("ARS","ARS").replace(/([A-Z]+)(USDT|USD|ARS)$/,"$1/$2");

// ========= 1) Dólar ARS (CryptoYa) =========
app.get("/api/dolar", async (_req,res)=>{
  try{
    // fuente: https://criptoya.com/api/dolar
    const d = await jfetch("https://criptoya.com/api/dolar");

    // Normalizo a {ask,bid} porque tu index espera eso
    const num = (v)=> (typeof v === "number" ? v : (v && v.price) ? v.price : null);

    const mep  = d?.mep?.al30?.["24hs"] || d?.mep?.ci;
    const ccl  = d?.ccl?.al30?.["24hs"] || d?.ccl?.ci;
    const blue = d?.blue || {};

    const criptoUSDT = d?.cripto?.usdt || {};
    const criptoUSDC = d?.cripto?.usdc || {};

    const out = {
      oficial: { ask: num(d?.oficial), bid: num(d?.oficial) },
      tarjeta: { ask: num(d?.tarjeta), bid: num(d?.tarjeta) },
      blue:   { ask: blue.ask ?? null, bid: blue.bid ?? null },
      mep:    { ask: num(mep),  bid: num(mep)  },
      ccl:    { ask: num(ccl),  bid: num(ccl)  },
      cripto: {
        ask: criptoUSDT.ask ?? criptoUSDC.ask ?? null,
        bid: criptoUSDT.bid ?? criptoUSDC.bid ?? null
      },
      ts: Date.now()
    };
    res.json(out);
  }catch(e){
    res.json({
      oficial:{ask:null,bid:null}, tarjeta:{ask:null,bid:null},
      blue:{ask:null,bid:null}, mep:{ask:null,bid:null},
      ccl:{ask:null,bid:null}, cripto:{ask:null,bid:null},
      ts: Date.now(), error:"dolar"
    });
  }
});

// ========= 2) Stats 24h (Binance spot) =========
app.get("/api/stats24h", async (req,res)=>{
  try{
    const sym = (req.query.symbol || "BTCUSDT").toUpperCase().replace("/","");
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`;
    const j = await jfetch(url);
    res.json({
      exchange: "Binance",
      last: j?.lastPrice ? Number(j.lastPrice) : null,
      high24h: j?.highPrice ? Number(j.highPrice) : null,
      low24h:  j?.lowPrice  ? Number(j.lowPrice)  : null,
      change24hPct: j?.priceChangePercent ? Number(j.priceChangePercent) : null,
    });
  }catch(e){
    res.json({exchange:"Binance", last:null, high24h:null, low24h:null, change24hPct:null, error:"stats"});
  }
});

// ========= 3) Cotizaciones multi-exchange (ccxt) =========
const EX_LIST = [
  "binance", "okx", "kraken", "bybit", "kucoin", "bitget", "mexc", "gate"
];

app.get("/api/quotes", async (req,res)=>{
  const pairRaw = (req.query.pair || "BTCUSDT").toUpperCase();
  const pair = toSlashPair(pairRaw); // "BTC/USDT"
  try{
    const jobs = EX_LIST.map(async (exId)=>{
      try{
        const ex = new ccxt[exId]({ enableRateLimit:true, timeout: 8000 });
        // Chequeo simple de mercado
        let marketSymbol = pair;
        if (!ex.markets) { try { await ex.loadMarkets(); } catch(_){} }
        if (ex.markets && !ex.markets[marketSymbol]) {
          // intentos de fallback típicos
          const alt = pair.replace("USDT","USD");
          if (ex.markets[alt]) marketSymbol = alt;
          else throw new Error("symbol not listed");
        }
        const t = await ex.fetchTicker(marketSymbol);
        return { exchange: exId, pair: marketSymbol, last: Number(t?.last) || null };
      }catch(_){
        return { exchange: exId, pair, last: null };
      }
    });

    const rows = await Promise.all(jobs);
    res.json(rows);
  }catch(e){
    res.json([]);
  }
});

// ========= fallback: servir index.html desde la raíz =========
function sendIndex(res){
  const candidates = [
    path.join(ROOT, "index.html"),
    path.join(ROOT, "Index.html")
  ];
  const f = candidates.find(p => fs.existsSync(p));
  if (f) return res.sendFile(f);
  res.status(404).send("index.html not found");
}

app.get("/", (_req,res)=>sendIndex(res));
app.get("*", (_req,res)=>sendIndex(res));

// ========= start =========
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`✅ Server on :${PORT}`));
