// app.js — Charly Cripto (compacto + robusto)

/* Utils */
const fmt = n => new Intl.NumberFormat("es-AR",{maximumFractionDigits:2}).format(n);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function fetchJSON(url, {retries=2, delay=700} = {}) {
  let err;
  for (let i=0;i<=retries;i++){
    try {
      const r = await fetch(url, {headers:{'accept':'application/json'}});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch(e){
      err = e;
      if (i<retries) await sleep(delay);
    }
  }
  throw err;
}

/* ===== Estado Dólar ===== */
const dollarState = {
  oficial:{compra:null,venta:null},
  blue:{compra:null,venta:null},
  tarjeta:{compra:null,venta:null},
  mep:{compra:null,venta:null},
  ccl:{compra:null,venta:null},
  cripto:{valor:1600}
};

const DOLS = [
  {key:"oficial",label:"Oficial"},
  {key:"blue",label:"Blue"},
  {key:"tarjeta",label:"Tarjeta"},
  {key:"mep",label:"MEP"},
  {key:"ccl",label:"CCL"},
  {key:"cripto",label:"Cripto (USDT≈USD)"}
];

function paintDollarBoxes(){
  const grid = document.getElementById("dollarGrid");
  grid.innerHTML = "";
  DOLS.forEach(d=>{
    const box = document.createElement("div");
    box.className = "dol-box";
    let html = `<div class="dol-tit">${d.label}</div><div class="dol-sub">—</div><div class="dol-val">—</div>`;
    if (d.key === "cripto"){
      const v = dollarState.cripto.valor ?? 1600;
      html = `<div class="dol-tit">${d.label}</div><div class="dol-sub">manual o API</div><div class="dol-val">AR$ ${fmt(v)}</div>`;
    } else {
      const s = dollarState[d.key];
      if (s?.compra && s?.venta){
        html = `<div class="dol-tit">${d.label}</div><div class="dol-sub">Compra / Venta</div><div class="dol-val">AR$ ${fmt(s.compra)} / AR$ ${fmt(s.venta)}</div>`;
      }
    }
    box.innerHTML = html;
    grid.appendChild(box);
  });
}

// CriptoYa: agrego anti-cache y retry
async function loadDollarsFromAPI(){
  try {
    const ts = Date.now();
    const url = '/proxy?url=' + encodeURIComponent(`https://criptoya.com/api/dolar?ts=${ts}`);
    const d = await fetchJSON(url, {retries:2, delay:800});

    // algunos campos pueden venir null por ratitos; pinto lo que haya
    dollarState.oficial = { compra: d?.oficial?.bid ?? null, venta: d?.oficial?.ask ?? null };
    dollarState.blue    = { compra: d?.blue?.bid ?? null,    venta: d?.blue?.ask ?? null };
    dollarState.mep     = { compra: d?.mep?.bid ?? null,     venta: d?.mep?.ask ?? null };
    dollarState.ccl     = { compra: d?.ccl?.bid ?? null,     venta: d?.ccl?.ask ?? null };
    const solBid = d?.solidario?.bid ?? d?.ahorro?.bid ?? null;
    const solAsk = d?.solidario?.ask ?? d?.ahorro?.ask ?? null;
    dollarState.tarjeta = { compra: solBid, venta: solAsk };

  } catch(e){
    console.warn("Dólar API no disponible:", e.message);
    // si falla, dejamos lo que hubiera (guiones)
  } finally {
    paintDollarBoxes();
  }
}

document.getElementById("btnUsdtSet").onclick = ()=>{
  const v = +document.getElementById("usdtArs").value;
  if (v>0) dollarState.cripto.valor = Math.round(v);
  paintDollarBoxes();
};

/* ===== Exchanges ===== */
const EXCHANGES = [
  { // Binance
    name:"Binance",
    sym:p=>p,
    url:p=>`https://api.binance.com/api/v3/ticker/price?symbol=${p}`,
    pick:d=>+d.price
  },
  { // Bybit
    name:"Bybit",
    sym:p=>p,
    url:p=>`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${p}`,
    pick:d=>+d.result.list[0].lastPrice
  },
  { // OKX
    name:"OKX",
    sym:p=>p.replace("USDT","-USDT"),
    url:p=>`https://www.okx.com/api/v5/market/ticker?instId=${p.replace("USDT","-USDT")}`,
    pick:d=>+d.data[0].last
  },

  // placeholders (sin romper)
  {name:"MEXC",todo:true},{name:"Bitget",todo:true},{name:"KuCoin",todo:true},{name:"Gate.io",todo:true},
  {name:"Kraken",todo:true},{name:"Bitfinex",todo:true},{name:"BingX",todo:true},{name:"Bitstamp",todo:true},
  {name:"CoinEx",todo:true},{name:"HTX",todo:true},{name:"Ripio",todo:true},{name:"Buenbit",todo:true},
  {name:"LemonCash",todo:true},{name:"Let’sBit",todo:true},{name:"ArgenBTC",todo:true},{name:"Belo",todo:true},
  {name:"SatoshiTango",todo:true},{name:"UniversalCoins",todo:true},{name:"PlusCrypto",todo:true},{name:"Saldo",todo:true}
];

let currentPair = "ETHUSDT";
const tbody = document.querySelector("#tblQuotes tbody");
const chkArs = document.getElementById("chkArs");

async function fetchOne(ex, pair){
  if (ex.todo) return { ex: ex.name, symbol: ex.sym ? ex.sym(pair) : pair, usd: null, ars: null, note:"configurar" };
  try {
    const ts = Date.now();
    const url = '/proxy?url=' + encodeURIComponent(ex.url(ex.sym(pair)) + (ex.url('').includes('?') ? `&ts=${ts}` : `?ts=${ts}`));
    const d = await fetchJSON(url, {retries:2, delay:800});
    const usd = ex.pick(d);
    const ars = chkArs.checked ? usd * (dollarState.cripto.valor ?? 1600) : null;
    return { ex: ex.name, symbol: ex.sym(pair), usd, ars };
  } catch(e){
    return { ex: ex.name, symbol: ex.sym(pair), usd: null, ars: null, note:"error" };
  }
}

async function loadQuotes(pair = currentPair){
  tbody.innerHTML = "";
  const rows = await Promise.all(EXCHANGES.map(x=>fetchOne(x, pair)));
  for (const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.ex}${r.note?` <span class="badge">${r.note}</span>`:""}</td>
      <td>${r.symbol || pair}</td>
      <td>${r.usd?("$ "+fmt(r.usd)):"—"}</td>
      <td>${r.ars?("AR$ "+fmt(r.ars)):"—"}</td>
    `;
    tbody.appendChild(tr);
  }
}
chkArs.addEventListener("change", ()=>loadQuotes());

/* ===== TradingView ===== */
let tv;
function mountTV(pair){
  document.getElementById("tvchart").innerHTML = "";
  const symbol = "BINANCE:" + pair;
  tv = new TradingView.widget({
    container_id: "tvchart",
    symbol,
    interval: "60",
    theme: "dark",
    autosize: true,
    locale: "es"
  });
}
document.querySelectorAll(".sym").forEach(b=>{
  b.addEventListener("click",()=>{
    currentPair = b.dataset.sym;
    document.getElementById("chartPair").textContent = `Par: ${currentPair} · Intervalo: 1h`;
    loadQuotes();
    mountTV(currentPair);
  });
});

/* ===== Init ===== */
paintDollarBoxes();
loadDollarsFromAPI();
loadQuotes();
mountTV(currentPair);

// MA demo (placeholder)
document.getElementById("btnMA").onclick = ()=>{
  const s = +document.getElementById("maS").value;
  const l = +document.getElementById("maL").value;
  const out = document.getElementById("maOut");
  if (l<=s){ out.textContent="La MA larga debe ser mayor a la corta."; return; }
  out.textContent=`Cuando conectemos datos del gráfico, calculo cruces de MA(${s}) y MA(${l}).`;
};
