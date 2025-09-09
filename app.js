// ===== Util =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const fmtUSD = (n) => n == null ? "—" : `$ ${n.toLocaleString("en-US", {maximumFractionDigits: 2})}`;
const fmtARS = (n) => n == null ? "—" : `AR$ ${n.toLocaleString("es-AR", {maximumFractionDigits: 2})}`;

// Estado
let dolarCripto = null;   // valor vivo (ARS por USD)
let currentAsset = "BTCUSDT";

// ===== Dólar widget =====
async function loadDolar() {
  try {
    const r = await fetch("/api/dolar");
    const j = await r.json();
    if (j.oficial) $("#dolar-oficial").textContent = fmtARS(j.oficial);
    if (j.blue) $("#dolar-blue").textContent = fmtARS(j.blue);
    // dolar cripto puede venir null: usamos fallback sugerido y el usuario puede cambiarlo
    dolarCripto = j.cripto ?? j.fallbackSugerido ?? 1600;
    $("#dolar-cripto").textContent = fmtARS(dolarCripto);
  } catch {
    dolarCripto = 1600;
    $("#dolar-oficial").textContent = "—";
    $("#dolar-blue").textContent = "—";
    $("#dolar-cripto").textContent = fmtARS(dolarCripto);
  }
}

// set manual
$("#dolar-cripto-set").addEventListener("click", () => {
  const val = parseFloat($("#dolar-cripto-input").value);
  if (!isNaN(val) && val > 0) {
    dolarCripto = val;
    $("#dolar-cripto").textContent = fmtARS(dolarCripto);
    renderQuotes(); // recomputa ARS
  }
});

// ===== Quotes por exchange =====
/**
 * Para BTC/ETH/SOL usamos símbolo spot XXUSDT.
 * Para estables mostramos 1.00 aprox (y ARS = dolarCripto)
 */
async function getPricesFor(symbol) {
  // Binance
  const bn = await fetch(`/api/binance/price?symbol=${symbol}`).then(r=>r.json()).catch(()=>null);
  // Bybit
  const by = await fetch(`/api/bybit/price?symbol=${symbol}`).then(r=>r.json()).catch(()=>null);
  // OKX (usa guion)
  const okxSym = symbol.replace("USDT", "-USDT");
  const ok = await fetch(`/api/okx/price?instId=${okxSym}`).then(r=>r.json()).catch(()=>null);

  const rows = [];
  if (bn && bn.price) rows.push({ exchange: "Binance", symbol, price: +bn.price });
  if (by && by.price) rows.push({ exchange: "Bybit", symbol, price: +by.price });
  if (ok && ok.price) rows.push({ exchange: "OKX", symbol: ok.symbol, price: +ok.price });

  return rows;
}

async function renderQuotes() {
  const tbody = $("#quotes-body");
  tbody.innerHTML = "";

  let symbol = currentAsset;
  let rows = [];
  if (["USDT","USDC","DAI"].includes(symbol)) {
    // estables ~1 USD
    rows = [
      { exchange: "Binance", symbol, price: 1.00 },
      { exchange: "Bybit",   symbol, price: 1.00 },
      { exchange: "OKX",     symbol, price: 1.00 },
    ];
  } else {
    rows = await getPricesFor(symbol);
  }

  const showARS = $("#toggle-ars").checked;
  rows.forEach(r => {
    const tr = document.createElement("div");
    tr.innerHTML = `
      <div>${r.exchange}</div>
      <div>${r.symbol}</div>
      <div class="right">${fmtUSD(r.price)}</div>
      <div class="right show-ars">${showARS ? fmtARS(r.price * (dolarCripto || 1600)) : ""}</div>
    `;
    tbody.appendChild(tr);
  });
}

// Tabs
$$(".tab").forEach(b=>{
  b.addEventListener("click", ()=>{
    $$(".tab").forEach(t=>t.classList.remove("active"));
    b.classList.add("active");
    const a = b.getAttribute("data-asset");
    currentAsset = a.endsWith("USDT") ? a : a; // USDT, USDC, DAI quedan como “estables”
    $("#chart-symbol").textContent = a.endsWith("USDT") ? a : (a + "USDT");
    renderQuotes();
    loadChart(); // recarga velas para el nuevo símbolo si corresponde
  });
});

// Toggle ARS
$("#toggle-ars").addEventListener("change", renderQuotes);

// ===== Gráfico (Lightweight Charts) =====
let chart, candleSeries;

function ensureChart() {
  if (chart) return;
  chart = LightweightCharts.createChart($("#chart"), {
    timeScale: { timeVisible: true, borderVisible: false },
    rightPriceScale: { borderVisible: false },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    crosshair: { mode: 0 }
  });
  candleSeries = chart.addCandlestickSeries();
}

async function loadChart() {
  ensureChart();
  const sym = (["USDT","USDC","DAI"].includes(currentAsset)) ? "BTCUSDT" : currentAsset; // para estables mostramos BTC
  const interval = $("#interval").value;
  try {
    const data = await fetch(`/api/binance/candles?symbol=${sym}&interval=${interval}&limit=500`).then(r=>r.json());
    const series = data.map(k => ({
      time: Math.floor(k.t/1000),
      open: k.o, high: k.h, low: k.l, close: k.c
    }));
    candleSeries.setData(series);
  } catch {
    candleSeries.setData([]);
  }
}

$("#interval").addEventListener("change", loadChart);

// ===== Análisis “IA” simple (MA cross) =====
function sma(arr, len) {
  if (len <= 0 || len > arr.length) return [];
  const out = [];
  let sum = 0;
  for (let i=0;i<arr.length;i++){
    sum += arr[i];
    if (i>=len) sum -= arr[i-len];
    if (i>=len-1) out.push(sum/len);
  }
  return out;
}

$("#run-analysis").addEventListener("click", ()=>{
  const shortLen = Math.max(2, parseInt($("#ma-short").value, 10) || 9);
  const longLen  = Math.max(shortLen+1, parseInt($("#ma-long").value, 10) || 21);

  // Tomamos últimos datos del gráfico
  const data = candleSeries._series?._data || []; // acceso interno del lib; si cambia, caemos al cálculo vacío
  const closes = data.map(d => d.close);
  if (closes.length < longLen) {
    $("#analysis-out").textContent = "No hay suficientes velas para calcular.";
    return;
  }
  const smaS = sma(closes, shortLen);
  const smaL = sma(closes, longLen);
  // alineamos por el final
  const off = smaL.length - smaS.length;
  const s = off > 0 ? smaS : smaS.slice(-smaL.length);
  const l = off > 0 ? smaL.slice(off) : smaL;

  if (!s.length || !l.length) {
    $("#analysis-out").textContent = "No se pudo calcular.";
    return;
  }

  const lastS = s[s.length-1];
  const lastL = l[l.length-1];
  const prevS = s[s.length-2] ?? lastS;
  const prevL = l[l.length-2] ?? lastL;

  let signal = "Neutral";
  if (prevS <= prevL && lastS > lastL) signal = "Cruce alcista (bullish)";
  else if (prevS >= prevL && lastS < lastL) signal = "Cruce bajista (bearish)";
  const lastClose = closes[closes.length-1];

  $("#analysis-out").textContent =
`MA(${shortLen})=${lastS.toFixed(2)} | MA(${longLen})=${lastL.toFixed(2)} | Close=${lastClose.toFixed(2)}
Señal: ${signal}
Nota: Esto NO es consejo financiero. Ajustá longitudes e intervalo para tu operativa.`;
});

// ===== Init =====
(async function init(){
  await loadDolar();
  await renderQuotes();
  await loadChart();
})();
