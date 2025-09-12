const COINGECKO_IDS = {
  btc: "bitcoin", eth: "ethereum", sol: "solana",
  bnb: "binancecoin", ada: "cardano", xrp: "ripple",
  doge: "dogecoin", matic: "matic-network", link: "chainlink", ton: "the-open-network",
  usdt: "tether", usdc: "usd-coin", dai: "dai"
};

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export default async function handler(req, res) {
  const listRaw = (req.query.list || "").toString().trim();
  if (!listRaw) return res.status(200).json({ pairs: [] });

  const pairs = listRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = [];

  for (const pair of pairs) {
    const [base, quote] = pair.split("-");
    if (!base || !quote) continue;

    // USD -> CoinGecko
    if (quote === "usd") {
      const id = COINGECKO_IDS[base];
      if (!id) { out.push({ pair, rows: [], source:"coingecko", error:"no mapeada" }); continue; }
      try {
        const j = await getJSON(`https://api.coingecko.com/api/v3/coins/${id}/tickers?include_exchange_logo=true`);
        const rows = (j.tickers || [])
          .filter(t => (t?.target || "").toUpperCase()==="USD")
          .map(t => ({
            exchange: t?.market?.name || "—",
            pair: `${t?.base}/${t?.target}`,
            last: Number(t?.last) || null,
            volume24h: Number(t?.volume) || null
          }))
          .slice(0,15);
        out.push({ pair, rows, source:"coingecko" });
      } catch(e) {
        out.push({ pair, rows: [], source:"coingecko", error:String(e) });
      }
      continue;
    }

    // ARS -> CriptoYA
    if (quote === "ars") {
      const exs = ["binancep2p","belo","ripio","lemoncash","satoshitango","tiendacrypto"];
      const rows = [];
      await Promise.all(exs.map(async (ex)=>{
        try {
          const j = await getJSON(`https://criptoya.com/api/${ex}/${base}/${quote}`);
          const last = Number(j?.last || j?.precio || j?.price || j?.venta || j?.ask);
          if (last) rows.push({ exchange: ex.toUpperCase(), pair:`${base.toUpperCase()}/${quote.toUpperCase()}`, last });
        } catch {}
      }));
      out.push({ pair, rows, source:"criptoya" });
      continue;
    }

    out.push({ pair, rows:[], source:"n/a", error:"quote no soportado" });
  }

  res.status(200).json({ pairs: out });
}
