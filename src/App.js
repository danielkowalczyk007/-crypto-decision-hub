import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

// ============== GLOBAL STYLES ==============
const injectStyles = () => {
  if (document.getElementById('crypto-hub-styles')) return;
  const style = document.createElement('style');
  style.id = 'crypto-hub-styles';
  style.textContent = `
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
  document.head.appendChild(style);
};
injectStyles();

// ============== CRYPTO UTILS FOR BINANCE AUTH ==============
const generateSignature = async (queryString, secretKey) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const saveApiKeys = (apiKey, secretKey) => {
  try { localStorage.setItem('binance_api_key', btoa(apiKey)); localStorage.setItem('binance_secret_key', btoa(secretKey)); return true; }
  catch (e) { return false; }
};

const loadApiKeys = () => {
  try {
    const apiKey = localStorage.getItem('binance_api_key');
    const secretKey = localStorage.getItem('binance_secret_key');
    return { apiKey: apiKey ? atob(apiKey) : '', secretKey: secretKey ? atob(secretKey) : '' };
  } catch (e) { return { apiKey: '', secretKey: '' }; }
};

const clearApiKeys = () => { localStorage.removeItem('binance_api_key'); localStorage.removeItem('binance_secret_key'); };

// ============== ALERTS STORAGE ==============
const saveAlerts = (alerts) => {
  try { localStorage.setItem('crypto_hub_alerts', JSON.stringify(alerts)); return true; }
  catch (e) { return false; }
};

const loadAlerts = () => {
  try {
    const data = localStorage.getItem('crypto_hub_alerts');
    return data ? JSON.parse(data) : [];
  } catch (e) { return []; }
};

const saveAlertHistory = (history) => {
  try { localStorage.setItem('crypto_hub_alert_history', JSON.stringify(history.slice(-50))); return true; }
  catch (e) { return false; }
};

const loadAlertHistory = () => {
  try {
    const data = localStorage.getItem('crypto_hub_alert_history');
    return data ? JSON.parse(data) : [];
  } catch (e) { return []; }
};

// ============== BINANCE AUTHENTICATED API ==============
const fetchSpotBalance = async (apiKey, secretKey) => {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await generateSignature(queryString, secretKey);
    const response = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.msg || 'API Error'); }
    const data = await response.json();
    const balances = data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked), total: parseFloat(b.free) + parseFloat(b.locked) }))
      .sort((a, b) => b.total - a.total);
    return { balances, canTrade: data.canTrade, accountType: 'SPOT' };
  } catch (error) { return { error: error.message }; }
};

const fetchFuturesBalance = async (apiKey, secretKey) => {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await generateSignature(queryString, secretKey);
    const response = await fetch(`https://fapi.binance.com/fapi/v2/balance?${queryString}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.msg || 'API Error'); }
    const data = await response.json();
    const balances = data.filter(b => parseFloat(b.balance) > 0 || parseFloat(b.crossUnPnl) !== 0)
      .map(b => ({ asset: b.asset, balance: parseFloat(b.balance), crossUnPnl: parseFloat(b.crossUnPnl), availableBalance: parseFloat(b.availableBalance) }));
    return { balances, accountType: 'FUTURES' };
  } catch (error) { return { error: error.message }; }
};

const fetchFuturesPositions = async (apiKey, secretKey) => {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await generateSignature(queryString, secretKey);
    const response = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.msg || 'API Error'); }
    const data = await response.json();
    const positions = data.filter(p => parseFloat(p.positionAmt) !== 0).map(p => ({
      symbol: p.symbol, positionAmt: parseFloat(p.positionAmt), entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice), unRealizedProfit: parseFloat(p.unRealizedProfit),
      liquidationPrice: parseFloat(p.liquidationPrice), leverage: parseInt(p.leverage), marginType: p.marginType,
      side: parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT',
      pnlPercent: ((parseFloat(p.markPrice) - parseFloat(p.entryPrice)) / parseFloat(p.entryPrice) * 100 * (parseFloat(p.positionAmt) > 0 ? 1 : -1)).toFixed(2)
    }));
    return { positions };
  } catch (error) { return { error: error.message }; }
};

const fetchOpenOrders = async (apiKey, secretKey) => {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await generateSignature(queryString, secretKey);
    const [spotRes, futuresRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/openOrders?${queryString}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } }),
      fetch(`https://fapi.binance.com/fapi/v1/openOrders?${queryString}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } })
    ]);
    const spotOrders = spotRes.ok ? await spotRes.json() : [];
    const futuresOrders = futuresRes.ok ? await futuresRes.json() : [];
    return { spot: spotOrders.map(o => ({ ...o, market: 'SPOT' })), futures: futuresOrders.map(o => ({ ...o, market: 'FUTURES' })) };
  } catch (error) { return { error: error.message }; }
};

// ============== TRADING FUNCTIONS ==============
const placeSpotOrder = async (apiKey, secretKey, symbol, side, type, quantity, price = null) => {
  try {
    const timestamp = Date.now();
    let params = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
    if (type === 'LIMIT' && price) params += `&price=${price}&timeInForce=GTC`;
    const signature = await generateSignature(params, secretKey);
    const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Order failed');
    return { success: true, order: data };
  } catch (error) { return { success: false, error: error.message }; }
};

const placeFuturesOrder = async (apiKey, secretKey, symbol, side, type, quantity, price = null, reduceOnly = false) => {
  try {
    const timestamp = Date.now();
    let params = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
    if (type === 'LIMIT' && price) params += `&price=${price}&timeInForce=GTC`;
    if (reduceOnly) params += `&reduceOnly=true`;
    const signature = await generateSignature(params, secretKey);
    const response = await fetch(`https://fapi.binance.com/fapi/v1/order?${params}&signature=${signature}`, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Order failed');
    return { success: true, order: data };
  } catch (error) { return { success: false, error: error.message }; }
};

const closeFuturesPosition = async (apiKey, secretKey, symbol, positionAmt) => {
  const side = parseFloat(positionAmt) > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(parseFloat(positionAmt));
  return placeFuturesOrder(apiKey, secretKey, symbol, side, 'MARKET', quantity, null, true);
};

const cancelOrder = async (apiKey, secretKey, symbol, orderId, market) => {
  try {
    const timestamp = Date.now();
    const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = await generateSignature(params, secretKey);
    const baseUrl = market === 'FUTURES' ? 'https://fapi.binance.com/fapi/v1/order' : 'https://api.binance.com/api/v3/order';
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, { method: 'DELETE', headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Cancel failed');
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
};

// ============== API FUNCTIONS ==============
const fetchCoinGeckoData = async () => {
  try {
    const [priceRes, globalRes, fgRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'),
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.alternative.me/fng/?limit=1')
    ]);
    const prices = await priceRes.json();
    const global = await globalRes.json();
    const fg = await fgRes.json();
    return {
      btcPrice: { value: prices.bitcoin?.usd || 0, change: parseFloat(prices.bitcoin?.usd_24h_change?.toFixed(2)) || 0 },
      ethPrice: { value: prices.ethereum?.usd || 0, change: parseFloat(prices.ethereum?.usd_24h_change?.toFixed(2)) || 0 },
      solPrice: { value: prices.solana?.usd || 0, change: parseFloat(prices.solana?.usd_24h_change?.toFixed(2)) || 0 },
      btcDominance: { value: parseFloat(global.data?.market_cap_percentage?.btc?.toFixed(1)) || 0 },
      volume24h: parseFloat((global.data?.total_volume?.usd / 1e9)?.toFixed(1)) || 0,
      fearGreed: { value: parseInt(fg.data?.[0]?.value) || 50, label: fg.data?.[0]?.value_classification || 'Neutral' }
    };
  } catch (error) { return null; }
};

const fetchBinanceData = async () => {
  try {
    const [fundingRes, oiRes, lsRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1'),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1')
    ]);
    const funding = await fundingRes.json();
    const oi = await oiRes.json();
    const ls = await lsRes.json();
    const btcPrice = (await (await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')).json()).price;
    return {
      fundingRate: { value: parseFloat((parseFloat(funding[0]?.fundingRate) * 100).toFixed(4)) || 0 },
      openInterest: { value: parseFloat(((parseFloat(oi?.openInterest) * parseFloat(btcPrice)) / 1e9).toFixed(2)) || 0 },
      longShortRatio: { value: parseFloat(parseFloat(ls[0]?.longShortRatio).toFixed(2)) || 1 }
    };
  } catch (error) { return null; }
};

const fetchDefiLlamaData = async () => {
  try {
    const [tvlRes, stableRes, protocolsRes] = await Promise.all([
      fetch('https://api.llama.fi/v2/historicalChainTvl'),
      fetch('https://api.llama.fi/v2/stablecoins'),
      fetch('https://api.llama.fi/protocols')
    ]);
    const tvlData = await tvlRes.json();
    const stableData = await stableRes.json();
    const protocols = await protocolsRes.json();
    const latestTvl = tvlData[tvlData.length - 1]?.tvl || 0;
    const weekAgoTvl = tvlData[tvlData.length - 8]?.tvl || latestTvl;
    const tvlChange = ((latestTvl - weekAgoTvl) / weekAgoTvl * 100).toFixed(1);
    const latestStable = stableData.reduce((sum, s) => sum + (s.circulating?.peggedUSD || 0), 0);
    const monthAgoStable = stableData.reduce((sum, s) => sum + (s.circulatingPrevMonth?.peggedUSD || s.circulating?.peggedUSD || 0), 0);
    const stableChange = ((latestStable - monthAgoStable) / monthAgoStable * 100).toFixed(1);
    const top5 = protocols.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 5).map(p => ({ name: p.name, tvl: p.tvl, change: p.change_1d || 0 }));
    return {
      tvl: { value: parseFloat((latestTvl / 1e9).toFixed(1)), change: parseFloat(tvlChange) },
      stablecoinSupply: { value: parseFloat((latestStable / 1e9).toFixed(1)), change: parseFloat(stableChange) },
      topProtocols: top5
    };
  } catch (error) { return null; }
};

const fetchFredData = async () => {
  try {
    const res = await fetch('https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=demo&file_type=json&sort_order=desc&limit=13');
    const data = await res.json();
    if (!data.observations?.length) return null;
    const latest = parseFloat(data.observations[0].value) / 1000;
    const yearAgo = parseFloat(data.observations[12]?.value || data.observations[0].value) / 1000;
    const change = ((latest - yearAgo) / yearAgo * 100).toFixed(1);
    return { m2Supply: { value: parseFloat(latest.toFixed(2)), change: parseFloat(change), trend: parseFloat(change) > 0 ? 'expanding' : 'contracting', lastUpdate: data.observations[0].date } };
  } catch (error) { return null; }
};

const fetchAltseasonData = async () => {
  try {
    const [globalRes, ethBtcRes, stableRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=btc,usd'),
      fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true')
    ]);
    const global = await globalRes.json();
    const ethBtc = await ethBtcRes.json();
    const stables = await stableRes.json();
    const ethBtcRatio = ethBtc.ethereum?.btc || 0;
    const totalMcap = global.data?.total_market_cap?.usd || 0;
    const btcMcap = global.data?.market_cap_percentage?.btc * totalMcap / 100 || 0;
    const total2 = (totalMcap - btcMcap) / 1e12;
    const btcDominance = global.data?.market_cap_percentage?.btc || 50;
    const usdt = stables.peggedAssets?.find(s => s.symbol === 'USDT');
    const usdc = stables.peggedAssets?.find(s => s.symbol === 'USDC');
    const usdtMcap = usdt?.circulating?.peggedUSD || 0;
    const usdcMcap = usdc?.circulating?.peggedUSD || 0;
    const totalStableMcap = usdtMcap + usdcMcap;
    const usdtChange7d = usdt?.circulatingPrevWeek?.peggedUSD ? ((usdtMcap - usdt.circulatingPrevWeek.peggedUSD) / usdt.circulatingPrevWeek.peggedUSD * 100) : 0;
    const usdcChange7d = usdc?.circulatingPrevWeek?.peggedUSD ? ((usdcMcap - usdc.circulatingPrevWeek.peggedUSD) / usdc.circulatingPrevWeek.peggedUSD * 100) : 0;
    let altseasonIndex = 50;
    if (btcDominance < 40) altseasonIndex = 90;
    else if (btcDominance < 45) altseasonIndex = 75;
    else if (btcDominance < 50) altseasonIndex = 60;
    else if (btcDominance < 55) altseasonIndex = 40;
    else if (btcDominance < 60) altseasonIndex = 25;
    else altseasonIndex = 10;
    if (ethBtcRatio > 0.055) altseasonIndex = Math.min(100, altseasonIndex + 15);
    else if (ethBtcRatio > 0.045) altseasonIndex = Math.min(100, altseasonIndex + 5);
    else if (ethBtcRatio < 0.03) altseasonIndex = Math.max(0, altseasonIndex - 15);
    return {
      ethBtcRatio: parseFloat(ethBtcRatio.toFixed(5)), total2: parseFloat(total2.toFixed(3)),
      btcDominance: parseFloat(btcDominance.toFixed(1)), altseasonIndex: Math.round(altseasonIndex),
      stablecoins: {
        usdt: { mcap: parseFloat((usdtMcap / 1e9).toFixed(2)), change7d: parseFloat(usdtChange7d.toFixed(2)) },
        usdc: { mcap: parseFloat((usdcMcap / 1e9).toFixed(2)), change7d: parseFloat(usdcChange7d.toFixed(2)) },
        total: parseFloat((totalStableMcap / 1e9).toFixed(2)),
        usdtDominance: parseFloat((usdtMcap / totalStableMcap * 100).toFixed(1))
      }
    };
  } catch (error) { return null; }
};

const fetchMarketStructure = async () => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const data = await response.json();
    const usdtPairs = data.filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('BUSD') && !t.symbol.includes('USDC') && !t.symbol.includes('TUSD') && !t.symbol.includes('FDUSD') && parseFloat(t.quoteVolume) > 1000000);
    const sorted = [...usdtPairs].sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
    const topGainers = sorted.slice(0, 15).map(t => ({ name: t.symbol.replace('USDT', ''), symbol: t.symbol, change24h: parseFloat(t.priceChangePercent).toFixed(2), price: parseFloat(t.lastPrice), volume: parseFloat(t.quoteVolume) }));
    const topLosers = sorted.slice(-15).reverse().map(t => ({ name: t.symbol.replace('USDT', ''), symbol: t.symbol, change24h: parseFloat(t.priceChangePercent).toFixed(2), price: parseFloat(t.lastPrice), volume: parseFloat(t.quoteVolume) }));
    const gainers = usdtPairs.filter(t => parseFloat(t.priceChangePercent) > 0).length;
    const losers = usdtPairs.filter(t => parseFloat(t.priceChangePercent) < 0).length;
    return { topGainers, topLosers, marketBreadth: { gainers, losers, ratio: (gainers / (gainers + losers) * 100).toFixed(0), total: usdtPairs.length }, source: 'Binance' };
  } catch (error) { return null; }
};

// Fetch CoinGecko trending categories
const fetchCoinGeckoCategories = async () => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/categories?order=market_cap_change_24h_desc');
    if (!response.ok) return null;
    const data = await response.json();
    // Top 10 kategorii z największą zmianą
    const topCategories = data.slice(0, 10).map(cat => ({
      id: cat.id,
      name: cat.name,
      marketCap: cat.market_cap,
      marketCapChange24h: cat.market_cap_change_24h?.toFixed(2) || '0',
      volume24h: cat.volume_24h,
      topCoins: cat.top_3_coins || []
    }));
    return { categories: topCategories, source: 'CoinGecko' };
  } catch (error) { return null; }
};

// ============== TRADINGVIEW WIDGETS ==============
const TradingViewChart = ({ symbol = 'BINANCE:BTCUSDT', theme = 'dark' }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: true, symbol, interval: 'D', timezone: 'Europe/Warsaw', theme,
        style: '1', locale: 'en', hide_top_toolbar: true, hide_legend: false,
        save_image: false, calendar: false, support_host: 'https://www.tradingview.com'
      });
      containerRef.current.appendChild(script);
    }
  }, [symbol, theme]);
  return <div ref={containerRef} style={{ height: '300px', borderRadius: '12px', overflow: 'hidden' }} />;
};

const TradingViewTechnicalAnalysis = ({ symbol = 'BINANCE:BTCUSDT', interval = '1D', theme = 'dark' }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        interval, width: '100%', isTransparent: true, height: '280',
        symbol, showIntervalTabs: true, displayMode: 'single', locale: 'en', colorTheme: theme
      });
      containerRef.current.appendChild(script);
    }
  }, [symbol, interval, theme]);
  return <div ref={containerRef} style={{ height: '280px' }} />;
};

// ============== HELP CONTENT ==============
const helpContent = {
  dayTradingScore: { title: '🎯 Day Trading Score', emoji: '🎯', description: 'Wskaźnik dla krótkoterminowych traderów. Horyzont: godziny-dni. Agresywne progi.', interpretation: [{ condition: '80-100', signal: 'bullish', text: '🟢 AKUMULUJ' }, { condition: '65-79', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '50-64', signal: 'neutral', text: '🟡 HOLD' }, { condition: '35-49', signal: 'warning', text: '🟠 OSTROŻNIE' }, { condition: '0-34', signal: 'bearish', text: '🔴 REDUKUJ' }], tip: 'Składowe: Fear & Greed, Funding Rate, BTC 24h momentum, L/S Ratio.', source: 'Binance, Alternative.me' },
  swingScore: { title: '📊 Swing Score', emoji: '📊', description: 'Wskaźnik dla swing traderów. Horyzont: tygodnie.', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD' }, { condition: '30-44', signal: 'warning', text: '🟠 OSTROŻNIE' }, { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ' }], tip: 'Składowe: F&G, TVL 7d, BTC Dom, Stables, Altseason.', source: 'DefiLlama, CoinGecko' },
  hodlScore: { title: '🏦 HODL Score', emoji: '🏦', description: 'Wskaźnik dla długoterminowych inwestorów. Horyzont: miesiące.', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD' }, { condition: '30-44', signal: 'warning', text: '🟠 OSTROŻNIE' }, { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ' }], tip: 'Składowe: M2 Money Supply, Stablecoin supply, TVL, F&G ekstrema.', source: 'FRED, DefiLlama' },
  btcPrice: { title: '₿ Bitcoin Price', emoji: '₿', description: 'Aktualna cena Bitcoina w USD.', interpretation: [{ condition: '+5%', signal: 'bullish', text: '🟢 Silny wzrost' }, { condition: '±2%', signal: 'neutral', text: '🟡 Stabilny' }, { condition: '-5%', signal: 'bearish', text: '🔴 Silny spadek' }], tip: 'Śledź trendy długoterminowe.', source: 'CoinGecko' },
  ethPrice: { title: '◆ Ethereum Price', emoji: '◆', description: 'Aktualna cena Ethereum w USD.', interpretation: [{ condition: '+5%', signal: 'bullish', text: '🟢 Silny wzrost' }, { condition: '±2%', signal: 'neutral', text: '🟡 Stabilny' }, { condition: '-5%', signal: 'bearish', text: '🔴 Silny spadek' }], tip: 'ETH często wyprzedza altcoiny.', source: 'CoinGecko' },
  fearGreed: { title: '😱 Fear & Greed Index', emoji: '😱', description: 'Wskaźnik sentymentu rynku 0-100.', interpretation: [{ condition: '0-25', signal: 'bullish', text: '🟢 Extreme Fear - okazja' }, { condition: '26-45', signal: 'bullish', text: '🟢 Fear - akumuluj' }, { condition: '46-55', signal: 'neutral', text: '🟡 Neutral' }, { condition: '56-75', signal: 'warning', text: '🟠 Greed - ostrożnie' }, { condition: '76-100', signal: 'bearish', text: '🔴 Extreme Greed - realizuj' }], tip: 'Kontrariański wskaźnik.', source: 'Alternative.me' },
  btcDominance: { title: '👑 BTC Dominance', emoji: '👑', description: 'Udział BTC w całkowitej kapitalizacji rynku.', interpretation: [{ condition: '>55%', signal: 'bearish', text: '🔴 BTC Season - alty słabe' }, { condition: '45-55%', signal: 'neutral', text: '🟡 Zrównoważony rynek' }, { condition: '<45%', signal: 'bullish', text: '🟢 Altseason!' }], tip: 'Spadająca dominacja = altseason.', source: 'CoinGecko' },
  fundingRate: { title: '💸 Funding Rate', emoji: '💸', description: 'Opłata między long/short na perpetuals.', interpretation: [{ condition: '> 0.05%', signal: 'bearish', text: '🔴 Overleveraged' }, { condition: '0-0.03%', signal: 'neutral', text: '🟡 Neutral' }, { condition: '< 0', signal: 'bullish', text: '🟢 Bearish sentiment' }], tip: 'Wysoki funding = lokalne szczyty.', source: 'Binance API' },
  openInterest: { title: '📊 Open Interest', emoji: '📊', description: 'Wartość otwartych pozycji na futures.', interpretation: [{ condition: 'Rosnący + cena rośnie', signal: 'bullish', text: '🟢 Silny trend wzrostowy' }, { condition: 'Rosnący + cena spada', signal: 'bearish', text: '🔴 Silny trend spadkowy' }, { condition: 'Spadający', signal: 'neutral', text: '🟡 Zamykanie pozycji' }], tip: 'Potwierdza siłę trendu.', source: 'Binance' },
  longShortRatio: { title: '⚖️ Long/Short Ratio', emoji: '⚖️', description: 'Stosunek pozycji long do short.', interpretation: [{ condition: '> 1.8', signal: 'bearish', text: '🔴 Za dużo longów' }, { condition: '1.0-1.8', signal: 'neutral', text: '🟡 Zbalansowany' }, { condition: '< 0.9', signal: 'bullish', text: '🟢 Kontrariański sygnał kupna' }], tip: 'Wskaźnik kontrariański.', source: 'Binance' },
  tvl: { title: '🔒 Total Value Locked', emoji: '🔒', description: 'Całkowita wartość zablokowana w DeFi.', interpretation: [{ condition: '+5% 7d', signal: 'bullish', text: '🟢 Kapitał napływa' }, { condition: '±2% 7d', signal: 'neutral', text: '🟡 Stabilny' }, { condition: '-5% 7d', signal: 'bearish', text: '🔴 Kapitał ucieka' }], tip: 'Wskaźnik adopcji DeFi.', source: 'DefiLlama' },
  stablecoinSupply: { title: '💵 Stablecoin Supply', emoji: '💵', description: 'Całkowita podaż stablecoinów.', interpretation: [{ condition: 'Rosnąca', signal: 'bullish', text: '🟢 Kapitał gotowy do kupna' }, { condition: 'Stabilna', signal: 'neutral', text: '🟡 Oczekiwanie' }, { condition: 'Spadająca', signal: 'bearish', text: '🔴 Wyjście z rynku' }], tip: 'Sucha amunicja na zakupy.', source: 'DefiLlama' },
  m2Supply: { title: '🏦 M2 Money Supply', emoji: '🏦', description: 'Globalna podaż pieniądza M2.', interpretation: [{ condition: 'Ekspansja', signal: 'bullish', text: '🟢 QE - risk on' }, { condition: 'Stabilna', signal: 'neutral', text: '🟡 Neutralny' }, { condition: 'Kontrakcja', signal: 'bearish', text: '🔴 QT - risk off' }], tip: 'BTC koreluje z M2 z opóźnieniem ~10 tygodni.', source: 'FRED' },
  portfolio: { title: '💼 Portfolio', emoji: '💼', description: 'Twoje portfolio na Binance.', interpretation: [{ condition: 'Połączony', signal: 'bullish', text: '🟢 API działa' }, { condition: 'Błąd', signal: 'bearish', text: '🔴 Sprawdź klucze' }], tip: 'Nigdy nie włączaj Withdrawals!', source: 'Binance Auth API' },
  alerts: { title: '🔔 System Alertów', emoji: '🔔', description: 'Ustaw powiadomienia dla wskaźników.', interpretation: [{ condition: 'Score Alert', signal: 'neutral', text: '🔔 Powiadomienie gdy Day/Swing/HODL przekroczy próg' }, { condition: 'Price Alert', signal: 'neutral', text: '🔔 Alert cenowy BTC/ETH/SOL' }, { condition: 'F&G Alert', signal: 'neutral', text: '🔔 Alert na ekstrema sentymentu' }], tip: 'Włącz powiadomienia przeglądarki!', source: 'Local' },
  marketBreadth: { title: '📊 Market Breadth', emoji: '📊', description: 'Stosunek coinów rosnących do spadających na Binance. Pokazuje ogólny sentyment rynku.', interpretation: [{ condition: '>65% Bullish', signal: 'bullish', text: '🟢 Silny rynek - większość rośnie' }, { condition: '45-65% Bullish', signal: 'neutral', text: '🟡 Neutralny - rynek mieszany' }, { condition: '<45% Bullish', signal: 'bearish', text: '🔴 Słaby rynek - większość spada' }], tip: 'Breadth potwierdza siłę trendu. Rally przy niskim breadth jest słabe.', source: 'Binance API' },
  positionCalculator: { title: '🧮 Position Size Calculator', emoji: '🧮', description: 'Kalkulator wielkości pozycji oparty na zarządzaniu ryzykiem. Oblicza optymalną wielkość pozycji na podstawie kapitału, tolerancji ryzyka i odległości stop-loss.', interpretation: [{ condition: 'Ryzyko 1-2%', signal: 'bullish', text: '🟢 Konserwatywne - zalecane' }, { condition: 'Ryzyko 3-5%', signal: 'neutral', text: '🟡 Umiarkowane' }, { condition: 'Ryzyko >5%', signal: 'bearish', text: '🔴 Agresywne - wysokie ryzyko' }], tip: 'Zasada: nigdy nie ryzykuj więcej niż 1-2% kapitału na jedną transakcję. Dźwignia zwiększa zyski ALE też straty!', source: 'Risk Management' },
  altseasonIndex: { title: '🌊 Altseason Index', emoji: '🌊', description: 'Wskaźnik 0-100 mierzący siłę altcoinów vs BTC. Oparty na dominacji BTC i ETH/BTC ratio.', interpretation: [{ condition: '>75', signal: 'bullish', text: '🟢 ALTSEASON - alty dominują' }, { condition: '50-75', signal: 'bullish', text: '🟢 Alty rosną - rotacja z BTC' }, { condition: '40-50', signal: 'neutral', text: '🟡 Neutralny - obserwuj' }, { condition: '<40', signal: 'bearish', text: '🔴 BTC Season - trzymaj BTC' }], tip: 'Historycznie altseason następuje po silnym wzroście BTC.', source: 'CoinGecko' },
  ethBtcRatio: { title: '⚗️ ETH/BTC Ratio', emoji: '⚗️', description: 'Stosunek ceny ETH do BTC. Kluczowy wskaźnik siły altcoinów.', interpretation: [{ condition: '>0.055', signal: 'bullish', text: '🟢 ETH silny - altseason sygnał' }, { condition: '0.035-0.055', signal: 'neutral', text: '🟡 Neutralny zakres' }, { condition: '<0.035', signal: 'bearish', text: '🔴 ETH słaby - BTC dominuje' }], tip: 'Rosnący ETH/BTC często poprzedza altseason.', source: 'CoinGecko' },
  total2: { title: '📈 Total2 Market Cap', emoji: '📈', description: 'Całkowita kapitalizacja rynku bez BTC. Mierzy wartość wszystkich altcoinów.', interpretation: [{ condition: 'Rośnie + BTC Dom spada', signal: 'bullish', text: '🟢 Kapitał płynie do altów' }, { condition: 'Stabilne', signal: 'neutral', text: '🟡 Rynek w konsolidacji' }, { condition: 'Spada + BTC Dom rośnie', signal: 'bearish', text: '🔴 Rotacja do BTC - risk off' }], tip: 'Total2 > $1.5T historycznie sygnalizuje silny altseason.', source: 'CoinGecko' },
  stablecoinFlows: { title: '💵 Stablecoin Flows', emoji: '💵', description: 'Przepływy kapitału w USDT/USDC. Rosnąca podaż = nowy kapitał na rynku.', interpretation: [{ condition: '>+1% 7d', signal: 'bullish', text: '🟢 Kapitał napływa - bullish' }, { condition: '±1% 7d', signal: 'neutral', text: '🟡 Stabilny przepływ' }, { condition: '<-1% 7d', signal: 'bearish', text: '🔴 Odpływ kapitału - ostrożnie' }], tip: 'USDT dominance >70% sugeruje większą płynność w parach USDT.', source: 'DefiLlama Stablecoins' },
  topGainers: { title: '🚀 Top Gainers', emoji: '🚀', description: 'Coiny z największymi wzrostami 24h na Binance. Pokazuje gdzie płynie kapitał spekulacyjny.', interpretation: [{ condition: 'Top coiny >20%', signal: 'bullish', text: '🟢 Silna spekulacja - momentum' }, { condition: 'Top coiny 5-20%', signal: 'neutral', text: '🟡 Normalna aktywność' }, { condition: 'Wszystkie <5%', signal: 'bearish', text: '🔴 Brak momentum - słaby rynek' }], tip: 'Szukaj powtarzających się sektorów wśród top gainers.', source: 'Binance API' },
  topLosers: { title: '📉 Top Losers', emoji: '📉', description: 'Coiny z największymi spadkami 24h na Binance. Pokazuje gdzie kapitał ucieka.', interpretation: [{ condition: 'Losers <-10%', signal: 'bearish', text: '🔴 Panika - potencjalne okazje' }, { condition: 'Losers -5% do -10%', signal: 'neutral', text: '🟡 Normalna korekta' }, { condition: 'Losers >-5%', signal: 'bullish', text: '🟢 Mała korekta - rynek silny' }], tip: 'Silne projekty na liście losers mogą być okazją.', source: 'Binance API' },
  sectorAnalysis: { title: '🏷️ Analiza Sektorów', emoji: '🏷️', description: 'Automatyczna kategoryzacja top gainers według sektorów (AI, Meme, DeFi, L1/L2, Gaming). Pokazuje gdzie aktualnie płynie kapitał spekulacyjny.', interpretation: [{ condition: 'Sektor >+10%', signal: 'bullish', text: '🟢 Hot sektor - momentum' }, { condition: 'Sektor 0-10%', signal: 'neutral', text: '🟡 Stabilny wzrost' }, { condition: 'Sektor <0%', signal: 'bearish', text: '🔴 Słaby sektor - unikaj' }], tip: 'Inwestuj w liderów najsilniejszych sektorów.', source: 'Binance API' }
};

// ============== UI COMPONENTS ==============
const HelpModal = ({ helpKey, onClose, theme }) => {
  const content = helpContent[helpKey];
  if (!content) return null;
  const t = theme === 'dark' ? { bg: 'rgba(15,23,42,0.98)', cardBg: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b' } : { bg: 'rgba(255,255,255,0.98)', cardBg: '#f8fafc', text: '#1e293b', textSecondary: '#64748b', border: '#e2e8f0', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626', warning: '#d97706' };
  const signalColor = (signal) => signal === 'bullish' ? t.positive : signal === 'bearish' ? t.negative : t.warning;
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: t.bg, borderRadius: '16px', maxWidth: '420px', width: '100%', maxHeight: '80vh', overflow: 'auto', border: `1px solid ${t.border}` }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>{content.emoji}</span>
            <h3 style={{ margin: 0, color: t.text, fontSize: '16px', fontWeight: '600' }}>{content.title}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSecondary, fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '16px' }}>
          <p style={{ color: t.text, fontSize: '13px', margin: '0 0 16px', padding: '10px', background: t.cardBg, borderRadius: '8px' }}>{content.description}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {content.interpretation.map((item, i) => (
              <div key={i} style={{ padding: '10px 12px', background: `${signalColor(item.signal)}15`, borderRadius: '10px', borderLeft: `6px solid ${signalColor(item.signal)}` }}>
                <span style={{ color: t.textSecondary, fontSize: '11px', fontFamily: 'monospace' }}>{item.condition}</span>
                <span style={{ color: signalColor(item.signal), fontSize: '13px', fontWeight: '600', marginLeft: '8px' }}>{item.text}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px', background: `${t.accent}15`, borderRadius: '8px', marginBottom: '12px' }}>
            <div style={{ color: t.accent, fontSize: '10px', fontWeight: '600', marginBottom: '4px' }}>💡 Pro Tip</div>
            <p style={{ color: t.text, fontSize: '12px', margin: 0 }}>{content.tip}</p>
          </div>
          <div style={{ fontSize: '10px', color: t.textSecondary, textAlign: 'right' }}>Źródło: {content.source}</div>
        </div>
      </div>
    </div>
  );
};

const Card = ({ children, helpKey, onHelp, style, theme, signalColor, isLive }) => {
  const t = theme === 'dark' ? { cardBg: '#0f172a', border: '#1e293b', helpBg: '#1e293b', helpColor: '#64748b' } : { cardBg: '#ffffff', border: '#e2e8f0', helpBg: '#f1f5f9', helpColor: '#64748b' };
  return (
    <div style={{ position: 'relative', padding: '14px', background: signalColor ? `${signalColor}08` : t.cardBg, borderRadius: '12px', border: `1px solid ${t.border}`, borderLeft: signalColor ? `5px solid ${signalColor}` : `1px solid ${t.border}`, ...style }}>
      {helpKey && <button onClick={() => onHelp(helpKey)} style={{ position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px', borderRadius: '50%', background: t.helpBg, border: 'none', color: t.helpColor, fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7, zIndex: 10 }}>?</button>}
      {isLive && <span style={{ position: 'absolute', bottom: '6px', right: '8px', fontSize: '8px', padding: '2px 5px', borderRadius: '4px', background: theme === 'dark' ? '#22c55e18' : '#16a34a15', color: theme === 'dark' ? '#22c55e' : '#16a34a', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: theme === 'dark' ? '#22c55e' : '#16a34a', animation: 'pulse 2s infinite' }}></span>LIVE</span>}
      {children}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
};

const LiveTag = ({ theme }) => <span style={{ fontSize: '9px', padding: '2px 5px', borderRadius: '4px', background: theme === 'dark' ? '#22c55e20' : '#16a34a20', color: theme === 'dark' ? '#22c55e' : '#16a34a', fontWeight: '600', marginLeft: '6px' }}>● LIVE</span>;

const SkeletonLoader = ({ width = '60px', height = '18px', theme }) => {
  const bg = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const shimmer = theme === 'dark' ? '#334155' : '#f1f5f9';
  return <div style={{ width, height, borderRadius: '4px', background: `linear-gradient(90deg, ${bg} 25%, ${shimmer} 50%, ${bg} 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', display: 'inline-block' }} />;
};

const DataSourcesBadge = ({ apiStatus, theme }) => {
  const t = theme === 'dark' ? { text: '#94a3b8', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b' } : { text: '#64748b', positive: '#16a34a', negative: '#dc2626', warning: '#d97706' };
  const sources = [
    { name: 'CoinGecko', status: apiStatus.coingecko },
    { name: 'Binance', status: apiStatus.binance },
    { name: 'DefiLlama', status: apiStatus.defillama },
    { name: 'FRED', status: apiStatus.fred }
  ];
  const liveCount = sources.filter(s => s.status === 'live').length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '8px', color: t.text, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: '600' }}>Źródła:</span>
      {sources.map((s, i) => (
        <span key={i} style={{ padding: '1px 4px', borderRadius: '3px', background: s.status === 'live' ? `${t.positive}20` : s.status === 'error' ? `${t.negative}20` : `${t.warning}20`, color: s.status === 'live' ? t.positive : s.status === 'error' ? t.negative : t.warning }}>{s.name}</span>
      ))}
    </div>
  );
};

const AIInsight = ({ cgData, binanceData, altseasonData, defiData, dayScore, swingScore, hodlScore, theme }) => {
  const t = theme === 'dark' ? { bg: '#1e293b', border: '#334155', text: '#f1f5f9', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b' } : { bg: '#f8fafc', border: '#e2e8f0', text: '#1e293b', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626', warning: '#d97706' };
  
  let insight = '';
  let signal = 'neutral';
  let emoji = '🤔';
  
  const fg = cgData?.fearGreed?.value || 50;
  const funding = binanceData?.fundingRate?.value || 0;
  const btcChange = cgData?.btcPrice?.change || 0;
  const lsRatio = binanceData?.longShortRatio?.value || 1;
  const altIndex = altseasonData?.altseasonIndex || 50;
  
  if (fg < 25 && funding < 0) {
    insight = `Extreme Fear (${fg}) + ujemny Funding (${funding.toFixed(4)}%) = potencjalne dno. Short Squeeze możliwy.`;
    signal = 'bullish'; emoji = '🟢';
  } else if (fg > 75 && funding > 0.03) {
    insight = `Extreme Greed (${fg}) + wysoki Funding (${funding.toFixed(4)}%) = rynek przegrzany. Rozważ realizację zysków.`;
    signal = 'bearish'; emoji = '🔴';
  } else if (altIndex > 60 && cgData?.btcDominance?.value < 50) {
    insight = `Altseason Index (${altIndex}) wysoki + BTC Dom spada = rotacja do altów. Szukaj liderów sektorów.`;
    signal = 'bullish'; emoji = '🚀';
  } else if (btcChange > 5) {
    insight = `BTC +${btcChange.toFixed(1)}% 24h = silne momentum. ${lsRatio > 1.5 ? 'Uwaga: crowded long.' : 'Trend może kontynuować.'}`;
    signal = 'bullish'; emoji = '📈';
  } else if (btcChange < -5) {
    insight = `BTC ${btcChange.toFixed(1)}% 24h = panika. ${fg < 30 ? 'Contrarianie: szukaj okazji.' : 'Obserwuj support levels.'}`;
    signal = 'bearish'; emoji = '📉';
  } else if (dayScore >= 45 && dayScore <= 55) {
    insight = `Rynek w konsolidacji. Day Score ${dayScore} neutralny. Czekaj na sygnał kierunkowy.`;
    signal = 'neutral'; emoji = '⏸️';
  } else {
    const avgScore = Math.round((dayScore + swingScore + hodlScore) / 3);
    if (avgScore > 60) { insight = `Wskaźniki pozytywne (avg: ${avgScore}). Rynek sprzyja akumulacji.`; signal = 'bullish'; emoji = '🟢'; }
    else if (avgScore < 40) { insight = `Wskaźniki negatywne (avg: ${avgScore}). Zachowaj ostrożność.`; signal = 'bearish'; emoji = '🟠'; }
    else { insight = `Mieszane sygnały (avg: ${avgScore}). Trzymaj pozycje, obserwuj rozwój.`; signal = 'neutral'; emoji = '🟡'; }
  }
  
  const bgColor = signal === 'bullish' ? `${t.positive}15` : signal === 'bearish' ? `${t.negative}15` : `${t.warning}15`;
  const borderColor = signal === 'bullish' ? t.positive : signal === 'bearish' ? t.negative : t.warning;
  
  return (
    <div style={{ padding: '10px 12px', background: bgColor, borderLeft: `4px solid ${borderColor}`, borderRadius: '0 8px 8px 0', margin: '0 12px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{emoji}</span>
        <div>
          <div style={{ fontSize: '9px', color: t.text, opacity: 0.7, marginBottom: '2px' }}>🤖 AI INSIGHT</div>
          <div style={{ fontSize: '11px', color: t.text, lineHeight: '1.4' }}>{insight}</div>
        </div>
      </div>
    </div>
  );
};

const PositionCalculator = ({ theme, onHelp }) => {
  const [capital, setCapital] = useState('1000');
  const [riskPercent, setRiskPercent] = useState('2');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [leverage, setLeverage] = useState('1');
  
  const t = theme === 'dark' ? { bg: '#0f172a', cardBg: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444' } : { bg: '#f8fafc', cardBg: '#ffffff', text: '#1e293b', textSecondary: '#64748b', border: '#e2e8f0', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626' };
  
  const capitalNum = parseFloat(capital) || 0;
  const riskNum = parseFloat(riskPercent) || 0;
  const entryNum = parseFloat(entryPrice) || 0;
  const stopNum = parseFloat(stopLoss) || 0;
  const leverageNum = parseFloat(leverage) || 1;
  
  const riskAmount = capitalNum * (riskNum / 100);
  const stopDistance = entryNum > 0 && stopNum > 0 ? Math.abs((entryNum - stopNum) / entryNum * 100) : 0;
  const positionSize = stopDistance > 0 ? (riskAmount / (stopDistance / 100)) * leverageNum : 0;
  const positionSizeUnits = entryNum > 0 ? positionSize / entryNum : 0;
  
  return (
    <div style={{ padding: '12px', background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.border}`, marginTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: t.text }}>🧮 Position Size Calculator</div>
        <button 
          onClick={() => onHelp && onHelp()} 
          style={{ 
            width: '24px', 
            height: '24px', 
            borderRadius: '50%', 
            background: theme === 'dark' ? '#3b82f6' : '#2563eb', 
            border: 'none', 
            color: '#ffffff', 
            fontSize: '14px', 
            fontWeight: '700', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >?</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div>
          <label style={{ fontSize: '9px', color: t.textSecondary }}>Kapitał ($)</label>
          <input type="number" value={capital} onChange={e => setCapital(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: '9px', color: t.textSecondary }}>Ryzyko (%)</label>
          <input type="number" value={riskPercent} onChange={e => setRiskPercent(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: '9px', color: t.textSecondary }}>Entry Price ($)</label>
          <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="np. 95000" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: '9px', color: t.textSecondary }}>Stop Loss ($)</label>
          <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="np. 93000" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '9px', color: t.textSecondary }}>Dźwignia</label>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          {['1', '2', '3', '5', '10', '20'].map(l => (
            <button key={l} onClick={() => setLeverage(l)} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: leverage === l ? `2px solid ${t.accent}` : `1px solid ${t.border}`, background: leverage === l ? `${t.accent}20` : t.bg, color: leverage === l ? t.accent : t.textSecondary, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>{l}x</button>
          ))}
        </div>
      </div>
      <div style={{ background: t.bg, borderRadius: '8px', padding: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px' }}>
          <div><span style={{ color: t.textSecondary }}>Ryzykujesz:</span> <span style={{ fontWeight: '700', color: t.negative }}>${riskAmount.toFixed(2)}</span></div>
          <div><span style={{ color: t.textSecondary }}>Stop dist:</span> <span style={{ fontWeight: '700' }}>{stopDistance.toFixed(2)}%</span></div>
          <div style={{ gridColumn: 'span 2', borderTop: `1px solid ${t.border}`, paddingTop: '8px', marginTop: '4px' }}>
            <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>WIELKOŚĆ POZYCJI:</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: t.accent }}>${positionSize.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: '500', color: t.textSecondary }}>({positionSizeUnits.toFixed(6)} jedn.)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SectorAnalysis = ({ topGainers, theme }) => {
  const t = theme === 'dark' ? { bg: '#0f172a', cardBg: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b' } : { bg: '#f8fafc', cardBg: '#ffffff', text: '#1e293b', textSecondary: '#64748b', border: '#e2e8f0', positive: '#16a34a', negative: '#dc2626', warning: '#d97706' };
  
  // Rozszerzona lista - dodane tokeny widoczne w top gainers
  const sectorKeywords = {
    'AI': ['FET', 'AGIX', 'OCEAN', 'NMR', 'RNDR', 'TAO', 'ARKM', 'WLD', 'CTXC', 'AIOZ', 'LPT', 'GRT', 'ORAI', 'PAAL', 'OLAS', 'TURBO', 'PHB', 'MDT', 'NFP'],
    'MEME': ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'MEME', 'NEIRO', 'PNUT', 'ACT', 'COW', 'POPCAT', 'MOG', 'BRETT', 'LADYS', 'BABYDOGE', 'ELON', 'AKITA', 'KISHU', 'SNEK', 'MYRO', 'BOME', 'SLERF', 'DOGS', 'HMSTR', 'CATI', 'TURBO', 'PEOPLE'],
    'DeFi': ['UNI', 'AAVE', 'COMP', 'MKR', 'SNX', 'CRV', 'SUSHI', 'YFI', 'DYDX', 'GMX', 'PENDLE', 'LDO', 'RPL', 'SSV', 'FXS', 'LQTY', 'BAL', 'RUNE', 'OSMO', 'JUP', 'RAY', 'ORCA', 'CAKE', 'BANANA', 'JOE', 'VOXEL', 'BIFI', 'ALPACA', 'BEL', 'WING', 'FOR', 'HARD'],
    'L1/L2': ['SOL', 'AVAX', 'MATIC', 'ARB', 'OP', 'APT', 'SUI', 'SEI', 'INJ', 'TIA', 'STRK', 'NEAR', 'FTM', 'ATOM', 'DOT', 'ADA', 'XRP', 'TRX', 'ALGO', 'HBAR', 'EOS', 'XLM', 'VET', 'ONE', 'EGLD', 'KAVA', 'ROSE', 'ZK', 'MANTA', 'METIS', 'CELO', 'ZIL', 'POL', 'TON', 'KAS', 'STX', 'ZEN', 'ZEC', 'OMNI', 'GAS', 'NEO', 'QTUM', 'ICX', 'ONT', 'WAVES', 'LSK', 'IOST', 'SC', 'THETA', 'TFUEL', 'FLM', 'STORJ', 'AR', 'FIL', 'BTT'],
    'Gaming': ['AXS', 'SAND', 'MANA', 'ENJ', 'GALA', 'IMX', 'ILV', 'PIXEL', 'PORTAL', 'SUPER', 'BEAM', 'RONIN', 'PRIME', 'MAGIC', 'YGG', 'PYR', 'ALICE', 'ATLAS', 'GODS', 'GMT', 'LOKA', 'SLP', 'RARE', 'HIGH', 'BIGTIME', 'XAI', 'NFT', 'VOXEL', 'GHST', 'REVV', 'TLM', 'BURGER', 'CHESS', 'DAR', 'HERO', 'MC', 'MOVR', 'JASMY', 'ID']
  };
  
  const sectorScores = {};
  const sectorCoins = {};
  
  Object.keys(sectorKeywords).forEach(sector => { sectorScores[sector] = 0; sectorCoins[sector] = []; });
  
  if (topGainers && topGainers.length > 0) {
    topGainers.forEach(coin => {
      let symbol = (coin.name || coin.symbol || '').toUpperCase().replace('USDT', '').replace('USDC', '').replace('BTC', '').replace('ETH', '');
      if (symbol.startsWith('1000')) symbol = symbol.substring(4);
      
      // Sprawdzamy każdy sektor
      let matched = false;
      Object.entries(sectorKeywords).forEach(([sector, keywords]) => {
        // Matchowanie: symbol jest równy keyword LUB symbol zaczyna się od keyword (dla derywatów)
        if (keywords.some(kw => symbol === kw || (kw.length >= 3 && symbol.startsWith(kw)))) {
          if (!matched || sectorCoins[sector].length < 5) { // Unikamy duplikatów w różnych sektorach
            sectorScores[sector] += parseFloat(coin.change24h) || 0;
            sectorCoins[sector].push({ name: symbol, change: parseFloat(coin.change24h) });
            matched = true;
          }
        }
      });
    });
  }
  
  const sortedSectors = Object.entries(sectorScores).filter(([_, score]) => score !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);
  
  return (
    <div style={{ padding: '12px', background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.border}`, marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>🏷️ Top Sektory (wg Gainers)</div>
      {sortedSectors.length === 0 ? (
        <div style={{ padding: '16px', background: t.bg, borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '6px' }}>📊</div>
          <div style={{ fontSize: '11px', color: t.textSecondary, marginBottom: '4px' }}>Brak wyraźnych trendów sektorowych</div>
          <div style={{ fontSize: '9px', color: t.textSecondary, opacity: 0.7 }}>Top gainers nie pasują do zdefiniowanych sektorów</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {sortedSectors.map(([sector, score], i) => (
            <div key={sector} style={{ padding: '10px', background: t.bg, borderRadius: '8px', borderLeft: `4px solid ${score > 0 ? t.positive : t.negative}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600' }}>{i + 1}. {sector}</span>
                <span style={{ fontSize: '10px', fontWeight: '700', color: score > 0 ? t.positive : t.negative }}>{score > 0 ? '+' : ''}{score.toFixed(1)}%</span>
              </div>
              <div style={{ fontSize: '8px', color: t.textSecondary }}>{sectorCoins[sector]?.slice(0, 3).map(c => c.name).join(', ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ApiStatusBadge = ({ status, label, theme }) => {
  const colors = { live: theme === 'dark' ? '#22c55e' : '#16a34a', loading: theme === 'dark' ? '#f59e0b' : '#d97706', error: theme === 'dark' ? '#ef4444' : '#dc2626', offline: theme === 'dark' ? '#64748b' : '#94a3b8' };
  const color = colors[status] || colors.offline;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: `${color}18`, fontSize: '9px', fontWeight: '600', color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, animation: status === 'live' ? 'pulse 2s infinite' : 'none' }} />{label}</span>;
};

// ============== COMPACT SCORE GAUGE ==============
const MiniScoreGauge = ({ score, label, icon, subtitle, onHelp, theme }) => {
  const isDark = theme === 'dark';
  const t = isDark ? { text: '#f1f5f9', textSecondary: '#64748b' } : { text: '#1e293b', textSecondary: '#64748b' };
  const getSignalInfo = (s) => { if (s >= 70) return { text: 'AKUMULUJ', color: '#22c55e' }; if (s >= 55) return { text: 'HOLD+', color: '#84cc16' }; if (s >= 45) return { text: 'HOLD', color: '#eab308' }; if (s >= 30) return { text: 'OSTROŻNIE', color: '#f97316' }; return { text: 'REDUKUJ', color: '#ef4444' }; };
  const signal = getSignalInfo(score);
  const needleAngle = -90 + (score / 100) * 180;
  const gaugeColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '31%', minWidth: '95px', padding: '6px 4px', background: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(241,245,249,0.7)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '2px', padding: '0 2px' }}>
        <span style={{ fontSize: '10px', fontWeight: '700', color: t.text }}>{icon} {label}</span>
        <button onClick={onHelp} style={{ width: '16px', height: '16px', borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', border: 'none', color: t.textSecondary, fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
      </div>
      <svg viewBox="0 0 100 52" style={{ width: '100%', maxWidth: '90px', height: '46px' }}>
        {gaugeColors.map((c, i) => { const startAngle = 180 + (i * 36); const endAngle = 180 + ((i + 1) * 36); const startRad = (startAngle * Math.PI) / 180; const endRad = (endAngle * Math.PI) / 180; const cx = 50, cy = 48, r = 38; return <path key={i} d={`M ${cx + r * Math.cos(startRad)} ${cy + r * Math.sin(startRad)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(endRad)} ${cy + r * Math.sin(endRad)}`} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" opacity={isDark ? 0.9 : 0.85} />; })}
        <g transform={`rotate(${needleAngle}, 50, 48)`}><line x1="50" y1="48" x2="50" y2="18" stroke={t.text} strokeWidth="2.5" strokeLinecap="round" /><circle cx="50" cy="48" r="4" fill={signal.color} /></g>
      </svg>
      <div style={{ fontSize: '18px', fontWeight: '800', color: signal.color, lineHeight: '1', marginTop: '0px' }}>{score}</div>
      <div style={{ marginTop: '3px', padding: '2px 6px', borderRadius: '4px', background: `${signal.color}20`, border: `1px solid ${signal.color}50`, fontSize: '8px', fontWeight: '700', color: signal.color }}>{signal.text}</div>
      <div style={{ fontSize: '8px', color: t.textSecondary, marginTop: '2px' }}>{subtitle}</div>
    </div>
  );
};

// ============== ALERT TOAST ==============
const AlertToast = ({ alert, onClose, theme }) => {
  const t = theme === 'dark' ? { bg: '#1e293b', text: '#f1f5f9', border: '#334155' } : { bg: '#ffffff', text: '#1e293b', border: '#e2e8f0' };
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', top: '70px', right: '12px', left: '12px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', zIndex: 1001, animation: 'slideIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>🔔 Alert: {alert.name}</div>
          <div style={{ fontSize: '11px', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>{alert.message}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>×</button>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
};

// ============== ALERT PANEL ==============
const AlertPanel = ({ alerts, onAddAlert, onDeleteAlert, onClose, theme }) => {
  const [alertType, setAlertType] = useState('score');
  const [alertMetric, setAlertMetric] = useState('dayTrading');
  const [alertCondition, setAlertCondition] = useState('below');
  const [alertValue, setAlertValue] = useState('');
  const [alertName, setAlertName] = useState('');
  
  const t = theme === 'dark' ? { bg: 'rgba(15,23,42,0.98)', cardBg: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444' } : { bg: 'rgba(255,255,255,0.98)', cardBg: '#f8fafc', text: '#1e293b', textSecondary: '#64748b', border: '#e2e8f0', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626' };
  
  const handleAdd = () => {
    if (!alertValue || !alertName) return;
    const newAlert = {
      id: Date.now(),
      name: alertName,
      type: alertType,
      metric: alertMetric,
      condition: alertCondition,
      value: parseFloat(alertValue),
      enabled: true,
      createdAt: new Date().toISOString(),
      triggered: false
    };
    onAddAlert(newAlert);
    setAlertName('');
    setAlertValue('');
  };
  
  const metricOptions = {
    score: [{ value: 'dayTrading', label: 'Day Trading Score' }, { value: 'swing', label: 'Swing Score' }, { value: 'hodl', label: 'HODL Score' }],
    price: [{ value: 'btc', label: 'Bitcoin (BTC)' }, { value: 'eth', label: 'Ethereum (ETH)' }, { value: 'sol', label: 'Solana (SOL)' }],
    indicator: [{ value: 'fearGreed', label: 'Fear & Greed' }, { value: 'funding', label: 'Funding Rate' }, { value: 'dominance', label: 'BTC Dominance' }]
  };
  
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: t.bg, borderRadius: '16px', maxWidth: '420px', width: '100%', maxHeight: '85vh', overflow: 'auto', border: `1px solid ${t.border}` }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: t.text, fontSize: '16px', fontWeight: '700' }}>🔔 Alerty</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textSecondary, fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        
        <div style={{ padding: '16px' }}>
          {/* Add new alert */}
          <div style={{ marginBottom: '20px', padding: '14px', background: t.cardBg, borderRadius: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: t.text, marginBottom: '12px' }}>➕ Nowy alert</div>
            
            <input type="text" placeholder="Nazwa alertu" value={alertName} onChange={e => setAlertName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', marginBottom: '10px', boxSizing: 'border-box' }} />
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {['score', 'price', 'indicator'].map(type => (
                <button key={type} onClick={() => { setAlertType(type); setAlertMetric(metricOptions[type][0].value); }} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: alertType === type ? `2px solid ${t.accent}` : `1px solid ${t.border}`, background: alertType === type ? `${t.accent}20` : t.bg, color: alertType === type ? t.accent : t.textSecondary, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                  {type === 'score' ? '📊 Score' : type === 'price' ? '💰 Cena' : '📈 Wskaźnik'}
                </button>
              ))}
            </div>
            
            <select value={alertMetric} onChange={e => setAlertMetric(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', marginBottom: '10px' }}>
              {metricOptions[alertType].map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select value={alertCondition} onChange={e => setAlertCondition(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }}>
                <option value="below">Spadnie poniżej</option>
                <option value="above">Wzrośnie powyżej</option>
              </select>
              <input type="number" placeholder="Wartość" value={alertValue} onChange={e => setAlertValue(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
            </div>
            
            <button onClick={handleAdd} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: t.accent, color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>➕ Dodaj alert</button>
          </div>
          
          {/* Active alerts */}
          <div style={{ fontSize: '12px', fontWeight: '600', color: t.text, marginBottom: '10px' }}>📋 Aktywne alerty ({alerts.length})</div>
          
          {alerts.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: t.textSecondary, fontSize: '12px' }}>Brak aktywnych alertów</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {alerts.map(alert => (
                <div key={alert.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: t.cardBg, borderRadius: '10px', borderLeft: `4px solid ${alert.condition === 'below' ? t.negative : t.positive}` }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: t.text }}>{alert.name}</div>
                    <div style={{ fontSize: '10px', color: t.textSecondary }}>{alert.condition === 'below' ? '↓' : '↑'} {alert.value} • {alert.metric}</div>
                  </div>
                  <button onClick={() => onDeleteAlert(alert.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: `${t.negative}20`, color: t.negative, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============== MAIN APP ==============
function App() {
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('crypto');
  const [helpModal, setHelpModal] = useState(null);
  
  // Data states
  const [cgData, setCgData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [defiData, setDefiData] = useState(null);
  const [fredData, setFredData] = useState(null);
  const [msData, setMsData] = useState(null);
  const [altseasonData, setAltseasonData] = useState(null);
  const [cgCategories, setCgCategories] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // API Status
  const [apiStatus, setApiStatus] = useState({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading', marketStructure: 'loading' });
  
  // Charts state
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  const [chartView, setChartView] = useState('analysis');
  const [taInterval, setTaInterval] = useState('1D');
  
  // ============== ALERTS STATE ==============
  const [alerts, setAlerts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  // ============== PORTFOLIO STATE ==============
  const [portfolioApiKey, setPortfolioApiKey] = useState('');
  const [portfolioSecretKey, setPortfolioSecretKey] = useState('');
  const [portfolioConnected, setPortfolioConnected] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState(null);
  const [showApiKeys, setShowApiKeys] = useState(false);
  
  // Portfolio data
  const [spotBalance, setSpotBalance] = useState(null);
  const [futuresBalance, setFuturesBalance] = useState(null);
  const [futuresPositions, setFuturesPositions] = useState(null);
  const [openOrders, setOpenOrders] = useState(null);
  
  // Trading state
  const [tradeSymbol, setTradeSymbol] = useState('BTCUSDT');
  const [tradeMarket, setTradeMarket] = useState('SPOT');
  const [tradeSide, setTradeSide] = useState('BUY');
  const [tradeType, setTradeType] = useState('MARKET');
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeResult, setTradeResult] = useState(null);
  
  // Load saved data on mount
  useEffect(() => {
    const savedKeys = loadApiKeys();
    if (savedKeys.apiKey && savedKeys.secretKey) {
      setPortfolioApiKey(savedKeys.apiKey);
      setPortfolioSecretKey(savedKeys.secretKey);
    }
    setAlerts(loadAlerts());
    setAlertHistory(loadAlertHistory());
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => setNotificationsEnabled(perm === 'granted'));
    } else if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);
  
  // Save alerts when changed
  useEffect(() => { saveAlerts(alerts); }, [alerts]);
  useEffect(() => { saveAlertHistory(alertHistory); }, [alertHistory]);
  
  // Mock data
  const mockData = { dxy: { value: 103.42, change: -1.8 }, liquidations: { long: 45.2, short: 12.8, total: 58 } };

  // Fetch all public data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setApiStatus({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading', marketStructure: 'loading' });
    const [cg, bn, defi, fred, ms, altseason, cgCat] = await Promise.all([fetchCoinGeckoData(), fetchBinanceData(), fetchDefiLlamaData(), fetchFredData(), fetchMarketStructure(), fetchAltseasonData(), fetchCoinGeckoCategories()]);
    if (cg) { setCgData(cg); setApiStatus(prev => ({ ...prev, coingecko: 'live' })); } else { setApiStatus(prev => ({ ...prev, coingecko: 'error' })); }
    if (bn) { setBinanceData(bn); setApiStatus(prev => ({ ...prev, binance: 'live' })); } else { setApiStatus(prev => ({ ...prev, binance: 'error' })); }
    if (defi) { setDefiData(defi); setApiStatus(prev => ({ ...prev, defillama: 'live' })); } else { setApiStatus(prev => ({ ...prev, defillama: 'error' })); }
    if (fred) { setFredData(fred); setApiStatus(prev => ({ ...prev, fred: 'live' })); } else { setApiStatus(prev => ({ ...prev, fred: 'error' })); }
    if (ms) { setMsData(ms); setApiStatus(prev => ({ ...prev, marketStructure: 'live' })); } else { setApiStatus(prev => ({ ...prev, marketStructure: 'error' })); }
    if (altseason) { setAltseasonData(altseason); }
    if (cgCat) { setCgCategories(cgCat); }
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAllData(); const interval = setInterval(fetchAllData, 60000); return () => clearInterval(interval); }, [fetchAllData]);

  // ============== ALERT CHECK ==============
  const checkAlerts = useCallback(() => {
    if (!cgData || alerts.length === 0) return;
    
    const dayScore = calculateDayTradingScore();
    const swingScoreVal = calculateSwingScore();
    const hodlScoreVal = calculateHodlScore();
    
    const currentValues = {
      dayTrading: dayScore,
      swing: swingScoreVal,
      hodl: hodlScoreVal,
      btc: cgData?.btcPrice?.value || 0,
      eth: cgData?.ethPrice?.value || 0,
      sol: cgData?.solPrice?.value || 0,
      fearGreed: cgData?.fearGreed?.value || 50,
      funding: binanceData?.fundingRate?.value || 0,
      dominance: cgData?.btcDominance?.value || 50
    };
    
    alerts.forEach(alert => {
      if (!alert.enabled || alert.triggered) return;
      
      const currentValue = currentValues[alert.metric];
      if (currentValue === undefined) return;
      
      const shouldTrigger = alert.condition === 'below' 
        ? currentValue < alert.value 
        : currentValue > alert.value;
      
      if (shouldTrigger) {
        const message = `${alert.metric}: ${currentValue} ${alert.condition === 'below' ? '<' : '>'} ${alert.value}`;
        
        // Show toast
        setActiveToast({ name: alert.name, message });
        
        // Browser notification
        if (notificationsEnabled && 'Notification' in window) {
          new Notification(`🔔 ${alert.name}`, { body: message, icon: '🎯' });
        }
        
        // Update alert and history
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, triggered: true } : a));
        setAlertHistory(prev => [...prev, { ...alert, triggeredAt: new Date().toISOString(), value: currentValue }]);
      }
    });
  }, [cgData, binanceData, alerts, notificationsEnabled]);
  
  useEffect(() => { checkAlerts(); }, [cgData, binanceData, checkAlerts]);

  // ============== PORTFOLIO FUNCTIONS ==============
  const connectPortfolio = async () => {
    if (!portfolioApiKey || !portfolioSecretKey) { setPortfolioError('Wprowadź API Key i Secret Key'); return; }
    setPortfolioLoading(true);
    setPortfolioError(null);
    
    const spotResult = await fetchSpotBalance(portfolioApiKey, portfolioSecretKey);
    if (spotResult.error) {
      setPortfolioError(spotResult.error);
      setPortfolioLoading(false);
      return;
    }
    
    setSpotBalance(spotResult);
    saveApiKeys(portfolioApiKey, portfolioSecretKey);
    
    const [futBal, futPos, orders] = await Promise.all([
      fetchFuturesBalance(portfolioApiKey, portfolioSecretKey),
      fetchFuturesPositions(portfolioApiKey, portfolioSecretKey),
      fetchOpenOrders(portfolioApiKey, portfolioSecretKey)
    ]);
    
    setFuturesBalance(futBal);
    setFuturesPositions(futPos);
    setOpenOrders(orders);
    setPortfolioConnected(true);
    setPortfolioLoading(false);
    setShowApiKeys(false);
  };
  
  const refreshPortfolio = async () => {
    if (!portfolioConnected) return;
    setPortfolioLoading(true);
    const [spot, futBal, futPos, orders] = await Promise.all([
      fetchSpotBalance(portfolioApiKey, portfolioSecretKey),
      fetchFuturesBalance(portfolioApiKey, portfolioSecretKey),
      fetchFuturesPositions(portfolioApiKey, portfolioSecretKey),
      fetchOpenOrders(portfolioApiKey, portfolioSecretKey)
    ]);
    setSpotBalance(spot);
    setFuturesBalance(futBal);
    setFuturesPositions(futPos);
    setOpenOrders(orders);
    setPortfolioLoading(false);
  };
  
  const disconnectPortfolio = () => {
    clearApiKeys();
    setPortfolioApiKey('');
    setPortfolioSecretKey('');
    setPortfolioConnected(false);
    setSpotBalance(null);
    setFuturesBalance(null);
    setFuturesPositions(null);
    setOpenOrders(null);
    setShowApiKeys(false);
  };
  
  const executeTrade = async () => {
    if (!tradeQuantity) { setTradeResult({ success: false, error: 'Wprowadź ilość' }); return; }
    setTradeResult(null);
    
    let result;
    if (tradeMarket === 'SPOT') {
      result = await placeSpotOrder(portfolioApiKey, portfolioSecretKey, tradeSymbol, tradeSide, tradeType, tradeQuantity, tradeType === 'LIMIT' ? tradePrice : null);
    } else {
      result = await placeFuturesOrder(portfolioApiKey, portfolioSecretKey, tradeSymbol, tradeSide, tradeType, tradeQuantity, tradeType === 'LIMIT' ? tradePrice : null, false);
    }
    
    setTradeResult(result);
    if (result.success) { setTimeout(refreshPortfolio, 1000); setTradeQuantity(''); setTradePrice(''); }
  };
  
  const handleClosePosition = async (symbol, positionAmt) => {
    const result = await closeFuturesPosition(portfolioApiKey, portfolioSecretKey, symbol, positionAmt);
    if (result.success) { setTimeout(refreshPortfolio, 1000); }
    else { alert(`Błąd: ${result.error}`); }
  };
  
  const handleCancelOrder = async (symbol, orderId, market) => {
    const result = await cancelOrder(portfolioApiKey, portfolioSecretKey, symbol, orderId, market);
    if (result.success) { setTimeout(refreshPortfolio, 1000); }
    else { alert(`Błąd: ${result.error}`); }
  };

  // Theme colors
  const t = theme === 'dark' ? { bg: '#030712', cardBg: '#0f172a', text: '#f1f5f9', textSecondary: '#64748b', border: '#1e293b', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b' } : { bg: '#f8fafc', cardBg: '#ffffff', text: '#1e293b', textSecondary: '#64748b', border: '#e2e8f0', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626', warning: '#d97706' };

  // Score calculations
  const calculateDayTradingScore = () => {
    let score = 50;
    if (cgData?.fearGreed) { if (cgData.fearGreed.value < 20) score += 15; else if (cgData.fearGreed.value < 35) score += 10; else if (cgData.fearGreed.value > 80) score -= 15; else if (cgData.fearGreed.value > 65) score -= 5; }
    if (binanceData?.fundingRate) { if (binanceData.fundingRate.value < -0.01) score += 10; else if (binanceData.fundingRate.value < 0) score += 5; else if (binanceData.fundingRate.value > 0.05) score -= 12; else if (binanceData.fundingRate.value > 0.03) score -= 5; }
    if (cgData?.btcPrice?.change > 5) score += 8; else if (cgData?.btcPrice?.change > 2) score += 4; else if (cgData?.btcPrice?.change < -5) score -= 8; else if (cgData?.btcPrice?.change < -2) score -= 4;
    if (binanceData?.longShortRatio?.value < 0.9) score += 6; else if (binanceData?.longShortRatio?.value > 1.8) score -= 6;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const calculateSwingScore = () => {
    let score = 50;
    if (cgData?.fearGreed) { if (cgData.fearGreed.value < 25) score += 12; else if (cgData.fearGreed.value < 40) score += 6; else if (cgData.fearGreed.value > 75) score -= 10; else if (cgData.fearGreed.value > 60) score -= 4; }
    if (defiData?.tvl?.change > 5) score += 10; else if (defiData?.tvl?.change > 2) score += 5; else if (defiData?.tvl?.change < -5) score -= 10; else if (defiData?.tvl?.change < -2) score -= 5;
    if (cgData?.btcDominance?.value > 55) score -= 4; else if (cgData?.btcDominance?.value < 45) score += 4;
    if (defiData?.stablecoinSupply?.change > 3) score += 8; else if (defiData?.stablecoinSupply?.change > 1) score += 4; else if (defiData?.stablecoinSupply?.change < -3) score -= 8; else if (defiData?.stablecoinSupply?.change < -1) score -= 4;
    if (altseasonData?.altseasonIndex > 70) score += 6; else if (altseasonData?.altseasonIndex > 55) score += 3; else if (altseasonData?.altseasonIndex < 30) score -= 4;
    if (altseasonData?.ethBtcRatio > 0.05) score += 4; else if (altseasonData?.ethBtcRatio < 0.035) score -= 4;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const calculateHodlScore = () => {
    let score = 50;
    if (fredData?.m2Supply?.trend === 'expanding') { if (fredData.m2Supply.change > 5) score += 15; else if (fredData.m2Supply.change > 2) score += 10; else score += 5; } else { if (fredData?.m2Supply?.change < -2) score -= 10; else score -= 5; }
    if (defiData?.stablecoinSupply?.change > 5) score += 12; else if (defiData?.stablecoinSupply?.change > 2) score += 6; else if (defiData?.stablecoinSupply?.change < -5) score -= 12; else if (defiData?.stablecoinSupply?.change < -2) score -= 6;
    if (defiData?.tvl?.change > 8) score += 8; else if (defiData?.tvl?.change > 3) score += 4; else if (defiData?.tvl?.change < -8) score -= 8; else if (defiData?.tvl?.change < -3) score -= 4;
    if (cgData?.fearGreed) { if (cgData.fearGreed.value < 20) score += 8; else if (cgData.fearGreed.value < 35) score += 4; else if (cgData.fearGreed.value > 85) score -= 8; else if (cgData.fearGreed.value > 70) score -= 4; }
    if (altseasonData?.stablecoins) { const totalChange = (altseasonData.stablecoins.usdt?.change7d || 0) + (altseasonData.stablecoins.usdc?.change7d || 0); if (totalChange > 2) score += 6; else if (totalChange > 0.5) score += 3; else if (totalChange < -2) score -= 6; else if (totalChange < -0.5) score -= 3; }
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const dayTradingScore = calculateDayTradingScore();
  const swingScore = calculateSwingScore();
  const hodlScore = calculateHodlScore();
  
  // Alert handlers
  const handleAddAlert = (alert) => { setAlerts(prev => [...prev, alert]); };
  const handleDeleteAlert = (id) => { setAlerts(prev => prev.filter(a => a.id !== id)); };
  
  const tabs = [
    { id: 'crypto', label: '₿ Crypto' },
    { id: 'structure', label: '📊 Structure' },
    { id: 'movers', label: '🔥 Movers' },
    { id: 'macro', label: '🏦 Macro' },
    { id: 'defi', label: '🦙 DeFi' },
    { id: 'derivatives', label: '📉 Deriv' },
    { id: 'charts', label: '📈 Charts' },
    { id: 'portfolio', label: '💼 Portfolio' }
  ];
  
  const formatChange = (val) => val >= 0 ? `+${val}%` : `${val}%`;
  const formatUSD = (val) => val >= 1000 ? `$${(val/1000).toFixed(1)}k` : `$${val.toFixed(2)}`;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '70px' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.border}`, position: 'sticky', top: 0, background: t.bg, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>🎯 Crypto Decision Hub {cgData && <LiveTag theme={theme} />}</h1>
            <span style={{ fontSize: '9px', color: t.textSecondary }}>{lastUpdate ? `${lastUpdate.toLocaleTimeString('pl-PL')}` : 'Ładowanie...'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => setShowAlertPanel(true)} style={{ position: 'relative', background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px', color: t.text }}>
              🔔
              {alerts.filter(a => a.enabled && !a.triggered).length > 0 && (
                <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', borderRadius: '50%', background: t.accent, color: '#fff', fontSize: '9px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {alerts.filter(a => a.enabled && !a.triggered).length}
                </span>
              )}
            </button>
            <button onClick={fetchAllData} disabled={loading} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px', color: t.text }}>{loading ? '⏳' : '🔄'}</button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          </div>
        </div>
        {/* Data Sources Badge */}
        <DataSourcesBadge apiStatus={apiStatus} theme={theme} />
      </div>

      {/* Three Scores - COMPACT ROW */}
      <div style={{ padding: '10px 12px' }}>
        <Card theme={theme}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
            <MiniScoreGauge score={dayTradingScore} label="Day" icon="🎯" subtitle="godziny-dni" onHelp={() => setHelpModal('dayTradingScore')} theme={theme} />
            <MiniScoreGauge score={swingScore} label="Swing" icon="📊" subtitle="tygodnie" onHelp={() => setHelpModal('swingScore')} theme={theme} />
            <MiniScoreGauge score={hodlScore} label="HODL" icon="🏦" subtitle="miesiące" onHelp={() => setHelpModal('hodlScore')} theme={theme} />
          </div>
        </Card>
      </div>

      {/* AI Insight */}
      <AIInsight cgData={cgData} binanceData={binanceData} altseasonData={altseasonData} defiData={defiData} dayScore={dayTradingScore} swingScore={swingScore} hodlScore={hodlScore} theme={theme} />

      {/* Tab Content */}
      <div style={{ padding: '0 12px' }}>
        
        {/* CRYPTO TAB */}
        {activeTab === 'crypto' && (
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} signalColor={(cgData?.btcPrice?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!cgData?.btcPrice}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>₿ Bitcoin</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.btcPrice?.value ? `$${cgData.btcPrice.value.toLocaleString()}` : <SkeletonLoader width="80px" height="20px" theme={theme} />}</div>
              <span style={{ fontSize: '11px', color: (cgData?.btcPrice?.change || 0) >= 0 ? t.positive : t.negative }}>{cgData?.btcPrice?.change ? formatChange(cgData.btcPrice.change) : <SkeletonLoader width="40px" height="14px" theme={theme} />}</span>
            </Card>
            <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme} signalColor={(cgData?.ethPrice?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!cgData?.ethPrice}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>◆ Ethereum</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.ethPrice?.value ? `$${cgData.ethPrice.value.toLocaleString()}` : <SkeletonLoader width="70px" height="20px" theme={theme} />}</div>
              <span style={{ fontSize: '11px', color: (cgData?.ethPrice?.change || 0) >= 0 ? t.positive : t.negative }}>{cgData?.ethPrice?.change ? formatChange(cgData.ethPrice.change) : <SkeletonLoader width="40px" height="14px" theme={theme} />}</span>
            </Card>
            <Card theme={theme} signalColor={(cgData?.solPrice?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!cgData?.solPrice}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>◎ Solana</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.solPrice?.value ? `$${cgData.solPrice.value}` : <SkeletonLoader width="60px" height="20px" theme={theme} />}</div>
              <span style={{ fontSize: '11px', color: (cgData?.solPrice?.change || 0) >= 0 ? t.positive : t.negative }}>{cgData?.solPrice?.change ? formatChange(cgData.solPrice.change) : <SkeletonLoader width="40px" height="14px" theme={theme} />}</span>
            </Card>
            <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} signalColor={(cgData?.fearGreed?.value || 50) < 35 ? t.positive : (cgData?.fearGreed?.value || 50) > 65 ? t.negative : t.warning} isLive={!!cgData?.fearGreed}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>😱 Fear & Greed</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.fearGreed?.value ?? <SkeletonLoader width="40px" height="20px" theme={theme} />}</div>
              <span style={{ fontSize: '10px', color: t.textSecondary }}>{cgData?.fearGreed?.label || <SkeletonLoader width="50px" height="12px" theme={theme} />}</span>
            </Card>
            <Card helpKey="btcDominance" onHelp={setHelpModal} theme={theme} isLive={!!cgData?.btcDominance}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>👑 BTC Dominance</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.btcDominance?.value ? `${cgData.btcDominance.value}%` : <SkeletonLoader width="50px" height="20px" theme={theme} />}</div>
            </Card>
            <Card theme={theme} isLive={!!cgData?.volume24h}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>📊 Volume 24h</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.volume24h ? `$${cgData.volume24h}B` : <SkeletonLoader width="60px" height="20px" theme={theme} />}</div>
            </Card>
          </div>
        )}

        {/* STRUCTURE TAB - REORDERED: Indicators BEFORE Gainers/Losers */}
        {activeTab === 'structure' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Market Breadth */}
            {msData?.marketBreadth && (
              <Card helpKey="marketBreadth" onHelp={setHelpModal} theme={theme} signalColor={parseInt(msData.marketBreadth.ratio) > 55 ? t.positive : parseInt(msData.marketBreadth.ratio) < 45 ? t.negative : t.warning} isLive={!!msData?.marketBreadth}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>📊 Market Breadth ({msData.source}) <span style={{ fontSize: '9px', color: t.textSecondary }}>({msData.marketBreadth.total} par)</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                  <div><div style={{ fontSize: '18px', fontWeight: '700', color: t.positive }}>{msData.marketBreadth.gainers}</div><div style={{ fontSize: '9px', color: t.textSecondary }}>Gainers</div></div>
                  <div><div style={{ fontSize: '18px', fontWeight: '700', color: t.negative }}>{msData.marketBreadth.losers}</div><div style={{ fontSize: '9px', color: t.textSecondary }}>Losers</div></div>
                  <div><div style={{ fontSize: '18px', fontWeight: '700', color: parseInt(msData.marketBreadth.ratio) > 50 ? t.positive : t.negative }}>{msData.marketBreadth.ratio}%</div><div style={{ fontSize: '9px', color: t.textSecondary }}>Bullish</div></div>
                </div>
                <div style={{ marginTop: '8px', height: '6px', background: t.bg, borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${msData.marketBreadth.ratio}%`, background: t.positive, transition: 'width 0.3s' }}></div>
                  <div style={{ width: `${100 - msData.marketBreadth.ratio}%`, background: t.negative, transition: 'width 0.3s' }}></div>
                </div>
              </Card>
            )}

            {/* Altseason Indicators - MOVED UP */}
            {altseasonData && (
              <Card helpKey="altseasonIndex" onHelp={setHelpModal} theme={theme} signalColor={altseasonData.altseasonIndex > 50 ? t.positive : altseasonData.altseasonIndex < 40 ? t.negative : t.warning} isLive={!!altseasonData}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>🌊 Altseason Indicators <LiveTag theme={theme} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>Altseason Index</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: altseasonData.altseasonIndex > 50 ? t.positive : altseasonData.altseasonIndex < 40 ? t.negative : t.warning }}>{altseasonData.altseasonIndex}</div>
                    <div style={{ fontSize: '8px', color: t.textSecondary }}>{altseasonData.altseasonIndex > 75 ? 'ALTSEASON' : altseasonData.altseasonIndex > 50 ? 'Alty rosną' : altseasonData.altseasonIndex > 40 ? 'Neutralny' : 'BTC Season'}</div>
                  </div>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>ETH/BTC Ratio</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: altseasonData.ethBtcRatio > 0.05 ? t.positive : altseasonData.ethBtcRatio < 0.035 ? t.negative : t.warning }}>{altseasonData.ethBtcRatio}</div>
                    <div style={{ fontSize: '8px', color: t.textSecondary }}>{altseasonData.ethBtcRatio > 0.05 ? 'ETH silny' : altseasonData.ethBtcRatio < 0.035 ? 'BTC dominuje' : 'Neutralny'}</div>
                  </div>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>Total2 (bez BTC)</div>
                    <div style={{ fontSize: '20px', fontWeight: '700' }}>${altseasonData.total2}T</div>
                    <div style={{ fontSize: '8px', color: t.textSecondary }}>Market Cap altów</div>
                  </div>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>BTC Dominance</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: altseasonData.btcDominance > 55 ? t.negative : altseasonData.btcDominance < 45 ? t.positive : t.warning }}>{altseasonData.btcDominance}%</div>
                    <div style={{ fontSize: '8px', color: t.textSecondary }}>{altseasonData.btcDominance > 55 ? 'BTC Season' : altseasonData.btcDominance < 45 ? 'Altseason' : 'Zrównoważony'}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Stablecoin Flows - MOVED UP */}
            {altseasonData?.stablecoins && (
              <Card helpKey="stablecoinFlows" onHelp={setHelpModal} theme={theme} signalColor={(altseasonData.stablecoins.usdt.change7d + altseasonData.stablecoins.usdc.change7d) > 1 ? t.positive : (altseasonData.stablecoins.usdt.change7d + altseasonData.stablecoins.usdc.change7d) < -1 ? t.negative : t.warning} isLive={!!altseasonData?.stablecoins}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>💵 Stablecoin Flows (7d) <LiveTag theme={theme} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600' }}>🟢 USDT</span>
                      <span style={{ fontSize: '10px', color: altseasonData.stablecoins.usdt.change7d >= 0 ? t.positive : t.negative, fontWeight: '600' }}>
                        {altseasonData.stablecoins.usdt.change7d >= 0 ? '+' : ''}{altseasonData.stablecoins.usdt.change7d}%
                      </span>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '700' }}>${altseasonData.stablecoins.usdt.mcap}B</div>
                  </div>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600' }}>🔵 USDC</span>
                      <span style={{ fontSize: '10px', color: altseasonData.stablecoins.usdc.change7d >= 0 ? t.positive : t.negative, fontWeight: '600' }}>
                        {altseasonData.stablecoins.usdc.change7d >= 0 ? '+' : ''}{altseasonData.stablecoins.usdc.change7d}%
                      </span>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '700' }}>${altseasonData.stablecoins.usdc.mcap}B</div>
                  </div>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>Total (USDT+USDC)</div>
                    <div style={{ fontSize: '16px', fontWeight: '700' }}>${altseasonData.stablecoins.total}B</div>
                  </div>
                  <div style={{ padding: '10px', background: t.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '4px' }}>USDT Dominance</div>
                    <div style={{ fontSize: '16px', fontWeight: '700' }}>{altseasonData.stablecoins.usdtDominance}%</div>
                  </div>
                </div>
                <div style={{ marginTop: '8px', padding: '8px', background: `${t.accent}10`, borderRadius: '6px', fontSize: '10px', color: t.textSecondary }}>
                  💡 {altseasonData.stablecoins.usdt.change7d + altseasonData.stablecoins.usdc.change7d > 1 
                    ? '🟢 Kapitał napływa do ekosystemu' 
                    : altseasonData.stablecoins.usdt.change7d + altseasonData.stablecoins.usdc.change7d < -1 
                    ? '🔴 Kapitał odpływa z ekosystemu' 
                    : '🟡 Stabilny przepływ kapitału'}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* MOVERS TAB - NEW */}
        {activeTab === 'movers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Sector Analysis - Binance based */}
            <SectorAnalysis topGainers={msData?.topGainers} theme={theme} />

            {/* CoinGecko Trending Categories */}
            {cgCategories?.categories && (
              <Card theme={theme} signalColor={t.accent} isLive={!!cgCategories}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>🏆 Trending Categories <span style={{ fontSize: '9px', color: t.textSecondary, fontWeight: '400' }}>(CoinGecko)</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {cgCategories.categories.slice(0, 8).map((cat, i) => (
                    <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: t.bg, borderRadius: '8px', borderLeft: `3px solid ${parseFloat(cat.marketCapChange24h) > 0 ? t.positive : t.negative}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', color: t.textSecondary, width: '18px' }}>{i + 1}.</span>
                        <span style={{ fontWeight: '600', fontSize: '11px' }}>{cat.name}</span>
                      </div>
                      <span style={{ color: parseFloat(cat.marketCapChange24h) > 0 ? t.positive : t.negative, fontWeight: '700', fontSize: '12px' }}>
                        {parseFloat(cat.marketCapChange24h) > 0 ? '+' : ''}{cat.marketCapChange24h}%
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Top Gainers */}
            {msData?.topGainers && (
              <Card helpKey="topGainers" onHelp={setHelpModal} theme={theme} signalColor={t.positive} isLive={!!msData?.topGainers}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: t.positive }}>🚀 Top Gainers 24h <span style={{ fontSize: '9px', color: t.textSecondary, fontWeight: '400' }}>(Binance)</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {msData.topGainers.slice(0, 10).map((coin, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: t.bg, borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', color: t.textSecondary, width: '16px' }}>{i + 1}.</span>
                        <span style={{ fontWeight: '600', fontSize: '11px' }}>{coin.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: t.positive, fontWeight: '700', fontSize: '12px' }}>+{coin.change24h}%</span>
                        <div style={{ fontSize: '9px', color: t.textSecondary }}>${coin.price < 1 ? coin.price.toFixed(6) : coin.price.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Top Losers */}
            {msData?.topLosers && (
              <Card helpKey="topLosers" onHelp={setHelpModal} theme={theme} signalColor={t.negative} isLive={!!msData?.topLosers}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: t.negative }}>📉 Top Losers 24h <span style={{ fontSize: '9px', color: t.textSecondary, fontWeight: '400' }}>(Binance)</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {msData.topLosers.slice(0, 10).map((coin, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: t.bg, borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', color: t.textSecondary, width: '16px' }}>{i + 1}.</span>
                        <span style={{ fontWeight: '600', fontSize: '11px' }}>{coin.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: t.negative, fontWeight: '700', fontSize: '12px' }}>{coin.change24h}%</span>
                        <div style={{ fontSize: '9px', color: t.textSecondary }}>${coin.price < 1 ? coin.price.toFixed(6) : coin.price.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* MACRO TAB */}
        {activeTab === 'macro' && (
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Card helpKey="m2Supply" onHelp={setHelpModal} theme={theme} signalColor={fredData?.m2Supply?.trend === 'expanding' ? t.positive : t.negative} isLive={!!fredData?.m2Supply}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>🏦 M2 Supply</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{fredData?.m2Supply?.value ? `$${fredData.m2Supply.value}T` : <SkeletonLoader width="70px" height="20px" theme={theme} />}</div>
              <span style={{ fontSize: '11px', color: fredData?.m2Supply?.trend === 'expanding' ? t.positive : t.negative }}>{fredData?.m2Supply?.change ? `${formatChange(fredData.m2Supply.change)} (YoY)` : <SkeletonLoader width="60px" height="14px" theme={theme} />}</span>
            </Card>
            <Card theme={theme} signalColor={mockData.dxy.change < 0 ? t.positive : t.negative}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💲 DXY Index</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{mockData.dxy.value}</div>
              <span style={{ fontSize: '11px', color: mockData.dxy.change < 0 ? t.positive : t.negative }}>{formatChange(mockData.dxy.change)}</span>
            </Card>
          </div>
        )}

        {/* DEFI TAB */}
        {activeTab === 'defi' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <Card helpKey="tvl" onHelp={setHelpModal} theme={theme} signalColor={(defiData?.tvl?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!defiData?.tvl}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>🔒 Total TVL</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{defiData?.tvl?.value ? `$${defiData.tvl.value}B` : <SkeletonLoader width="70px" height="20px" theme={theme} />}</div>
                <span style={{ fontSize: '11px', color: (defiData?.tvl?.change || 0) >= 0 ? t.positive : t.negative }}>{defiData?.tvl?.change ? `${formatChange(defiData.tvl.change)} (7d)` : <SkeletonLoader width="50px" height="14px" theme={theme} />}</span>
              </Card>
              <Card helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme} signalColor={(defiData?.stablecoinSupply?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!defiData?.stablecoinSupply}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💵 Stablecoin</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{defiData?.stablecoinSupply?.value ? `$${defiData.stablecoinSupply.value}B` : <SkeletonLoader width="70px" height="20px" theme={theme} />}</div>
                <span style={{ fontSize: '11px', color: (defiData?.stablecoinSupply?.change || 0) >= 0 ? t.positive : t.negative }}>{defiData?.stablecoinSupply?.change ? `${formatChange(defiData.stablecoinSupply.change)} (30d)` : <SkeletonLoader width="50px" height="14px" theme={theme} />}</span>
              </Card>
            </div>
            {defiData?.topProtocols && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>🏆 Top 5 Protokołów</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {defiData.topProtocols.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px', background: t.bg, borderRadius: '6px' }}>
                      <span style={{ fontWeight: '500', fontSize: '11px' }}>{i + 1}. {p.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: '600', fontSize: '11px' }}>${(p.tvl / 1e9).toFixed(2)}B</span>
                        <span style={{ fontSize: '9px', marginLeft: '4px', color: p.change >= 0 ? t.positive : t.negative }}>{p.change >= 0 ? '+' : ''}{p.change?.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {!defiData?.topProtocols && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>🏆 Top 5 Protokołów</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px', background: t.bg, borderRadius: '6px' }}>
                      <SkeletonLoader width="80px" height="14px" theme={theme} />
                      <SkeletonLoader width="60px" height="14px" theme={theme} />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* DERIVATIVES TAB */}
        {activeTab === 'derivatives' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme} signalColor={(binanceData?.fundingRate?.value || 0) < 0 ? t.positive : (binanceData?.fundingRate?.value || 0) > 0.05 ? t.negative : t.warning} isLive={!!binanceData?.fundingRate}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💸 Funding Rate</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{binanceData?.fundingRate?.value !== undefined ? `${binanceData.fundingRate.value.toFixed(4)}%` : <SkeletonLoader width="70px" height="20px" theme={theme} />}</div>
                <span style={{ fontSize: '9px', color: t.textSecondary }}>BTC Perpetual</span>
              </Card>
              <Card helpKey="openInterest" onHelp={setHelpModal} theme={theme} isLive={!!binanceData?.openInterest}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>📊 Open Interest</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{binanceData?.openInterest?.value ? `$${binanceData.openInterest.value}B` : <SkeletonLoader width="60px" height="20px" theme={theme} />}</div>
                <span style={{ fontSize: '9px', color: t.textSecondary }}>BTC Futures</span>
              </Card>
              <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme} signalColor={(binanceData?.longShortRatio?.value || 1) < 1 ? t.positive : (binanceData?.longShortRatio?.value || 1) > 1.8 ? t.negative : t.warning} isLive={!!binanceData?.longShortRatio}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>⚖️ Long/Short</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{binanceData?.longShortRatio?.value || <SkeletonLoader width="50px" height="20px" theme={theme} />}</div>
              </Card>
              <Card theme={theme} signalColor={mockData.liquidations.long > mockData.liquidations.short ? t.negative : t.positive}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💥 Liquidations 24h</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>${mockData.liquidations.total}M</div>
                <div style={{ fontSize: '9px' }}><span style={{ color: t.positive }}>L: ${mockData.liquidations.long}M</span> | <span style={{ color: t.negative }}>S: ${mockData.liquidations.short}M</span></div>
              </Card>
            </div>
            {/* Position Size Calculator */}
            <PositionCalculator theme={theme} onHelp={() => setHelpModal('positionCalculator')} />
          </div>
        )}

        {/* CHARTS TAB - Analysis first, then Chart */}
        {activeTab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Card theme={theme}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {[{ s: 'BINANCE:BTCUSDT', l: 'BTC' }, { s: 'BINANCE:ETHUSDT', l: 'ETH' }, { s: 'BINANCE:SOLUSDT', l: 'SOL' }, { s: 'CRYPTOCAP:TOTAL', l: 'Total' }, { s: 'CRYPTOCAP:BTC.D', l: 'BTC.D' }].map(item => (
                  <button key={item.s} onClick={() => setTvSymbol(item.s)} style={{ padding: '6px 10px', borderRadius: '6px', border: tvSymbol === item.s ? `2px solid ${t.accent}` : `1px solid ${t.border}`, background: tvSymbol === item.s ? `${t.accent}20` : t.bg, color: tvSymbol === item.s ? t.accent : t.textSecondary, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>{item.l}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                {['analysis', 'chart', 'both'].map(view => (
                  <button key={view} onClick={() => setChartView(view)} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: chartView === view ? `2px solid ${t.accent}` : `1px solid ${t.border}`, background: chartView === view ? `${t.accent}20` : t.bg, color: chartView === view ? t.accent : t.textSecondary, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>{view === 'chart' ? '📈 Chart' : view === 'analysis' ? '📊 Analysis' : '📈📊 Both'}</button>
                ))}
              </div>
            </Card>
            {(chartView === 'analysis' || chartView === 'both') && (
              <Card helpKey="technicalAnalysis" onHelp={setHelpModal} theme={theme}>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {['15m', '1H', '4H', '1D', '1W'].map(int => (
                    <button key={int} onClick={() => setTaInterval(int === '15m' ? '15' : int === '1H' ? '60' : int === '4H' ? '240' : int === '1D' ? 'D' : 'W')} style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, fontSize: '10px', cursor: 'pointer' }}>{int}</button>
                  ))}
                </div>
                <TradingViewTechnicalAnalysis symbol={tvSymbol} interval={taInterval} theme={theme} />
              </Card>
            )}
            {(chartView === 'chart' || chartView === 'both') && <TradingViewChart symbol={tvSymbol} theme={theme} />}
          </div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab === 'portfolio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!portfolioConnected ? (
              <Card helpKey="portfolio" onHelp={setHelpModal} theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>🔐 Połącz z Binance</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ padding: '10px', background: `${t.warning}15`, borderRadius: '8px', fontSize: '10px', color: t.warning }}>
                    ⚠️ Użyj kluczy z ograniczonymi uprawnieniami. Nigdy nie włączaj Withdrawals!
                  </div>
                  <input type="text" placeholder="API Key" value={portfolioApiKey} onChange={e => setPortfolioApiKey(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
                  <input type={showApiKeys ? 'text' : 'password'} placeholder="Secret Key" value={portfolioSecretKey} onChange={e => setPortfolioSecretKey(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: t.textSecondary }}>
                    <input type="checkbox" checked={showApiKeys} onChange={e => setShowApiKeys(e.target.checked)} /> Pokaż klucze
                  </label>
                  {portfolioError && <div style={{ padding: '8px', background: `${t.negative}15`, borderRadius: '6px', color: t.negative, fontSize: '11px' }}>❌ {portfolioError}</div>}
                  <button onClick={connectPortfolio} disabled={portfolioLoading} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: t.accent, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                    {portfolioLoading ? '⏳ Łączenie...' : '🔗 Połącz'}
                  </button>
                </div>
              </Card>
            ) : (
              <>
                {/* Connected Header */}
                <Card theme={theme}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>✅</span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600' }}>Binance Connected</div>
                        <div style={{ fontSize: '9px', color: t.textSecondary }}>Spot & Futures</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={refreshPortfolio} disabled={portfolioLoading} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '10px', cursor: 'pointer' }}>{portfolioLoading ? '⏳' : '🔄'}</button>
                      <button onClick={disconnectPortfolio} style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: t.negative, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>Rozłącz</button>
                    </div>
                  </div>
                </Card>

                {/* Spot Balance */}
                {spotBalance?.balances && spotBalance.balances.length > 0 && (
                  <Card theme={theme}>
                    <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>💰 Spot Balance</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {spotBalance.balances.slice(0, 10).map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: t.bg, borderRadius: '6px' }}>
                          <span style={{ fontWeight: '600', fontSize: '11px' }}>{b.asset}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600' }}>{b.total.toFixed(b.total < 1 ? 6 : 4)}</div>
                            {b.locked > 0 && <div style={{ fontSize: '9px', color: t.warning }}>🔒 {b.locked.toFixed(4)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Futures Balance */}
                {futuresBalance?.balances && futuresBalance.balances.length > 0 && (
                  <Card theme={theme}>
                    <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>📊 Futures Balance</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {futuresBalance.balances.map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: t.bg, borderRadius: '6px' }}>
                          <span style={{ fontWeight: '600', fontSize: '11px' }}>{b.asset}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600' }}>{b.balance.toFixed(2)}</div>
                            {b.crossUnPnl !== 0 && <div style={{ fontSize: '9px', color: b.crossUnPnl >= 0 ? t.positive : t.negative }}>PnL: {b.crossUnPnl >= 0 ? '+' : ''}{b.crossUnPnl.toFixed(2)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Open Positions */}
                {futuresPositions?.positions && futuresPositions.positions.length > 0 && (
                  <Card theme={theme}>
                    <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>📈 Open Positions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {futuresPositions.positions.map((p, i) => (
                        <div key={i} style={{ padding: '10px', background: t.bg, borderRadius: '8px', borderLeft: `4px solid ${p.side === 'LONG' ? t.positive : t.negative}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontWeight: '700', fontSize: '13px' }}>{p.symbol}</span>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: p.side === 'LONG' ? `${t.positive}20` : `${t.negative}20`, color: p.side === 'LONG' ? t.positive : t.negative, fontWeight: '600' }}>{p.side} {p.leverage}x</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '10px' }}>
                            <div><span style={{ color: t.textSecondary }}>Size:</span> {p.positionAmt}</div>
                            <div><span style={{ color: t.textSecondary }}>Entry:</span> ${p.entryPrice.toFixed(2)}</div>
                            <div><span style={{ color: t.textSecondary }}>Mark:</span> ${p.markPrice.toFixed(2)}</div>
                            <div><span style={{ color: t.textSecondary }}>Liq:</span> ${p.liquidationPrice.toFixed(2)}</div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: p.unRealizedProfit >= 0 ? t.positive : t.negative }}>
                              {p.unRealizedProfit >= 0 ? '+' : ''}{p.unRealizedProfit.toFixed(2)} USDT ({p.pnlPercent}%)
                            </div>
                            <button onClick={() => handleClosePosition(p.symbol, p.positionAmt)} style={{ padding: '4px 8px', borderRadius: '4px', border: 'none', background: t.negative, color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Open Orders */}
                {openOrders && (openOrders.spot?.length > 0 || openOrders.futures?.length > 0) && (
                  <Card theme={theme}>
                    <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>📋 Open Orders</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[...(openOrders.spot || []), ...(openOrders.futures || [])].map((o, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: t.bg, borderRadius: '6px' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '11px' }}>{o.symbol}</div>
                            <div style={{ fontSize: '9px', color: t.textSecondary }}>{o.side} {o.type} @ {o.price}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: o.market === 'SPOT' ? t.accent : t.warning }}>{o.market}</span>
                            <button onClick={() => handleCancelOrder(o.symbol, o.orderId, o.market)} style={{ padding: '3px 6px', borderRadius: '4px', border: 'none', background: t.negative, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Quick Trade */}
                <Card theme={theme}>
                  <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>⚡ Quick Trade</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value)} style={{ flex: 2, padding: '8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '11px' }}>
                        <option value="BTCUSDT">BTC/USDT</option>
                        <option value="ETHUSDT">ETH/USDT</option>
                        <option value="SOLUSDT">SOL/USDT</option>
                        <option value="BNBUSDT">BNB/USDT</option>
                      </select>
                      <select value={tradeMarket} onChange={e => setTradeMarket(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '11px' }}>
                        <option value="SPOT">Spot</option>
                        <option value="FUTURES">Futures</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setTradeSide('BUY')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: tradeSide === 'BUY' ? t.positive : t.bg, color: tradeSide === 'BUY' ? '#fff' : t.textSecondary, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>🟢 BUY</button>
                      <button onClick={() => setTradeSide('SELL')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: tradeSide === 'SELL' ? t.negative : t.bg, color: tradeSide === 'SELL' ? '#fff' : t.textSecondary, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>🔴 SELL</button>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setTradeType('MARKET')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: tradeType === 'MARKET' ? `2px solid ${t.accent}` : `1px solid ${t.border}`, background: t.bg, color: tradeType === 'MARKET' ? t.accent : t.textSecondary, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Market</button>
                      <button onClick={() => setTradeType('LIMIT')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: tradeType === 'LIMIT' ? `2px solid ${t.accent}` : `1px solid ${t.border}`, background: t.bg, color: tradeType === 'LIMIT' ? t.accent : t.textSecondary, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Limit</button>
                    </div>
                    <input type="number" placeholder="Ilość" value={tradeQuantity} onChange={e => setTradeQuantity(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
                    {tradeType === 'LIMIT' && (
                      <input type="number" placeholder="Cena" value={tradePrice} onChange={e => setTradePrice(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
                    )}
                    <button onClick={executeTrade} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: tradeSide === 'BUY' ? t.positive : t.negative, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      {tradeSide === 'BUY' ? '🟢' : '🔴'} {tradeSide} {tradeType} {tradeSymbol}
                    </button>
                    {tradeResult && (
                      <div style={{ padding: '8px', borderRadius: '6px', background: tradeResult.success ? `${t.positive}20` : `${t.negative}20`, color: tradeResult.success ? t.positive : t.negative, fontSize: '11px' }}>
                        {tradeResult.success ? `✅ Order złożony! ID: ${tradeResult.order.orderId}` : `❌ ${tradeResult.error}`}
                      </div>
                    )}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

      </div>

      {/* Bottom Navigation Bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: t.cardBg, borderTop: `1px solid ${t.border}`, zIndex: 100, padding: '6px 8px', paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              padding: '6px 8px', borderRadius: '10px', border: 'none',
              background: activeTab === tab.id ? `${t.accent}20` : 'transparent',
              color: activeTab === tab.id ? t.accent : t.textSecondary,
              fontSize: '16px', cursor: 'pointer', minWidth: '44px'
            }}>
              <span>{tab.label.split(' ')[0]}</span>
              <span style={{ fontSize: '8px', fontWeight: '600' }}>{tab.label.split(' ')[1] || ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Help Modal */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
      
      {/* Alert Panel */}
      {showAlertPanel && <AlertPanel alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onClose={() => setShowAlertPanel(false)} theme={theme} />}
      
      {/* Alert Toast */}
      {activeToast && <AlertToast alert={activeToast} onClose={() => setActiveToast(null)} theme={theme} />}
    </div>
  );
}

export default App;
