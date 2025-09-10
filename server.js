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

// Healthcheck para Render
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Servir archivos estáticos (Muro.jpeg en raíz)
app.use(express.static(__dirname));

// Index
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Dólar (CriptoYa)
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar");
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: "Fallo dolar", detail: String(e) });
  }
});

// Klínes Binance
app.get("/api/klines", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = (req.query.interval || "15m");
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 1000);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: "Fallo klines", detail: String(e) });
  }
});

// Tickers por exchange
app.get("/api/ticker", async (req, res) => {
  try {
    const exchange = String(req.query.exchange || "").toLowerCase();
    const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();

    let url, pick;
    switch (exchange) {
      case "binance":
        url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
        pick = async (r) => (await r.json()).price;
        break;
      case "bybit":
        url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
        pick = async (r) => {
          const j = await r.json();
          return j?.result?.list?.[0]?.lastPrice;
        };
        break;
      case "okx":
        url = `https://www.okx.com/api/v5/market/ticker?instId=${symbol.replace("USDT","-USDT")}`;
        pick = async (r) => (await r.json())?.data?.[0]?.last;
        break;
      case "kucoin":
        url = `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol.replace("USDT","-USDT")}`;
        pick = async (r) => (await r.json())?.data?.price;
        break;
      case "mexc":
        url = `https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`;
        pick = async (r) => (await r.json()).price;
        break;
      case "bitget":
        url = `https://api.bitget.com/api/v2/market/tickers?symbol=${symbol}`;
        pick = async (r) => (await r.json())?.data?.list?.[0]?.last;
        break;
      default:
        return res.status(400).json({ error: "exchange no soportado" });
    }

    const rr = await fetch(url);
    if (!rr.ok) throw new Error(`HTTP ${rr.status}`);
    const price = await pick(rr);
    if (!price) throw new Error("sin precio");

    res.json({ exchange, symbol, price: Number(price) });
  } catch (e) {
    res.status(500).json({ error: "Fallo ticker", detail: String(e) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Charly Cripto • MVP en :${PORT}`));
