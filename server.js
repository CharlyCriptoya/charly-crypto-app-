// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

// --------- STATIC (sirve /public y también el Muro.jpg en raíz) ----------
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public/index.html")));

// --------- Helpers ----------
const ok = (x) => x && x.status >= 200 && x.status < 300;
const j = (r) => r.json();

// --------- Adapters de precio USD por exchange ----------
const adapters = {
  // symbol: "BTCUSDT" / "ETHUSDT" / "SOLUSDT" ...
  binance: async (symbol) => {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!ok(r)) throw new Error("binance");
    const { price } = await j(r);
    return { price: +price };
  },
  bybit: async (symbol) => {
    const r = await fetch(`https://api.bybit.com/v2/public/tickers?symbol=${symbol}`);
    if (!ok(r)) throw new Error("bybit");
    const d = await j(r);
    return { price: +d.result[0].last_price };
  },
  okx: async (symbol) => {
    const instId = symbol.replace("USDT", "-USDT");
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    if (!ok(r)) throw new Error("okx");
    const d = await j(r);
    return { price: +d.data[0].last };
  },
  kucoin: async (symbol) => {
    const inst = symbol.replace("USDT", "-USDT");
    const r = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${inst}`);
    if (!ok(r)) throw new Error("kucoin");
    const d = await j(r);
    return { price: +d.data.price };
  },
  bitget: async (symbol) => {
    const inst = symbol.replace("USDT", "USDT"); // mismo form
    const r = await fetch(`https://api.bitget.com/api/spot/v1/market/ticker?symbol=${inst}`);
    if (!ok(r)) throw new Error("bitget");
    const d = await j(r);
    return { price: +d.data.close };
  },
  mexc: async (symbol) => {
    const r = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!ok(r)) throw new Error("mexc");
    const d = await j(r);
    return { price: +d.price };
  },
  // 👉 Agregamos locales cuando tengamos endpoint estable (Ripio, Lemon, Let'sBit, etc.)
};

// --------- API: precio en USD para un exchange + par ----------
app.get("/api/price", async (req, res) => {
  try {
    const ex = String(req.query.exchange || "").toLowerCase();
    const pair = String(req.query.pair || "BTCUSDT").toUpperCase();
    if (!adapters[ex]) return res.status(400).json({ error: "exchange no soportado" });
    const { price } = await adapters[ex](pair);
    res.json({ exchange: ex, pair, usd: price });
  } catch (e) {
    res.status(500).json({ error: e.message || "fetch error" });
  }
});

// --------- API: tasas dólar (widget de arriba) ----------
/*
  Por defecto trae algo razonable. Podés cambiar "source" en el query:
  /api/rates?source=manual&value=1400
*/
let manualRate = null;

app.get("/api/rates", async (req, res) => {
  const src = String(req.query.source || "default");
  const val = req.query.value ? Number(req.query.value) : null;

  try {
    if (src === "manual" && val) {
      manualRate = val;
      return res.json({ source: "manual", cripto: val, mep: val, ccl: val, blue: val, oficial: val });
    }

    // Fuente simple y estable: tomamos USDT≈USD=1 y proponemos un set inicial.
    // Luego podemos enchufar CriptoYA u otra API local (MEP/CCL/Blue).
    const base = manualRate || 1400; // valor inicial para arrancar
    res.json({
      source: manualRate ? "manual" : "default",
      oficial: Math.round(base * 0.85),
      blue: Math.round(base * 0.92),
      mep: Math.round(base * 0.98),
      ccl: Math.round(base * 1.02),
      cripto: base
    });
  } catch (e) {
    res.status(500).json({ error: "rates error" });
  }
});

// --------- Healthcheck ----------
app.get("/healthz", (_, res) => res.type("text").send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server up on", PORT));
