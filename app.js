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

  // placeholders (sin romper, los vamos completando después)
  {name:"MEXC",todo:true},{name:"Bitget",todo:true},{name:"KuCoin",todo:true},
  {name:"Gate.io",todo:true},{name:"Kraken",todo:true},{name:"Bitfinex",todo:true},
  {name:"BingX",todo:true},{name:"Bitstamp",todo:true},{name:"CoinEx",todo:true},
  {name:"HTX",todo:true},{name:"Ripio",todo:true},{name:"Buenbit",todo:true},
  {name:"LemonCash",todo:true},{name:"Let’sBit",todo:true},
  {name:"Belo",todo:true},{name:"SatoshiTango",todo:true},
  {name:"UniversalCoins",todo:true},{name:"PlusCrypto",todo:true},{name:"Saldo",todo:true},
  {name:"TiendaCrypto",todo:true},{name:"CocosCrypto",todo:true},{name:"LeningradoCash",todo:true}
];
