// server.js — Backend robusto para Render
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import ccxt from "ccxt";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const PUB  = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.static(ROOT));
if (fs.existsSync(PUB)) app.use(express.static(PUB));

/* ============ API DÓLAR ============ */
async function j(u) {
  const r = await fetch(u, { headers: { accept: "application/json" }, timeout: 12000 });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
}
app.get("/api/dolar", async (_req, res) => {
  try {
    const d = await j("https://criptoya.com/api/dolar");
    const pick = (o) => ({ ask: o?.venta ?? null, bid: o?.compra ?? null });
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
    res.json({ oficial:{},tarjeta:{},blue:{},mep:{},ccl:{},cripto:{},ts:Date.now(),error:"usd_fetch" });
  }
});

/* ============ API Stats 24h (Binance) ============ */
app.get("/api/stats24h", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  try {
    const d = await j(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    const num = (v) => (v==null ? null : +v);
    res.json({
      exchange: "Binance",
      last:    num(d.lastPrice),
      high24h: num(d.highPrice),
      low24h:  num(d.lowPrice),
      change24hPct: d.priceChangePercent ? +(+d.priceChangePercent).toFixed(2) : null
    });
  } catch (e) {
    console.error("stats:", e.message);
    res.json({ exchange:"Binance", last:null, high24h:null, low24h:null, change24hPct:null, error:"stats" });
  }
});

/* ============ API Quotes multi-exchange ============ */
const EX_IDS = [
  "binance","okx","bybit","kucoin","gate","bitget","mexc","bingx",
  "coinbase","kraken","bitfinex","bitstamp","poloniex","coinex","btse",
  "huobi","lbank","ascendex","whitebit","upbit","bitmart","bithumb","zb"
];
function mapSymbolFor(exId, rawSym){
  const s = rawSym.toUpperCase().replace("/","");
  const base = s.endsWith("USDT") ? s.slice(0,-4) : s.slice(0,-3);
  if (["coinbase","kraken","bitfinex","bitstamp","upbit","bithumb"].includes(exId))
    return `${base}/USD`;
  return s.endsWith("USDT") ? `${base}/USDT` : `${base}/USD`;
}
async function pLimitAll(items, limit, worker){
  const out = [];
  let idx = 0;
  const running = [];
  async function runOne(i){ try { out.push(await worker(items[i])); } catch {} }
  while (idx < items.length) {
    const i = idx++;
    const p = runOne(i).finally(()=> running.splice(running.indexOf(p),1));
    running.push(p);
    if (running.length >= limit) await Promise.race(running);
  }
  await Promise.allSettled(running);
  return out;
}
const TTL = 5000;
const cache = new Map();
app.get("/api/quotes", async (req, res) => {
  const raw = (req.query.pair || "BTCUSDT").toUpperCase();
  const now = Date.now();
  const c = cache.get(raw);
  if (c && now - c.ts < TTL) return res.json(c.data);

  const rows = [];
  await pLimitAll(EX_IDS, 5, async (id) => {
    try {
      const C = ccxt[id];
      if (!C) return;
      const ex = new C({ enableRateLimit:true, timeout: 10000 });
      await ex.loadMarkets();
      let sym = mapSymbolFor(id, raw);
      if (!ex.markets[sym]) {
        const base = raw.endsWith("USDT") ? raw.slice(0,-4) : raw.slice(0,-3);
        const cands = [`${base}/USDT`, `${base}/USD`, `${base}/USDC`, `${base}/BUSD`];
        sym = cands.find(s => ex.markets[s]);
        if (!sym) return;
      }
      const t = await ex.fetchTicker(sym);
      if (t && t.last != null) rows.push({ exchange: ex.name, pair: sym, last: +t.last });
    } catch(_) {}
  });

  const prices = rows.map(r=>r.last).filter(Number.isFinite);
  const ref = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : null;
  const data = rows.map(r => ({
      ...r,
      refPrice: ref,
      diffPct: (ref && r.last) ? +(((r.last - ref)/ref)*100).toFixed(2) : null
    }))
    .sort((a,b)=> a.exchange.localeCompare(b.exchange));

  cache.set(raw, { ts: now, data });
  res.json(data);
});

/* ============ Fallback index.html ============ */
app.get("/", (_req, res) => {
  const candidates = [path.join(PUB, "index.html"), path.join(ROOT, "index.html")];
  const file = candidates.find(f => fs.existsSync(f));
  if (file) return res.sendFile(file);
  res.status(500).send("index.html not found");
});
app.get("*", (_req, res) => {
  const candidates = [path.join(PUB, "index.html"), path.join(ROOT, "index.html")];
  const file = candidates.find(f => fs.existsSync(f));
  if (file) return res.sendFile(file);
  res.status(500).send("index.html not found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on :${PORT}`));
