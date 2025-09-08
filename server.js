// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import compression from "compression";
import cors from "cors";
import { fileURLToPath } from "url";

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App
const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.static(path.join(__dirname, "public"))); // sirve /public

// Helper fetch con timeout
async function fetchJSON(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

// === Fuentes ===
// Binance:  https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
// Coinbase: https://api.coinbase.com/v2/prices/BTC-USD/spot
// Kraken:   https://api.kraken.com/0/public/Ticker?pair=XBTUSD
// Bluelytics: https://api.bluelytics.com.ar/v2/latest

async function getBinance() {
  const j = await fetchJSON("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
  return Number(j.price); // USDT ~ USD
}
async function getCoinbase() {
  const j = await fetchJSON("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  return Number(j.data.amount);
}
async function getKraken() {
  const j = await fetchJSON("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
  const data = j.result?.XXBTZUSD || j.result?.XBTUSD || Object.values(j.result || {})[0];
  return Number(data?.c?.[0]);
}
async function getBlue() {
  const j = await fetchJSON("https://api.bluelytics.com.ar/v2/latest");
  const blue_buy = Number(j.blue?.value_buy);
  const blue_sell = Number(j.blue?.value_sell);
  const blue_avg = (blue_buy + blue_sell) / 2;
  return {
    blue_avg,
    blue_buy,
    blue_sell,
    oficial_buy: Number(j.oficial?.value_buy),
    oficial_sell: Number(j.oficial?.value_sell)
  };
}

// Endpoint unificado
app.get("/api/quotes", async (_req, res) => {
  try {
    const [binance, coinbase, kraken, blue] = await Promise.allSettled([
      getBinance(),
      getCoinbase(),
      getKraken(),
      getBlue()
    ]);

    const usd = {
      binance: Number(binance.value || NaN),
      coinbase: Number(coinbase.value || NaN),
      kraken: Number(kraken.value || NaN)
    };

    const usdList = Object.values(usd).filter(Number.isFinite);
    const usd_ref = usdList.length ? usdList.reduce((a, b) => a + b, 0) / usdList.length : NaN;

    const rate = blue.value || null;
    const btc_ars_ref =
      Number.isFinite(usd_ref) && rate?.blue_avg ? usd_ref * rate.blue_avg : NaN;

    res.json({
      ts: Date.now(),
      usd,
      usd_ref,
      ars_rate_blue: rate,
      btc_ars_ref
    });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

// Endpoint dólar solo
app.get("/api/dolar", async (_req, res) => {
  try {
    const data = await getBlue();
    res.json({ ts: Date.now(), ...data });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

// Fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server escuchando en http://localhost:${PORT}`);
});
