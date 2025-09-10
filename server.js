// app.js (ESM)

// ---------------- Dólar widgets ----------------
// De momento uso un “provider” simple. Si querés, después los conecto a criptoya vía /proxy.
const dollarState = {
  oficial: { compra: null, venta: null },
  blue:    { compra: null, venta: null },
  tarjeta: { compra: null, venta: null },
  mep:     { compra: null, venta: null },
  ccl:     { compra: null, venta: null },
  cripto:  { valor: 1600 }   // editable desde el input
};

// Render básico de 6 cajas
const DOLS = [
  {key:"oficial", label:"Oficial"},
  {key:"blue",    label:"Blue"},
  {key:"tarjeta", label:"Tarjeta"},
  {key:"mep",     label:"MEP"},
  {key:"ccl",     label:"CCL"},
  {key:"cripto",  label:"Cripto (USDT≈USD)"},
];

function paintDollarBoxes(){
  const grid = document.getElementById("dollarGrid");
  grid.innerHTML = "";
  DOLS.forEach(d=>{
    const box = document.createElement("div");
    box.className = "dol-box";
    let html = `<div class="dol-tit">${d.label}</div><div class="dol-sub">—</div><div class="dol-val">—</div>`;
    if(d.key === "cripto"){
      const v = dollarState.cripto.valor ?? 1600;
      html = `<div class="dol-tit">${d.label}</div>
              <div class="dol-sub">manual o API</div>
              <div class="dol-val">AR$ ${fmt(v)}</div>`;
    }else{
      const s = dollarState[d.key];
      if(s && s.compra && s.venta){
        html = `<div class="dol-tit">${d.label}</div>
                <div class="dol-sub">Compra / Venta</div>
                <div class="dol-val">AR$ ${fmt(s.compra)} / AR$ ${fmt(s.venta)}</div>`;
      }
    }
    box.innerHTML = html;
    grid.appendChild(box);
  });
}

// (Opcional) Hook para que más adelante conectemos a API (ej: criptoya) usando el proxy del server.
async function loadDollarsFromAPI(){
  try{
    // Ejemplo de cómo cablear uno (comentar si no hay API lista):
    // const r = await fetch('/proxy?url=' + encodeURIComponent('https://criptoya.com/api/dolar'));
    // const d = await r.json();
    // dollarState.oficial = { compra: d.oficial?.bid, venta: d.oficial?.ask };
    // dollarState.blue    = { compra: d.blue?.bid,    venta: d.blue?.ask    };
    // dollarState.mep     = { compra: d.mep?.bid,     venta: d.mep?.ask     };
    // dollarState.ccl     = { compra: d.ccl?.bid,     venta: d.ccl?.ask     };
    // dollarState.tarjeta = { compra: d.solidario?.bid, venta: d.solidario?.ask };
  }catch(e){
    console.warn("Dólar API no disponible aún:", e.message);
  }finally{
    paintDollarBoxes();
  }
}

document.getElementById("btnUsdtSet").onclick = ()=>{
  const v = +document.getElementById("usdtArs").value;
  if (v>0) dollarState.cripto.valor = Math.round(v);
  paintDollarBoxes();
};

// ---------------- Exchanges ----------------
const EXCHANGES = [
  // funcionando (3)
  { name:"Binance", sym:(p)=>p, url:(p)=>`https://api.binance.com/api/v3/ticker/price?symbol=${p}`, pick:(d)=>+d.price },
  { name:"Bybit",   sym:(p)=>p, url:(p)=>`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${p}`, pick:(d)=>+d.result.list[0].lastPrice },
  { name:"OKX",     sym:(p)=>p.replace("USDT","-USDT"), url:(p)=>`https://www.okx.com/api/v5/market/ticker?instId=${p.replace("USDT","-USDT")}`, pick:(d)=>+d.data[0].last },

  // listados (placeholder, no rompen)
  { name:"MEXC",    todo:true },
  { name:"Bitget",  todo:true },
  { name:"KuCoin",  todo:true },
  { name:"Gate.io", todo:true },
  { name:"Kraken",  todo:true },
  { name:"Bitfinex",todo:true },
  { name:"BingX",   todo:true },
  { name:"Bitstamp",todo:true },
  { name:"CoinEx",  todo:true },
  { name:"Huobi/HTX", todo:true },
  { name:"Ripio",   todo:true },
  { name:"Buenbit", todo:true },
  { name:"LemonCash", todo:true },
  { name:"Let’sBit",  todo:true },
  { name:"ArgenBTC",  todo:true },
  { name:"Belo",      todo:true },
  { name:"SatoshiTango", todo:true },
  { name:"UniversalCoins", todo:true },
  { name:"PlusCrypto", todo:true },
  { name:"Saldo",     todo:true }
];

let currentPair = "ETHUSDT";
const tbody = document.querySelector("#tblQuotes tbody");
const chkArs = document.getElementById("chkArs");

function fmt(n){ return new Intl.NumberFormat("es-AR",{maximumFractionDigits:2}).format(n); }

async function fetchOne(ex, pair){
  if(ex.todo) return { ex: ex.name, symbol: pair, usd: null, ars: null, note:"configurar" };
  try{
    const url = '/proxy?url=' + encodeURIComponent(ex.url(ex.sym(pair)));
    const r = await fetch(url);
    const d = await r.json();
    const usd = ex.pick(d);
    const ars = chkArs.checked ? usd * (dollarState.cripto.valor ?? 1600) : null;
    return { ex: ex.name, symbol: ex.sym(pair), usd, ars };
  }catch(e){
    return { ex: ex.name, symbol: ex.sym(pair), usd: null, ars: null, note:"error" };
  }
}

async function loadQuotes(pair=currentPair){
  tbody.innerHTML = "";
  const rows = await Promise.all(EXCHANGES.map(x=>fetchOne(x, pair)));
  for(const r of rows){
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

// botones de par
document.querySelectorAll(".sym").forEach(b=>{
  b.addEventListener("click",()=>{
    currentPair = b.dataset.sym;
    document.getElementById("chartPair").textContent = `Par: ${currentPair} · Intervalo: 1h`;
    loadQuotes();
    mountTV(currentPair);
  });
});
chkArs.addEventListener("change", ()=>loadQuotes());

// ---------------- TradingView ----------------
let tv;
function mountTV(pair){
  document.getElementById("tvchart").innerHTML = ""; // limpiar
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

// ---------------- Init ----------------
paintDollarBoxes();
loadDollarsFromAPI(); // si no hay API, igual pinta con lo que haya
loadQuotes();
mountTV(currentPair);

// MA demo
document.getElementById("btnMA").onclick = ()=>{
  const s = +document.getElementById("maS").value;
  const l = +document.getElementById("maL").value;
  const out = document.getElementById("maOut");
  if(l<=s){ out.textContent = "La MA larga debe ser mayor a la corta."; return; }
  out.textContent = `Cuando conectemos los datos del gráfico, calculo cruces de MA(${s}) y MA(${l}) para darte señal (alcista/bajista).`;
};
