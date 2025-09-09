// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;                // raíz del proyecto
const PUB  = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.static(ROOT));         // sirve la raíz (index.html acá)
if (fs.existsSync(PUB)) app.use(express.static(PUB)); // opcional: también /public

// fetch con timeout
function abortableFetch(url, ms = 10000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    headers: { "accept": "application/json", "user-agent": "Mozilla/5.0", ...headers }
  }).finally(() => clearTimeout(t));
}

/* ====== /api/dolar (CriptoYa) ====== */
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await abortableFetch("https://criptoya.com/api/dolar", 10000);
    if (!r.ok) throw new Error("criptoya " + r.status);
    const d = await r.json();
    const pick = (o = {}) => ({ ask: o.venta ?? o.ask ?? null, bid: o.compra ?? o.bid ?? null });
    res.json({
      oficial: pick(d.oficial ?? d.official),
      tarjeta: pick(d.tarjeta ?? d.solidario),
      blue:    pick(d.blue),
      mep:     pick(d.mep),
      ccl:     pick(d.ccl),
      cripto:  pick(d.cripto ?? d.crypto),
      ts: Date.now()
    });
  } catch (e) {
    console.error("usd:", e.message);
    res.json({oficial:{},tarjeta:{},blue:{},mep:{},ccl:{},cripto:{},ts:Date.now(),error:"usd_fetch"});
  }
});

/* ====== /api/stats24h (Binance) ====== */
app.get("/api/stats24h", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  try {
    const r = await abortableFetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, 10000);
    if (!r.ok) throw new Error("binance " + r.status);
    const d = await r.json();
    const num = v => (v==null ? null : +v);
    res.json({
      exchange: "Binance",
      last:    num(d.lastPrice),
      high24h: num(d.highPrice),
      low24h:  num(d.lowPrice),
      change24hPct: d.priceChangePercent ? +(+d.priceChangePercent).toFixed(2) : null
    });
  } catch (e) {
    console.error("stats:", e.message);
    res.json({exchange:"Binance",last:null,high24h:null,low24h:null,change24hPct:null,error:"stats"});
  }
});

/* ====== /api/quotes (multi-exchange sin ccxt) ====== */
function normPair(input="BTCUSDT"){
  const s = input.toUpperCase().replace("/","");
  const base = s.endsWith("USDT") ? s.slice(0,-4) : s.slice(0,-3);
  const quote = s.endsWith("USDT") ? "USDT" : "USD";
  return { base, quote };
}
app.get("/api/quotes", async (req, res) => {
  const { base, quote } = normPair(req.query.pair || "BTCUSDT");

  const tasks = [
    // Binance
    (async ()=>{ const r=await abortableFetch(`https://api.binance.com/api/v3/ticker/price?symbol=${base}${quote}`);
      if(!r.ok) throw 0; const j=await r.json();
      return { exchange:"Binance", pair:`${base}/${quote}`, last:+j.price }; })(),
    // Coinbase (solo USD)
    (async ()=>{ const q = quote==="USDT" ? "USD" : quote;
      const r=await abortableFetch(`https://api.coinbase.com/v2/prices/${base}-${q}/spot`);
      if(!r.ok) throw 0; const j=await r.json();
      return { exchange:"Coinbase", pair:`${base}/${q}`, last:+j.data.amount }; })(),
    // Kraken (BTC=XBT)
    (async ()=>{ const b = base==="BTC" ? "XBT" : base;
      const q = quote==="USDT" ? "USD" : quote;
      const r=await abortableFetch(`https://api.kraken.com/0/public/Ticker?pair=${b}${q}`);
      if(!r.ok) throw 0; const j=await r.json(); const k=Object.keys(j.result||{})[0];
      if(!k) throw 0; return { exchange:"Kraken", pair:`${b}/${q}`, last:+j.result[k].c[0] }; })(),
    // Bitfinex
    (async ()=>{ const q = quote==="USDT" ? "USD" : quote;
      const r=await abortableFetch(`https://api-pub.bitfinex.com/v2/ticker/t${base}${q}`);
      if(!r.ok) throw 0; const j=await r.json();
      return { exchange:"Bitfinex", pair:`${base}/${q}`, last:+j[6] }; })(),
    // Bitstamp
    (async ()=>{ const q = quote==="USDT" ? "USD" : quote;
      const r=await abortableFetch(`https://www.bitstamp.net/api/v2/ticker/${base.toLowerCase()}${q.toLowerCase()}`);
      if(!r.ok) throw 0; const j=await r.json();
      return { exchange:"Bitstamp", pair:`${base}/${q}`, last:+j.last }; })(),
    // OKX (index)
    (async ()=>{ const r=await abortableFetch(`https://www.okx.com/api/v5/market/index-tickers?instId=${base}-${quote}`);
      if(!r.ok) throw 0; const j=await r.json(); const it=(j.data||[])[0];
      if(!it) throw 0; return { exchange:"OKX", pair:`${base}/${quote}`, last:+it.idxPx }; })(),
    // Bybit (spot)
    (async ()=>{ const r=await abortableFetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${base}${quote}`);
      if(!r.ok) throw 0; const j=await r.json(); const it=(j.result?.list||[])[0];
      if(!it) throw 0; return { exchange:"Bybit", pair:`${base}/${quote}`, last:+it.lastPrice }; })(),
  ];

  const settled = await Promise.allSettled(tasks);
  const rows = settled.filter(x => x.status === "fulfilled" && Number.isFinite(x.value.last)).map(x => x.value);
  const ref = rows.length ? rows.reduce((a,b)=>a+b.last,0)/rows.length : null;
  const out = rows.map(r => ({
    ...r,
    refPrice: ref,
    diffPct: (ref && r.last) ? +(((r.last-ref)/ref)*100).toFixed(2) : null
  })).sort((a,b)=> a.exchange.localeCompare(b.exchange));

  res.json(out);
});

/* ====== fallback a index.html ====== */
function sendIndex(res){
  const cands = [path.join(ROOT,"index.html"), path.join(PUB,"index.html")];
  const f = cands.find(p=>fs.existsSync(p));
  if (f) return res.sendFile(f);
  res.status(500).send("index.html not found");
}
app.get("/", (_req,res)=>sendIndex(res));
app.get("*", (_req,res)=>sendIndex(res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on :${PORT}`));
