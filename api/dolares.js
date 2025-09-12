// /api/dolares.js
export default async function handler(req, res) {
  try {
    // 1) Dólares de DolarAPI (lista completa)
    const r = await fetch("https://dolarapi.com/v1/dolares");
    if (!r.ok) throw new Error(`DolarAPI ${r.status}`);
    const data = await r.json();

    const pick = (tipo) => data.find((d) => {
      const n = (d.casa || d.nombre || "").toLowerCase();
      return n.includes(tipo);
    });

    const toNumber = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")));
    const map = (d) =>
      d ? {
        compra: toNumber(d.compra ?? d.bid ?? d.promedio ?? d.valor ?? d.value),
        venta:  toNumber(d.venta  ?? d.ask ?? d.promedio ?? d.valor ?? d.value),
        fuente: d.casa || d.nombre || "DolarAPI"
      } : null;

    const oficial = map(pick("oficial"));
    const blue    = map(pick("blue"));
    const mep     = map(pick("mep")) || map(pick("bolsa"));         // algunos lo listan como “bolsa”
    const ccl     = map(pick("contado con liqui")) || map(pick("ccl"));
    const tarjeta = map(pick("tarjeta")) || map(pick("qatar"));

    // 2) “Cripto dólar” (USDT/ARS) — opcional, si responde CriptoYA
    let cripto = null;
    try {
      const candidates = [
        "https://criptoya.com/api/binancep2p/usdt/ars/1",
        "https://criptoya.com/api/belo/usdt/ars",
        "https://criptoya.com/api/ripio/usdt/ars",
        "https://criptoya.com/api/lemoncash/usdt/ars"
      ];
      for (const url of candidates) {
        try {
          const j = await (await fetch(url, { cache: "no-store" })).json();
          const v = j?.price ?? j?.venta ?? j?.sell ?? j?.ask ?? j?.ars ?? j?.v ?? j?.promedio ?? j?.avg;
          const w = j?.compra ?? j?.buy  ?? j?.bid ?? j?.ars ?? j?.c ?? j?.promedio ?? j?.avg ?? v;
          const venta  = toNumber(v);
          const compra = toNumber(w);
          if (!Number.isNaN(venta) || !Number.isNaN(compra)) {
            cripto = { compra: compra || null, venta: venta || compra || null, fuente: url.split("/api/")[1] };
            break;
          }
        } catch {}
      }
    } catch {}

    res.status(200).json({ oficial, blue, mep, ccl, tarjeta, cripto });
  } catch (e) {
    res.status(200).json({
      oficial: null, blue: null, mep: null, ccl: null, tarjeta: null, cripto: null,
      error: String(e)
    });
  }
}
