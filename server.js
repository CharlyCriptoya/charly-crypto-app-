// server.js (ESM)
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import ccxt from "ccxt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ---------- USD/ARS widget ----------
// Usamos endpoints públicos de CriptoYa para dolar.
// Si preferís otro proveedor, cambia las URLs acá.
async function getJSON(u) {
  const r = await fetch(u, { timeout: 10000 });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
}

app.get("/api/dolar", async (req, res) => {
  try {
    const [oficial, blue, mep, ccl, tarjeta, cripto] = await Promise.all([
      getJSON("https://criptoya.com/api/dolar/oficial"),
      getJSON("https://criptoya.com/api/dolar/blue"),
      getJSON("https://criptoya.com/api/dolar/mep"),
      getJSON("https://criptoya.com/api/dolar/ccl"),
      getJSON("https://criptoya.com/api/dolar/tarjeta"),
      getJSON("https://criptoya.com/api/dolar/cripto"),
    ]);
    res.json({
      oficial: { ask: oficial.venta, bid: oficial.compra },
      blue: { ask: blue.venta, bid: blue.compra },
      mep: { ask: mep.venta, bid: mep.compra },
      ccl: { ask: ccl.venta, bid: ccl.compra },
      tarjeta: { ask: tarjeta.venta, bid: tarjeta.compra },
      cripto: { ask: cripto.venta, bid: cripto.compra },
      ts: Date.now(),
    });
  } catch (e) {
    console.error("dolar", e.message);
    res.status(500).json({ error: "usd fetch error" });
  }
});

// ---------- Stats 24h (por ahora tomamos Binance spot) ----------
app.get("/api/stats24h", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  try {
    const binance = new ccxt.binance({ enableRateLimit: true });
    await binance.loadMarkets();
    const m = binance.market(symbol);
    const t = await binance.fetchTicker(m.symbol);
    const pct = t.percentage ?? ((t.last - t.open) / t.open) * 100;
    res.json({
      exchange: "Binance",
      last: t.last, high24h: t.high, low24h: t.low,
      change24hPct: Number.isFinite(pct) ? +pct.toFixed(2) : null,
    });
  } catch (e) {
    console.error("stats", e.message);
    res.status(500).json({ error: "stats error" });
  }
});

// ---------- Cotizaciones multi-exchange ----------
const EXCH_LIST = [
  "binance","okx","bybit","kucoin","gate","bitget","mexc","bingx",
  "coinbase","kraken","bitfinex","bitstamp","poloniex","coinex","btse",
  "huobi","lbank","ascendex","zb","whitebit","upbit","bitmart","bithumb"
];

function mapSymbolForExchange(baseSym, ex) {
  // baseSym tipo 'BTCUSDT' o 'ETHUSDT'
  const base = baseSym.replace("/", "").toUpperCase();
  const isUSDT = base.endsWith("USDT");
  const cex = ex.id;

  // Algunos usan USD en vez de USDT
  if (!isUSDT) return baseSym;

  const baseAsset = base.slice(0, -4); // 'BTC'
  // Ajustes por exchange
  if (["coinbase","kraken","bitfinex","bitstamp","upbit","bithumb"].includes(cex)) {
    return `${baseAsset}/USD`;
  }
  // Otros aceptan USDT
  return `${baseAsset}/USDT`;
}

app.get("/api/quotes", async (req, res) => {
  const pair = (req.query.pair || "BTCUSDT").toUpperCase(); // ej: BTCUSDT
  const out = [];
  try {
    await Promise.all(EXCH_LIST.map(async id => {
      try {
        const exClass = ccxt[id];
        if (!exClass) return;
        const ex = new exClass({ enableRateLimit: true, timeout: 10000 });
        await ex.loadMarkets();
        // Mapeo del símbolo según el exchange
        let sym = mapSymbolForExchange(pair, ex);
        if (!ex.markets[sym]) {
          // fallback a spot clásico
          const base = pair.replace("/", "").toUpperCase();
          const baseAsset = base.endsWith("USDT") ? base.slice(0,-4) : base;
          const candidates = [`${baseAsset}/USDT`, `${baseAsset}/USD`, `${baseAsset}/BUSD`, `${baseAsset}/USDC`, `${baseAsset}/BRL`];
          sym = candidates.find(s => ex.markets[s]);
          if (!sym) return;
        }
        const t = await ex.fetchTicker(sym);
        out.push({ exchange: ex.name, pair: sym, last: t.last });
      } catch (e) {
        // silencioso por rate limit / mercados inexistentes
      }
    }));
    // ordenar por exchange
    out.sort((a,b)=> a.exchange.localeCompare(b.exchange));
    res.json(out);
  } catch (e) {
    console.error("quotes", e.message);
    res.status(500).json({ error: "quotes error" });
  }
});

// ---------- SPA simple ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
