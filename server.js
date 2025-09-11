// server.js  (ESM)
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

// --------- estáticos (sirve index.html + Muro.jpeg) ---------
app.use(express.static(__dirname, { maxAge: 0 }));

// --------- health ---------
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// --------- index ---------
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ===== Helpers =====
const toNum = (x) => {
  if (x == null) return null;
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const s = x.replace(/[^\d.,-]/g, "");
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof x === "object") {
    // por si nos pasan el nodo completo
    return toNum(x.venta ?? x.sell ?? x.ask ?? x.v ?? x.price ?? x.promedio ?? null);
  }
  return null;
};
const both = (node) => ({
  venta: toNum(node?.venta ?? node?.seller ?? node?.ask ?? node?.v ?? node),
  compra: toNum(node?.compra ?? node?.buyer ?? node?.bid ?? node?.p ?? node)
});
const noStore = (res) => res.set("Cache-Control", "no-store");


// ================== 1) DÓLAR (ARS) ==================
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { timeout: 12000 });
    const j = await r.json();
    noStore(res);
    return res.json({
      oficial: both(j?.oficial),
      tarjeta: both(j?.tarjeta ?? j?.solidario ?? j?.qatar),
      blue:    both(j?.blue),
      mep:     both(j?.mep),
      ccl:     both(j?.ccl),
      cripto:  both(j?.cripto ?? j?.crypto ?? j?.usdt ?? j?.usdc),
      ts: Date.now()
    });
  } catch (e) {
    console.error("DOLAR FAIL:", e);
    noStore(res);
    return res.status(502).json({ error: "dolar_fail" });
  }
});

// Alias para frontend
app.get("/api/ars", (req, res) => app._router.handle({ ...req, url: "/api/dolar" }, res));


// ================== 2) SPOT POR EXCHANGE ==================
// arma un snapshot {binance:{ars,usd}, bybit:{...}, ...}
const SPOT_EXCHANGES = {
  binance:  (base) => `https://criptoya.com/api/binance/${base}/ars`,
  bybit:    (base) => `https://criptoya.com/api/bybit/${base}/ars`,
  okx:      (base) => `https://criptoya.com/api/okx/${base}/ars`,
  kucoin:   (base) => `https://criptoya.com/api/kucoin/${base}/ars`,
  mexc:     (base) => `https://criptoya.com/api/mexc/${base}/ars`,
  bitget:   (base) => `https://criptoya.com/api/bitget/${base}/ars`,
};

app.get("/api/spot/:base", async (req, res) => {
  const base = String(req.params.base || "").toLowerCase(); // btc | eth | usdt
  if (!["btc", "eth", "usdt"].includes(base)) {
    return res.status(400).json({ error: "base_invalida", allow: ["btc","eth","usdt"] });
  }

  const tasks = Object.entries(SPOT_EXCHANGES).map(async ([ex, urlFn]) => {
    const url = urlFn(base);
    try {
      const r = await fetch(url, { timeout: 12000 });
      if (!r.ok) throw new Error(`${ex} http_${r.status}`);
      const d = await r.json();
      // distintos campos posibles
      const ars = toNum(d?.ars ?? d?.precio_ars ?? d?.price_ars ?? d?.price);
      const usd = toNum(d?.usd ?? d?.precio_usd ?? d?.price_usd);
      return [ex, { ex, ars, usd }];
    } catch (e) {
      console.warn("SPOT FAIL", ex, url, e.message);
      return [ex, { ex, ars: null, usd: null, error: String(e.message || e) }];
    }
  });

  const rows = Object.fromEntries(await Promise.all(tasks));
  noStore(res);
  return res.json(rows);
});


// ================== 3) Proxy genérico a par (opcional) ==================
// /api/cripto/btc/ars  /api/cripto/usdt/ars  /api/cripto/sol/ars
app.get("/api/cripto/:symbol/:fiat", async (req, res) => {
  const { symbol, fiat } = req.params; // ej: usdt / ars
  try {
    const url = `https://criptoya.com/api/${symbol}/${fiat}`;
    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) throw new Error("http_" + r.status);
    const j = await r.json();
    noStore(res);
    return res.json(j);
  } catch (e) {
    console.error("CRIPTOYA FAIL:", req.params, e);
    noStore(res);
    return res.status(502).json({ error: "criptoya_fail" });
  }
});


// ================== start ==================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Charly Cripto • MVP en :${PORT}`));
