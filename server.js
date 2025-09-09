// server.js
import express from "express";
import fetch from "node-fetch";
import compression from "compression";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// ---------- Paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- App ----------
const app = express();
app.use(compression());
app.use(cors());

// Servimos estáticos de /public y, además, la raíz para que /muro.jpg funcione
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// ---------- Healthcheck ----------
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// ---------- Helpers ----------
const TIMEOUT_MS = 8000;
const cache = new Map();
/**
 * Guardado simple en RAM con TTL (ms)
 */
function setCache(key, value, ttlMs = 10000) {
  cache.set(key, { value, exp: Date.now() + ttlMs });
}
function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

async function fetchJson(url, { ttl = 8000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- API: Dólar ARS ----------
/**
 * Devuelve varias cotizaciones de dólar (si alguna fuente cae, rellena con lo disponible).
 * Front usa principalmente un "dólar cripto" para convertir USD→ARS.
 */
app.get("/api/dolar", async (_req, res) => {
  const key = "dolar";
  const hit = getCache(key);
  if (hit) return res.json(hit);
  try {
    // Fuente 1: Bluelytics (oficial/blue) – puede fallar a veces
    let blue = null, oficial = null;
    try {
      const blu = await fetchJson("https://api.bluelytics.com.ar/v2/latest");
      blue = (blu?.blue?.value_avg) || null;
      oficial = (blu?.oficial?.value_avg) || null;
    } catch {}

    // Fuente 2: “dólar cripto” aproximado: usamos precio USDT en Binance (1 USDT ≈ 1 USD)
    // Tomamos USDT/ARS indirecto con un estimador: BTCUSDT*BTCARS/… → demasiado.
    // Mejor: si no tenés fuente directa, dejamos editable en el front y sugerimos default.
    // Para que no rompa, mandamos un valor por defecto razonable (lo puede sobrescribir el usuario).
    const dolarCripto = null; // el front lo tratará y permitirá setear a mano

    const payload = {
      ts: Date.now(),
      blue,
      oficial,
      cripto: dolarCripto,       // null => el front propone un valor y permite editar
      fallbackSugerido: 1600     // valor editable desde la UI si no llega fuente
    };
    setCache(key, payload, 60_000);
    res.json(payload);
  } catch (e) {
    res.json({
      ts: Date.now(),
      blue: null,
      oficial: null,
      cripto: null,
      fallbackSugerido: 1600,
      note: "fallback"
    });
  }
});

// ---------- API: Precios spot ----------
/**
 * Binance spot (precio último) => /api/binance/price?symbol=BTCUSDT
 */
app.get("/api/binance/price", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const key = `bn_price_${symbol}`;
  const hit = getCache(key);
  if (hit) return res.json(hit);
  try {
    const j = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const out = { exchange: "Binance", symbol, price: parseFloat(j.price) };
    setCache(key, out, 5000);
    res.json(out);
  } catch (e) {
    res.status(502).json({ exchange: "Binance", symbol, error: String(e) });
  }
});

/**
 * Bybit spot (precio último) => /api/bybit/price?symbol=BTCUSDT
 */
app.get("/api/bybit/price", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const key = `by_price_${symbol}`;
  const hit = getCache(key);
  if (hit) return res.json(hit);
  try {
    const j = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
    const t = j?.result?.list?.[0];
    const out = { exchange: "Bybit", symbol, price: t ? parseFloat(t.lastPrice) : null };
    setCache(key, out, 5000);
    res.json(out);
  } catch (e) {
    res.status(502).json({ exchange: "Bybit", symbol, error: String(e) });
  }
});

/**
 * OKX spot (precio último) => /api/okx/price?instId=BTC-USDT
 */
app.get("/api/okx/price", async (req, res) => {
  const instId = (req.query.instId || "BTC-USDT").toUpperCase();
  const key = `okx_price_${instId}`;
  const hit = getCache(key);
  if (hit) return res.json(hit);
  try {
    const j = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    const t = j?.data?.[0];
    const out = { exchange: "OKX", symbol: instId, price: t ? parseFloat(t.last) : null };
    setCache(key, out, 5000);
    res.json(out);
  } catch (e) {
    res.status(502).json({ exchange: "OKX", symbol: instId, error: String(e) });
  }
});

// ---------- API: Velas (para el gráfico) ----------
/**
 * Binance klines => /api/binance/candles?symbol=BTCUSDT&interval=1h&limit=500
 * Devuelve formato compacto: [{t,o,h,l,c,v}]
 */
app.get("/api/binance/candles", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const interval = (req.query.interval || "1h");
  const limit = Math.min(parseInt(req.query.limit || "500", 10), 1000);
  const key = `bn_kl_${symbol}_${interval}_${limit}`;
  const hit = getCache(key);
  if (hit) return res.json(hit);
  try {
    const raw = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const out = raw.map(k => ({
      t: k[0],            // open time ms
      o: +k[1],
      h: +k[2],
      l: +k[3],
      c: +k[4],
      v: +k[5]
    }));
    setCache(key, out, 10_000);
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// ---------- Fallback a index ----------
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Charly Cripto • MVP corriendo en http://localhost:${PORT}`);
});
