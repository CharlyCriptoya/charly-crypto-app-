// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ccxt from 'ccxt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ==== Static: sirve index.html en la RAÍZ (minúscula) ====
app.use(express.static(__dirname, { extensions: ['html'] }));

// ==== Helpers ====
const ok = (res, data) => res.json(data);
const fail = (res, err, status = 500) => {
  console.error(err);
  res.status(status).json({ error: true, message: String(err) });
};

const toPair = (s) => {
  // "BTCUSDT" -> "BTC/USDT", "USDTARS" -> "USDT/ARS"
  const m = s.match(/^([A-Z]+)([A-Z]+)$/);
  return m ? `${m[1]}/${m[2]}` : s.replace('-', '/').toUpperCase();
};

// ==== 1) DÓLAR (CriptoYa) ====
app.get('/api/dolar', async (_req, res) => {
  try {
    const r = await fetch('https://criptoya.com/api/dolar', { timeout: 10000 });
    const j = await r.json();

    // Normalizo claves que usás en el front
    const out = {
      oficial: { ask: j.oficial?.venta ?? null, bid: j.oficial?.compra ?? null },
      tarjeta: { ask: j.tarjeta?.venta ?? null, bid: j.tarjeta?.compra ?? null },
      blue:    { ask: j.blue?.venta    ?? null, bid: j.blue?.compra    ?? null },
      mep:     { ask: j.mep?.venta     ?? null, bid: j.mep?.compra     ?? null },
      ccl:     { ask: j.ccl?.venta     ?? null, bid: j.ccl?.compra     ?? null },
      cripto:  { ask: j.crypto?.venta  ?? null, bid: j.crypto?.compra  ?? null },
      ts: Date.now()
    };
    ok(res, out);
  } catch (e) { fail(res, e); }
});

// ==== 2) Stats 24h (ccxt, por exchange = Binance) ====
app.get('/api/stats24h', async (req, res) => {
  const symbolRaw = (req.query.symbol || 'BTCUSDT').toString().toUpperCase();
  const market = toPair(symbolRaw);

  try {
    const ex = new ccxt.binance({ enableRateLimit: true });
    const t = await ex.fetchTicker(market);
    ok(res, {
      exchange: 'Binance',
      last: t.last ?? null,
      high24h: t.high ?? null,
      low24h: t.low ?? null,
      change24hPct: t.percentage ?? null
    });
  } catch (e) { fail(res, e); }
});

// ==== 3) Tabla multi-exchange (ccxt) ====
// ?pair=BTCUSDT  -> devuelve [{exchange, pair, lastUSD, lastARS}]
const EX_IDS = [
  'binance','okx','bybit','kucoin','kraken','bitfinex',
  'coinbase','gate','mexc','huobi'
];

async function fetchDolarCripto() {
  try {
    const r = await fetch('https://criptoya.com/api/dolar', { timeout: 8000 });
    const j = await r.json();
    // si no hay "crypto", intento "blue" como fallback
    return j?.crypto?.venta || j?.blue?.venta || null;
  } catch { return null; }
}

app.get('/api/quotes', async (req, res) => {
  const symbolRaw = (req.query.pair || 'BTCUSDT').toString().toUpperCase();
  const market = toPair(symbolRaw);

  // precio ARS por USDT
  const usdArs = await fetchDolarCripto();

  try {
    const results = await Promise.all(EX_IDS.map(async (id) => {
      try {
        const exClass = ccxt[id];
        if (!exClass) throw new Error(`Exchange no soportado: ${id}`);
        const ex = new exClass({ enableRateLimit: true });
        const t = await ex.fetchTicker(market); // puede tirar
        const last = t.last ?? null;
        const lastARS = (last && usdArs) ? last * usdArs : null;
        return { exchange: ex.id, pair: market, lastUSD: last, lastARS };
      } catch (err) {
        // devuelvo fila con error pero no rompo toda la tabla
        return { exchange: id, pair: market, lastUSD: null, lastARS: null };
      }
    }));

    ok(res, results);
  } catch (e) { fail(res, e); }
});

// ==== Arranque ====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server on :${PORT}`));
