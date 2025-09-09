import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import ccxt from "ccxt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ------- sirve desde la RAÍZ -------
app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

// =========== DÓLAR ===========
// Fuente principal: dolarapi.com
// Fallback: criptoya.com
app.get("/api/dolar", async (_req, res) => {
  const norm = (o) => ({ ask: o?.venta ?? null, bid: o?.compra ?? null });

  const fromDolarApi = async () => {
    // https://dolarapi.com/v1/dolares  -> [ { casa, compra, venta }, ... ]
    const r = await fetch("https://dolarapi.com/v1/dolares", { cache: "no-store" });
    const arr = await r.json();
    const by = (name) => arr.find(x => (x.casa || x.nombre || "").toLowerCase().includes(name));
    return {
      oficial: norm(by("oficial")),
      tarjeta: norm(by("tarjeta")),
      blue:    norm(by("blue")),
      mep:     norm(by("bolsa")),            // MEP/Bolsa
      ccl:     norm(by("contado con liqui")),// CCL
      cripto:  norm(by("cripto") || {}),     // si existe en esa API
      ts: Date.now(),
      src: "dolarapi"
    };
  };

  const fromCriptoYa = async () => {
    // https://criptoya.com/api/dolar -> {oficial:{compra,venta}, blue:{...}, ccl:{...}, mep:{...}, cripto:{...}}
    const r = await fetch("https://criptoya.com/api/dolar", { headers:{accept:"application/json"}, cache:"no-store" });
    const d = await r.json();
    const pick = (o) => ({ ask: o?.venta ?? null, bid: o?.compra ?? null });
    return {
      oficial: pick(d.oficial || d.official || {}),
      tarjeta: pick(d.tarjeta || d.solidario || {}),
      blue:    pick(d.blue || {}),
      mep:     pick(d.mep || {}),
      ccl:     pick(d.ccl || {}),
      cripto:  pick(d.cripto || d.crypto || {}),
      ts: Date.now(),
      src: "criptoya"
    };
  };

  try {
    let out = null;
    try { out = await fromDolarApi(); } catch {}
    if (!out || Object.values(out).every(v => v && v.ask==null && v.bid==null)) {
      out = await fromCriptoYa();
    }
    res.json(out);
  } catch (e) {
    console.error("usd:", e);
    res.status(200).json({ oficial:{}, tarjeta:{}, blue:{}, mep:{}, ccl:{}, cripto:{}, ts:Date.now(), error:"usd_fetch" });
  }
});

// =========== QUOTES multi-exchange (CCXT) ===========
//
// Llama a muchos exchanges en paralelo y devuelve última cotización en USD.
// Front lo convierte a ARS usando el "dólar cripto".
//
const EX_IDS = [
  "binance","okx","bybit","kraken","coinbase","kucoin","bitfinex","bitstamp",
  "gate","mexc","bitget","huobi","poloniex","phemex","bingx","gemini"
];

app.get("/api/quotes", async (req, res) => {
  const pair = (req.query.pair || "BTCUSDT").toUpperCase();
  // CCXT usa el formato con barra
  const unified = pair.includes("/") ? pair : (pair.replace("USDT","USDT").slice(0,3)+"/"+pair.slice(3));

  const tasks = EX_IDS.map(async (id) => {
    try {
      const exClass = ccxt[id];
      if (!exClass) return null;
      const ex = new exClass({ enableRateLimit: true, timeout: 15000 });
      const markets = await ex.loadMarkets();
      // Buscar símbolo equivalente (ej: BTC/USDT o variantes)
      const symbol = markets[unified] ? unified
                   : Object.keys(markets).find(s => s.replace(/[-_]/g,"") === unified.replace("/",""));
      if (!symbol) return null;
      const t = await ex.fetchTicker(symbol);
      const last = t?.last ?? t?.close ?? null;
      return last ? { exchange: ex.id, pair: symbol.replace("/",""), last_usd: +last } : null;
    } catch {
      return null;
    }
  });

  try {
    const settled = await Promise.allSettled(tasks);
    const rows = settled
      .map(x => x.status === "fulfilled" ? x.value : null)
      .filter(Boolean)
      .sort((a,b) => a.exchange.localeCompare(b.exchange));
    res.json(rows);
  } catch (e) {
    console.error("quotes:", e);
    res.status(200).json([]);
  }
});

// =========== STATS 24h (Binance) ===========
app.get("/api/stats24h", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  try{
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { cache:"no-store" });
    const d = await r.json();
    res.json({
      exchange: "Binance",
      last: +d.lastPrice || null,
      high24h: +d.highPrice || null,
      low24h: +d.lowPrice || null,
      change24hPct: d.priceChangePercent ? +(+d.priceChangePercent).toFixed(2) : null
    });
  }catch(e){
    res.json({ exchange:"Binance" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server on :${PORT}`));
