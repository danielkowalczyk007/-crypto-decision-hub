import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// ============== CRYPTO UTILS FOR BINANCE AUTH ==============
const generateSignature = async (queryString, secretKey) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
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
const saveAlerts = (alerts) => { try { localStorage.setItem('crypto_hub_alerts', JSON.stringify(alerts)); return true; } catch (e) { return false; } };
const loadAlerts = () => { try { const data = localStorage.getItem('crypto_hub_alerts'); return data ? JSON.parse(data) : []; } catch (e) { return []; } };
const saveAlertHistory = (history) => { try { localStorage.setItem('crypto_hub_alert_history', JSON.stringify(history.slice(-50))); return true; } catch (e) { return false; } };
const loadAlertHistory = () => { try { const data = localStorage.getItem('crypto_hub_alert_history'); return data ? JSON.parse(data) : []; } catch (e) { return []; } };

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
    const spotOrders = spotRes.ok ? (await spotRes.json()).map(o => ({ ...o, market: 'SPOT' })) : [];
    const futuresOrders = futuresRes.ok ? (await futuresRes.json()).map(o => ({ ...o, market: 'FUTURES' })) : [];
    return { spot: spotOrders, futures: futuresOrders };
  } catch (error) { return { error: error.message }; }
};

const placeOrder = async (apiKey, secretKey, params, market = 'SPOT') => {
  try {
    const timestamp = Date.now();
    const queryString = `${new URLSearchParams({ ...params, timestamp }).toString()}`;
    const signature = await generateSignature(queryString, secretKey);
    const baseUrl = market === 'SPOT' ? 'https://api.binance.com/api/v3/order' : 'https://fapi.binance.com/fapi/v1/order';
    const response = await fetch(`${baseUrl}?${queryString}&signature=${signature}`, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Order failed');
    return { success: true, order: data };
  } catch (error) { return { success: false, error: error.message }; }
};

const cancelOrder = async (apiKey, secretKey, symbol, orderId, market = 'SPOT') => {
  try {
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = await generateSignature(queryString, secretKey);
    const baseUrl = market === 'SPOT' ? 'https://api.binance.com/api/v3/order' : 'https://fapi.binance.com/fapi/v1/order';
    const response = await fetch(`${baseUrl}?${queryString}&signature=${signature}`, { method: 'DELETE', headers: { 'X-MBX-APIKEY': apiKey } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.msg || 'Cancel failed'); }
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
};

const closePosition = async (apiKey, secretKey, symbol, positionAmt) => {
  const side = parseFloat(positionAmt) > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(parseFloat(positionAmt));
  return placeOrder(apiKey, secretKey, { symbol, side, type: 'MARKET', quantity: quantity.toString(), reduceOnly: 'true' }, 'FUTURES');
};

// ============== COINGECKO API ==============
const fetchCoinGeckoData = async () => {
  try {
    const [pricesRes, globalRes, fgRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true'),
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.alternative.me/fng/?limit=1')
    ]);
    
    if (!pricesRes.ok || !globalRes.ok) throw new Error('CoinGecko API error');
    
    const prices = await pricesRes.json();
    const global = await globalRes.json();
    const fgData = fgRes.ok ? await fgRes.json() : null;
    
    const fgValue = parseInt(fgData?.data?.[0]?.value) || 50;
    const fgText = fgValue <= 25 ? 'Extreme Fear' : fgValue <= 45 ? 'Fear' : fgValue <= 55 ? 'Neutral' : fgValue <= 75 ? 'Greed' : 'Extreme Greed';
    
    return {
      btcPrice: { value: prices.bitcoin?.usd || 0, change: prices.bitcoin?.usd_24h_change || 0, volume: prices.bitcoin?.usd_24h_vol || 0, marketCap: prices.bitcoin?.usd_market_cap || 0 },
      ethPrice: { value: prices.ethereum?.usd || 0, change: prices.ethereum?.usd_24h_change || 0, volume: prices.ethereum?.usd_24h_vol || 0 },
      solPrice: { value: prices.solana?.usd || 0, change: prices.solana?.usd_24h_change || 0, volume: prices.solana?.usd_24h_vol || 0 },
      bnbPrice: { value: prices.binancecoin?.usd || 0, change: prices.binancecoin?.usd_24h_change || 0, volume: prices.binancecoin?.usd_24h_vol || 0 },
      btcDominance: { value: parseFloat((global.data?.market_cap_percentage?.btc || 0).toFixed(2)) },
      totalMarketCap: { value: ((global.data?.total_market_cap?.usd || 0) / 1e12).toFixed(2) },
      totalVolume: { value: ((global.data?.total_volume?.usd || 0) / 1e9).toFixed(0) },
      fearGreed: { value: fgValue, text: fgText }
    };
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return null;
  }
};

// ============== BINANCE FUTURES API ==============
const fetchBinanceData = async () => {
  try {
    const [fundingRes, oiRes, lsRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1'),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1')
    ]);
    
    if (!fundingRes.ok) throw new Error('Binance API error');
    
    const funding = await fundingRes.json();
    const oi = oiRes.ok ? await oiRes.json() : null;
    const ls = lsRes.ok ? await lsRes.json() : null;
    
    return {
      fundingRate: { value: parseFloat(funding[0]?.fundingRate || 0) * 100, time: funding[0]?.fundingTime },
      openInterest: { value: parseFloat(oi?.openInterest || 0), notional: parseFloat(oi?.openInterest || 0) * 95000 },
      longShortRatio: { value: parseFloat(ls?.[0]?.longShortRatio || 1), longAccount: parseFloat(ls?.[0]?.longAccount || 0.5), shortAccount: parseFloat(ls?.[0]?.shortAccount || 0.5) }
    };
  } catch (error) {
    console.error('Binance fetch error:', error);
    return null;
  }
};

// ============== DEFILLAMA API ==============
const fetchDefiLlamaData = async () => {
  try {
    const [tvlRes, stablesRes, protocolsRes] = await Promise.all([
      fetch('https://api.llama.fi/v2/historicalChainTvl').catch(e => ({ ok: false })),
      fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true').catch(e => ({ ok: false })),
      fetch('https://api.llama.fi/protocols').catch(e => ({ ok: false }))
    ]);
    
    let currentTvl = 0, tvlChange = 0;
    if (tvlRes.ok) {
      const tvlData = await tvlRes.json();
      if (Array.isArray(tvlData) && tvlData.length > 0) {
        currentTvl = tvlData[tvlData.length - 1]?.tvl || 0;
        const tvl7dAgo = tvlData[Math.max(0, tvlData.length - 8)]?.tvl || currentTvl;
        tvlChange = tvl7dAgo > 0 ? ((currentTvl - tvl7dAgo) / tvl7dAgo * 100) : 0;
      }
    }
    if (currentTvl === 0) { currentTvl = 180e9; tvlChange = 2.5; }
    
    let totalStables = 0, usdtData = { supply: 0, change: '0' }, usdcData = { supply: 0, change: '0' }, stableChange = 0;
    if (stablesRes.ok) {
      const stablesData = await stablesRes.json();
      const peggedAssets = stablesData?.peggedAssets || [];
      if (peggedAssets.length > 0) {
        const usdt = peggedAssets.find(s => s.symbol === 'USDT');
        const usdc = peggedAssets.find(s => s.symbol === 'USDC');
        totalStables = peggedAssets.reduce((sum, s) => sum + (s.circulating?.peggedUSD || s.circulatingPrevDay?.peggedUSD || 0), 0);
        if (usdt) {
          const usdtSupply = usdt.circulating?.peggedUSD || 0;
          const usdtPrevDay = usdt.circulatingPrevDay?.peggedUSD || usdtSupply;
          usdtData = { supply: usdtSupply, change: usdtPrevDay > 0 ? ((usdtSupply - usdtPrevDay) / usdtPrevDay * 100).toFixed(2) : '0' };
        }
        if (usdc) {
          const usdcSupply = usdc.circulating?.peggedUSD || 0;
          const usdcPrevDay = usdc.circulatingPrevDay?.peggedUSD || usdcSupply;
          usdcData = { supply: usdcSupply, change: usdcPrevDay > 0 ? ((usdcSupply - usdcPrevDay) / usdcPrevDay * 100).toFixed(2) : '0' };
        }
        const prevTotal = peggedAssets.reduce((sum, s) => sum + (s.circulatingPrevDay?.peggedUSD || 0), 0);
        stableChange = prevTotal > 0 ? ((totalStables - prevTotal) / prevTotal * 100) : 0;
      }
    }
    if (totalStables === 0) { totalStables = 190e9; usdtData = { supply: 140e9, change: '0.1' }; usdcData = { supply: 35e9, change: '0.05' }; stableChange = 0.5; }
    
    let topProtocols = [];
    if (protocolsRes.ok) {
      const protocols = await protocolsRes.json();
      if (Array.isArray(protocols)) {
        topProtocols = protocols.filter(p => p.tvl && p.tvl > 0).sort((a, b) => b.tvl - a.tvl).slice(0, 5)
          .map(p => ({ name: p.name, tvl: p.tvl, change: p.change_7d || 0 }));
      }
    }
    if (topProtocols.length === 0) {
      topProtocols = [{ name: 'Lido', tvl: 35e9, change: 2.1 }, { name: 'Aave', tvl: 20e9, change: 1.5 }, { name: 'EigenLayer', tvl: 18e9, change: 3.2 }, { name: 'Maker', tvl: 8e9, change: 0.8 }, { name: 'Uniswap', tvl: 6e9, change: 1.2 }];
    }
    
    return {
      tvl: { value: (currentTvl / 1e9).toFixed(1), change: tvlChange.toFixed(1) },
      stablecoinSupply: { value: (totalStables / 1e9).toFixed(1), change: stableChange.toFixed(2), usdt: (usdtData.supply / 1e9).toFixed(1), usdc: (usdcData.supply / 1e9).toFixed(1), usdtChange: usdtData.change, usdcChange: usdcData.change },
      topProtocols
    };
  } catch (error) {
    console.error('DefiLlama fetch error:', error);
    return { tvl: { value: '180.0', change: '2.5' }, stablecoinSupply: { value: '190.0', change: '0.50', usdt: '140.0', usdc: '35.0', usdtChange: '0.10', usdcChange: '0.05' }, topProtocols: [{ name: 'Lido', tvl: 35e9, change: 2.1 }, { name: 'Aave', tvl: 20e9, change: 1.5 }] };
  }
};

// ============== FRED API ==============
const fetchFredData = async () => {
  try {
    const FRED_API_KEY = '77212658aa97c444f7b78e0d924d0d25';
    const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=${FRED_API_KEY}&file_type=json&limit=13&sort_order=desc`);
    if (!response.ok) return { m2Supply: { value: 22.8, change: 5.5, trend: 'expanding' } };
    const data = await response.json();
    const observations = data.observations || [];
    if (observations.length < 2 || !observations[0]?.value) return { m2Supply: { value: 22.8, change: 5.5, trend: 'expanding' } };
    const latest = parseFloat(observations[0]?.value) || 0;
    const previous = parseFloat(observations[1]?.value) || latest;
    const yearAgo = parseFloat(observations[11]?.value) || latest;
    if (latest === 0) return { m2Supply: { value: 22.8, change: 5.5, trend: 'expanding' } };
    const monthlyChange = previous > 0 ? ((latest - previous) / previous * 100) : 0;
    const yearlyChange = yearAgo > 0 ? ((latest - yearAgo) / yearAgo * 100) : 0;
    return { m2Supply: { value: (latest / 1000).toFixed(1), change: yearlyChange.toFixed(1), monthlyChange: monthlyChange.toFixed(2), trend: monthlyChange >= 0 ? 'expanding' : 'contracting' } };
  } catch (error) {
    return { m2Supply: { value: 22.8, change: 5.5, trend: 'expanding' } };
  }
};

// ============== POLYGON.IO API ==============
const POLYGON_API_KEY = '8NH1cpI_SZ0J7RanOyCx9phpJjudm8dZ';
const fetchPolygonData = async () => {
  try {
    const endpoints = {
      dxy: `https://api.polygon.io/v2/aggs/ticker/C:USDX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      sp500: `https://api.polygon.io/v2/aggs/ticker/I:SPX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      gold: `https://api.polygon.io/v2/aggs/ticker/C:XAUUSD/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      silver: `https://api.polygon.io/v2/aggs/ticker/C:XAGUSD/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      vix: `https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    };
    const results = await Promise.allSettled([fetch(endpoints.dxy).then(r => r.json()), fetch(endpoints.sp500).then(r => r.json()), fetch(endpoints.gold).then(r => r.json()), fetch(endpoints.silver).then(r => r.json()), fetch(endpoints.vix).then(r => r.json())]);
    const parseResult = (result, fallback) => {
      if (result.status === 'fulfilled' && result.value?.results?.[0]) {
        const d = result.value.results[0];
        return { value: d.c, open: d.o, high: d.h, low: d.l, change: d.o > 0 ? ((d.c - d.o) / d.o * 100) : 0 };
      }
      return fallback;
    };
    return {
      dxy: parseResult(results[0], { value: 99.40, change: -0.25 }),
      sp500: parseResult(results[1], { value: 6940, change: 0.85 }),
      gold: parseResult(results[2], { value: 4596, change: 0.15 }),
      silver: parseResult(results[3], { value: 90.0, change: 1.2 }),
      vix: parseResult(results[4], { value: 15.9, change: -0.1 })
    };
  } catch (error) {
    return { dxy: { value: 99.40, change: -0.25 }, sp500: { value: 6940, change: 0.85 }, gold: { value: 4596, change: 0.15 }, silver: { value: 90.0, change: 1.2 }, vix: { value: 15.9, change: -0.1 } };
  }
};

// ============== MARKET STRUCTURE ==============
const fetchMarketStructure = async () => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h');
    if (!response.ok) throw new Error('CoinGecko error');
    const data = await response.json();
    const stablecoins = ['usdt', 'usdc', 'busd', 'dai', 'tusd', 'usdp', 'fdusd', 'usdd', 'frax', 'gusd', 'paxg'];
    const validCoins = data.filter(c => c.symbol && c.price_change_percentage_24h && !stablecoins.includes(c.symbol.toLowerCase()) && c.total_volume >= 1000000);
    const sortedByChange = [...validCoins].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
    const topGainers = sortedByChange.filter(c => c.price_change_percentage_24h > 0).slice(0, 20).map(c => ({ name: c.symbol.toUpperCase(), price: c.current_price, change24h: c.price_change_percentage_24h, volume: c.total_volume, image: c.image }));
    const topLosers = sortedByChange.filter(c => c.price_change_percentage_24h < 0).slice(-20).reverse().map(c => ({ name: c.symbol.toUpperCase(), price: c.current_price, change24h: c.price_change_percentage_24h, volume: c.total_volume, image: c.image }));
    const gainersCount = validCoins.filter(c => c.price_change_percentage_24h > 0).length;
    const losersCount = validCoins.filter(c => c.price_change_percentage_24h < 0).length;
    return { topGainers, topLosers, breadth: { gainers: gainersCount, losers: losersCount, unchanged: validCoins.length - gainersCount - losersCount, total: validCoins.length, bullishPercent: (gainersCount / Math.max(validCoins.length, 1) * 100).toFixed(1) }, source: 'coingecko' };
  } catch (error) {
    return { topGainers: [], topLosers: [], breadth: { gainers: 0, losers: 0, unchanged: 0, total: 0, bullishPercent: '0' }, error: error.message };
  }
};

// ============== ALTSEASON DATA ==============
const fetchAltseasonData = async () => {
  try {
    const [globalRes, ethBtcRes] = await Promise.all([fetch('https://api.coingecko.com/api/v3/global'), fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=btc')]);
    if (!globalRes.ok) throw new Error('CoinGecko global error');
    const global = await globalRes.json();
    const ethBtc = ethBtcRes.ok ? await ethBtcRes.json() : null;
    const btcDom = global.data?.market_cap_percentage?.btc || 50;
    const ethBtcRatio = ethBtc?.ethereum?.btc || 0;
    const total2Cap = (global.data?.total_market_cap?.usd || 0) - (global.data?.total_market_cap?.btc || 0);
    let altseasonIndex = 50;
    if (btcDom < 40) altseasonIndex = 90; else if (btcDom < 45) altseasonIndex = 75; else if (btcDom < 50) altseasonIndex = 60; else if (btcDom < 55) altseasonIndex = 40; else if (btcDom < 60) altseasonIndex = 25; else altseasonIndex = 10;
    if (ethBtcRatio > 0.055) altseasonIndex = Math.min(100, altseasonIndex + 15); else if (ethBtcRatio > 0.045) altseasonIndex = Math.min(100, altseasonIndex + 5); else if (ethBtcRatio < 0.03) altseasonIndex = Math.max(0, altseasonIndex - 15);
    return { altseasonIndex: Math.round(altseasonIndex), btcDominance: btcDom, ethBtcRatio, total2Cap: total2Cap / 1e12, isAltseason: altseasonIndex > 60 };
  } catch (error) { return null; }
};

// ============== ETH/BTC HISTORY ==============
const fetchEthBtcHistory = async (days = 30) => {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=btc&days=${days}`);
    if (!response.ok) throw new Error('CoinGecko error');
    const data = await response.json();
    const prices = data.prices || [];
    if (prices.length === 0) return null;
    const chartData = prices.filter((_, i) => i % Math.max(1, Math.floor(prices.length / 50)) === 0).map(([timestamp, value]) => ({ date: timestamp, value, dateStr: new Date(timestamp).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) }));
    const values = chartData.map(d => d.value);
    const current = values[values.length - 1];
    const start = values[0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const change = start > 0 ? ((current - start) / start * 100) : 0;
    return { chartData, current: current.toFixed(5), start: start.toFixed(5), min: min.toFixed(5), max: max.toFixed(5), change: change.toFixed(2), days };
  } catch (error) { return null; }
};

// ============== COMPARISON COINS ==============
const COMPARISON_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', color: '#627EEA' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', color: '#00FFA3' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', color: '#F3BA2F' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', color: '#23292F' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', color: '#0033AD' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', color: '#C2A633' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', color: '#E84142' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', color: '#2A5ADA' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', color: '#E6007A' },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', color: '#8247E5' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', color: '#FF007A' }
];

const fetchComparisonData = async (coinIds) => {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=1h,24h,7d,30d`);
    if (!response.ok) throw new Error('CoinGecko error');
    const data = await response.json();
    return data.map(coin => {
      const coinConfig = COMPARISON_COINS.find(c => c.id === coin.id);
      return { id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name, color: coinConfig?.color || '#888', price: coin.current_price, change1h: coin.price_change_percentage_1h_in_currency, change24h: coin.price_change_percentage_24h_in_currency, change7d: coin.price_change_percentage_7d_in_currency, change30d: coin.price_change_percentage_30d_in_currency, volume: coin.total_volume, marketCap: coin.market_cap, sparkline: coin.sparkline_in_7d?.price || [], ath: coin.ath, athChange: coin.ath_change_percentage };
    });
  } catch (error) { return null; }
};

// ============== HELP CONTENT ==============
const helpContent = {
  dayTradingScore: { title: 'Day Trading Score', emoji: '🎯', description: 'Wskaźnik do krótkoterminowego tradingu (godziny-dni). Wykorzystuje agresywne progi i skupia się na momentum rynkowym.', interpretation: [{ condition: '80-100', signal: 'bullish', text: '🟢 AKUMULUJ - Silne warunki do kupna' }, { condition: '65-79', signal: 'bullish', text: '🟢 HOLD+ - Dobre warunki, trzymaj pozycje' }, { condition: '50-64', signal: 'neutral', text: '🟡 HOLD - Neutralne, obserwuj rynek' }, { condition: '35-49', signal: 'bearish', text: '🟠 OSTROŻNIE - Słabe warunki' }, { condition: '0-34', signal: 'bearish', text: '🔴 REDUKUJ - Rozważ zamknięcie pozycji' }], tip: 'Łącz z analizą Funding Rate i Fear & Greed dla lepszych wyników.', source: 'Algorytm wewnętrzny' },
  swingScore: { title: 'Swing Trading Score', emoji: '📊', description: 'Wskaźnik do średnioterminowego tradingu (tygodnie). Bazuje na trendach TVL, dominacji BTC i napływach stablecoinów.', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ - Trend wzrostowy' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+ - Pozytywne sygnały' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD - Boczny trend' }, { condition: '30-44', signal: 'bearish', text: '🟠 OSTROŻNIE - Słabnący trend' }, { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ - Trend spadkowy' }], tip: 'Obserwuj Altseason Index i ETH/BTC ratio dla potwierdzenia sygnałów.', source: 'Algorytm wewnętrzny' },
  hodlScore: { title: 'HODL Score', emoji: '🏦', description: 'Wskaźnik do długoterminowego inwestowania (miesiące-lata). Wykorzystuje konserwatywne progi oparte na makro i fundamentach.', interpretation: [{ condition: '60-100', signal: 'bullish', text: '🟢 AKUMULUJ - Świetny czas na DCA' }, { condition: '50-59', signal: 'bullish', text: '🟢 HOLD+ - Dobre warunki makro' }, { condition: '40-49', signal: 'neutral', text: '🟡 HOLD - Stabilne, obserwuj' }, { condition: '25-39', signal: 'bearish', text: '🟠 OSTROŻNIE - Niepewność makro' }, { condition: '0-24', signal: 'bearish', text: '🔴 REDUKUJ - Rozważ zabezpieczenie' }], tip: 'Najlepszy moment na kupno gdy Fear & Greed < 25 i M2 rośnie.', source: 'Algorytm wewnętrzny' },
  btcPrice: { title: 'Cena Bitcoin', emoji: '₿', description: 'Aktualna cena Bitcoina w USD wraz ze zmianą 24h.', interpretation: [{ condition: '> +5% 24h', signal: 'bullish', text: '🟢 Silny wzrost - momentum bycze' }, { condition: '-2% do +2%', signal: 'neutral', text: '🟡 Stabilny - konsolidacja' }, { condition: '< -5% 24h', signal: 'bearish', text: '🔴 Silny spadek - momentum niedźwiedzie' }], tip: 'Obserwuj reakcję altcoinów na ruchy BTC.', source: 'CoinGecko API' },
  fearGreed: { title: 'Fear & Greed Index', emoji: '😱', description: 'Wskaźnik sentymentu rynkowego (0-100). Extreme Fear często oznacza okazję kupna, Extreme Greed - ostrożność.', interpretation: [{ condition: '0-25', signal: 'bullish', text: '🟢 Extreme Fear - potencjalna okazja' }, { condition: '25-45', signal: 'neutral', text: '🟡 Fear - ostrożny optymizm' }, { condition: '45-55', signal: 'neutral', text: '🟡 Neutral - brak wyraźnego sygnału' }, { condition: '55-75', signal: 'bearish', text: '🟠 Greed - rozważ realizację zysków' }, { condition: '75-100', signal: 'bearish', text: '🔴 Extreme Greed - wysokie ryzyko korekty' }], tip: 'Kupuj gdy inni się boją, sprzedawaj gdy są chciwi.', source: 'Alternative.me' },
  fundingRate: { title: 'Funding Rate', emoji: '💰', description: 'Opłata między long/short na futures. Dodatni = longi płacą shortom (rynek przegrzany).', interpretation: [{ condition: '< -0.01%', signal: 'bullish', text: '🟢 Bardzo ujemny - shorts dominują, potencjalne squeeze' }, { condition: '-0.01% do 0.01%', signal: 'neutral', text: '🟡 Neutralny - zrównoważony rynek' }, { condition: '> 0.03%', signal: 'bearish', text: '🔴 Wysoki - rynek przegrzany, ryzyko korekty' }], tip: 'Ekstremalnie wysoki funding często poprzedza gwałtowne spadki.', source: 'Binance Futures API' },
  tvl: { title: 'Total Value Locked', emoji: '🔒', description: 'Całkowita wartość zablokowana w protokołach DeFi.', interpretation: [{ condition: '> +5% 7d', signal: 'bullish', text: '🟢 Silny wzrost - kapitał napływa do DeFi' }, { condition: '-2% do +2% 7d', signal: 'neutral', text: '🟡 Stabilny - normalne warunki' }, { condition: '< -5% 7d', signal: 'bearish', text: '🔴 Spadek - kapitał ucieka z DeFi' }], tip: 'Porównuj TVL z ceną ETH - rozbieżność może sygnalizować zmianę trendu.', source: 'DefiLlama API' },
  m2Supply: { title: 'M2 Money Supply', emoji: '🏦', description: 'Podaż pieniądza M2 w USA. Ekspansja monetarna = więcej kapitału do aktywów ryzykownych.', interpretation: [{ condition: 'Expanding > +5%', signal: 'bullish', text: '🟢 Ekspansja - kapitał napływa' }, { condition: 'Flat ±2%', signal: 'neutral', text: '🟡 Stabilny - brak zmian' }, { condition: 'Contracting', signal: 'bearish', text: '🔴 Zacieśnianie - ryzyko spadków' }], tip: 'BTC historycznie koreluje z M2 - ekspansja = wzrosty.', source: 'FRED API' },
  dxy: { title: 'DXY (Dollar Index)', emoji: '💵', description: 'Indeks dolara amerykańskiego. Negatywnie skorelowany z crypto.', interpretation: [{ condition: '< 101', signal: 'bullish', text: '🟢 Bardzo bullish - słaby dolar wspiera ryzykowne aktywa' }, { condition: '101 - 105', signal: 'neutral', text: '🟡 Neutralny - obserwuj kierunek' }, { condition: '> 105', signal: 'bearish', text: '🔴 Bearish - silny dolar ciąży na crypto' }], tip: 'DXY < 103 + spadający trend = historycznie najlepsze warunki dla Bitcoin rallyów.', source: 'Polygon.io API' },
  vix: { title: 'VIX (Volatility Index)', emoji: '😱', description: 'Indeks zmienności S&P 500, nazywany "indeksem strachu".', interpretation: [{ condition: '< 14', signal: 'bullish', text: '🟢 Niski strach - środowisko risk-on' }, { condition: '14 - 20', signal: 'neutral', text: '🟡 Normalny - standardowe warunki' }, { condition: '> 25', signal: 'bearish', text: '🔴 Wysoki strach - risk-off' }], tip: 'Skoki VIX > 30 często oznaczają lokalne dna na rynkach.', source: 'Polygon.io API' },
  portfolio: { title: 'Portfolio Binance', emoji: '💼', description: 'Twoje saldo na Binance (Spot i Futures). Wymaga klucza API z uprawnieniami do odczytu.', interpretation: [{ condition: 'PnL > +10%', signal: 'bullish', text: '🟢 Dobra passa - rozważ zabezpieczenie zysków' }, { condition: 'PnL ±5%', signal: 'neutral', text: '🟡 Stabilne - kontynuuj strategię' }, { condition: 'PnL < -10%', signal: 'bearish', text: '🔴 Straty - przeanalizuj pozycje' }], tip: 'Nigdy nie trzymaj wszystkiego na giełdzie - używaj cold wallet.', source: 'Binance API' }
};

// ============== THEME HOOK ==============
const useTheme = (theme) => {
  const isDark = theme === 'dark';
  return {
    isDark,
    bg: isDark ? 'bg-slate-900' : 'bg-white',
    card: isDark ? 'bg-slate-800' : 'bg-slate-100',
    text: isDark ? 'text-slate-100' : 'text-slate-900',
    muted: isDark ? 'text-slate-400' : 'text-slate-500',
    border: isDark ? 'border-slate-700' : 'border-slate-200',
    input: isDark ? 'bg-slate-700 text-white border-slate-600' : 'bg-white text-slate-900 border-slate-300',
    hover: isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-200'
  };
};

// ============== UI COMPONENTS ==============
const HelpModal = ({ helpKey, onClose, theme }) => {
  const content = helpContent[helpKey];
  if (!content) return null;
  const t = useTheme(theme);
  const signalClass = (s) => s === 'bullish' ? 'text-green-500 border-l-green-500 bg-green-500/10' : s === 'bearish' ? 'text-red-500 border-l-red-500 bg-red-500/10' : 'text-yellow-500 border-l-yellow-500 bg-yellow-500/10';
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div onClick={e => e.stopPropagation()} className={`${t.bg} rounded-2xl max-w-md w-full max-h-[80vh] overflow-auto border ${t.border}`}>
        <div className={`p-4 border-b ${t.border} flex justify-between items-center`}>
          <div className="flex items-center gap-2.5"><span className="text-2xl">{content.emoji}</span><h3 className={`m-0 ${t.text} text-base font-semibold`}>{content.title}</h3></div>
          <button onClick={onClose} className={`bg-transparent border-none ${t.muted} text-2xl cursor-pointer hover:opacity-70`}>×</button>
        </div>
        <div className="p-4">
          <p className={`${t.text} text-sm mb-4 p-2.5 ${t.card} rounded-lg`}>{content.description}</p>
          <div className="flex flex-col gap-2 mb-4">{content.interpretation.map((item, i) => (<div key={i} className={`p-2.5 rounded-lg border-l-4 ${signalClass(item.signal)}`}><span className={`${t.muted} text-xs font-mono`}>{item.condition}</span><span className="text-sm font-semibold ml-2">{item.text}</span></div>))}</div>
          <div className="p-3 bg-blue-500/15 rounded-lg mb-3"><div className="text-blue-500 text-xs font-semibold mb-1">💡 Pro Tip</div><p className={`${t.text} text-xs m-0`}>{content.tip}</p></div>
          <div className={`text-xs ${t.muted} text-right`}>Źródło: {content.source}</div>
        </div>
      </div>
    </div>
  );
};

const Card = ({ children, helpKey, onHelp, className = '', theme, signalColor, isLive }) => {
  const t = useTheme(theme);
  const gradientClass = signalColor === 'positive' ? 'bg-gradient-to-r from-green-500/20 via-transparent to-transparent border-l-4 border-l-green-500' : signalColor === 'negative' ? 'bg-gradient-to-r from-red-500/20 via-transparent to-transparent border-l-4 border-l-red-500' : signalColor === 'warning' ? 'bg-gradient-to-r from-yellow-500/20 via-transparent to-transparent border-l-4 border-l-yellow-500' : '';
  return (
    <div className={`relative p-3.5 ${t.card} rounded-xl border ${t.border} ${gradientClass} ${className}`}>
      {helpKey && <button onClick={() => onHelp(helpKey)} className={`absolute top-2 right-2 w-5 h-5 rounded-full ${t.isDark ? 'bg-slate-700' : 'bg-slate-200'} border-none ${t.muted} text-xs font-semibold cursor-pointer flex items-center justify-center opacity-70 hover:opacity-100 z-10`}>?</button>}
      {isLive && <span className={`absolute bottom-1.5 right-2 text-[8px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 font-semibold flex items-center gap-1`}><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>LIVE</span>}
      {children}
    </div>
  );
};

const SkeletonLoader = ({ width = 'w-16', height = 'h-5', theme }) => {
  const t = useTheme(theme);
  return <div className={`${width} ${height} rounded ${t.isDark ? 'bg-gradient-to-r from-slate-700 via-slate-800 to-slate-700' : 'bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200'} bg-[length:200%_100%] animate-pulse inline-block`} />;
};

// ============== SCORE GAUGE COMPONENT ==============
const ScoreGauge = ({ score, label, type, theme, onHelp }) => {
  const t = useTheme(theme);
  const thresholds = type === 'day' ? { high: 80, midHigh: 65, mid: 50, low: 35 } : type === 'swing' ? { high: 70, midHigh: 55, mid: 45, low: 30 } : { high: 60, midHigh: 50, mid: 40, low: 25 };
  const getColor = () => { if (score >= thresholds.high) return '#22c55e'; if (score >= thresholds.midHigh) return '#84cc16'; if (score >= thresholds.mid) return '#eab308'; if (score >= thresholds.low) return '#f97316'; return '#ef4444'; };
  const getLabel = () => { if (score >= thresholds.high) return 'AKUMULUJ'; if (score >= thresholds.midHigh) return 'HOLD+'; if (score >= thresholds.mid) return 'HOLD'; if (score >= thresholds.low) return 'OSTROŻNIE'; return 'REDUKUJ'; };
  const color = getColor();
  const data = [{ value: score }, { value: 100 - score }];
  return (
    <div onClick={onHelp} className={`p-3 ${t.card} rounded-xl border ${t.border} cursor-pointer hover:opacity-90 transition-opacity`}>
      <div className={`text-[10px] font-semibold ${t.muted} mb-1 text-center`}>{label}</div>
      <div className="h-20 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="85%" startAngle={180} endAngle={0} innerRadius="60%" outerRadius="90%" dataKey="value" stroke="none">
              <Cell fill={color} /><Cell fill={t.isDark ? '#334155' : '#e2e8f0'} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className="text-xl font-bold" style={{ color }}>{score}</div>
          <div className="text-[8px] font-semibold" style={{ color }}>{getLabel()}</div>
        </div>
      </div>
    </div>
  );
};

// ============== MINI SCORE GAUGE (for Dashboard) ==============
const MiniScoreGauge = ({ score, label, emoji, type, theme }) => {
  const t = useTheme(theme);
  const thresholds = type === 'day' ? { high: 80, midHigh: 65, mid: 50, low: 35 } : type === 'swing' ? { high: 70, midHigh: 55, mid: 45, low: 30 } : { high: 60, midHigh: 50, mid: 40, low: 25 };
  const getColor = () => { if (score >= thresholds.high) return 'text-green-500 bg-green-500/20'; if (score >= thresholds.midHigh) return 'text-lime-500 bg-lime-500/20'; if (score >= thresholds.mid) return 'text-yellow-500 bg-yellow-500/20'; if (score >= thresholds.low) return 'text-orange-500 bg-orange-500/20'; return 'text-red-500 bg-red-500/20'; };
  const getSignal = () => { if (score >= thresholds.high) return 'AKUMULUJ'; if (score >= thresholds.midHigh) return 'HOLD+'; if (score >= thresholds.mid) return 'HOLD'; if (score >= thresholds.low) return 'OSTROŻNIE'; return 'REDUKUJ'; };
  const colorClass = getColor();
  return (
    <div className={`p-2.5 ${t.bg} rounded-lg text-center`}>
      <div className={`text-[9px] ${t.muted} mb-0.5`}>{emoji} {label}</div>
      <div className={`text-lg font-bold ${colorClass.split(' ')[0]}`}>{score}</div>
      <div className={`text-[8px] font-semibold px-1.5 py-0.5 rounded ${colorClass}`}>{getSignal()}</div>
    </div>
  );
};

// ============== AI INSIGHT COMPONENT ==============
const AIInsight = ({ cgData, binanceData, altseasonData, defiData, dayScore, swingScore, hodlScore, theme, compact = false }) => {
  const t = useTheme(theme);
  const fg = cgData?.fearGreed?.value || 50;
  const funding = binanceData?.fundingRate?.value || 0;
  const btcChange = cgData?.btcPrice?.change || 0;
  const avgScore = Math.round((dayScore + swingScore + hodlScore) / 3);
  
  let signal = 'neutral', emoji = '🤔', headline = '';
  if (fg < 20) { headline = `Ekstremalny strach (F&G: ${fg})`; signal = 'bullish'; emoji = '🟢'; }
  else if (fg < 30) { headline = `Strach na rynku (F&G: ${fg})`; signal = 'bullish'; emoji = '🟡'; }
  else if (fg > 80) { headline = `Ekstremalna chciwość (F&G: ${fg})`; signal = 'bearish'; emoji = '🔴'; }
  else if (fg > 70) { headline = `Chciwość dominuje (F&G: ${fg})`; signal = 'bearish'; emoji = '🟠'; }
  else { headline = `Neutralny sentyment (F&G: ${fg})`; }

  const bgClass = signal === 'bullish' ? 'bg-green-500/15 border-l-green-500' : signal === 'bearish' ? 'bg-red-500/15 border-l-red-500' : 'bg-yellow-500/15 border-l-yellow-500';
  
  if (compact) {
    return (
      <div className={`p-2.5 ${bgClass} border-l-4 rounded-lg`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <div className="flex-1">
            <div className={`text-xs font-semibold ${t.text}`}>{headline}</div>
            <div className={`text-[10px] ${t.muted}`}>Avg Score: {avgScore}/100</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 ${bgClass} border-l-4 rounded-lg`}>
      <div className="flex items-start gap-2.5">
        <span className="text-2xl">{emoji}</span>
        <div className="flex-1">
          <div className={`text-sm font-semibold ${t.text} mb-1`}>{headline}</div>
          <div className={`text-[11px] ${t.muted} space-y-0.5`}>
            {funding < -0.01 && <div>• Ujemny funding = short squeeze potential</div>}
            {funding > 0.05 && <div>• Wysoki funding = overleveraged longs</div>}
            {btcChange > 5 && <div>• BTC +{btcChange.toFixed(1)}% - silne momentum</div>}
            {btcChange < -5 && <div>• BTC {btcChange.toFixed(1)}% - korekta w toku</div>}
            <div>• Score średnia: {avgScore}/100</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============== MAIN SCREEN NAVIGATION ==============
const MAIN_SCREENS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'analysis', label: 'Analysis', icon: '📈' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼' }
];

// ============== ANALYSIS SUB-TABS ==============
const ANALYSIS_TABS = [
  { id: 'crypto', label: '₿ Crypto' },
  { id: 'structure', label: '📊 Structure' },
  { id: 'pulse', label: '⚡ Pulse' },
  { id: 'compare', label: '⚖️ Compare' },
  { id: 'macro', label: '🏦 Macro' },
  { id: 'defi', label: '🦙 DeFi' },
  { id: 'derivatives', label: '📊 Deriv' },
  { id: 'charts', label: '📈 Charts' }
];

// ============== ETH/BTC HISTORY CHART ==============
const EthBtcHistoryChart = ({ data, timeframe, onTimeframeChange, loading, onHelp, theme }) => {
  const t = useTheme(theme);
  const timeframes = [{ value: 30, label: '30D' }, { value: 90, label: '90D' }, { value: 365, label: '1Y' }];
  
  return (
    <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
      <div className="flex justify-between items-center mb-3">
        <div className={`text-xs font-semibold ${t.text}`}>📈 ETH/BTC History</div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">{timeframes.map(tf => (<button key={tf.value} onClick={() => onTimeframeChange(tf.value)} className={`px-2 py-1 rounded text-[9px] font-semibold cursor-pointer border-none ${timeframe === tf.value ? 'bg-blue-500 text-white' : `${t.bg} ${t.muted}`}`}>{tf.label}</button>))}</div>
          <button onClick={onHelp} className={`w-5 h-5 rounded-full ${t.isDark ? 'bg-white/10' : 'bg-black/10'} border-none ${t.muted} text-[10px] cursor-pointer`}>?</button>
        </div>
      </div>
      {loading ? <div className={`h-40 ${t.bg} rounded-lg animate-pulse flex items-center justify-center`}><span className={`text-xs ${t.muted}`}>Ładowanie...</span></div> : !data ? <div className={`h-40 ${t.bg} rounded-lg flex items-center justify-center`}><span className={`text-xs ${t.muted}`}>Brak danych</span></div> : (
        <>
          <div className="h-40 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs><linearGradient id="ethBtcGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={data.change >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3}/><stop offset="95%" stopColor={data.change >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="dateStr" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.toFixed(4)} />
                <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '11px' }} formatter={(value) => [value.toFixed(5), 'ETH/BTC']} />
                <Area type="monotone" dataKey="value" stroke={data.change >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#ethBtcGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className={`p-2 ${t.bg} rounded-lg text-center`}><div className={`text-[8px] ${t.muted}`}>Aktualny</div><div className={`text-[11px] font-bold ${t.text}`}>{data.current}</div></div>
            <div className={`p-2 ${t.bg} rounded-lg text-center`}><div className={`text-[8px] ${t.muted}`}>Zmiana</div><div className={`text-[11px] font-bold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>{data.change >= 0 ? '+' : ''}{data.change}%</div></div>
            <div className={`p-2 ${t.bg} rounded-lg text-center`}><div className={`text-[8px] ${t.muted}`}>Min</div><div className="text-[11px] font-bold text-red-500">{data.min}</div></div>
            <div className={`p-2 ${t.bg} rounded-lg text-center`}><div className={`text-[8px] ${t.muted}`}>Max</div><div className="text-[11px] font-bold text-green-500">{data.max}</div></div>
          </div>
        </>
      )}
    </div>
  );
};

// ============== SECTOR ANALYSIS ==============
const SectorAnalysis = ({ topGainers, theme }) => {
  const t = useTheme(theme);
  const sectorKeywords = {
    'AI': ['FET', 'AGIX', 'OCEAN', 'RNDR', 'TAO', 'ARKM', 'WLD', 'NEAR', 'GRT', 'THETA'],
    'MEME': ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'NEIRO', 'PNUT', 'BRETT', 'TURBO'],
    'DeFi': ['UNI', 'AAVE', 'COMP', 'MKR', 'CRV', 'DYDX', 'GMX', 'PENDLE', 'SNX', 'SUSHI'],
    'L1/L2': ['SOL', 'AVAX', 'MATIC', 'ARB', 'OP', 'APT', 'SUI', 'SEI', 'INJ', 'TIA'],
    'Gaming': ['AXS', 'SAND', 'MANA', 'GALA', 'IMX', 'PIXEL', 'PORTAL', 'PRIME', 'BIGTIME', 'BEAM'],
    'Infra': ['LINK', 'DOT', 'ATOM', 'QNT', 'FIL', 'AR', 'EGLD', 'HBAR', 'VET', 'XLM']
  };
  const sectorScores = {}, sectorCoins = {};
  Object.keys(sectorKeywords).forEach(s => { sectorScores[s] = 0; sectorCoins[s] = []; });
  if (topGainers?.length) {
    topGainers.forEach(coin => {
      let symbol = (coin.name || '').toUpperCase().replace('USDT', '');
      Object.entries(sectorKeywords).forEach(([sector, kw]) => {
        if (kw.some(k => symbol === k || symbol.startsWith(k))) { sectorScores[sector] += parseFloat(coin.change24h) || 0; sectorCoins[sector].push({ name: symbol, change: parseFloat(coin.change24h) }); }
      });
    });
  }
  const sorted = Object.entries(sectorScores).filter(([_, s]) => s !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  return (
    <div className={`p-3 ${t.card} rounded-xl border ${t.border} mb-2.5`}>
      <div className={`text-xs font-semibold mb-2.5 ${t.text}`}>🏷️ Top Sektory</div>
      {sorted.length === 0 ? <div className={`p-4 ${t.bg} rounded-lg text-center text-[11px] ${t.muted}`}>Brak danych</div> : (
        <div className="grid grid-cols-2 gap-2">{sorted.map(([sector, score], i) => (
          <div key={sector} className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${score > 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
            <div className="flex justify-between items-center mb-1"><span className={`text-[11px] font-semibold ${t.text}`}>{i + 1}. {sector}</span><span className={`text-[10px] font-bold ${score > 0 ? 'text-green-500' : 'text-red-500'}`}>{score > 0 ? '+' : ''}{score.toFixed(1)}%</span></div>
            <div className={`text-[8px] ${t.muted}`}>{sectorCoins[sector]?.slice(0, 4).map(c => c.name).join(', ')}</div>
          </div>
        ))}</div>
      )}
    </div>
  );
};

// ============== TRADINGVIEW CHART ==============
const TradingViewChart = ({ symbol, theme }) => {
  const containerRef = useRef(null);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    if (!containerRef.current) return;
    setError(false);
    containerRef.current.innerHTML = '';
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetContainer.appendChild(widgetDiv);
    containerRef.current.appendChild(widgetContainer);
    const timeoutId = setTimeout(() => setError(true), 10000);
    try {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.innerHTML = JSON.stringify({ autosize: true, symbol, interval: 'D', timezone: 'Europe/Warsaw', theme: theme === 'dark' ? 'dark' : 'light', style: '1', locale: 'pl', hide_top_toolbar: false, save_image: false, calendar: false });
      script.onload = () => clearTimeout(timeoutId);
      script.onerror = () => { clearTimeout(timeoutId); setError(true); };
      widgetContainer.appendChild(script);
    } catch { clearTimeout(timeoutId); setError(true); }
    return () => clearTimeout(timeoutId);
  }, [symbol, theme]);
  
  if (error) return <div className="h-[400px] w-full rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#f1f5f9' }}><span className="text-4xl mb-3">📈</span><span className="text-sm" style={{ color: '#94a3b8' }}>Nie udało się załadować</span></div>;
  return <div ref={containerRef} className="h-[400px] w-full rounded-xl overflow-hidden" />;
};

const TradingViewTechnicalAnalysis = ({ symbol, interval, theme }) => {
  const containerRef = useRef(null);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    if (!containerRef.current) return;
    setError(false);
    containerRef.current.innerHTML = '';
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetContainer.appendChild(widgetDiv);
    containerRef.current.appendChild(widgetContainer);
    const timeoutId = setTimeout(() => setError(true), 10000);
    try {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
      script.async = true;
      script.innerHTML = JSON.stringify({ interval, width: '100%', isTransparent: true, height: '100%', symbol, showIntervalTabs: true, locale: 'pl', colorTheme: theme === 'dark' ? 'dark' : 'light' });
      script.onload = () => clearTimeout(timeoutId);
      script.onerror = () => { clearTimeout(timeoutId); setError(true); };
      widgetContainer.appendChild(script);
    } catch { clearTimeout(timeoutId); setError(true); }
    return () => clearTimeout(timeoutId);
  }, [symbol, interval, theme]);
  
  if (error) return <div className="h-[380px] w-full flex items-center justify-center rounded-lg" style={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#f1f5f9' }}><span className="text-3xl mb-2">📊</span></div>;
  return <div ref={containerRef} className="h-[380px] w-full" />;
};

// ============== MAIN APP COMPONENT ==============
function App() {
  const [theme, setTheme] = useState('dark');
  const [mainScreen, setMainScreen] = useState('dashboard');
  const [analysisTab, setAnalysisTab] = useState('crypto');
  const [loading, setLoading] = useState(true);
  const [helpModal, setHelpModal] = useState(null);
  
  // API Data States
  const [cgData, setCgData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [defiData, setDefiData] = useState(null);
  const [fredData, setFredData] = useState(null);
  const [polygonData, setPolygonData] = useState(null);
  const [msData, setMsData] = useState(null);
  const [altseasonData, setAltseasonData] = useState(null);
  const [apiStatus, setApiStatus] = useState({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading', polygon: 'loading' });
  
  // Chart States
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  const [chartView, setChartView] = useState('analysis');
  const [taInterval, setTaInterval] = useState('1D');
  const [ethBtcHistory, setEthBtcHistory] = useState(null);
  const [ethBtcTimeframe, setEthBtcTimeframe] = useState(30);
  const [ethBtcLoading, setEthBtcLoading] = useState(false);
  
  // Portfolio States
  const [portfolioApiKey, setPortfolioApiKey] = useState('');
  const [portfolioSecretKey, setPortfolioSecretKey] = useState('');
  const [portfolioConnected, setPortfolioConnected] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState(null);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [spotBalance, setSpotBalance] = useState(null);
  const [futuresBalance, setFuturesBalance] = useState(null);
  const [futuresPositions, setFuturesPositions] = useState(null);
  
  // Trading States
  const [tradeSymbol, setTradeSymbol] = useState('BTCUSDT');
  const [tradeMarket, setTradeMarket] = useState('SPOT');
  const [tradeSide, setTradeSide] = useState('BUY');
  const [tradeType, setTradeType] = useState('MARKET');
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeResult, setTradeResult] = useState(null);
  
  // Comparison States
  const [selectedCoins, setSelectedCoins] = useState(['bitcoin', 'ethereum', 'solana']);
  const [comparisonData, setComparisonData] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  
  // UI States
  const [showAllGainers, setShowAllGainers] = useState(false);
  const [showAllLosers, setShowAllLosers] = useState(false);
  
  const t = useTheme(theme);

  // Load API keys on mount
  useEffect(() => {
    const savedKeys = loadApiKeys();
    if (savedKeys.apiKey && savedKeys.secretKey) {
      setPortfolioApiKey(savedKeys.apiKey);
      setPortfolioSecretKey(savedKeys.secretKey);
    }
  }, []);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const [cg, bin, defi, fred, ms, alt, poly] = await Promise.all([
      fetchCoinGeckoData(), fetchBinanceData(), fetchDefiLlamaData(), fetchFredData(),
      fetchMarketStructure(), fetchAltseasonData(), fetchPolygonData()
    ]);
    setCgData(cg); setBinanceData(bin); setDefiData(defi); setFredData(fred);
    setMsData(ms); setAltseasonData(alt); setPolygonData(poly);
    setApiStatus({
      coingecko: cg ? 'live' : 'error', binance: bin ? 'live' : 'error',
      defillama: defi ? 'live' : 'error', fred: fred ? 'live' : 'error', polygon: poly ? 'live' : 'error'
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAllData(); const interval = setInterval(fetchAllData, 60000); return () => clearInterval(interval); }, [fetchAllData]);

  // Fetch ETH/BTC history
  useEffect(() => {
    const loadEthBtcHistory = async () => {
      setEthBtcLoading(true);
      const data = await fetchEthBtcHistory(ethBtcTimeframe);
      setEthBtcHistory(data);
      setEthBtcLoading(false);
    };
    loadEthBtcHistory();
  }, [ethBtcTimeframe]);

  // Fetch comparison data
  useEffect(() => {
    if (selectedCoins.length === 0) { setComparisonData(null); return; }
    const loadComparison = async () => {
      setComparisonLoading(true);
      const data = await fetchComparisonData(selectedCoins);
      setComparisonData(data);
      setComparisonLoading(false);
    };
    loadComparison();
  }, [selectedCoins]);

  // Score Calculations
  const calculateDayTradingScore = useCallback(() => {
    if (!cgData || !binanceData) return 50;
    let score = 50;
    const fg = cgData.fearGreed?.value || 50;
    const funding = binanceData.fundingRate?.value || 0;
    const btcChange = cgData.btcPrice?.change || 0;
    const lsRatio = binanceData.longShortRatio?.value || 1;
    if (fg < 20) score += 15; else if (fg < 35) score += 10; else if (fg > 80) score -= 15; else if (fg > 65) score -= 5;
    if (funding < -0.01) score += 10; else if (funding < 0) score += 5; else if (funding > 0.05) score -= 12; else if (funding > 0.03) score -= 5;
    if (btcChange > 5) score += 8; else if (btcChange > 2) score += 4; else if (btcChange < -5) score -= 8; else if (btcChange < -2) score -= 4;
    if (lsRatio < 0.9) score += 6; else if (lsRatio > 1.8) score -= 6;
    return Math.max(0, Math.min(100, score));
  }, [cgData, binanceData]);

  const calculateSwingScore = useCallback(() => {
    if (!cgData || !defiData) return 50;
    let score = 50;
    const fg = cgData.fearGreed?.value || 50;
    const tvlChange = parseFloat(defiData.tvl?.change) || 0;
    const btcDom = cgData.btcDominance?.value || 50;
    const stableChange = parseFloat(defiData.stablecoinSupply?.change) || 0;
    const altIndex = altseasonData?.altseasonIndex || 50;
    if (fg < 25) score += 12; else if (fg < 40) score += 6; else if (fg > 75) score -= 10; else if (fg > 60) score -= 4;
    if (tvlChange > 5) score += 10; else if (tvlChange > 2) score += 5; else if (tvlChange < -5) score -= 10; else if (tvlChange < -2) score -= 5;
    if (btcDom > 55) score -= 4; else if (btcDom < 45) score += 4;
    if (stableChange > 3) score += 8; else if (stableChange > 1) score += 4; else if (stableChange < -3) score -= 8; else if (stableChange < -1) score -= 4;
    if (altIndex > 70) score += 6; else if (altIndex > 55) score += 3; else if (altIndex < 30) score -= 4;
    return Math.max(0, Math.min(100, score));
  }, [cgData, defiData, altseasonData]);

  const calculateHodlScore = useCallback(() => {
    if (!defiData || !fredData) return 50;
    let score = 50;
    const m2Change = parseFloat(fredData.m2Supply?.change) || 0;
    const m2Trend = fredData.m2Supply?.trend || 'stable';
    const stableChange = parseFloat(defiData.stablecoinSupply?.change) || 0;
    const tvlChange = parseFloat(defiData.tvl?.change) || 0;
    const fg = cgData?.fearGreed?.value || 50;
    if (m2Trend === 'expanding') { if (m2Change > 5) score += 15; else if (m2Change > 2) score += 10; else score += 5; } else { if (m2Change < -2) score -= 10; else score -= 5; }
    if (stableChange > 5) score += 12; else if (stableChange > 2) score += 6; else if (stableChange < -5) score -= 12; else if (stableChange < -2) score -= 6;
    if (tvlChange > 8) score += 8; else if (tvlChange > 3) score += 4; else if (tvlChange < -8) score -= 8; else if (tvlChange < -3) score -= 4;
    if (fg < 20) score += 8; else if (fg < 35) score += 4; else if (fg > 85) score -= 8; else if (fg > 70) score -= 4;
    return Math.max(0, Math.min(100, score));
  }, [cgData, defiData, fredData]);

  const dayScore = calculateDayTradingScore();
  const swingScore = calculateSwingScore();
  const hodlScore = calculateHodlScore();

  // Portfolio Functions
  const connectPortfolio = async () => {
    if (!portfolioApiKey || !portfolioSecretKey) { setPortfolioError('Wprowadź klucze API'); return; }
    setPortfolioLoading(true);
    setPortfolioError(null);
    const spotResult = await fetchSpotBalance(portfolioApiKey, portfolioSecretKey);
    if (spotResult.error) { setPortfolioError(spotResult.error); setPortfolioLoading(false); return; }
    saveApiKeys(portfolioApiKey, portfolioSecretKey);
    setSpotBalance(spotResult);
    const [futBal, futPos] = await Promise.all([fetchFuturesBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesPositions(portfolioApiKey, portfolioSecretKey)]);
    setFuturesBalance(futBal.error ? null : futBal);
    setFuturesPositions(futPos.error ? null : futPos);
    setPortfolioConnected(true);
    setPortfolioLoading(false);
  };

  const refreshPortfolio = async () => {
    if (!portfolioConnected) return;
    setPortfolioLoading(true);
    const [spot, futBal, futPos] = await Promise.all([fetchSpotBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesPositions(portfolioApiKey, portfolioSecretKey)]);
    setSpotBalance(spot.error ? spotBalance : spot);
    setFuturesBalance(futBal.error ? futuresBalance : futBal);
    setFuturesPositions(futPos.error ? futuresPositions : futPos);
    setPortfolioLoading(false);
  };

  const disconnectPortfolio = () => {
    clearApiKeys();
    setPortfolioConnected(false);
    setSpotBalance(null);
    setFuturesBalance(null);
    setFuturesPositions(null);
    setPortfolioApiKey('');
    setPortfolioSecretKey('');
  };

  const executeTrade = async () => {
    if (!tradeQuantity) { setTradeResult({ success: false, error: 'Wprowadź ilość' }); return; }
    const params = { symbol: tradeSymbol, side: tradeSide, type: tradeType, quantity: tradeQuantity };
    if (tradeType === 'LIMIT' && tradePrice) params.price = tradePrice;
    if (tradeType === 'LIMIT') params.timeInForce = 'GTC';
    const result = await placeOrder(portfolioApiKey, portfolioSecretKey, params, tradeMarket);
    setTradeResult(result);
    if (result.success) { setTradeQuantity(''); setTradePrice(''); refreshPortfolio(); }
  };

  const handleClosePosition = async (symbol, positionAmt) => {
    const result = await closePosition(portfolioApiKey, portfolioSecretKey, symbol, positionAmt);
    if (result.success) refreshPortfolio();
  };

  // Helper Functions
  const formatPrice = (p) => { if (!p) return '--'; if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 }); if (p >= 1) return '$' + p.toFixed(2); return '$' + p.toFixed(4); };
  const formatChange = (c) => { if (c === undefined || c === null) return '--'; return (c >= 0 ? '+' : '') + c.toFixed(2) + '%'; };
  const toggleCoin = (coinId) => { setSelectedCoins(prev => prev.includes(coinId) ? prev.filter(c => c !== coinId) : prev.length < 5 ? [...prev, coinId] : prev); };

  // ============== RENDER DASHBOARD SCREEN ==============
  const renderDashboard = () => (
    <div className="space-y-3 pb-20">
      {/* Header with Theme Toggle */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={`text-xl font-bold ${t.text}`}>Crypto Decision Hub</h1>
          <div className={`text-[10px] ${t.muted}`}>Dashboard • Last update: {new Date().toLocaleTimeString('pl-PL')}</div>
        </div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg ${t.card} border ${t.border}`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>

      {/* Three Scores Summary */}
      <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
        <div className={`text-xs font-semibold mb-2 ${t.text} flex items-center gap-2`}>🎯 Three Scores <span className={`text-[9px] px-1.5 py-0.5 rounded ${t.bg} ${t.muted}`}>Kliknij by zobaczyć więcej</span></div>
        <div className="grid grid-cols-3 gap-2">
          <MiniScoreGauge score={dayScore} label="Day" emoji="🎯" type="day" theme={theme} />
          <MiniScoreGauge score={swingScore} label="Swing" emoji="📊" type="swing" theme={theme} />
          <MiniScoreGauge score={hodlScore} label="HODL" emoji="🏦" type="hodl" theme={theme} />
        </div>
      </div>

      {/* AI Insight */}
      <AIInsight cgData={cgData} binanceData={binanceData} altseasonData={altseasonData} defiData={defiData} dayScore={dayScore} swingScore={swingScore} hodlScore={hodlScore} theme={theme} compact={true} />

      {/* Main Prices Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.btcPrice?.change || 0) > 0 ? 'positive' : (cgData?.btcPrice?.change || 0) < 0 ? 'negative' : undefined}>
          <div className={`text-[10px] ${t.muted} mb-0.5`}>₿ Bitcoin</div>
          {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
            <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.btcPrice?.value)}</div>
            <div className={`text-xs font-semibold ${(cgData?.btcPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.btcPrice?.change)}</div>
          </>}
        </Card>
        <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.fearGreed?.value || 50) < 30 ? 'positive' : (cgData?.fearGreed?.value || 50) > 70 ? 'negative' : 'warning'}>
          <div className={`text-[10px] ${t.muted} mb-0.5`}>😱 Fear & Greed</div>
          {loading ? <SkeletonLoader width="w-16" height="h-6" theme={theme} /> : <>
            <div className={`text-lg font-bold ${t.text}`}>{cgData?.fearGreed?.value || '--'}</div>
            <div className={`text-xs ${t.muted}`}>{cgData?.fearGreed?.text || '--'}</div>
          </>}
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={`p-2.5 ${t.card} rounded-xl border ${t.border} text-center`}>
          <div className={`text-[9px] ${t.muted}`}>⟠ ETH</div>
          {loading ? <SkeletonLoader width="w-16" height="h-5" theme={theme} /> : <>
            <div className={`text-sm font-bold ${t.text}`}>{formatPrice(cgData?.ethPrice?.value)}</div>
            <div className={`text-[10px] font-semibold ${(cgData?.ethPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.ethPrice?.change)}</div>
          </>}
        </div>
        <div className={`p-2.5 ${t.card} rounded-xl border ${t.border} text-center`}>
          <div className={`text-[9px] ${t.muted}`}>◎ SOL</div>
          {loading ? <SkeletonLoader width="w-16" height="h-5" theme={theme} /> : <>
            <div className={`text-sm font-bold ${t.text}`}>{formatPrice(cgData?.solPrice?.value)}</div>
            <div className={`text-[10px] font-semibold ${(cgData?.solPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.solPrice?.change)}</div>
          </>}
        </div>
        <div className={`p-2.5 ${t.card} rounded-xl border ${t.border} text-center`}>
          <div className={`text-[9px] ${t.muted}`}>🔶 BNB</div>
          {loading ? <SkeletonLoader width="w-16" height="h-5" theme={theme} /> : <>
            <div className={`text-sm font-bold ${t.text}`}>{formatPrice(cgData?.bnbPrice?.value)}</div>
            <div className={`text-[10px] font-semibold ${(cgData?.bnbPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.bnbPrice?.change)}</div>
          </>}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><div className={`text-[9px] ${t.muted}`}>BTC Dom</div><div className={`text-sm font-bold ${t.text}`}>{cgData?.btcDominance?.value?.toFixed(1) || '--'}%</div></div>
          <div><div className={`text-[9px] ${t.muted}`}>TVL</div><div className={`text-sm font-bold ${t.text}`}>${defiData?.tvl?.value || '--'}B</div></div>
          <div><div className={`text-[9px] ${t.muted}`}>Funding</div><div className={`text-sm font-bold ${(binanceData?.fundingRate?.value || 0) < 0 ? 'text-green-500' : (binanceData?.fundingRate?.value || 0) > 0.03 ? 'text-red-500' : t.text}`}>{binanceData?.fundingRate?.value ? (binanceData.fundingRate.value).toFixed(4) : '--'}%</div></div>
          <div><div className={`text-[9px] ${t.muted}`}>MCap</div><div className={`text-sm font-bold ${t.text}`}>${cgData?.totalMarketCap?.value || '--'}T</div></div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMainScreen('analysis')} className={`p-3 ${t.card} rounded-xl border ${t.border} text-left hover:opacity-80 transition-opacity`}>
          <div className="text-lg mb-1">📈</div>
          <div className={`text-xs font-semibold ${t.text}`}>Analiza</div>
          <div className={`text-[10px] ${t.muted}`}>Szczegółowe dane</div>
        </button>
        <button onClick={() => setMainScreen('portfolio')} className={`p-3 ${t.card} rounded-xl border ${t.border} text-left hover:opacity-80 transition-opacity`}>
          <div className="text-lg mb-1">💼</div>
          <div className={`text-xs font-semibold ${t.text}`}>Portfolio</div>
          <div className={`text-[10px] ${t.muted}`}>Binance trading</div>
        </button>
      </div>
    </div>
  );

  // ============== RENDER ANALYSIS SCREEN ==============
  const renderAnalysis = () => (
    <div className="space-y-3 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button onClick={() => setMainScreen('dashboard')} className={`p-1.5 rounded-lg ${t.card} border ${t.border}`}>←</button>
          <div><h1 className={`text-lg font-bold ${t.text}`}>Analysis</h1><div className={`text-[10px] ${t.muted}`}>Szczegółowa analiza rynku</div></div>
        </div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg ${t.card} border ${t.border}`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>

      {/* Sub-tabs */}
      <div className="flex overflow-x-auto gap-1 pb-1" style={{ scrollbarWidth: 'none' }}>
        {ANALYSIS_TABS.map(tab => (
          <button key={tab.id} onClick={() => setAnalysisTab(tab.id)} className={`px-3 py-2 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer border-none transition-colors ${analysisTab === tab.id ? 'bg-blue-500 text-white' : `${t.card} ${t.muted}`}`}>{tab.label}</button>
        ))}
      </div>

      {/* Crypto Tab */}
      {analysisTab === 'crypto' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <ScoreGauge score={dayScore} label="Day Trading" type="day" theme={theme} onHelp={() => setHelpModal('dayTradingScore')} />
            <ScoreGauge score={swingScore} label="Swing" type="swing" theme={theme} onHelp={() => setHelpModal('swingScore')} />
            <ScoreGauge score={hodlScore} label="HODL" type="hodl" theme={theme} onHelp={() => setHelpModal('hodlScore')} />
          </div>
          <AIInsight cgData={cgData} binanceData={binanceData} altseasonData={altseasonData} defiData={defiData} dayScore={dayScore} swingScore={swingScore} hodlScore={hodlScore} theme={theme} />
          <div className="grid grid-cols-2 gap-3">
            <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.btcPrice?.change || 0) > 0 ? 'positive' : (cgData?.btcPrice?.change || 0) < 0 ? 'negative' : undefined}>
              <div className={`text-[10px] ${t.muted} mb-1`}>₿ Bitcoin</div>
              <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.btcPrice?.value)}</div>
              <div className={`text-xs font-semibold ${(cgData?.btcPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.btcPrice?.change)}</div>
            </Card>
            <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.fearGreed?.value || 50) < 30 ? 'positive' : (cgData?.fearGreed?.value || 50) > 70 ? 'negative' : 'warning'}>
              <div className={`text-[10px] ${t.muted} mb-1`}>😱 Fear & Greed</div>
              <div className={`text-lg font-bold ${t.text}`}>{cgData?.fearGreed?.value || '--'}</div>
              <div className={`text-xs ${t.muted}`}>{cgData?.fearGreed?.text || '--'}</div>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card theme={theme} isLive signalColor={(cgData?.ethPrice?.change || 0) > 0 ? 'positive' : (cgData?.ethPrice?.change || 0) < 0 ? 'negative' : undefined}>
              <div className={`text-[10px] ${t.muted} mb-1`}>⟠ Ethereum</div>
              <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.ethPrice?.value)}</div>
              <div className={`text-xs font-semibold ${(cgData?.ethPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.ethPrice?.change)}</div>
            </Card>
            <Card theme={theme} isLive signalColor={(cgData?.solPrice?.change || 0) > 0 ? 'positive' : (cgData?.solPrice?.change || 0) < 0 ? 'negative' : undefined}>
              <div className={`text-[10px] ${t.muted} mb-1`}>◎ Solana</div>
              <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.solPrice?.value)}</div>
              <div className={`text-xs font-semibold ${(cgData?.solPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.solPrice?.change)}</div>
            </Card>
          </div>
        </div>
      )}

      {/* Structure Tab */}
      {analysisTab === 'structure' && (
        <div className="space-y-3">
          <Card theme={theme} isLive>
            <div className={`text-xs font-semibold mb-3 ${t.text}`}>🌊 Altseason Indicators</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${(altseasonData?.altseasonIndex || 0) > 60 ? 'border-l-green-500' : (altseasonData?.altseasonIndex || 0) < 40 ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
                <div className={`text-[9px] ${t.muted}`}>Altseason Index</div>
                <div className={`text-xl font-bold ${(altseasonData?.altseasonIndex || 0) > 60 ? 'text-green-500' : (altseasonData?.altseasonIndex || 0) < 40 ? 'text-red-500' : 'text-yellow-500'}`}>{altseasonData?.altseasonIndex || '--'}</div>
              </div>
              <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${(altseasonData?.ethBtcRatio || 0) > 0.05 ? 'border-l-green-500' : (altseasonData?.ethBtcRatio || 0) < 0.035 ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
                <div className={`text-[9px] ${t.muted}`}>ETH/BTC</div>
                <div className={`text-xl font-bold ${(altseasonData?.ethBtcRatio || 0) > 0.05 ? 'text-green-500' : (altseasonData?.ethBtcRatio || 0) < 0.035 ? 'text-red-500' : 'text-yellow-500'}`}>{altseasonData?.ethBtcRatio?.toFixed(5) || '--'}</div>
              </div>
              <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 border-l-blue-500`}>
                <div className={`text-[9px] ${t.muted}`}>Total2</div>
                <div className="text-xl font-bold text-blue-400">${altseasonData?.total2Cap?.toFixed(2) || '--'}T</div>
              </div>
              <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${(altseasonData?.btcDominance || 50) > 55 ? 'border-l-red-500' : (altseasonData?.btcDominance || 50) < 45 ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
                <div className={`text-[9px] ${t.muted}`}>BTC Dom</div>
                <div className={`text-xl font-bold ${(altseasonData?.btcDominance || 50) > 55 ? 'text-red-500' : (altseasonData?.btcDominance || 50) < 45 ? 'text-green-500' : 'text-yellow-500'}`}>{altseasonData?.btcDominance?.toFixed(2) || '--'}%</div>
              </div>
            </div>
          </Card>
          <EthBtcHistoryChart data={ethBtcHistory} timeframe={ethBtcTimeframe} onTimeframeChange={setEthBtcTimeframe} loading={ethBtcLoading} onHelp={() => setHelpModal('ethBtcHistory')} theme={theme} />
          <Card theme={theme} isLive>
            <div className={`text-xs font-semibold mb-3 ${t.text}`}>💵 Stablecoin Flows</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                <div className="flex justify-between"><span className={`text-[9px] ${t.muted}`}>USDT</span><span className={`text-[9px] font-semibold ${parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) >= 0 ? '+' : ''}{defiData?.stablecoinSupply?.usdtChange || '--'}%</span></div>
                <div className={`text-base font-bold ${t.text}`}>${defiData?.stablecoinSupply?.usdt || '--'}B</div>
              </div>
              <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${parseFloat(defiData?.stablecoinSupply?.usdcChange || 0) >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                <div className="flex justify-between"><span className={`text-[9px] ${t.muted}`}>USDC</span><span className={`text-[9px] font-semibold ${parseFloat(defiData?.stablecoinSupply?.usdcChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{parseFloat(defiData?.stablecoinSupply?.usdcChange || 0) >= 0 ? '+' : ''}{defiData?.stablecoinSupply?.usdcChange || '--'}%</span></div>
                <div className={`text-base font-bold ${t.text}`}>${defiData?.stablecoinSupply?.usdc || '--'}B</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Pulse Tab */}
      {analysisTab === 'pulse' && (
        <div className="space-y-3">
          <SectorAnalysis topGainers={msData?.topGainers} theme={theme} />
          <Card theme={theme} isLive signalColor="positive">
            <div className="flex justify-between items-center mb-3">
              <div className={`text-xs font-semibold ${t.text}`}>🚀 Top Gainers 24h</div>
              <button onClick={() => setShowAllGainers(!showAllGainers)} className={`text-[9px] ${t.muted} bg-transparent border-none cursor-pointer`}>{showAllGainers ? 'Mniej' : 'Więcej'}</button>
            </div>
            <div className="space-y-2">
              {msData?.topGainers?.length > 0 ? (showAllGainers ? msData.topGainers : msData.topGainers.slice(0, 5)).map((coin, i) => (
                <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                  <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{coin.name?.replace('USDT', '')}</span></div>
                  <span className="text-xs font-bold text-green-500">+{coin.change24h?.toFixed(2)}%</span>
                </div>
              )) : <div className={`p-4 ${t.bg} rounded-lg text-center text-[11px] ${t.muted}`}>Brak danych</div>}
            </div>
          </Card>
          <Card theme={theme} isLive signalColor="negative">
            <div className="flex justify-between items-center mb-3">
              <div className={`text-xs font-semibold ${t.text}`}>📉 Top Losers 24h</div>
              <button onClick={() => setShowAllLosers(!showAllLosers)} className={`text-[9px] ${t.muted} bg-transparent border-none cursor-pointer`}>{showAllLosers ? 'Mniej' : 'Więcej'}</button>
            </div>
            <div className="space-y-2">
              {msData?.topLosers?.length > 0 ? (showAllLosers ? msData.topLosers : msData.topLosers.slice(0, 5)).map((coin, i) => (
                <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                  <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{coin.name?.replace('USDT', '')}</span></div>
                  <span className="text-xs font-bold text-red-500">{coin.change24h?.toFixed(2)}%</span>
                </div>
              )) : <div className={`p-4 ${t.bg} rounded-lg text-center text-[11px] ${t.muted}`}>Brak danych</div>}
            </div>
          </Card>
        </div>
      )}

      {/* Compare Tab */}
      {analysisTab === 'compare' && (
        <div className="space-y-3">
          <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
            <div className={`text-xs font-semibold mb-3 ${t.text}`}>🎯 Wybierz coiny (max 5)</div>
            <div className="flex flex-wrap gap-1.5">
              {COMPARISON_COINS.map(coin => (
                <button key={coin.id} onClick={() => toggleCoin(coin.id)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer border-2 transition-all ${selectedCoins.includes(coin.id) ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `border-transparent ${t.bg} ${t.muted}`}`} style={selectedCoins.includes(coin.id) ? { borderColor: coin.color, backgroundColor: `${coin.color}20`, color: coin.color } : {}}>{coin.symbol}</button>
              ))}
            </div>
          </div>
          {comparisonLoading ? <div className={`p-8 ${t.card} rounded-xl text-center`}><div className="animate-spin text-2xl mb-2">⏳</div><div className={`text-xs ${t.muted}`}>Ładowanie...</div></div> : comparisonData && (
            <div className={`${t.card} rounded-xl border ${t.border} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead><tr className={`${t.bg} border-b ${t.border}`}><th className={`p-2.5 text-left ${t.muted}`}>Coin</th><th className={`p-2.5 text-right ${t.muted}`}>Cena</th><th className={`p-2.5 text-right ${t.muted}`}>24h</th><th className={`p-2.5 text-right ${t.muted}`}>7d</th></tr></thead>
                  <tbody>{comparisonData.map((coin, i) => (
                    <tr key={coin.id} className={`border-b ${t.border}`}>
                      <td className="p-2.5"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: coin.color }}></div><span className={`font-bold ${t.text}`}>{coin.symbol}</span></div></td>
                      <td className={`p-2.5 text-right font-mono ${t.text}`}>${coin.price?.toLocaleString('en-US', { maximumFractionDigits: coin.price >= 1 ? 2 : 6 })}</td>
                      <td className={`p-2.5 text-right font-semibold ${(coin.change24h || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(coin.change24h)}</td>
                      <td className={`p-2.5 text-right font-semibold ${(coin.change7d || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(coin.change7d)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Macro Tab */}
      {analysisTab === 'macro' && (
        <div className="space-y-3">
          <Card helpKey="m2Supply" onHelp={setHelpModal} theme={theme} isLive signalColor={fredData?.m2Supply?.trend === 'expanding' ? 'positive' : 'negative'}>
            <div className={`text-xs font-semibold mb-2 ${t.text}`}>🏦 M2 Money Supply</div>
            <div className={`text-2xl font-bold ${t.text}`}>${fredData?.m2Supply?.value || '--'}T</div>
            <div className={`text-xs font-semibold ${fredData?.m2Supply?.trend === 'expanding' ? 'text-green-500' : 'text-red-500'}`}>{fredData?.m2Supply?.trend === 'expanding' ? '📈 Expanding' : '📉 Contracting'} ({fredData?.m2Supply?.change || '--'}% YoY)</div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card helpKey="dxy" onHelp={setHelpModal} theme={theme} isLive signalColor={(polygonData?.dxy?.value || 100) < 103 ? 'positive' : (polygonData?.dxy?.value || 100) > 105 ? 'negative' : 'warning'}>
              <div className={`text-[10px] ${t.muted} mb-1`}>💵 DXY</div>
              <div className={`text-lg font-bold ${(polygonData?.dxy?.value || 100) < 103 ? 'text-green-500' : (polygonData?.dxy?.value || 100) > 105 ? 'text-red-500' : 'text-yellow-500'}`}>{(polygonData?.dxy?.value || 0).toFixed(2)}</div>
              <div className={`text-[10px] ${(polygonData?.dxy?.change || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>{formatChange(polygonData?.dxy?.change)}</div>
            </Card>
            <Card helpKey="vix" onHelp={setHelpModal} theme={theme} isLive signalColor={(polygonData?.vix?.value || 15) < 20 ? 'positive' : (polygonData?.vix?.value || 15) > 25 ? 'negative' : 'warning'}>
              <div className={`text-[10px] ${t.muted} mb-1`}>😱 VIX</div>
              <div className={`text-lg font-bold ${(polygonData?.vix?.value || 15) < 20 ? 'text-green-500' : (polygonData?.vix?.value || 15) > 25 ? 'text-red-500' : 'text-yellow-500'}`}>{(polygonData?.vix?.value || 0).toFixed(2)}</div>
              <div className={`text-[10px] ${(polygonData?.vix?.change || 0) <= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(polygonData?.vix?.change)}</div>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card theme={theme} isLive><div className={`text-[10px] ${t.muted} mb-1`}>📈 S&P 500</div><div className={`text-lg font-bold ${t.text}`}>{(polygonData?.sp500?.value || 0).toLocaleString()}</div><div className={`text-[10px] ${(polygonData?.sp500?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(polygonData?.sp500?.change)}</div></Card>
            <Card theme={theme} isLive><div className={`text-[10px] ${t.muted} mb-1`}>🥇 Gold</div><div className={`text-lg font-bold ${t.text}`}>${(polygonData?.gold?.value || 0).toFixed(0)}</div><div className={`text-[10px] ${(polygonData?.gold?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(polygonData?.gold?.change)}</div></Card>
          </div>
        </div>
      )}

      {/* DeFi Tab */}
      {analysisTab === 'defi' && (
        <div className="space-y-3">
          <Card helpKey="tvl" onHelp={setHelpModal} theme={theme} isLive signalColor={parseFloat(defiData?.tvl?.change || 0) > 0 ? 'positive' : parseFloat(defiData?.tvl?.change || 0) < 0 ? 'negative' : undefined}>
            <div className={`text-xs font-semibold mb-2 ${t.text}`}>🔒 Total Value Locked</div>
            <div className={`text-2xl font-bold ${t.text}`}>${defiData?.tvl?.value || '--'}B</div>
            <div className={`text-xs font-semibold ${parseFloat(defiData?.tvl?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{parseFloat(defiData?.tvl?.change || 0) >= 0 ? '+' : ''}{defiData?.tvl?.change || '--'}% 7d</div>
          </Card>
          <Card theme={theme} isLive>
            <div className={`text-xs font-semibold mb-3 ${t.text}`}>🏆 Top 5 Protocols</div>
            <div className="space-y-2">{defiData?.topProtocols?.map((p, i) => (
              <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{p.name}</span></div>
                <div className="text-right"><div className={`text-xs font-bold ${t.text}`}>${(p.tvl / 1e9).toFixed(1)}B</div><div className={`text-[9px] ${p.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.change >= 0 ? '+' : ''}{p.change?.toFixed(1)}%</div></div>
              </div>
            ))}</div>
          </Card>
        </div>
      )}

      {/* Derivatives Tab */}
      {analysisTab === 'derivatives' && (
        <div className="space-y-3">
          <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme} isLive signalColor={(binanceData?.fundingRate?.value || 0) < 0 ? 'positive' : (binanceData?.fundingRate?.value || 0) > 0.03 ? 'negative' : 'warning'}>
            <div className={`text-xs font-semibold mb-2 ${t.text}`}>💰 Funding Rate (BTC)</div>
            <div className={`text-2xl font-bold ${(binanceData?.fundingRate?.value || 0) < 0 ? 'text-green-500' : (binanceData?.fundingRate?.value || 0) > 0.03 ? 'text-red-500' : 'text-yellow-500'}`}>{binanceData?.fundingRate?.value ? (binanceData.fundingRate.value).toFixed(4) : '--'}%</div>
            <div className={`text-[10px] ${t.muted}`}>{(binanceData?.fundingRate?.value || 0) < 0 ? 'Shorts płacą longom' : 'Longi płacą shortom'}</div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card theme={theme} isLive><div className={`text-[10px] ${t.muted} mb-1`}>📈 Open Interest</div><div className={`text-lg font-bold ${t.text}`}>{binanceData?.openInterest?.value ? (binanceData.openInterest.value / 1000).toFixed(1) + 'K' : '--'}</div><div className={`text-[10px] ${t.muted}`}>BTC</div></Card>
            <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme} isLive signalColor={(binanceData?.longShortRatio?.value || 1) < 0.9 ? 'positive' : (binanceData?.longShortRatio?.value || 1) > 1.5 ? 'negative' : undefined}>
              <div className={`text-[10px] ${t.muted} mb-1`}>⚖️ L/S Ratio</div>
              <div className={`text-lg font-bold ${(binanceData?.longShortRatio?.value || 1) < 0.9 ? 'text-green-500' : (binanceData?.longShortRatio?.value || 1) > 1.5 ? 'text-red-500' : t.text}`}>{binanceData?.longShortRatio?.value?.toFixed(2) || '--'}</div>
              <div className={`text-[10px] ${t.muted}`}>L: {((binanceData?.longShortRatio?.longAccount || 0.5) * 100).toFixed(0)}% / S: {((binanceData?.longShortRatio?.shortAccount || 0.5) * 100).toFixed(0)}%</div>
            </Card>
          </div>
        </div>
      )}

      {/* Charts Tab */}
      {analysisTab === 'charts' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{[{ symbol: 'BINANCE:BTCUSDT', label: 'BTC' }, { symbol: 'BINANCE:ETHUSDT', label: 'ETH' }, { symbol: 'BINANCE:SOLUSDT', label: 'SOL' }].map(s => (
            <button key={s.symbol} onClick={() => setTvSymbol(s.symbol)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer border-none ${tvSymbol === s.symbol ? 'bg-blue-500 text-white' : `${t.card} ${t.muted}`}`}>{s.label}</button>
          ))}</div>
          <div className="flex gap-1.5">{['analysis', 'chart', 'both'].map(v => (
            <button key={v} onClick={() => setChartView(v)} className={`flex-1 py-2 rounded-lg text-[10px] font-semibold cursor-pointer border-none ${chartView === v ? 'bg-blue-500 text-white' : `${t.card} ${t.muted}`}`}>{v === 'analysis' ? '📊 TA' : v === 'chart' ? '📈 Chart' : '📊 Both'}</button>
          ))}</div>
          {(chartView === 'analysis' || chartView === 'both') && <TradingViewTechnicalAnalysis symbol={tvSymbol} interval={taInterval} theme={theme} />}
          {(chartView === 'chart' || chartView === 'both') && <TradingViewChart symbol={tvSymbol} theme={theme} />}
        </div>
      )}
    </div>
  );

  // ============== RENDER PORTFOLIO SCREEN ==============
  const renderPortfolio = () => (
    <div className="space-y-3 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button onClick={() => setMainScreen('dashboard')} className={`p-1.5 rounded-lg ${t.card} border ${t.border}`}>←</button>
          <div><h1 className={`text-lg font-bold ${t.text}`}>Portfolio</h1><div className={`text-[10px] ${t.muted}`}>Binance Integration</div></div>
        </div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg ${t.card} border ${t.border}`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>

      {!portfolioConnected ? (
        <Card helpKey="portfolio" onHelp={setHelpModal} theme={theme}>
          <div className={`text-xs font-semibold mb-3 ${t.text}`}>🔐 Połącz z Binance</div>
          <div className={`text-[10px] ${t.muted} mb-3 p-2 ${t.bg} rounded-lg`}>⚠️ Używaj tylko kluczy z uprawnieniami READ-ONLY dla bezpieczeństwa. Dla tradingu dodaj Trading permission.</div>
          <div className="space-y-2">
            <div className="relative"><input type={showApiKeys ? 'text' : 'password'} placeholder="API Key" value={portfolioApiKey} onChange={e => setPortfolioApiKey(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border ${t.input} text-xs`} /></div>
            <div className="relative"><input type={showApiKeys ? 'text' : 'password'} placeholder="Secret Key" value={portfolioSecretKey} onChange={e => setPortfolioSecretKey(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border ${t.input} text-xs`} /></div>
            <button onClick={() => setShowApiKeys(!showApiKeys)} className={`text-[10px] ${t.muted} bg-transparent border-none cursor-pointer`}>{showApiKeys ? '🙈 Ukryj' : '👁️ Pokaż'} klucze</button>
            {portfolioError && <div className="p-2 rounded-lg bg-red-500/20 text-red-500 text-[11px]">❌ {portfolioError}</div>}
            <button onClick={connectPortfolio} disabled={portfolioLoading} className="w-full py-3 rounded-lg border-none bg-blue-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-50">{portfolioLoading ? '⏳ Łączenie...' : '🔗 Połącz'}</button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex gap-2">
            <button onClick={refreshPortfolio} disabled={portfolioLoading} className={`flex-1 py-2.5 rounded-lg border ${t.border} ${t.bg} ${t.text} text-xs font-semibold cursor-pointer disabled:opacity-50`}>{portfolioLoading ? '⏳' : '🔄'} Odśwież</button>
            <button onClick={disconnectPortfolio} className="py-2.5 px-4 rounded-lg border-none bg-red-500/20 text-red-500 text-xs font-semibold cursor-pointer">🔌 Rozłącz</button>
          </div>
          
          {spotBalance && (
            <Card theme={theme}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>💰 Spot Balance</div>
              <div className="space-y-2">{spotBalance.balances?.slice(0, 10).map((b, i) => (
                <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                  <span className={`text-xs font-semibold ${t.text}`}>{b.asset}</span>
                  <div className="text-right"><div className={`text-xs font-bold ${t.text}`}>{b.total.toFixed(6)}</div>{b.locked > 0 && <div className={`text-[9px] ${t.muted}`}>Locked: {b.locked.toFixed(6)}</div>}</div>
                </div>
              ))}</div>
            </Card>
          )}

          {futuresPositions?.positions?.length > 0 && (
            <Card theme={theme}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>📈 Otwarte Pozycje</div>
              <div className="space-y-2">{futuresPositions.positions.map((p, i) => (
                <div key={i} className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${p.side === 'LONG' ? 'border-l-green-500' : 'border-l-red-500'}`}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className={`text-sm font-bold ${t.text}`}>{p.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.side === 'LONG' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'} font-semibold`}>{p.side} {p.leverage}x</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div><span className={t.muted}>Size:</span> {p.positionAmt}</div>
                    <div><span className={t.muted}>Entry:</span> ${p.entryPrice.toFixed(2)}</div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className={`text-sm font-bold ${p.unRealizedProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.unRealizedProfit >= 0 ? '+' : ''}{p.unRealizedProfit.toFixed(2)} ({p.pnlPercent}%)</div>
                    <button onClick={() => handleClosePosition(p.symbol, p.positionAmt)} className="px-2 py-1 rounded bg-red-500 text-white text-[9px] font-semibold cursor-pointer border-none">Close</button>
                  </div>
                </div>
              ))}</div>
            </Card>
          )}

          <Card theme={theme}>
            <div className={`text-xs font-semibold mb-3 ${t.text}`}>⚡ Quick Trade</div>
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <select value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value)} className={`flex-[2] px-2 py-2 rounded-lg border ${t.input} text-[11px]`}><option value="BTCUSDT">BTC/USDT</option><option value="ETHUSDT">ETH/USDT</option><option value="SOLUSDT">SOL/USDT</option></select>
                <select value={tradeMarket} onChange={e => setTradeMarket(e.target.value)} className={`flex-1 px-2 py-2 rounded-lg border ${t.input} text-[11px]`}><option value="SPOT">Spot</option><option value="FUTURES">Futures</option></select>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setTradeSide('BUY')} className={`flex-1 py-2.5 rounded-lg border-none text-xs font-semibold cursor-pointer ${tradeSide === 'BUY' ? 'bg-green-500 text-white' : `${t.bg} ${t.muted}`}`}>🟢 BUY</button>
                <button onClick={() => setTradeSide('SELL')} className={`flex-1 py-2.5 rounded-lg border-none text-xs font-semibold cursor-pointer ${tradeSide === 'SELL' ? 'bg-red-500 text-white' : `${t.bg} ${t.muted}`}`}>🔴 SELL</button>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setTradeType('MARKET')} className={`flex-1 py-2 rounded-lg border-2 text-[11px] font-semibold cursor-pointer ${tradeType === 'MARKET' ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `border-transparent ${t.bg} ${t.muted}`}`}>Market</button>
                <button onClick={() => setTradeType('LIMIT')} className={`flex-1 py-2 rounded-lg border-2 text-[11px] font-semibold cursor-pointer ${tradeType === 'LIMIT' ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `border-transparent ${t.bg} ${t.muted}`}`}>Limit</button>
              </div>
              <input type="number" placeholder="Ilość" value={tradeQuantity} onChange={e => setTradeQuantity(e.target.value)} className={`w-full px-2.5 py-2.5 rounded-lg border ${t.input} text-xs`} />
              {tradeType === 'LIMIT' && <input type="number" placeholder="Cena" value={tradePrice} onChange={e => setTradePrice(e.target.value)} className={`w-full px-2.5 py-2.5 rounded-lg border ${t.input} text-xs`} />}
              <button onClick={executeTrade} className={`w-full py-3 rounded-lg border-none text-sm font-bold text-white cursor-pointer ${tradeSide === 'BUY' ? 'bg-green-500' : 'bg-red-500'}`}>{tradeSide === 'BUY' ? '🟢' : '🔴'} {tradeSide} {tradeSymbol}</button>
              {tradeResult && <div className={`p-2 rounded-lg text-[11px] ${tradeResult.success ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{tradeResult.success ? `✅ Order ID: ${tradeResult.order.orderId}` : `❌ ${tradeResult.error}`}</div>}
            </div>
          </Card>
        </>
      )}
    </div>
  );

  // ============== MAIN RENDER ==============
  return (
    <div className={`min-h-screen ${t.bg} p-3`}>
      {/* Render Active Screen */}
      {mainScreen === 'dashboard' && renderDashboard()}
      {mainScreen === 'analysis' && renderAnalysis()}
      {mainScreen === 'portfolio' && renderPortfolio()}

      {/* Bottom Navigation - 3 Main Screens */}
      <div className={`fixed bottom-0 left-0 right-0 ${t.card} border-t ${t.border} z-50 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]`}>
        <div className="flex justify-around">
          {MAIN_SCREENS.map(screen => (
            <button
              key={screen.id}
              onClick={() => setMainScreen(screen.id)}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl border-none cursor-pointer transition-all ${mainScreen === screen.id ? 'bg-blue-500/20 text-blue-500' : `bg-transparent ${t.muted}`}`}
            >
              <span className="text-xl">{screen.icon}</span>
              <span className="text-[10px] font-semibold">{screen.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Help Modal */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
    </div>
  );
}

export default App;
