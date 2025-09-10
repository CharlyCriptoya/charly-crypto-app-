// server.js
import express from "express";
import fetch from "node-fetch";
import compression from "compression";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());

// Healthcheck
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Estáticos (Muro.jpeg en raíz)
app.use(express.static(__dirname));

// Index
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

/* ====== DÓLAR (ARS) — con compra/venta y timestamp ====== */
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { timeout: 12000 });
    const j = await r.json();

    const toNum = (x) => {
      if (x == null) return null;
      if (typeof x === "number") return x;
      if (typeof x === "string") {
        const s = x.replace(/[^\d.,-]/g, "");
        const norm = s.replace(/\./g, "").replace(",", ".");
        const n = Number(norm);
        return isFinite(n) ? n : null;
      }
      if (typeof x === "object") {
        return toNum(x.venta ?? x.sell ?? x.ask ?? x.v ?? x.price ?? x.promedio ?? null);
      }
      return null;
    };
    const both = (node) => ({
      venta: toNum(node?.venta ?? node?.seller ?? node?.ask ?? node?.v ?? node),
      compra: toNum(node?.compra ?? node?.buyer ?? node?.bid ?? node?.p ?? node)
    });

    const out = {
      oficial: both(j?.oficial),
      tarjeta: both(j?.tarjeta ?? j?.solidario ?? j?.qatar),
      blue:    both(j?.blue),
      mep:     both(j?.mep),
      ccl:     both(j?.ccl),
      cripto:  both(j?.cripto ?? j?.crypto ?? j?.usdt ?? j?.usdc),
      ts: Date.now()
    };
    res.json(out);
  } catch (e) {
    console.error("DOLAR FAIL:", e);
    res.status(500).json({ error: "dolar_fail" });
  }
});

/* ====== Klines (para análisis técnico) ====== */
app.get("/api/klines", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = (req.query.interval || "15m");
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 1000);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url, { timeout: 12000 });
    if (!r.ok) throw new Error("binance_klines_" + r.status);
    res.json(await r.json());
  } catch (e) {
    console.error("KLINES FAIL:", e);
    res.status(500).json({ error: "klines_fail" });
  }
});

/* ====== Ticker spot por exchange ======
   Soportados: binance, bybit, okx, kucoin, mexc, bitget, gate, bitstamp, kraken
*/
app.get("/api/ticker", async (req, res) => {
  try {
    const exchange = String(req.query.exchange || "").toLowerCase();
    const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();

    let url, pick;
    switch (exchange) {
      case "binance": {
        url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
        pick = async (r) => (await r.json()).price;
        break;
      }
      case "bybit": { // SPOT
        url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`;
        pick = async (r) => (await r.json())?.result?.list?.[0]?.lastPrice;
        break;
      }
      case "okx": {
        const inst = symbol.includes("-") ? symbol : symbol.replace("USDT","-USDT");
        url = `https://www.okx.com/api/v5/market/ticker?instId=${inst}`;
        pick = async (r) => (await r.json())?.data?.[0]?.last;
        break;
      }
      case "kucoin": {
        const inst = symbol.includes("-") ? symbol : symbol.replace("USDT","-USDT");
        url = `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${inst}`;
        pick = async (r) => (await r.json())?.data?.price;
        break;
      }
      case "mexc": {
        url = `https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`;
        pick = async (r) => (await r.json()).price;
        break;
      }
      case "bitget": { // SPOT
        url = `https://api.bitget.com/api/spot/v1/market/ticker?symbol=${symbol}`;
        pick = async (r) => {
          const j = await r.json();
          return j?.data?.close ?? j?.data?.lastPr ?? j?.data?.[0]?.close;
        };
        break;
      }
      case "gate": { // Gate.io
        const pair = symbol.replace("USDT","_USDT"); // BTC_USDT
        url = `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`;
        pick = async (r) => {
          const j = await r.json();
          return j?.[0]?.last;
        };
        break;
      }
      case "bitstamp": { // Bitstamp (puede no tener todos los pares)
        const p = symbol.toLowerCase(); // btcusdt
        url = `https://www.bitstamp.net/api/v2/ticker/${p}`;
        pick = async (r) => (await r.json())?.last;
        break;
      }
      case "kraken": {
        const ksym = symbol.replace("BTC","XBT").replace("USDT","USDT");
        url = `https://api.kraken.com/0/public/Ticker?pair=${ksym}`;
        pick = async (r) => {
          const j = await r.json();
          const firstKey = Object.keys(j?.result || {})[0];
          return j?.result?.[firstKey]?.c?.[0];
        };
        break;
      }
      default:
        return res.status(400).json({ error: "exchange_no_soportado" });
    }

    const rr = await fetch(url, { timeout: 12000 });
    if (!rr.ok) throw new Error(`${exchange}_http_${rr.status}`);
    const price = Number(await pick(rr));
    if (!isFinite(price)) throw new Error(`${exchange}_sin_precio`);
    res.json({ exchange, symbol, price });
  } catch (e) {
    console.error("TICKER FAIL:", e);
    res.status(500).json({ error: "ticker_fail", detail: String(e) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Charly Cripto • MVP en :${PORT}`));
