export default async function handler(req, res) {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares");
    const data = await r.json();

    const pick = (tipo) => data.find((d) => (d.casa || d.nombre || "").toLowerCase().includes(tipo));
    const toNumber = (v) => (typeof v === "number" ? v : Number(String(v).replace(",", ".")));
    const map = (d) =>
      d ? {
        compra: toNumber(d.compra ?? d.bid ?? d.promedio ?? d.valor ?? d.value ?? null),
        venta: toNumber(d.venta ?? d.ask ?? d.promedio ?? d.valor ?? d.value ?? null),
        fuente: d.casa || d.nombre || "DolarAPI"
      } : null;

    const oficial = map(pick("oficial"));
    const blue   = map(pick("blue"));
    const mep    = map(pick("mep"));
    const ccl    = map(pick("contado con liqui")) || map(pick("ccl"));
    const tarjeta= map(pick("tarjeta")) || map(pick("qatar"));

    res.status(200).json({ oficial, blue, mep, ccl, tarjeta });
  } catch (e) {
    res.status(200).json({ oficial:null, blue:null, mep:null, ccl:null, tarjeta:null, error:String(e) });
  }
}
