import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// servir archivos estáticos desde la raíz
app.use(express.static(__dirname));

// ruta raíz → devuelve index.html (minúsculas)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ...tus rutas /api/dolar, /api/stats24h, /api/quotes
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server on :${port}`));
