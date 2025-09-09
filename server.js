import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.static("./"));

// Endpoint para los precios de exchanges
app.get("/api/exchanges", async (req, res) => {
  try {
    const response = await fetch("https://criptoya.com/api/btc/usdt/0.1"); 
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "No se pudo obtener datos de exchanges" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Servidor en puerto", PORT));
