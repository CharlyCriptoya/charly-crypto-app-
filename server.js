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

/** ==============================
 * API — Dólares AR (widget superior)
 * ============================== */
app.get("/api/dolares", async (_req, res) => {
  try {
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

    const oficial = map(pick("oficial"));
    const blue = map(pick("blue"));
    const mep = map(pick("mep"));
    const ccl = map(pick("contado con liqui")) || map(pick("ccl"));
    const tarjeta = map(pick("tarjeta")) || map(pick("qatar"));

    res.json({ oficial, blue, mep, ccl, tarjeta });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
});

/** ==============================
 * API — Pares cripto (USD / ARS)
 * ============================== */
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

  const pairs = listRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = [];

  for (const pair of pairs) {
    const [base, quote] = pair.split("-");
    if (!base || !quote) continue;

    // USD: CoinGecko
    if (quote === "usd") {
      const id = COINGECKO_IDS[base];
      if (!id) {
        out.push({ pair, rows: [], source: "coingecko", error: "base no mapeada" });
        continue;
      }
      try {
        const j = await getJSON(`https://api.coingecko.com/api/v3/coins/${id}/tickers?include_exchange_logo=true`);
        const rows = (j.tickers || [])
          .filter((t) => (t?.target || "").toUpperCase() === "USD")
          .map((t) => ({
            exchange: t?.market?.name || "—",
            pair: `${t?.base}/${t?.target}`,
            last: Number(t?.last) || null,
            volume24h: Number(t?.volume) || null
          }))
          .slice(0, 15);
        out.push({ pair, rows, source: "coingecko" });
      } catch (e) {
        out.push({ pair, rows: [], source: "coingecko", error: String(e) });
      }
      continue;
    }

    // ARS: CriptoYA
    if (quote === "ars") {
      const exs = ["binancep2p", "belo", "ripio", "lemoncash", "satoshitango", "tiendacrypto"];
      const rows = [];
      await Promise.all(
        exs.map(async (ex) => {
          try {
            const url = `https://criptoya.com/api/${ex}/${base}/${quote}`;
            const j = await getJSON(url);
            const last = Number(j?.last || j?.precio || j?.price || j?.venta || j?.ask);
            if (last) {
              rows.push({ exchange: ex.toUpperCase(), pair: `${base.toUpperCase()}/${quote.toUpperCase()}`, last });
            }
          } catch {}
        })
      );
      out.push({ pair, rows, source: "criptoya" });
      continue;
    }

    out.push({ pair, rows: [], source: "n/a", error: "quote no soportado" });
  }

  res.json({ pairs: out });
});

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ MVP corriendo en http://localhost:${PORT}`));
