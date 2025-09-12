import express from "express";
import cors from "cors";
import compression from "compression";

const app = express();
app.use(cors());
app.use(compression());

// Sirve index.html, Muro.jpg y todo desde la RAÍZ
app.use(express.static(process.cwd(), { index: "index.html", extensions: ["html"] }));

// Utilidad fetch (Node 18+ ya trae fetch nativo)
async function getJSON(url, opt = {}) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/**
 * API — Dólares AR (widget superior)
 * Fuente principal: DolarAPI. Si falla, intenta CriptoYA para blue (fallback).
 */
app.get("/api/dolares", async (_req, res) => {
  try {
    // DolarAPI: https://dolarapi.com/v1/dolares  (array con varias cotizaciones)
    const data = await getJSON("https://dolarapi.com/v1/dolares");
    const pick = (tipo) => data.find((d) => (d.casa || d.nombre || "").toLowerCase().includes(tipo));
    const toNumber = (v) => (typeof v === "number" ? v : Number(String(v).replace(",", ".")));

    const map = (d) =>
      d
        ? {
            compra: toNumber(d.compra ?? d.bid ?? d.promedio ?? d.valor ?? d.value ?? null),
            venta: toNumber(d.venta ?? d.ask ?? d.promedio ?? d.valor ?? d.value ?? null),
            fuente: d.casa || d.nombre || "DolarAPI"
          }
        : null;

    let oficial = map(pick("oficial"));
    let blue = map(pick("blue"));
    let mep = map(pick("mep"));
    let ccl = map(pick("contado con liqui")) || map(pick("ccl"));
    let tarjeta = map(pick("tarjeta")) || map(pick("qatar")) || null;

    // Opcional: “cripto dólar” (USDT/ARS) — intento suave con CriptoYA; si falla, se omite
    let cripto = null;
    try {
      // Algunas instancias de CriptoYA exponen P2P USDT/ARS. Probamos varios endpoints comunes.
      const candidates = [
        "https://criptoya.com/api/binancep2p/usdt/ars/1",
        "https://criptoya.com/api/lemoncash/usdt/ars",
        "https://criptoya.com/api/ripio/usdt/ars",
        "https://criptoya.com/api/belo/usdt/ars"
      ];
      for (const url of candidates) {
        try {
          const j = await getJSON(url);
          // Intento normalizar posibles campos
          const v =
            j?.price ?? j?.venta ?? j?.sell ?? j?.ask ?? j?.ars ?? j?.v ?? j?.promedio ?? j?.avg ?? null;
          const w =
            j?.compra ?? j?.buy ?? j?.bid ?? j?.ars ?? j?.c ?? j?.promedio ?? j?.avg ?? v ?? null;
          const toNum = (x) => (typeof x === "number" ? x : Number(String(x).replace(",", ".")));
          const venta = toNum(v);
          const compra = toNum(w);
          if (!Number.isNaN(venta) || !Number.isNaN(compra)) {
            cripto = { compra: compra || null, venta: venta || compra || null, fuente: url.split("/api/")[1] };
            break;
          }
        } catch {}
      }
    } catch {}

    res.json({ oficial, blue, mep, ccl, tarjeta, cripto });
  } catch (e) {
    res.status(200).json({ error: String(e), oficial: null, blue: null, mep: null, ccl: null, tarjeta: null, cripto: null });
  }
});

/**
 * API — Tickers por par y exchange
 * - Para pares *_/USD* uso CoinGecko tickers (sin API key).
 * - Para *_/ARS* intento CriptoYA (varios exchanges). Si falla, devuelvo vacío.
 *
 * Query: /api/pairs?list=btc-usd,eth-usd,usdt-ars
 */
const COINGECKO_IDS = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  bnb: "binancecoin",
  ada: "cardano",
  xrp: "ripple",
  doge: "dogecoin",
  matic: "matic-network",
  link: "chainlink",
  ton: "the-open-network",
  usdt: "tether",
  usdc: "usd-coin",
  dai: "dai"
};

app.get("/api/pairs", async (req, res) => {
  const listRaw = (req.query.list || "").toString().trim();
  if (!listRaw) return res.json({ pairs: [] });

  const pairs = listRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const out = [];

  for (const pair of pairs) {
    const [base, quote] = pair.split("-"); // ej: btc-usd
    if (!base || !quote) continue;

    // USD: CoinGecko tickers
    if (quote === "usd") {
      const id = COINGECKO_IDS[base];
      if (!id) {
        out.push({ pair, rows: [], source: "coingecko", error: "base no mapeada" });
        continue;
      }
      try {
        const j = await getJSON(
          `https://api.coingecko.com/api/v3/coins/${id}/tickers?include_exchange_logo=true`
        );
        const rows =
          (j.tickers || [])
            .filter((t) => (t?.target || "").toUpperCase() === "USD")
            .map((t) => ({
              exchange: t?.market?.name || t?.market?.identifier || "—",
              pair: `${t?.base}/${t?.target}`,
              last: Number(t?.last) || null,
              volume24h: Number(t?.volume) || null,
              spread: t?.bid_ask_spread_percentage ?? null
            }))
            // un pequeño dedupe por exchange
            .reduce((acc, r) => {
              if (!acc.some((x) => x.exchange === r.exchange && x.pair === r.pair)) acc.push(r);
              return acc;
            }, [])
            .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
            .slice(0, 30) || [];
        out.push({ pair, rows, source: "coingecko" });
      } catch (e) {
        out.push({ pair, rows: [], source: "coingecko", error: String(e) });
      }
      continue;
    }

    // ARS: intento CriptoYA por varios exchanges locales/p2p comunes
    if (quote === "ars") {
      const exs = [
        "binancep2p",
        "belo",
        "ripio",
        "ripioexchange",
        "lemoncash",
        "satoshitango",
        "tiendacrypto",
        "pluscrypto",
        "saldo",
        "vitawallet",
        "buenbit",
        "bitrade",
        "letsbit",
        "kriptonmarket",
        "camerbit",
        "decrypto",
        "armex"
      ];
      const rows = [];
      await Promise.all(
        exs.map(async (ex) => {
          try {
            const url = `https://criptoya.com/api/${ex}/${base}/${quote}`;
            const j = await getJSON(url);
            // Intento normalizar campos comunes (varía por exchange)
            const last =
              Number(j?.last) ||
              Number(j?.precio) ||
              Number(j?.price) ||
              Number(j?.venta) ||
              Number(j?.ask) ||
              Number(j?.promedio) ||
              Number(j?.avg) ||
              null;
            if (last) {
              rows.push({
                exchange: ex.toUpperCase(),
                pair: `${base.toUpperCase()}/${quote.toUpperCase()}`,
                last
              });
            }
          } catch {}
        })
      );
      rows.sort((a, b) => (a.last || 0) - (b.last || 0));
      out.push({ pair, rows, source: "criptoya" });
      continue;
    }

    // Otros quotes (por ahora no)
    out.push({ pair, rows: [], source: "n/a", error: "quote no soportado (usa usd o ars)" });
  }

  res.json({ pairs: out });
});

// Salud
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Charly Cripto • MVP listo en http://localhost:${PORT}`);
});
