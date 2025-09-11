// server.js (SAFE)
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.static(".", { extensions: ["html"] }));

// Health para Render
app.get("/healthz", (_req, res) => res.send("ok"));

// Proxy a CriptoYa (real)
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { timeout: 8000 });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: "no_dolar_data", detail: String(e) });
  }
});

// Mock de emergencia (por si querés probar sin red)
app.get("/api/dolar_mock", (_req, res) => {
  res.json({
    oficial: { venta: 1435, compra: 1435 },
    tarjeta: { venta: 1865.5, compra: 1865.5 },
    blue:    { venta: 1395,  compra: 1375 },
    mep:     1379.9,
    ccl:     1378.3,
    cripto:  1381
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("SAFE server on http://localhost:" + PORT);
});
