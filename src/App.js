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

// ============== BRAKUJĄCE FUNKCJE API ==============
// WKLEJ TEN KOD DO App.js PRZED LINIĄ "const helpContent = {"
// (czyli przed linią ~130)

// ============== COINGECKO API ==============
const fetchCoinGeckoData = async () => {
  try {
    // Fetch główne dane - dodano binancecoin
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
    const fgClassification = fgData?.data?.[0]?.value_classification || 'Neutral';
    // Map classification to Polish text
    const fgText = fgValue <= 25 ? 'Extreme Fear' : fgValue <= 45 ? 'Fear' : fgValue <= 55 ? 'Neutral' : fgValue <= 75 ? 'Greed' : 'Extreme Greed';
    
    return {
      btcPrice: {
        value: prices.bitcoin?.usd || 0,
        change: prices.bitcoin?.usd_24h_change || 0,
        volume: prices.bitcoin?.usd_24h_vol || 0,
        marketCap: prices.bitcoin?.usd_market_cap || 0
      },
      ethPrice: {
        value: prices.ethereum?.usd || 0,
        change: prices.ethereum?.usd_24h_change || 0,
        volume: prices.ethereum?.usd_24h_vol || 0
      },
      solPrice: {
        value: prices.solana?.usd || 0,
        change: prices.solana?.usd_24h_change || 0,
        volume: prices.solana?.usd_24h_vol || 0
      },
      bnbPrice: {
        value: prices.binancecoin?.usd || 0,
        change: prices.binancecoin?.usd_24h_change || 0,
        volume: prices.binancecoin?.usd_24h_vol || 0
      },
      btcDominance: {
        value: parseFloat((global.data?.market_cap_percentage?.btc || 0).toFixed(2))
      },
      totalMarketCap: {
        value: ((global.data?.total_market_cap?.usd || 0) / 1e12).toFixed(2)
      },
      totalVolume: {
        value: ((global.data?.total_volume?.usd || 0) / 1e9).toFixed(0)
      },
      fearGreed: {
        value: fgValue,
        text: fgText,
        classification: fgClassification
      }
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
      fundingRate: {
        value: parseFloat(funding[0]?.fundingRate || 0) * 100,
        time: funding[0]?.fundingTime
      },
      openInterest: {
        value: parseFloat(oi?.openInterest || 0),
        notional: parseFloat(oi?.openInterest || 0) * 95000 // approx BTC price
      },
      longShortRatio: {
        value: parseFloat(ls?.[0]?.longShortRatio || 1),
        longAccount: parseFloat(ls?.[0]?.longAccount || 0.5),
        shortAccount: parseFloat(ls?.[0]?.shortAccount || 0.5)
      }
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
      fetch('https://api.llama.fi/v2/historicalChainTvl'),
      fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true'),
      fetch('https://api.llama.fi/protocols')
    ]);
    
    if (!tvlRes.ok) throw new Error('DefiLlama API error');
    
    const tvlData = await tvlRes.json();
    const stablesData = stablesRes.ok ? await stablesRes.json() : null;
    const protocols = protocolsRes.ok ? await protocolsRes.json() : [];
    
    // Calculate TVL change
    const currentTvl = tvlData[tvlData.length - 1]?.tvl || 0;
    const tvl7dAgo = tvlData[tvlData.length - 8]?.tvl || currentTvl;
    const tvlChange = tvl7dAgo > 0 ? ((currentTvl - tvl7dAgo) / tvl7dAgo * 100) : 0;
    
    // Stablecoin data
    const usdt = stablesData?.peggedAssets?.find(s => s.symbol === 'USDT');
    const usdc = stablesData?.peggedAssets?.find(s => s.symbol === 'USDC');
    const totalStables = stablesData?.peggedAssets?.reduce((sum, s) => sum + (s.circulating?.peggedUSD || 0), 0) || 0;
    
    // Top protocols
    const topProtocols = protocols
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
      .slice(0, 5)
      .map(p => ({ name: p.name, tvl: p.tvl, change7d: p.change_7d }));
    
    return {
      tvl: {
        value: (currentTvl / 1e9).toFixed(1),
        change: tvlChange.toFixed(1)
      },
      stablecoinSupply: {
        value: (totalStables / 1e9).toFixed(1),
        change: ((usdt?.circulatingPrevDay?.peggedUSD && usdc?.circulatingPrevDay?.peggedUSD) ? 
          (((usdt.circulating?.peggedUSD || 0) + (usdc.circulating?.peggedUSD || 0)) - 
           ((usdt.circulatingPrevDay?.peggedUSD || 0) + (usdc.circulatingPrevDay?.peggedUSD || 0))) / 
          ((usdt.circulatingPrevDay?.peggedUSD || 1) + (usdc.circulatingPrevDay?.peggedUSD || 1)) * 100 : 0).toFixed(2),
        usdt: usdt?.circulating?.peggedUSD ? (usdt.circulating.peggedUSD / 1e9).toFixed(1) : '0',
        usdc: usdc?.circulating?.peggedUSD ? (usdc.circulating.peggedUSD / 1e9).toFixed(1) : '0',
        usdtChange: usdt?.circulatingPrevDay?.peggedUSD ? 
          ((usdt.circulating.peggedUSD - usdt.circulatingPrevDay.peggedUSD) / usdt.circulatingPrevDay.peggedUSD * 100).toFixed(2) : '0',
        usdcChange: usdc?.circulatingPrevDay?.peggedUSD ?
          ((usdc.circulating.peggedUSD - usdc.circulatingPrevDay.peggedUSD) / usdc.circulatingPrevDay.peggedUSD * 100).toFixed(2) : '0'
      },
      topProtocols
    };
  } catch (error) {
    console.error('DefiLlama fetch error:', error);
    return null;
  }
};

// ============== FRED API (M2 Money Supply) ==============
const fetchFredData = async () => {
  try {
    const FRED_API_KEY = '77212658aa97c444f7b78e0d924d0d25';
    
    const response = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=${FRED_API_KEY}&file_type=json&limit=13&sort_order=desc`
    );
    
    if (!response.ok) {
      // Fallback - aktualne dane M2 (styczeń 2026)
      return {
        m2Supply: {
          value: 21.5,
          change: 4.2,
          trend: 'expanding'
        }
      };
    }
    
    const data = await response.json();
    const observations = data.observations || [];
    
    if (observations.length < 2 || !observations[0]?.value || observations[0]?.value === '.') {
      // Fallback jeśli brak danych
      return {
        m2Supply: {
          value: 21.5,
          change: 4.2,
          trend: 'expanding'
        }
      };
    }
    
    const latest = parseFloat(observations[0]?.value) || 0;
    const previous = parseFloat(observations[1]?.value) || latest;
    const yearAgo = parseFloat(observations[11]?.value) || latest;
    
    if (latest === 0) {
      return {
        m2Supply: {
          value: 21.5,
          change: 4.2,
          trend: 'expanding'
        }
      };
    }
    
    const monthlyChange = previous > 0 ? ((latest - previous) / previous * 100) : 0;
    const yearlyChange = yearAgo > 0 ? ((latest - yearAgo) / yearAgo * 100) : 0;
    
    return {
      m2Supply: {
        value: (latest / 1000).toFixed(1), // Convert billions to trillions
        change: yearlyChange.toFixed(1),
        monthlyChange: monthlyChange.toFixed(2),
        trend: monthlyChange >= 0 ? 'expanding' : 'contracting'
      }
    };
  } catch (error) {
    console.error('FRED fetch error:', error);
    // Fallback - aktualne dane M2 (styczeń 2026)
    return {
      m2Supply: {
        value: 21.5,
        change: 4.2,
        trend: 'expanding'
      }
    };
  }
};

// ============== POLYGON.IO DATA (DXY, S&P500, Gold, Silver, VIX) ==============
const POLYGON_API_KEY = '8NH1cpI_SZ0J7RanOyCx9phpJjudm8dZ';

const fetchPolygonData = async () => {
  try {
    console.log('Fetching Polygon.io data...');
    
    // Polygon endpoints - using previous day aggregates
    const endpoints = {
      dxy: `https://api.polygon.io/v2/aggs/ticker/C:USDX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      sp500: `https://api.polygon.io/v2/aggs/ticker/I:SPX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      gold: `https://api.polygon.io/v2/aggs/ticker/C:XAUUSD/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      silver: `https://api.polygon.io/v2/aggs/ticker/C:XAGUSD/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      vix: `https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    };
    
    const results = await Promise.allSettled([
      fetch(endpoints.dxy).then(r => r.json()),
      fetch(endpoints.sp500).then(r => r.json()),
      fetch(endpoints.gold).then(r => r.json()),
      fetch(endpoints.silver).then(r => r.json()),
      fetch(endpoints.vix).then(r => r.json())
    ]);
    
    // Debug: log raw responses
    console.log('Polygon raw results:', results.map((r, i) => ({
      index: i,
      status: r.status,
      hasResults: r.value?.results?.length > 0,
      firstResult: r.value?.results?.[0]
    })));
    
    const parseResult = (result, fallback, name) => {
      if (result.status === 'fulfilled' && result.value?.results?.[0]) {
        const d = result.value.results[0];
        const change = d.o > 0 ? ((d.c - d.o) / d.o * 100) : 0;
        const parsed = { value: d.c, open: d.o, high: d.h, low: d.l, change: change, volume: d.v || 0, timestamp: d.t };
        console.log(`✅ ${name}: Polygon returned $${d.c}`);
        return parsed;
      }
      console.warn(`⚠️ ${name}: Using fallback (Polygon returned no data)`);
      return fallback;
    };
    
    // Aktualne fallbacki (styczeń 2026)
    const data = {
      dxy: parseResult(results[0], { value: 109.5, change: 0.1, open: 109.4 }, 'DXY'),
      sp500: parseResult(results[1], { value: 5950, change: 0.2, open: 5940 }, 'S&P500'),
      gold: parseResult(results[2], { value: 4600, change: 0.3, open: 4585 }, 'GOLD'),
      silver: parseResult(results[3], { value: 88, change: 0.4, open: 87.6 }, 'SILVER'),
      vix: parseResult(results[4], { value: 16, change: -0.5, open: 16.1 }, 'VIX')
    };
    
    // Calculate Gold/Silver ratio
    if (data.gold?.value && data.silver?.value) {
      data.goldSilverRatio = {
        value: data.gold.value / data.silver.value,
        historical: 52 // Historical average for context
      };
      console.log(`📊 G/S Ratio: ${data.goldSilverRatio.value.toFixed(1)}x`);
    }
    
    console.log('Polygon data fetched successfully:', data);
    return data;
  } catch (error) {
    console.error('Polygon fetch error:', error);
    // Fallbacki z aktualnymi cenami (styczeń 2026)
    return {
      dxy: { value: 109.5, change: 0.1 },
      sp500: { value: 5950, change: 0.2 },
      gold: { value: 4600, change: 0.3 },
      silver: { value: 88, change: 0.4 },
      vix: { value: 16, change: -0.5 },
      goldSilverRatio: { value: 52.3, historical: 52 }
    };
  }
};

// ============== MARKET STRUCTURE (Top Gainers/Losers) ==============
const fetchMarketStructure = async () => {
  try {
    console.log('Fetching market structure from Binance...');
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) {
      console.error('Binance ticker response not OK:', response.status, response.statusText);
      throw new Error('Binance ticker error');
    }
    
    const data = await response.json();
    console.log('Binance ticker data received:', data?.length, 'pairs');
    
    // Filtruj tylko pary USDT i wyklucz stablecoiny
    const stablecoins = ['BUSD', 'USDC', 'TUSD', 'FDUSD', 'DAI', 'USDP'];
    const usdtPairs = data.filter(t => {
      if (!t.symbol.endsWith('USDT')) return false;
      const base = t.symbol.replace('USDT', '');
      if (stablecoins.includes(base)) return false;
      if (parseFloat(t.quoteVolume) < 1000000) return false; // min $1M volume
      return true;
    });
    
    console.log('Filtered USDT pairs:', usdtPairs.length);
    
    // Sortuj po zmianie procentowej
    const sorted = usdtPairs.sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
    
    // Top gainers i losers
    const topGainers = sorted.slice(0, 20).map(t => ({
      name: t.symbol,
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.quoteVolume)
    }));
    
    const topLosers = sorted.slice(-20).reverse().map(t => ({
      name: t.symbol,
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.quoteVolume)
    }));
    
    // Market breadth
    const gainers = usdtPairs.filter(t => parseFloat(t.priceChangePercent) > 0).length;
    const losers = usdtPairs.filter(t => parseFloat(t.priceChangePercent) < 0).length;
    const unchanged = usdtPairs.length - gainers - losers;
    
    console.log('Market Structure result - gainers:', gainers, 'losers:', losers, 'topGainers:', topGainers.length);
    
    return {
      topGainers,
      topLosers,
      breadth: {
        gainers,
        losers,
        unchanged,
        total: usdtPairs.length,
        bullishPercent: (gainers / usdtPairs.length * 100).toFixed(1)
      }
    };
  } catch (error) {
    console.error('Market structure fetch error:', error);
    return null;
  }
};

// ============== ALTSEASON DATA ==============
const fetchAltseasonData = async () => {
  try {
    const [globalRes, ethBtcRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=btc')
    ]);
    
    if (!globalRes.ok) throw new Error('CoinGecko global error');
    
    const global = await globalRes.json();
    const ethBtc = ethBtcRes.ok ? await ethBtcRes.json() : null;
    
    const btcDom = global.data?.market_cap_percentage?.btc || 50;
    const ethBtcRatio = ethBtc?.ethereum?.btc || 0;
    const total2Cap = (global.data?.total_market_cap?.usd || 0) - (global.data?.total_market_cap?.btc || 0);
    
    // Calculate Altseason Index (0-100)
    // Based on BTC dominance and ETH/BTC ratio
    let altseasonIndex = 50;
    
    // BTC Dominance factor (lower = more altseason)
    if (btcDom < 40) altseasonIndex = 90;
    else if (btcDom < 45) altseasonIndex = 75;
    else if (btcDom < 50) altseasonIndex = 60;
    else if (btcDom < 55) altseasonIndex = 40;
    else if (btcDom < 60) altseasonIndex = 25;
    else altseasonIndex = 10;
    
    // ETH/BTC ratio bonus
    if (ethBtcRatio > 0.055) altseasonIndex = Math.min(100, altseasonIndex + 15);
    else if (ethBtcRatio > 0.045) altseasonIndex = Math.min(100, altseasonIndex + 5);
    else if (ethBtcRatio < 0.03) altseasonIndex = Math.max(0, altseasonIndex - 15);
    
    return {
      altseasonIndex: Math.round(altseasonIndex),
      btcDominance: btcDom,
      ethBtcRatio: ethBtcRatio,
      total2Cap: total2Cap / 1e12, // in trillions
      isAltseason: altseasonIndex > 60
    };
  } catch (error) {
    console.error('Altseason fetch error:', error);
    return null;
  }
};

// ============== KONIEC BRAKUJĄCYCH FUNKCJI ==============


// ============== HELP CONTENT ==============
const helpContent = {
  dayTradingScore: {
    title: 'Day Trading Score',
    emoji: '🎯',
    description: 'Wskaźnik do krótkoterminowego tradingu (godziny-dni). Wykorzystuje agresywne progi i skupia się na momentum rynkowym.',
    interpretation: [
      { condition: '80-100', signal: 'bullish', text: '🟢 AKUMULUJ - Silne warunki do kupna' },
      { condition: '65-79', signal: 'bullish', text: '🟢 HOLD+ - Dobre warunki, trzymaj pozycje' },
      { condition: '50-64', signal: 'neutral', text: '🟡 HOLD - Neutralne, obserwuj rynek' },
      { condition: '35-49', signal: 'bearish', text: '🟠 OSTROŻNIE - Słabe warunki' },
      { condition: '0-34', signal: 'bearish', text: '🔴 REDUKUJ - Rozważ zamknięcie pozycji' }
    ],
    tip: 'Łącz z analizą Funding Rate i Fear & Greed dla lepszych wyników.',
    source: 'Algorytm wewnętrzny'
  },
  swingScore: {
    title: 'Swing Trading Score',
    emoji: '📊',
    description: 'Wskaźnik do średnioterminowego tradingu (tygodnie). Bazuje na trendach TVL, dominacji BTC i napływach stablecoinów.',
    interpretation: [
      { condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ - Trend wzrostowy' },
      { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+ - Pozytywne sygnały' },
      { condition: '45-54', signal: 'neutral', text: '🟡 HOLD - Boczny trend' },
      { condition: '30-44', signal: 'bearish', text: '🟠 OSTROŻNIE - Słabnący trend' },
      { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ - Trend spadkowy' }
    ],
    tip: 'Obserwuj Altseason Index i ETH/BTC ratio dla potwierdzenia sygnałów.',
    source: 'Algorytm wewnętrzny'
  },
  hodlScore: {
    title: 'HODL Score',
    emoji: '🏦',
    description: 'Wskaźnik do długoterminowego inwestowania (miesiące-lata). Wykorzystuje konserwatywne progi oparte na makro i fundamentach.',
    interpretation: [
      { condition: '60-100', signal: 'bullish', text: '🟢 AKUMULUJ - Świetny czas na DCA' },
      { condition: '50-59', signal: 'bullish', text: '🟢 HOLD+ - Dobre warunki makro' },
      { condition: '40-49', signal: 'neutral', text: '🟡 HOLD - Stabilne, obserwuj' },
      { condition: '25-39', signal: 'bearish', text: '🟠 OSTROŻNIE - Niepewność makro' },
      { condition: '0-24', signal: 'bearish', text: '🔴 REDUKUJ - Rozważ zabezpieczenie' }
    ],
    tip: 'Najlepszy moment na kupno gdy Fear & Greed < 25 i M2 rośnie.',
    source: 'Algorytm wewnętrzny'
  },
  ethBtcHistory: {
    title: 'ETH/BTC Historia',
    emoji: '📈',
    description: 'Wykres historyczny stosunku ceny ETH do BTC. Rosnący trend wskazuje na outperformance Ethereum względem Bitcoina.',
    interpretation: [
      { condition: '> 0.055', signal: 'bullish', text: '🟢 Altcoin Season - ETH dominuje' },
      { condition: '0.045 - 0.055', signal: 'neutral', text: '🟡 Równowaga - Normalne warunki' },
      { condition: '< 0.035', signal: 'bearish', text: '🔴 BTC Season - Bitcoin dominuje' }
    ],
    tip: 'Wysoki ETH/BTC często poprzedza altseason. Obserwuj wybicia powyżej 0.05.',
    source: 'CoinGecko API'
  },
  positionCalculator: {
    title: 'Kalkulator Pozycji',
    emoji: '🧮',
    description: 'Narzędzie do obliczania wielkości pozycji na podstawie kapitału, ryzyka i Stop Loss. Pomaga zarządzać ryzykiem.',
    interpretation: [
      { condition: 'Ryzyko 1%', signal: 'bullish', text: '🟢 Konserwatywne - zalecane dla początkujących' },
      { condition: 'Ryzyko 2%', signal: 'neutral', text: '🟡 Umiarkowane - standardowe' },
      { condition: 'Ryzyko 3%+', signal: 'bearish', text: '🔴 Agresywne - tylko dla doświadczonych' }
    ],
    tip: 'Nigdy nie ryzykuj więcej niż 1-2% kapitału na pojedynczą transakcję.',
    source: 'Formuła Risk Management'
  },
  btcPrice: {
    title: 'Cena Bitcoin',
    emoji: '₿',
    description: 'Aktualna cena Bitcoina w USD wraz ze zmianą 24h. BTC jest głównym wskaźnikiem kondycji całego rynku crypto.',
    interpretation: [
      { condition: '> +5% 24h', signal: 'bullish', text: '🟢 Silny wzrost - momentum bycze' },
      { condition: '-2% do +2%', signal: 'neutral', text: '🟡 Stabilny - konsolidacja' },
      { condition: '< -5% 24h', signal: 'bearish', text: '🔴 Silny spadek - momentum niedźwiedzie' }
    ],
    tip: 'Obserwuj reakcję altcoinów na ruchy BTC - słaba reakcja może oznaczać zmianę trendu.',
    source: 'CoinGecko API'
  },
  fearGreed: {
    title: 'Fear & Greed Index',
    emoji: '😱',
    description: 'Wskaźnik sentymentu rynkowego (0-100). Extreme Fear często oznacza okazję kupna, Extreme Greed - ostrożność.',
    interpretation: [
      { condition: '0-25', signal: 'bullish', text: '🟢 Extreme Fear - potencjalna okazja' },
      { condition: '25-45', signal: 'neutral', text: '🟡 Fear - ostrożny optymizm' },
      { condition: '45-55', signal: 'neutral', text: '🟡 Neutral - brak wyraźnego sygnału' },
      { condition: '55-75', signal: 'bearish', text: '🟠 Greed - rozważ realizację zysków' },
      { condition: '75-100', signal: 'bearish', text: '🔴 Extreme Greed - wysokie ryzyko korekty' }
    ],
    tip: 'Kupuj gdy inni się boją, sprzedawaj gdy są chciwi - Warren Buffett.',
    source: 'Alternative.me'
  },
  fundingRate: {
    title: 'Funding Rate',
    emoji: '💰',
    description: 'Opłata między long/short na futures. Dodatni = longi płacą shortom (rynek przegrzany), ujemny = odwrotnie.',
    interpretation: [
      { condition: '< -0.01%', signal: 'bullish', text: '🟢 Bardzo ujemny - shorts dominują, potencjalne squeeze' },
      { condition: '-0.01% do 0.01%', signal: 'neutral', text: '🟡 Neutralny - zrównoważony rynek' },
      { condition: '> 0.03%', signal: 'bearish', text: '🔴 Wysoki - rynek przegrzany, ryzyko korekty' }
    ],
    tip: 'Ekstremalnie wysoki funding często poprzedza gwałtowne spadki.',
    source: 'Binance Futures API'
  },
  tvl: {
    title: 'Total Value Locked',
    emoji: '🔒',
    description: 'Całkowita wartość zablokowana w protokołach DeFi. Rosnący TVL = większe zaufanie i adopcja.',
    interpretation: [
      { condition: '> +5% 7d', signal: 'bullish', text: '🟢 Silny wzrost - kapitał napływa do DeFi' },
      { condition: '-2% do +2% 7d', signal: 'neutral', text: '🟡 Stabilny - normalne warunki' },
      { condition: '< -5% 7d', signal: 'bearish', text: '🔴 Spadek - kapitał ucieka z DeFi' }
    ],
    tip: 'Porównuj TVL z ceną ETH - rozbieżność może sygnalizować zmianę trendu.',
    source: 'DefiLlama API'
  },
  ethPrice: {
    title: 'Cena Ethereum',
    emoji: '⟠',
    description: 'Aktualna cena Ethereum w USD. ETH jest fundamentem DeFi i smart contractów.',
    interpretation: [
      { condition: '> +5% 24h', signal: 'bullish', text: '🟢 Silny wzrost - altcoiny mogą podążyć' },
      { condition: '-2% do +2%', signal: 'neutral', text: '🟡 Stabilny - konsolidacja' },
      { condition: '< -5% 24h', signal: 'bearish', text: '🔴 Spadek - presja na altcoiny' }
    ],
    tip: 'Obserwuj ETH/BTC ratio - rosnące ETH przy słabym BTC sygnalizuje altseason.',
    source: 'CoinGecko API'
  },
  solPrice: {
    title: 'Cena Solana',
    emoji: '◎',
    description: 'Aktualna cena Solana w USD. SOL jest liderem szybkich i tanich transakcji.',
    interpretation: [
      { condition: '> +7% 24h', signal: 'bullish', text: '🟢 Silny wzrost - momentum bycze' },
      { condition: '-3% do +3%', signal: 'neutral', text: '🟡 Stabilny - normalne wahania' },
      { condition: '< -7% 24h', signal: 'bearish', text: '🔴 Silny spadek - realizacja zysków' }
    ],
    tip: 'SOL często outperformuje w czasie altseason - obserwuj volume.',
    source: 'CoinGecko API'
  },
  bnbPrice: {
    title: 'Cena BNB',
    emoji: '🔶',
    description: 'Aktualna cena BNB (Binance Coin) w USD. Token ekosystemu Binance, używany do zniżek na opłaty i DeFi.',
    interpretation: [
      { condition: '> +5% 24h', signal: 'bullish', text: '🟢 Silny wzrost - wzrost aktywności na Binance' },
      { condition: '-2% do +2%', signal: 'neutral', text: '🟡 Stabilny - normalne wahania' },
      { condition: '< -5% 24h', signal: 'bearish', text: '🔴 Spadek - presja sprzedażowa' }
    ],
    tip: 'BNB często koreluje z volumem na Binance i nowymi launchpadami.',
    source: 'CoinGecko API'
  },
  totalMarketCap: {
    title: 'Total Market Cap',
    emoji: '🌍',
    description: 'Całkowita kapitalizacja rynku kryptowalut. Pokazuje ile kapitału jest zainwestowane w crypto.',
    interpretation: [
      { condition: '> $3.5T', signal: 'bullish', text: '🟢 ATH territory - silna hossa' },
      { condition: '$2.5T - $3.5T', signal: 'neutral', text: '🟡 Zdrowy rynek - normalne warunki' },
      { condition: '< $2.5T', signal: 'bearish', text: '🔴 Bear market - kapitał odpływa' }
    ],
    tip: 'Rosnący market cap przy spadającej dominacji BTC = najlepszy czas na altcoiny.',
    source: 'CoinGecko API'
  },
  btcDominance: {
    title: 'BTC Dominance',
    emoji: '👑',
    description: 'Udział Bitcoina w całkowitej kapitalizacji rynku crypto. Spadająca dominacja = altseason.',
    interpretation: [
      { condition: '> 55%', signal: 'bearish', text: '🔴 BTC Season - kapitał w BTC' },
      { condition: '45-55%', signal: 'neutral', text: '🟡 Równowaga - mieszane sygnały' },
      { condition: '< 45%', signal: 'bullish', text: '🟢 Altseason - kapitał w altcoinach' }
    ],
    tip: 'Spadająca dominacja BTC przy rosnących cenach = silny altseason.',
    source: 'CoinGecko API'
  },
  altseasonIndex: {
    title: 'Altseason Index',
    emoji: '🚀',
    description: 'Wskaźnik siły altcoinów względem BTC (0-100). Wysoki = altcoiny outperformują.',
    interpretation: [
      { condition: '> 70', signal: 'bullish', text: '🟢 Altseason - czas na altcoiny' },
      { condition: '40-70', signal: 'neutral', text: '🟡 Mieszany - selektywne wybory' },
      { condition: '< 40', signal: 'bearish', text: '🔴 BTC Season - zostań przy BTC' }
    ],
    tip: 'Łącz z ETH/BTC ratio dla potwierdzenia trendu altcoinów.',
    source: 'Algorytm wewnętrzny'
  },
  ethBtcRatio: {
    title: 'ETH/BTC Ratio',
    emoji: '⚖️',
    description: 'Stosunek ceny ETH do BTC. Pokazuje siłę Ethereum względem Bitcoina - kluczowy wskaźnik altseason.',
    interpretation: [
      { condition: '> 0.05', signal: 'bullish', text: '🟢 Altseason - ETH dominuje' },
      { condition: '0.035 - 0.05', signal: 'neutral', text: '🟡 Równowaga - normalne warunki' },
      { condition: '< 0.035', signal: 'bearish', text: '🔴 BTC Season - kapitał w BTC' }
    ],
    tip: 'Rosnący ETH/BTC przy wysokim volume często poprzedza altseason.',
    source: 'CoinGecko API'
  },
  total2: {
    title: 'Total2 Market Cap',
    emoji: '📊',
    description: 'Całkowita kapitalizacja altcoinów (bez BTC). Pokazuje siłę całego rynku altcoinów.',
    interpretation: [
      { condition: '> $1.5T', signal: 'bullish', text: '🟢 Silny altcoin market - hossa altów' },
      { condition: '$1T - $1.5T', signal: 'neutral', text: '🟡 Zdrowy rynek altów' },
      { condition: '< $800B', signal: 'bearish', text: '🔴 Słaby altcoin market' }
    ],
    tip: 'Rosnący Total2 przy spadającej dominacji BTC = najlepszy czas na altcoiny.',
    source: 'CoinGecko API'
  },
  stablecoinFlows: {
    title: 'Stablecoin Flows',
    emoji: '💵',
    description: 'Napływy/odpływy stablecoinów (USDT, USDC). Rosnące = kapitał napływa na rynek.',
    interpretation: [
      { condition: '> +2% 7d', signal: 'bullish', text: '🟢 Napływ kapitału - bycze sygnały' },
      { condition: '-1% do +1%', signal: 'neutral', text: '🟡 Stabilny - neutralne' },
      { condition: '< -2% 7d', signal: 'bearish', text: '🔴 Odpływ kapitału - niedźwiedzie' }
    ],
    tip: 'Duży napływ USDT często poprzedza wzrosty BTC.',
    source: 'DefiLlama API'
  },
  topGainers: {
    title: 'Top Gainers 24h',
    emoji: '🚀',
    description: 'Kryptowaluty z największymi wzrostami w ciągu 24 godzin na Binance.',
    interpretation: [
      { condition: 'Dużo > +20%', signal: 'bullish', text: '🟢 Silne momentum - hype na rynku' },
      { condition: 'Średnie +5-15%', signal: 'neutral', text: '🟡 Normalne - zdrowy rynek' },
      { condition: 'Niewiele wzrostów', signal: 'bearish', text: '🔴 Słabe - brak momentum' }
    ],
    tip: 'Unikaj FOMO - kupowanie po +50% wzrostu często kończy się stratą.',
    source: 'Binance API'
  },
  topLosers: {
    title: 'Top Losers 24h',
    emoji: '📉',
    description: 'Kryptowaluty z największymi spadkami w ciągu 24 godzin na Binance.',
    interpretation: [
      { condition: 'Dużo < -20%', signal: 'bearish', text: '🔴 Panika - szukaj okazji kupna' },
      { condition: 'Średnie -5-15%', signal: 'neutral', text: '🟡 Korekta - normalne' },
      { condition: 'Niewiele spadków', signal: 'bullish', text: '🟢 Silny rynek - mało słabości' }
    ],
    tip: 'Duże spadki mogą być okazją, ale sprawdź fundamenty projektu.',
    source: 'Binance API'
  },
  marketBreadth: {
    title: 'Market Breadth',
    emoji: '📊',
    description: 'Stosunek rosnących do spadających kryptowalut. Pokazuje szerokość ruchu rynkowego.',
    interpretation: [
      { condition: '> 60% bullish', signal: 'bullish', text: '🟢 Szeroki wzrost - zdrowy trend' },
      { condition: '40-60%', signal: 'neutral', text: '🟡 Mieszany - brak kierunku' },
      { condition: '< 40% bullish', signal: 'bearish', text: '🔴 Szeroki spadek - słabość rynku' }
    ],
    tip: 'Rosnący BTC przy słabym breadth = rozbieżność, możliwa korekta.',
    source: 'Binance API'
  },
  m2Supply: {
    title: 'M2 Money Supply',
    emoji: '🏦',
    description: 'Podaż pieniądza M2 w USA. Ekspansja monetarna = więcej kapitału do aktywów ryzykownych.',
    interpretation: [
      { condition: 'Expanding > +5%', signal: 'bullish', text: '🟢 Ekspansja - kapitał napływa' },
      { condition: 'Flat ±2%', signal: 'neutral', text: '🟡 Stabilny - brak zmian' },
      { condition: 'Contracting', signal: 'bearish', text: '🔴 Zacieśnianie - ryzyko spadków' }
    ],
    tip: 'BTC historycznie koreluje z M2 - ekspansja = wzrosty.',
    source: 'FRED API'
  },
  dxy: {
    title: 'DXY (Dollar Index)',
    emoji: '💵',
    description: 'Indeks dolara amerykańskiego mierzący jego siłę względem koszyka głównych walut. Negatywnie skorelowany z crypto.',
    interpretation: [
      { condition: '< 101 + spadający', signal: 'bullish', text: '🟢 Bardzo bullish - słaby dolar wspiera ryzykowne aktywa' },
      { condition: '< 103', signal: 'bullish', text: '🟢 Bullish - korzystne warunki dla crypto' },
      { condition: '103 - 105', signal: 'neutral', text: '🟡 Neutralny - obserwuj kierunek' },
      { condition: '> 105', signal: 'bearish', text: '🟠 Bearish - silny dolar ciąży na crypto' },
      { condition: '> 106 + rosnący', signal: 'bearish', text: '🔴 Bardzo bearish - presja na ryzykowne aktywa' }
    ],
    tip: 'DXY < 103 + spadający trend = historycznie najlepsze warunki dla Bitcoin rallyów.',
    source: 'Polygon.io API'
  },
  vix: {
    title: 'VIX (Volatility Index)',
    emoji: '😱',
    description: 'Indeks zmienności S&P 500, nazywany "indeksem strachu". Niski VIX = risk-on, wysoki VIX = risk-off.',
    interpretation: [
      { condition: '< 14', signal: 'bullish', text: '🟢 Niski strach - środowisko risk-on' },
      { condition: '14 - 20', signal: 'neutral', text: '🟡 Normalny - standardowe warunki' },
      { condition: '20 - 25', signal: 'bearish', text: '🟠 Podwyższony - ostrożność wskazana' },
      { condition: '> 25', signal: 'bearish', text: '🔴 Wysoki strach - risk-off, presja na aktywa' },
      { condition: '> 30', signal: 'bearish', text: '🔴 Panika - ekstremalne warunki' }
    ],
    tip: 'Skoki VIX > 30 często oznaczają lokalne dna na rynkach - contrarian indicator.',
    source: 'Polygon.io API'
  },
  stablecoinSupply: {
    title: 'Stablecoin Supply',
    emoji: '💰',
    description: 'Całkowita podaż stablecoinów. Rosnąca = więcej dry powder na rynku.',
    interpretation: [
      { condition: '> +3% 30d', signal: 'bullish', text: '🟢 Wzrost - kapitał napływa' },
      { condition: '±1%', signal: 'neutral', text: '🟡 Stabilny - neutralne' },
      { condition: '< -3% 30d', signal: 'bearish', text: '🔴 Spadek - kapitał ucieka' }
    ],
    tip: 'Rosnąca podaż stablecoinów często poprzedza rajdy cenowe.',
    source: 'DefiLlama API'
  },
  openInterest: {
    title: 'Open Interest',
    emoji: '📈',
    description: 'Wartość otwartych pozycji futures. Wysoki OI = większa spekulacja i zmienność.',
    interpretation: [
      { condition: 'ATH + wysoki funding', signal: 'bearish', text: '🔴 Przegrzanie - ryzyko cascade liquidations' },
      { condition: 'Rosnący przy wzrostach', signal: 'neutral', text: '🟡 Zdrowy - potwierdza trend' },
      { condition: 'Spadający OI', signal: 'bullish', text: '🟢 Deleveraging - zdrowszy rynek' }
    ],
    tip: 'Nagły spadek OI przy spadku ceny = cascade liquidations.',
    source: 'Binance Futures API'
  },
  longShortRatio: {
    title: 'Long/Short Ratio',
    emoji: '⚖️',
    description: 'Stosunek kont long do short. Contrarian indicator - ekstremalne wartości często się odwracają.',
    interpretation: [
      { condition: '< 0.9', signal: 'bullish', text: '🟢 Shorts dominują - potencjalne squeeze' },
      { condition: '0.9 - 1.5', signal: 'neutral', text: '🟡 Zbalansowany rynek' },
      { condition: '> 1.8', signal: 'bearish', text: '🔴 Longs dominują - ryzyko dump' }
    ],
    tip: 'Ekstremalnie wysokie L/S przy high funding = recepta na crash.',
    source: 'Binance Futures API'
  },
  portfolio: {
    title: 'Portfolio Binance',
    emoji: '💼',
    description: 'Twoje saldo na Binance (Spot i Futures). Wymaga klucza API z uprawnieniami do odczytu.',
    interpretation: [
      { condition: 'PnL > +10%', signal: 'bullish', text: '🟢 Dobra passa - rozważ zabezpieczenie zysków' },
      { condition: 'PnL ±5%', signal: 'neutral', text: '🟡 Stabilne - kontynuuj strategię' },
      { condition: 'PnL < -10%', signal: 'bearish', text: '🔴 Straty - przeanalizuj pozycje' }
    ],
    tip: 'Nigdy nie trzymaj wszystkiego na giełdzie - używaj cold wallet.',
    source: 'Binance API (authenticated)'
  }
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

// ============== UI COMPONENTS WITH TAILWIND ==============
const HelpModal = ({ helpKey, onClose, theme }) => {
  const content = helpContent[helpKey];
  if (!content) return null;
  const t = useTheme(theme);
  const signalClass = (s) => s === 'bullish' ? 'text-green-500 border-l-green-500 bg-green-500/10' : s === 'bearish' ? 'text-red-500 border-l-red-500 bg-red-500/10' : 'text-yellow-500 border-l-yellow-500 bg-yellow-500/10';
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div onClick={e => e.stopPropagation()} className={`${t.bg} rounded-2xl max-w-md w-full max-h-[80vh] overflow-auto border ${t.border}`}>
        <div className={`p-4 border-b ${t.border} flex justify-between items-center`}>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{content.emoji}</span>
            <h3 className={`m-0 ${t.text} text-base font-semibold`}>{content.title}</h3>
          </div>
          <button onClick={onClose} className={`bg-transparent border-none ${t.muted} text-2xl cursor-pointer hover:opacity-70`}>×</button>
        </div>
        <div className="p-4">
          <p className={`${t.text} text-sm mb-4 p-2.5 ${t.card} rounded-lg`}>{content.description}</p>
          <div className="flex flex-col gap-2 mb-4">
            {content.interpretation.map((item, i) => (
              <div key={i} className={`p-2.5 rounded-lg border-l-4 ${signalClass(item.signal)}`}>
                <span className={`${t.muted} text-xs font-mono`}>{item.condition}</span>
                <span className="text-sm font-semibold ml-2">{item.text}</span>
              </div>
            ))}
          </div>
          <div className="p-3 bg-blue-500/15 rounded-lg mb-3">
            <div className="text-blue-500 text-xs font-semibold mb-1">💡 Pro Tip</div>
            <p className={`${t.text} text-xs m-0`}>{content.tip}</p>
          </div>
          <div className={`text-xs ${t.muted} text-right`}>Źródło: {content.source}</div>
        </div>
      </div>
    </div>
  );
};

const Card = ({ children, helpKey, onHelp, className = '', theme, signalColor, isLive }) => {
  const t = useTheme(theme);
  // Gradient background based on signal color
  const gradientClass = signalColor === 'positive' 
    ? 'bg-gradient-to-r from-green-500/20 via-transparent to-transparent border-l-4 border-l-green-500' 
    : signalColor === 'negative' 
    ? 'bg-gradient-to-r from-red-500/20 via-transparent to-transparent border-l-4 border-l-red-500' 
    : signalColor === 'warning' 
    ? 'bg-gradient-to-r from-yellow-500/20 via-transparent to-transparent border-l-4 border-l-yellow-500' 
    : '';
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

const DataSourcesBadge = ({ apiStatus, theme }) => {
  const t = useTheme(theme);
  const sources = [{ name: 'CG', status: apiStatus.coingecko }, { name: 'Bin', status: apiStatus.binance }, { name: 'DeFi', status: apiStatus.defillama }, { name: 'FRED', status: apiStatus.fred }, { name: 'Poly', status: apiStatus.polygon }];
  const statusClass = (s) => s === 'live' ? 'bg-green-500/20 text-green-500' : s === 'error' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500';
  return (
    <div className={`flex items-center gap-1 text-[8px] ${t.muted} flex-wrap`}>
      {sources.map((s, i) => <span key={i} className={`px-1.5 py-0.5 rounded ${statusClass(s.status)}`}>{s.name}</span>)}
    </div>
  );
};

const AIInsight = ({ cgData, binanceData, altseasonData, defiData, dayScore, swingScore, hodlScore, theme, onOpenPost }) => {
  const t = useTheme(theme);
  
  // Extract all metrics with correct paths
  const fg = cgData?.fearGreed?.value || 50;
  const funding = binanceData?.fundingRate?.value || 0;
  const btcChange = cgData?.btcPrice?.change || 0;
  const ethChange = cgData?.ethPrice?.change || 0;
  const btcDom = cgData?.btcDominance?.value || 50;
  const altIndex = altseasonData?.altseasonIndex || 50;
  const ethBtc = altseasonData?.ethBtcRatio || 0;
  const tvlChange = defiData?.tvl?.change || 0;
  const usdtChange = parseFloat(defiData?.stablecoinSupply?.usdtChange) || 0;
  const usdcChange = parseFloat(defiData?.stablecoinSupply?.usdcChange) || 0;
  const stableChange = (usdtChange + usdcChange) / 2; // średnia zmiana
  const avgScore = Math.round((dayScore + swingScore + hodlScore) / 3);
  
  // Build multi-part insight
  const insights = [];
  let signal = 'neutral';
  let emoji = '🤔';
  let headline = '';
  
  // 1. PRIMARY SIGNAL (headline based on F&G)
  if (fg < 20) {
    headline = `Ekstremalny strach (F&G: ${fg})`;
    signal = 'bullish'; emoji = '🟢';
    insights.push('Historycznie strefa akumulacji dla długoterminowych.');
  } else if (fg < 30) {
    headline = `Strach na rynku (F&G: ${fg})`;
    signal = 'bullish'; emoji = '🟡';
    insights.push('Sentyment pesymistyczny - potencjalne okazje.');
  } else if (fg > 80) {
    headline = `Ekstremalna chciwość (F&G: ${fg})`;
    signal = 'bearish'; emoji = '🔴';
    insights.push('Strefa dystrybucji. Rozważ zabezpieczenie pozycji.');
  } else if (fg > 70) {
    headline = `Chciwość dominuje (F&G: ${fg})`;
    signal = 'bearish'; emoji = '🟠';
    insights.push('Rynek optymistyczny - zachowaj ostrożność.');
  } else {
    headline = `Neutralny sentyment (F&G: ${fg})`;
    insights.push('Rynek w równowadze między strachem a chciwością.');
  }
  
  // 2. DERIVATIVES CONTEXT
  if (funding < -0.01) {
    insights.push(`Ujemny funding (${(funding * 100).toFixed(3)}%) = short squeeze potential.`);
    if (signal === 'neutral') signal = 'bullish';
  } else if (funding > 0.05) {
    insights.push(`Wysoki funding (${(funding * 100).toFixed(3)}%) = overleveraged longs.`);
    if (signal === 'neutral') signal = 'bearish';
  }
  
  // 3. MOMENTUM
  if (btcChange > 5) {
    insights.push(`BTC +${btcChange.toFixed(1)}% (24h) - silne momentum wzrostowe.`);
  } else if (btcChange < -5) {
    insights.push(`BTC ${btcChange.toFixed(1)}% (24h) - korekta w toku.`);
  }
  
  // 4. ALTSEASON CONTEXT
  if (altIndex > 70 && ethBtc > 0.04) {
    insights.push(`Altseason Index ${altIndex} + ETH/BTC silne = rotacja do altów.`);
  } else if (altIndex < 30) {
    insights.push(`Altseason Index ${altIndex} - BTC dominuje, alty słabsze.`);
  }
  
  // 5. LIQUIDITY FLOW
  if (stableChange > 2) {
    insights.push(`Napływ stablecoinów +${stableChange.toFixed(1)}% - świeża płynność.`);
  } else if (stableChange < -2) {
    insights.push(`Odpływ stablecoinów ${stableChange.toFixed(1)}% - kapitał wychodzi.`);
  }
  
  // 6. TVL HEALTH
  if (tvlChange > 5) {
    insights.push(`TVL DeFi +${tvlChange.toFixed(1)}% (7d) - zdrowy wzrost adopcji.`);
  } else if (tvlChange < -5) {
    insights.push(`TVL DeFi ${tvlChange.toFixed(1)}% (7d) - odpływ z protokołów.`);
  }
  
  // 7. SCORE SUMMARY (always add)
  if (dayScore >= 65 && swingScore >= 55 && hodlScore >= 50) {
    insights.push(`Wszystkie score'y pozytywne (avg: ${avgScore}) - sygnały zbieżne.`);
  } else if (dayScore <= 35 || swingScore <= 30 || hodlScore <= 25) {
    insights.push(`Uwaga: score w strefie ryzyka (D:${dayScore}/S:${swingScore}/H:${hodlScore}).`);
  } else {
    insights.push(`Score'y mieszane (avg: ${avgScore}) - brak jednoznacznego kierunku.`);
  }
  
  // Limit to 3-4 most important insights
  const finalInsights = insights.slice(0, 4);
  
  const bgClass = signal === 'bullish' ? 'bg-green-500/15 border-l-green-500' : signal === 'bearish' ? 'bg-red-500/15 border-l-red-500' : 'bg-yellow-500/15 border-l-yellow-500';
  const headlineColor = signal === 'bullish' ? 'text-green-400' : signal === 'bearish' ? 'text-red-400' : 'text-yellow-400';
  
  return (
    <div className="px-3 mt-3 mb-3">
      <div className={`p-3 ${bgClass} border-l-4 rounded-lg relative`}>
        {/* Post Generator Button */}
        {onOpenPost && (
          <button 
            onClick={onOpenPost}
            className={`absolute top-2 right-2 px-2 py-1 rounded-lg text-[10px] font-semibold ${t.isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'} ${t.text} transition-colors`}
          >
            📝 Post
          </button>
        )}
        <div className="flex items-start gap-2.5">
          <span className="text-xl flex-shrink-0">{emoji}</span>
          <div className="min-w-0 flex-1 pr-14">
            <div className={`text-[10px] ${t.text} opacity-70 mb-1`}>🤖 AI MARKET INSIGHT</div>
            <div className={`text-sm font-semibold ${headlineColor} mb-1.5`}>{headline}</div>
            <ul className={`text-[11px] ${t.text} opacity-90 leading-relaxed space-y-0.5`}>
              {finalInsights.map((ins, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="opacity-50 mt-0.5">•</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const MiniScoreGauge = ({ score, label, icon, subtitle, onHelp, theme }) => {
  const t = useTheme(theme);
  const getSignal = (s) => { if (s >= 70) return { text: 'AKUMULUJ', color: '#22c55e' }; if (s >= 55) return { text: 'HOLD+', color: '#84cc16' }; if (s >= 45) return { text: 'HOLD', color: '#eab308' }; if (s >= 30) return { text: 'OSTROŻNIE', color: '#f97316' }; return { text: 'REDUKUJ', color: '#ef4444' }; };
  const signal = getSignal(score);
  const needleAngle = -90 + (score / 100) * 180;
  const gaugeColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
  return (
    <div className={`flex flex-col items-center w-[32%] min-w-[100px] p-2 ${t.isDark ? 'bg-slate-800/50' : 'bg-slate-100/70'} rounded-xl relative overflow-hidden`}>
      <button onClick={onHelp} className={`absolute top-1 right-1 w-4 h-4 rounded-full ${t.isDark ? 'bg-white/15' : 'bg-black/10'} border-none ${t.muted} text-[8px] cursor-pointer flex items-center justify-center z-10 hover:opacity-80`}>?</button>
      <div className="text-center mb-1">
        <div className={`text-[10px] font-bold ${t.text}`}>{icon} {label}</div>
        {subtitle && <div className={`text-[7px] ${t.muted}`}>{subtitle}</div>}
      </div>
      <svg viewBox="0 0 100 60" className="w-full max-w-[90px] h-[50px]">
        <defs><linearGradient id={`gauge-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">{gaugeColors.map((c, i) => <stop key={i} offset={`${i * 25}%`} stopColor={c} />)}</linearGradient></defs>
        <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke={t.isDark ? '#334155' : '#e2e8f0'} strokeWidth="7" strokeLinecap="round" />
        <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke={`url(#gauge-${label})`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * 126} 126`} />
        <g transform={`rotate(${needleAngle} 50 45)`}><line x1="50" y1="45" x2="50" y2="18" stroke={signal.color} strokeWidth="2.5" strokeLinecap="round" /><circle cx="50" cy="45" r="3" fill={signal.color} /></g>
      </svg>
      <div className="text-center mt-1">
        <div className="text-[9px] font-bold tracking-wide" style={{ color: signal.color }}>{signal.text}</div>
        <div className="text-sm font-bold" style={{ color: signal.color }}>{score}</div>
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
  const t = useTheme(theme);
  const capitalNum = parseFloat(capital) || 0;
  const riskNum = parseFloat(riskPercent) || 0;
  const entryNum = parseFloat(entryPrice) || 0;
  const stopNum = parseFloat(stopLoss) || 0;
  const leverageNum = parseFloat(leverage) || 1;
  const riskAmount = capitalNum * (riskNum / 100);
  const stopDistance = entryNum > 0 && stopNum > 0 ? Math.abs((entryNum - stopNum) / entryNum * 100) : 0;
  const positionSize = stopDistance > 0 ? (riskAmount / (stopDistance / 100)) * leverageNum : 0;
  return (
    <div className={`p-3 ${t.card} rounded-xl border ${t.border} mt-2.5`}>
      <div className="flex justify-between items-center mb-2.5">
        <div className={`text-xs font-semibold ${t.text}`}>🧮 Position Calculator</div>
        <button onClick={onHelp} className={`w-6 h-6 rounded-full ${t.isDark ? 'bg-white/10' : 'bg-black/10'} border-none ${t.muted} text-xs cursor-pointer`}>?</button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <div><label className={`text-[9px] ${t.muted}`}>Kapitał ($)</label><input type="number" value={capital} onChange={e => setCapital(e.target.value)} className={`w-full px-2 py-2 rounded-lg border ${t.input} text-xs mt-1`} /></div>
        <div><label className={`text-[9px] ${t.muted}`}>Ryzyko (%)</label><input type="number" value={riskPercent} onChange={e => setRiskPercent(e.target.value)} className={`w-full px-2 py-2 rounded-lg border ${t.input} text-xs mt-1`} /></div>
        <div><label className={`text-[9px] ${t.muted}`}>Entry ($)</label><input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} className={`w-full px-2 py-2 rounded-lg border ${t.input} text-xs mt-1`} placeholder="95000" /></div>
        <div><label className={`text-[9px] ${t.muted}`}>Stop Loss ($)</label><input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className={`w-full px-2 py-2 rounded-lg border ${t.input} text-xs mt-1`} placeholder="93000" /></div>
      </div>
      <div className="mb-2.5"><label className={`text-[9px] ${t.muted}`}>Dźwignia</label>
        <div className="flex gap-1 mt-1">{['1', '2', '3', '5', '10', '20'].map(l => (<button key={l} onClick={() => setLeverage(l)} className={`flex-1 py-1.5 rounded-md border-2 text-[10px] font-semibold cursor-pointer ${leverage === l ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `border-transparent ${t.card} ${t.muted}`}`}>{l}x</button>))}</div>
      </div>
      <div className={`${t.bg} rounded-lg p-2.5`}>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div><span className={t.muted}>Ryzykujesz:</span> <span className="font-bold text-red-500">${riskAmount.toFixed(2)}</span></div>
          <div><span className={t.muted}>Stop dist:</span> <span className="font-bold">{stopDistance.toFixed(2)}%</span></div>
          <div className={`col-span-2 border-t ${t.border} pt-2 mt-1`}>
            <div className={`text-[9px] ${t.muted} mb-1`}>WIELKOŚĆ POZYCJI:</div>
            <div className="text-base font-bold text-blue-500">${positionSize.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SectorAnalysis = ({ topGainers, theme }) => {
  const t = useTheme(theme);
  const sectorKeywords = {
    'AI': ['FET', 'AGIX', 'OCEAN', 'RNDR', 'TAO', 'ARKM', 'WLD'],
    'MEME': ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'NEIRO', 'PNUT'],
    'DeFi': ['UNI', 'AAVE', 'COMP', 'MKR', 'CRV', 'DYDX', 'GMX', 'PENDLE'],
    'L1/L2': ['SOL', 'AVAX', 'MATIC', 'ARB', 'OP', 'APT', 'SUI', 'SEI', 'INJ'],
    'Gaming': ['AXS', 'SAND', 'MANA', 'GALA', 'IMX', 'PIXEL', 'PORTAL']
  };
  const sectorScores = {}; const sectorCoins = {};
  Object.keys(sectorKeywords).forEach(s => { sectorScores[s] = 0; sectorCoins[s] = []; });
  if (topGainers?.length) {
    topGainers.forEach(coin => {
      let symbol = (coin.name || '').toUpperCase().replace('USDT', '');
      Object.entries(sectorKeywords).forEach(([sector, kw]) => {
        if (kw.some(k => symbol === k || symbol.startsWith(k))) {
          sectorScores[sector] += parseFloat(coin.change24h) || 0;
          sectorCoins[sector].push({ name: symbol, change: parseFloat(coin.change24h) });
        }
      });
    });
  }
  const sorted = Object.entries(sectorScores).filter(([_, s]) => s !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);
  return (
    <div className={`p-3 ${t.card} rounded-xl border ${t.border} mb-2.5`}>
      <div className={`text-xs font-semibold mb-2.5 ${t.text}`}>🏷️ Top Sektory</div>
      {sorted.length === 0 ? <div className={`p-4 ${t.bg} rounded-lg text-center text-[11px] ${t.muted}`}>Brak danych</div> : (
        <div className="grid grid-cols-2 gap-2">
          {sorted.map(([sector, score], i) => (
            <div key={sector} className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${score > 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-[11px] font-semibold ${t.text}`}>{i + 1}. {sector}</span>
                <span className={`text-[10px] font-bold ${score > 0 ? 'text-green-500' : 'text-red-500'}`}>{score > 0 ? '+' : ''}{score.toFixed(1)}%</span>
              </div>
              <div className={`text-[8px] ${t.muted}`}>{sectorCoins[sector]?.slice(0, 3).map(c => c.name).join(', ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EthBtcHistoryChart = ({ data, timeframe, onTimeframeChange, loading, onHelp, theme }) => {
  const t = useTheme(theme);
  const timeframes = [{ value: 30, label: '30D' }, { value: 90, label: '90D' }, { value: 365, label: '1Y' }];
  
  return (
    <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
      <div className="flex justify-between items-center mb-3">
        <div className={`text-xs font-semibold ${t.text}`}>📈 ETH/BTC History</div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {timeframes.map(tf => (
              <button key={tf.value} onClick={() => onTimeframeChange(tf.value)} className={`px-2 py-1 rounded text-[9px] font-semibold cursor-pointer border-none ${timeframe === tf.value ? 'bg-blue-500 text-white' : `${t.bg} ${t.muted}`}`}>{tf.label}</button>
            ))}
          </div>
          <button onClick={onHelp} className={`w-5 h-5 rounded-full ${t.isDark ? 'bg-white/10' : 'bg-black/10'} border-none ${t.muted} text-[10px] cursor-pointer`}>?</button>
        </div>
      </div>
      
      {loading ? (
        <div className={`h-40 ${t.bg} rounded-lg animate-pulse flex items-center justify-center`}>
          <span className={`text-xs ${t.muted}`}>Ładowanie wykresu...</span>
        </div>
      ) : !data ? (
        <div className={`h-40 ${t.bg} rounded-lg flex items-center justify-center`}>
          <span className={`text-xs ${t.muted}`}>Brak danych</span>
        </div>
      ) : (
        <>
          <div className="h-40 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="ethBtcGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={data.change >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={data.change >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="dateStr" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.toFixed(4)} />
                <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '11px' }} formatter={(value) => [value.toFixed(5), 'ETH/BTC']} labelFormatter={(label) => `Data: ${label}`} />
                <Area type="monotone" dataKey="value" stroke={data.change >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#ethBtcGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className={`p-2 ${t.bg} rounded-lg text-center`}>
              <div className={`text-[8px] ${t.muted}`}>Aktualny</div>
              <div className={`text-[11px] font-bold ${t.text}`}>{data.current}</div>
            </div>
            <div className={`p-2 ${t.bg} rounded-lg text-center`}>
              <div className={`text-[8px] ${t.muted}`}>Zmiana {data.days}d</div>
              <div className={`text-[11px] font-bold ${data.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>{data.change >= 0 ? '+' : ''}{data.change}%</div>
            </div>
            <div className={`p-2 ${t.bg} rounded-lg text-center`}>
              <div className={`text-[8px] ${t.muted}`}>Min</div>
              <div className={`text-[11px] font-bold text-red-500`}>{data.min}</div>
            </div>
            <div className={`p-2 ${t.bg} rounded-lg text-center`}>
              <div className={`text-[8px] ${t.muted}`}>Max</div>
              <div className={`text-[11px] font-bold text-green-500`}>{data.max}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const AlertToast = ({ alert, onClose, theme }) => {
  const t = useTheme(theme);
  useEffect(() => { const timer = setTimeout(onClose, 8000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 ${t.card} rounded-xl border ${t.border} shadow-2xl p-4 max-w-xs z-[1001]`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔔</span>
        <div className="flex-1">
          <div className={`text-xs font-bold ${t.text} mb-1`}>{alert.name}</div>
          <div className={`text-[10px] ${t.muted}`}>{alert.condition === 'below' ? '↓ Poniżej' : '↑ Powyżej'} {alert.value}</div>
        </div>
        <button onClick={onClose} className={`bg-transparent border-none ${t.muted} text-lg cursor-pointer`}>×</button>
      </div>
    </div>
  );
};

// ============== PWA COMPONENTS ==============
const OfflineIndicator = ({ theme }) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const t = useTheme(theme);
  
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  if (!isOffline) return null;
  
  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500 text-slate-900 text-center py-2 px-4 text-xs font-semibold z-[1002] flex items-center justify-center gap-2">
      <span>📴</span>
      <span>Jesteś offline - dane mogą być nieaktualne</span>
    </div>
  );
};

const PWAInstallBanner = ({ theme, onDismiss }) => {
  const t = useTheme(theme);
  const [canInstall, setCanInstall] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  
  useEffect(() => {
    // Check if already running as PWA
    const checkPWA = window.matchMedia('(display-mode: standalone)').matches || 
                     window.navigator.standalone === true;
    setIsPWA(checkPWA);
    
    // Listen for install prompt
    const handleInstallAvailable = () => setCanInstall(true);
    const handleInstalled = () => { setCanInstall(false); setIsPWA(true); };
    
    window.addEventListener('pwaInstallAvailable', handleInstallAvailable);
    window.addEventListener('pwaInstalled', handleInstalled);
    
    return () => {
      window.removeEventListener('pwaInstallAvailable', handleInstallAvailable);
      window.removeEventListener('pwaInstalled', handleInstalled);
    };
  }, []);
  
  const handleInstall = async () => {
    if (window.installPWA) {
      const installed = await window.installPWA();
      if (installed) {
        setCanInstall(false);
        setIsPWA(true);
      }
    }
  };
  
  // Don't show if already PWA or can't install
  if (isPWA || !canInstall) return null;
  
  return (
    <div className={`fixed bottom-24 left-4 right-4 ${t.card} rounded-xl border ${t.border} shadow-2xl p-4 z-[999]`}>
      <div className="flex items-start gap-3">
        <div className="text-3xl">📲</div>
        <div className="flex-1">
          <div className={`text-sm font-bold ${t.text} mb-1`}>Zainstaluj aplikację</div>
          <div className={`text-xs ${t.muted} mb-3`}>Dodaj Crypto Decision Hub do ekranu głównego dla szybszego dostępu i trybu offline.</div>
          <div className="flex gap-2">
            <button onClick={handleInstall} className="px-4 py-2 bg-blue-500 text-white text-xs font-semibold rounded-lg border-none cursor-pointer hover:bg-blue-600">Zainstaluj</button>
            <button onClick={onDismiss} className={`px-4 py-2 ${t.bg} ${t.muted} text-xs font-semibold rounded-lg border ${t.border} cursor-pointer`}>Później</button>
          </div>
        </div>
        <button onClick={onDismiss} className={`bg-transparent border-none ${t.muted} text-lg cursor-pointer`}>×</button>
      </div>
    </div>
  );
};

const PWAUpdateBanner = ({ theme, onUpdate, onDismiss }) => {
  const t = useTheme(theme);
  return (
    <div className={`fixed top-4 left-4 right-4 ${t.card} rounded-xl border ${t.border} shadow-2xl p-4 z-[1003]`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔄</div>
        <div className="flex-1">
          <div className={`text-sm font-bold ${t.text} mb-1`}>Nowa wersja dostępna!</div>
          <div className={`text-xs ${t.muted} mb-2`}>Odśwież aby zaktualizować aplikację.</div>
          <div className="flex gap-2">
            <button onClick={onUpdate} className="px-4 py-2 bg-green-500 text-white text-xs font-semibold rounded-lg border-none cursor-pointer hover:bg-green-600">Aktualizuj</button>
            <button onClick={onDismiss} className={`px-4 py-2 ${t.bg} ${t.muted} text-xs font-semibold rounded-lg border ${t.border} cursor-pointer`}>Później</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============== COMPARISON MODE ==============
const COMPARISON_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', color: '#627EEA' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', color: '#00FFA3' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', color: '#F3BA2F' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', color: '#23292F' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', color: '#0033AD' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', color: '#E84142' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', color: '#E6007A' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', color: '#C2A633' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', color: '#2A5ADA' },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', color: '#8247E5' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', color: '#FF007A' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', color: '#BFBBBB' },
  { id: 'near', symbol: 'NEAR', name: 'NEAR', color: '#00C08B' },
  { id: 'aptos', symbol: 'APT', name: 'Aptos', color: '#4CD7D0' },
  { id: 'arbitrum', symbol: 'ARB', name: 'Arbitrum', color: '#28A0F0' },
  { id: 'optimism', symbol: 'OP', name: 'Optimism', color: '#FF0420' },
  { id: 'sui', symbol: 'SUI', name: 'Sui', color: '#4DA2FF' },
  { id: 'render-token', symbol: 'RNDR', name: 'Render', color: '#E52D27' },
  { id: 'injective-protocol', symbol: 'INJ', name: 'Injective', color: '#00F2FE' }
];

const fetchComparisonData = async (coinIds) => {
  if (!coinIds || coinIds.length === 0) return null;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=1h,24h,7d,30d`);
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    return data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change1h: coin.price_change_percentage_1h_in_currency,
      change24h: coin.price_change_percentage_24h_in_currency,
      change7d: coin.price_change_percentage_7d_in_currency,
      change30d: coin.price_change_percentage_30d_in_currency,
      volume: coin.total_volume,
      marketCap: coin.market_cap,
      sparkline: coin.sparkline_in_7d?.price || [],
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      ath: coin.ath,
      athChange: coin.ath_change_percentage,
      color: COMPARISON_COINS.find(c => c.id === coin.id)?.color || '#6366f1'
    }));
  } catch (error) {
    console.error('Comparison fetch error:', error);
    return null;
  }
};

// ============== ETH/BTC HISTORY ==============
const fetchEthBtcHistory = async (days = 30) => {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=btc&days=${days}&interval=daily`);
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    
    if (!data.prices || data.prices.length === 0) return null;
    
    const prices = data.prices.map(([timestamp, value]) => ({
      date: new Date(timestamp).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
      value: value,
      timestamp
    }));
    
    const firstPrice = prices[0]?.value || 0;
    const lastPrice = prices[prices.length - 1]?.value || 0;
    const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice * 100) : 0;
    const minValue = Math.min(...prices.map(p => p.value));
    const maxValue = Math.max(...prices.map(p => p.value));
    
    return {
      prices,
      change: change.toFixed(2),
      current: lastPrice.toFixed(5),
      min: minValue.toFixed(5),
      max: maxValue.toFixed(5),
      days
    };
  } catch (error) {
    console.error('ETH/BTC history fetch error:', error);
    return null;
  }
};

// ============== EXPORT FUNCTIONS ==============
const exportToCSV = (data, filename, headers) => {
  if (!data || data.length === 0) return;
  const csvHeaders = headers.map(h => h.label).join(',');
  const csvRows = data.map(row => headers.map(h => {
    let val = h.accessor(row);
    if (typeof val === 'string' && val.includes(',')) val = `"${val}"`;
    return val;
  }).join(','));
  const csvContent = [csvHeaders, ...csvRows].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const exportToPDF = (title, sections, theme = 'dark') => {
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#0f172a' : '#ffffff';
  const textColor = isDark ? '#f8fafc' : '#1e293b';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const cardBg = isDark ? '#1e293b' : '#f8fafc';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${bgColor}; color: ${textColor}; padding: 20px; }
        .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid ${borderColor}; }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .header .subtitle { font-size: 12px; color: ${mutedColor}; }
        .section { margin-bottom: 20px; background: ${cardBg}; border-radius: 12px; padding: 16px; border: 1px solid ${borderColor}; }
        .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid ${borderColor}; }
        th { background: ${isDark ? '#334155' : '#e2e8f0'}; font-weight: 600; color: ${mutedColor}; }
        .positive { color: #22c55e; }
        .negative { color: #ef4444; }
        .neutral { color: ${mutedColor}; }
        .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .metric-card { background: ${bgColor}; padding: 12px; border-radius: 8px; text-align: center; }
        .metric-label { font-size: 10px; color: ${mutedColor}; margin-bottom: 4px; }
        .metric-value { font-size: 16px; font-weight: 700; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid ${borderColor}; text-align: center; font-size: 10px; color: ${mutedColor}; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 ${title}</h1>
        <div class="subtitle">Wygenerowano: ${new Date().toLocaleString('pl-PL')} | Crypto Decision Hub</div>
      </div>
      ${sections.map(section => `
        <div class="section">
          <div class="section-title">${section.icon || ''} ${section.title}</div>
          ${section.content}
        </div>
      `).join('')}
      <div class="footer">
        Crypto Decision Hub | Dane z CoinGecko, Binance, DefiLlama, FRED | © ${new Date().getFullYear()}
      </div>
    </body>
    </html>
  `;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
};

const generateComparisonPDFContent = (data, theme) => {
  if (!data || data.length === 0) return [];
  const isDark = theme === 'dark';
  
  const tableRows = data.map(coin => `
    <tr>
      <td><strong>${coin.symbol}</strong> <span style="color: ${isDark ? '#94a3b8' : '#64748b'}; font-size: 10px;">${coin.name}</span></td>
      <td style="text-align: right;">$${coin.price?.toLocaleString('en-US', { maximumFractionDigits: coin.price >= 1 ? 2 : 6 }) || '--'}</td>
      <td style="text-align: right;" class="${(coin.change1h || 0) >= 0 ? 'positive' : 'negative'}">${coin.change1h?.toFixed(2) || '--'}%</td>
      <td style="text-align: right;" class="${(coin.change24h || 0) >= 0 ? 'positive' : 'negative'}">${coin.change24h?.toFixed(2) || '--'}%</td>
      <td style="text-align: right;" class="${(coin.change7d || 0) >= 0 ? 'positive' : 'negative'}">${coin.change7d?.toFixed(2) || '--'}%</td>
      <td style="text-align: right;">$${coin.volume >= 1e9 ? (coin.volume / 1e9).toFixed(1) + 'B' : (coin.volume / 1e6).toFixed(0) + 'M'}</td>
      <td style="text-align: right;">$${coin.marketCap >= 1e12 ? (coin.marketCap / 1e12).toFixed(2) + 'T' : (coin.marketCap / 1e9).toFixed(1) + 'B'}</td>
    </tr>
  `).join('');
  
  const avg24h = data.reduce((a, c) => a + (c.change24h || 0), 0) / data.length;
  const best = [...data].sort((a, b) => (b.change24h || 0) - (a.change24h || 0))[0];
  const worst = [...data].sort((a, b) => (a.change24h || 0) - (b.change24h || 0))[0];
  
  return [
    {
      title: 'Porównanie kryptowalut',
      icon: '📊',
      content: `
        <table>
          <thead>
            <tr>
              <th>Coin</th>
              <th style="text-align: right;">Cena</th>
              <th style="text-align: right;">1h</th>
              <th style="text-align: right;">24h</th>
              <th style="text-align: right;">7d</th>
              <th style="text-align: right;">Volume</th>
              <th style="text-align: right;">Market Cap</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      `
    },
    {
      title: 'Podsumowanie',
      icon: '📈',
      content: `
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">Średnia zmiana 24h</div>
            <div class="metric-value ${avg24h >= 0 ? 'positive' : 'negative'}">${avg24h >= 0 ? '+' : ''}${avg24h.toFixed(2)}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Najlepszy 24h</div>
            <div class="metric-value positive">${best?.symbol} (${best?.change24h?.toFixed(2)}%)</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Najgorszy 24h</div>
            <div class="metric-value negative">${worst?.symbol} (${worst?.change24h?.toFixed(2)}%)</div>
          </div>
        </div>
      `
    }
  ];
};

const generateMarketReportPDFContent = (cgData, binanceData, defiData, altseasonData, dayScore, swingScore, hodlScore, theme) => {
  const isDark = theme === 'dark';
  const fg = cgData?.fearGreed?.value || '--';
  const btcPrice = cgData?.btcPrice?.value;
  const btcChange = cgData?.btcPrice?.change;
  const ethPrice = cgData?.ethPrice?.value;
  const ethChange = cgData?.ethPrice?.change;
  const funding = binanceData?.fundingRate?.value;
  const tvl = defiData?.tvl?.value;
  const tvlChange = defiData?.tvl?.change;
  
  const getScoreClass = (score) => score >= 55 ? 'positive' : score <= 45 ? 'negative' : 'neutral';
  
  return [
    {
      title: 'Trading Scores',
      icon: '🎯',
      content: `
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">Day Trading</div>
            <div class="metric-value ${getScoreClass(dayScore)}">${dayScore}/100</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Swing</div>
            <div class="metric-value ${getScoreClass(swingScore)}">${swingScore}/100</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">HODL</div>
            <div class="metric-value ${getScoreClass(hodlScore)}">${hodlScore}/100</div>
          </div>
        </div>
      `
    },
    {
      title: 'Ceny głównych kryptowalut',
      icon: '💰',
      content: `
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">Bitcoin (BTC)</div>
            <div class="metric-value">$${btcPrice?.toLocaleString() || '--'}</div>
            <div class="${(btcChange || 0) >= 0 ? 'positive' : 'negative'}" style="font-size: 12px;">${btcChange >= 0 ? '+' : ''}${btcChange?.toFixed(2) || '--'}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Ethereum (ETH)</div>
            <div class="metric-value">$${ethPrice?.toLocaleString() || '--'}</div>
            <div class="${(ethChange || 0) >= 0 ? 'positive' : 'negative'}" style="font-size: 12px;">${ethChange >= 0 ? '+' : ''}${ethChange?.toFixed(2) || '--'}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Fear & Greed</div>
            <div class="metric-value">${fg}</div>
            <div style="font-size: 10px; color: ${isDark ? '#94a3b8' : '#64748b'};">${fg < 25 ? 'Extreme Fear' : fg < 45 ? 'Fear' : fg < 55 ? 'Neutral' : fg < 75 ? 'Greed' : 'Extreme Greed'}</div>
          </div>
        </div>
      `
    },
    {
      title: 'Wskaźniki rynkowe',
      icon: '📊',
      content: `
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">Funding Rate</div>
            <div class="metric-value ${(funding || 0) > 0.01 ? 'negative' : (funding || 0) < -0.01 ? 'positive' : 'neutral'}">${funding?.toFixed(4) || '--'}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Total TVL</div>
            <div class="metric-value">$${tvl?.toFixed(1) || '--'}B</div>
            <div class="${(tvlChange || 0) >= 0 ? 'positive' : 'negative'}" style="font-size: 12px;">${tvlChange >= 0 ? '+' : ''}${tvlChange?.toFixed(2) || '--'}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Altseason Index</div>
            <div class="metric-value">${altseasonData?.altseasonIndex || '--'}</div>
            <div style="font-size: 10px; color: ${isDark ? '#94a3b8' : '#64748b'};">${(altseasonData?.altseasonIndex || 0) > 60 ? 'Altseason' : 'BTC Season'}</div>
          </div>
        </div>
      `
    }
  ];
};

const ComparisonMode = ({ theme, onHelp }) => {
  const t = useTheme(theme);
  const [selectedCoins, setSelectedCoins] = useState(['bitcoin', 'ethereum', 'solana']);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [sortBy, setSortBy] = useState('marketCap');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    const loadData = async () => {
      if (selectedCoins.length === 0) { setComparisonData(null); return; }
      setLoading(true);
      const data = await fetchComparisonData(selectedCoins);
      setComparisonData(data);
      setLoading(false);
    };
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [selectedCoins]);

  const toggleCoin = (coinId) => {
    if (selectedCoins.includes(coinId)) {
      if (selectedCoins.length > 1) setSelectedCoins(selectedCoins.filter(id => id !== coinId));
    } else {
      if (selectedCoins.length < 5) setSelectedCoins([...selectedCoins, coinId]);
    }
  };

  const formatPrice = (p) => { if (!p) return '$--'; if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`; if (p >= 1) return `$${p.toFixed(2)}`; return `$${p.toFixed(4)}`; };
  const formatChange = (c) => { if (c === undefined || c === null) return '--'; return c >= 0 ? `+${c.toFixed(1)}%` : `${c.toFixed(1)}%`; };
  const formatVolume = (v) => { if (!v) return '--'; if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`; if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`; return `$${v.toLocaleString()}`; };
  const formatMcap = (m) => { if (!m) return '--'; if (m >= 1e12) return `$${(m / 1e12).toFixed(2)}T`; if (m >= 1e9) return `$${(m / 1e9).toFixed(1)}B`; return `$${(m / 1e6).toFixed(0)}M`; };

  const sortedData = comparisonData ? [...comparisonData].sort((a, b) => {
    const aVal = a[sortBy] || 0;
    const bVal = b[sortBy] || 0;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  }) : [];

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  // Normalize sparkline data for overlay chart
  const normalizedChartData = comparisonData ? (() => {
    const sparklines = comparisonData.filter(c => c.sparkline && c.sparkline.length > 0);
    if (sparklines.length === 0) return [];
    const maxLen = Math.max(...sparklines.map(c => c.sparkline.length));
    if (maxLen === 0) return [];
    const step = Math.max(1, Math.ceil(maxLen / 50));
    const points = [];
    for (let i = 0; i < maxLen; i += step) {
      const point = { index: i };
      comparisonData.forEach(coin => {
        if (coin.sparkline && coin.sparkline.length > 0) {
          const idx = Math.min(Math.floor(i * coin.sparkline.length / maxLen), coin.sparkline.length - 1);
          const firstPrice = coin.sparkline[0];
          const currentPrice = coin.sparkline[idx] || firstPrice;
          point[coin.symbol] = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice * 100) : 0;
        }
      });
      points.push(point);
    }
    return points;
  })() : [];

  // Radar chart data
  const radarMetrics = ['change24h', 'change7d', 'volume', 'marketCap'];
  const radarData = comparisonData ? (() => {
    const maxValues = {};
    radarMetrics.forEach(m => { maxValues[m] = Math.max(...comparisonData.map(c => Math.abs(c[m] || 0))); });
    return comparisonData.map(coin => ({
      ...coin,
      normalized: radarMetrics.reduce((acc, m) => {
        acc[m] = maxValues[m] > 0 ? (Math.abs(coin[m] || 0) / maxValues[m]) * 100 : 0;
        return acc;
      }, {})
    }));
  })() : [];

  // Export handlers
  const handleExportCSV = () => {
    if (!comparisonData) return;
    const headers = [
      { label: 'Symbol', accessor: (r) => r.symbol },
      { label: 'Name', accessor: (r) => r.name },
      { label: 'Price (USD)', accessor: (r) => r.price?.toFixed(6) || '' },
      { label: 'Change 1h (%)', accessor: (r) => r.change1h?.toFixed(2) || '' },
      { label: 'Change 24h (%)', accessor: (r) => r.change24h?.toFixed(2) || '' },
      { label: 'Change 7d (%)', accessor: (r) => r.change7d?.toFixed(2) || '' },
      { label: 'Change 30d (%)', accessor: (r) => r.change30d?.toFixed(2) || '' },
      { label: 'Volume 24h (USD)', accessor: (r) => r.volume?.toFixed(0) || '' },
      { label: 'Market Cap (USD)', accessor: (r) => r.marketCap?.toFixed(0) || '' },
      { label: 'ATH (USD)', accessor: (r) => r.ath?.toFixed(2) || '' },
      { label: 'ATH Change (%)', accessor: (r) => r.athChange?.toFixed(2) || '' }
    ];
    exportToCSV(sortedData, 'crypto_comparison', headers);
  };

  const handleExportPDF = () => {
    if (!comparisonData) return;
    const sections = generateComparisonPDFContent(sortedData, theme);
    exportToPDF('Porównanie kryptowalut', sections, theme);
  };

  return (
    <div className="space-y-3">
      {/* Coin Selector */}
      <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
        <div className="flex justify-between items-center mb-3">
          <div className={`text-xs font-semibold ${t.text}`}>🎯 Wybierz coiny (max 5)</div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-1 rounded-full ${t.bg} ${t.muted}`}>{selectedCoins.length}/5</span>
            {comparisonData && (
              <div className="flex gap-1">
                <button onClick={handleExportCSV} className={`px-2 py-1 rounded text-[9px] font-semibold cursor-pointer border ${t.border} ${t.bg} ${t.muted} hover:text-green-500 hover:border-green-500`} title="Export CSV">📄 CSV</button>
                <button onClick={handleExportPDF} className={`px-2 py-1 rounded text-[9px] font-semibold cursor-pointer border ${t.border} ${t.bg} ${t.muted} hover:text-blue-500 hover:border-blue-500`} title="Export PDF">📑 PDF</button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMPARISON_COINS.map(coin => (
            <button
              key={coin.id}
              onClick={() => toggleCoin(coin.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer border-2 transition-all ${
                selectedCoins.includes(coin.id)
                  ? 'border-blue-500 bg-blue-500/20 text-blue-500'
                  : `border-transparent ${t.bg} ${t.muted} hover:border-blue-500/50`
              }`}
              style={selectedCoins.includes(coin.id) ? { borderColor: coin.color, backgroundColor: `${coin.color}20`, color: coin.color } : {}}
            >
              {coin.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        {[{ id: 'table', icon: '📋', label: 'Tabela' }, { id: 'chart', icon: '📈', label: 'Wykres' }, { id: 'radar', icon: '🎯', label: 'Radar' }].map(mode => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            className={`flex-1 py-2.5 rounded-lg border-2 text-[11px] font-semibold cursor-pointer flex items-center justify-center gap-1.5 ${
              viewMode === mode.id ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `border-transparent ${t.card} ${t.muted}`
            }`}
          >
            <span>{mode.icon}</span> {mode.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className={`p-8 ${t.card} rounded-xl border ${t.border} text-center`}>
          <div className="animate-spin text-2xl mb-2">⏳</div>
          <div className={`text-xs ${t.muted}`}>Ładowanie danych...</div>
        </div>
      )}

      {/* Table View */}
      {!loading && viewMode === 'table' && comparisonData && (
        <div className={`${t.card} rounded-xl border ${t.border} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className={`${t.bg} border-b ${t.border}`}>
                  <th className={`p-2.5 text-left ${t.muted} font-semibold`}>Coin</th>
                  <th onClick={() => handleSort('price')} className={`p-2.5 text-right ${t.muted} font-semibold cursor-pointer hover:text-blue-500`}>Cena {sortBy === 'price' && (sortDir === 'desc' ? '↓' : '↑')}</th>
                  <th onClick={() => handleSort('change1h')} className={`p-2.5 text-right ${t.muted} font-semibold cursor-pointer hover:text-blue-500`}>1h {sortBy === 'change1h' && (sortDir === 'desc' ? '↓' : '↑')}</th>
                  <th onClick={() => handleSort('change24h')} className={`p-2.5 text-right ${t.muted} font-semibold cursor-pointer hover:text-blue-500`}>24h {sortBy === 'change24h' && (sortDir === 'desc' ? '↓' : '↑')}</th>
                  <th onClick={() => handleSort('change7d')} className={`p-2.5 text-right ${t.muted} font-semibold cursor-pointer hover:text-blue-500`}>7d {sortBy === 'change7d' && (sortDir === 'desc' ? '↓' : '↑')}</th>
                  <th onClick={() => handleSort('volume')} className={`p-2.5 text-right ${t.muted} font-semibold cursor-pointer hover:text-blue-500`}>Vol {sortBy === 'volume' && (sortDir === 'desc' ? '↓' : '↑')}</th>
                  <th onClick={() => handleSort('marketCap')} className={`p-2.5 text-right ${t.muted} font-semibold cursor-pointer hover:text-blue-500`}>MCap {sortBy === 'marketCap' && (sortDir === 'desc' ? '↓' : '↑')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((coin, i) => (
                  <tr key={coin.id} className={`border-b ${t.border} ${i % 2 === 0 ? '' : t.bg}`}>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: coin.color }}></div>
                        <span className={`font-bold ${t.text}`}>{coin.symbol}</span>
                        <span className={`${t.muted} hidden sm:inline`}>{coin.name}</span>
                      </div>
                    </td>
                    <td className={`p-2.5 text-right font-bold ${t.text}`}>{formatPrice(coin.price)}</td>
                    <td className={`p-2.5 text-right font-semibold ${(coin.change1h || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(coin.change1h)}</td>
                    <td className={`p-2.5 text-right font-semibold ${(coin.change24h || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(coin.change24h)}</td>
                    <td className={`p-2.5 text-right font-semibold ${(coin.change7d || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(coin.change7d)}</td>
                    <td className={`p-2.5 text-right ${t.muted}`}>{formatVolume(coin.volume)}</td>
                    <td className={`p-2.5 text-right ${t.muted}`}>{formatMcap(coin.marketCap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Summary Row */}
          <div className={`p-3 ${t.bg} border-t ${t.border} grid grid-cols-3 gap-3 text-center`}>
            <div>
              <div className={`text-[9px] ${t.muted}`}>Avg 24h</div>
              <div className={`text-xs font-bold ${(sortedData.reduce((a, c) => a + (c.change24h || 0), 0) / sortedData.length) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatChange(sortedData.reduce((a, c) => a + (c.change24h || 0), 0) / sortedData.length)}
              </div>
            </div>
            <div>
              <div className={`text-[9px] ${t.muted}`}>Najlepszy 24h</div>
              <div className="text-xs font-bold text-green-500">{sortedData.sort((a, b) => (b.change24h || 0) - (a.change24h || 0))[0]?.symbol}</div>
            </div>
            <div>
              <div className={`text-[9px] ${t.muted}`}>Najgorszy 24h</div>
              <div className="text-xs font-bold text-red-500">{sortedData.sort((a, b) => (a.change24h || 0) - (b.change24h || 0))[0]?.symbol}</div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Chart View */}
      {!loading && viewMode === 'chart' && comparisonData && normalizedChartData.length > 0 && (
        <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
          <div className={`text-xs font-semibold ${t.text} mb-3`}>📈 Performance 7D (% change)</div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={normalizedChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="index" tick={false} axisLine={false} />
                <YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '11px' }} formatter={(value, name) => [`${value.toFixed(2)}%`, name]} />
                {comparisonData.map((coin, i) => (
                  <Area key={coin.symbol} type="monotone" dataKey={coin.symbol} stroke={coin.color} fill={`${coin.color}30`} strokeWidth={2} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {comparisonData.map(coin => (
              <div key={coin.symbol} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: coin.color }}></div>
                <span className={`text-[10px] ${t.text}`}>{coin.symbol}</span>
                <span className={`text-[10px] font-semibold ${(coin.change7d || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(coin.change7d)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Radar View */}
      {!loading && viewMode === 'radar' && radarData.length > 0 && (
        <div className={`p-3 ${t.card} rounded-xl border ${t.border}`}>
          <div className={`text-xs font-semibold ${t.text} mb-3`}>🎯 Porównanie metryk</div>
          <div className="flex flex-wrap gap-3">
            {radarData.map(coin => (
              <div key={coin.id} className={`p-3 ${t.bg} rounded-lg flex-1 min-w-[140px] max-w-[calc(50%-6px)]`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: coin.color }}></div>
                  <span className={`text-sm font-bold ${t.text}`}>{coin.symbol}</span>
                </div>
                <div className="space-y-2">
                  {[
                    { key: 'change24h', label: '24h Change', value: coin.change24h, normalized: coin.normalized.change24h },
                    { key: 'change7d', label: '7d Change', value: coin.change7d, normalized: coin.normalized.change7d },
                    { key: 'volume', label: 'Volume', value: coin.volume, normalized: coin.normalized.volume, format: 'vol' },
                    { key: 'marketCap', label: 'Market Cap', value: coin.marketCap, normalized: coin.normalized.marketCap, format: 'mcap' }
                  ].map(metric => (
                    <div key={metric.key}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-[9px] ${t.muted}`}>{metric.label}</span>
                        <span className={`text-[9px] font-semibold ${metric.format ? t.text : (metric.value || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {metric.format === 'vol' ? formatVolume(metric.value) : metric.format === 'mcap' ? formatMcap(metric.value) : formatChange(metric.value)}
                        </span>
                      </div>
                      <div className={`h-1.5 rounded-full ${t.isDark ? 'bg-slate-700' : 'bg-slate-200'} overflow-hidden`}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(metric.normalized, 100)}%`, backgroundColor: coin.color }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Overall ranking */}
          <div className={`mt-3 p-2.5 ${t.bg} rounded-lg`}>
            <div className={`text-[9px] ${t.muted} mb-2`}>🏆 Ranking ogólny (suma znormalizowanych metryk)</div>
            <div className="flex flex-wrap gap-2">
              {radarData
                .map(c => ({ ...c, totalScore: Object.values(c.normalized).reduce((a, b) => a + b, 0) }))
                .sort((a, b) => b.totalScore - a.totalScore)
                .map((coin, i) => (
                  <div key={coin.id} className={`flex items-center gap-1.5 px-2 py-1 rounded ${i === 0 ? 'bg-yellow-500/20' : t.card}`}>
                    <span className={`text-[10px] ${i === 0 ? 'text-yellow-500' : t.muted}`}>#{i + 1}</span>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: coin.color }}></div>
                    <span className={`text-[10px] font-semibold ${t.text}`}>{coin.symbol}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && (!comparisonData || comparisonData.length === 0) && (
        <div className={`p-8 ${t.card} rounded-xl border ${t.border} text-center`}>
          <div className="text-3xl mb-2">📊</div>
          <div className={`text-sm ${t.text} mb-1`}>Wybierz coiny do porównania</div>
          <div className={`text-xs ${t.muted}`}>Kliknij na symbole powyżej</div>
        </div>
      )}

      {/* Help Card */}
      <div className={`p-3 ${t.bg} rounded-lg`}>
        <div className={`text-[9px] ${t.muted}`}>
          💡 <strong>Porównanie</strong> pozwala analizować do 5 kryptowalut jednocześnie. 
          Widok <strong>Tabela</strong> pokazuje kluczowe metryki, <strong>Wykres</strong> porównuje 7-dniową zmianę %, 
          a <strong>Radar</strong> wizualizuje relatywną siłę każdego coina.
        </div>
      </div>
    </div>
  );
};

const AlertPanel = ({ alerts, onAddAlert, onDeleteAlert, onClose, theme }) => {
  const [alertType, setAlertType] = useState('score');
  const [alertMetric, setAlertMetric] = useState('dayTrading');
  const [alertCondition, setAlertCondition] = useState('below');
  const [alertValue, setAlertValue] = useState('');
  const [alertName, setAlertName] = useState('');
  const t = useTheme(theme);
  const handleAdd = () => {
    if (!alertValue || !alertName) return;
    onAddAlert({ id: Date.now(), name: alertName, type: alertType, metric: alertMetric, condition: alertCondition, value: parseFloat(alertValue), enabled: true, triggered: false });
    setAlertName(''); setAlertValue('');
  };
  const metricOptions = {
    score: [{ value: 'dayTrading', label: 'Day Trading' }, { value: 'swing', label: 'Swing' }, { value: 'hodl', label: 'HODL' }],
    price: [{ value: 'btc', label: 'Bitcoin' }, { value: 'eth', label: 'Ethereum' }, { value: 'sol', label: 'Solana' }],
    indicator: [{ value: 'fearGreed', label: 'Fear & Greed' }, { value: 'funding', label: 'Funding Rate' }, { value: 'dominance', label: 'BTC Dom' }]
  };
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div onClick={e => e.stopPropagation()} className={`${t.bg} rounded-2xl max-w-md w-full max-h-[85vh] overflow-auto border ${t.border}`}>
        <div className={`p-4 border-b ${t.border} flex justify-between items-center`}>
          <h3 className={`m-0 ${t.text} text-base font-bold`}>🔔 Alerty</h3>
          <button onClick={onClose} className={`bg-transparent border-none ${t.muted} text-2xl cursor-pointer`}>×</button>
        </div>
        <div className="p-4">
          <div className={`mb-5 p-3.5 ${t.card} rounded-xl`}>
            <div className={`text-xs font-semibold ${t.text} mb-3`}>➕ Nowy alert</div>
            <input type="text" placeholder="Nazwa" value={alertName} onChange={e => setAlertName(e.target.value)} className={`w-full px-2.5 py-2.5 rounded-lg border ${t.input} text-xs mb-2.5`} />
            <div className="flex gap-2 mb-2.5">
              {['score', 'price', 'indicator'].map(type => (
                <button key={type} onClick={() => { setAlertType(type); setAlertMetric(metricOptions[type][0].value); }} className={`flex-1 py-2 rounded-md border-2 text-[10px] font-semibold cursor-pointer ${alertType === type ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `${t.card} border-transparent ${t.muted}`}`}>
                  {type === 'score' ? '📊' : type === 'price' ? '💰' : '📈'} {type}
                </button>
              ))}
            </div>
            <select value={alertMetric} onChange={e => setAlertMetric(e.target.value)} className={`w-full px-2.5 py-2.5 rounded-lg border ${t.input} text-xs mb-2.5`}>
              {metricOptions[alertType].map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="flex gap-2 mb-2.5">
              <select value={alertCondition} onChange={e => setAlertCondition(e.target.value)} className={`flex-1 px-2.5 py-2.5 rounded-lg border ${t.input} text-xs`}>
                <option value="below">Poniżej</option><option value="above">Powyżej</option>
              </select>
              <input type="number" placeholder="Wartość" value={alertValue} onChange={e => setAlertValue(e.target.value)} className={`flex-1 px-2.5 py-2.5 rounded-lg border ${t.input} text-xs`} />
            </div>
            <button onClick={handleAdd} className="w-full py-3 rounded-lg border-none bg-blue-500 text-white text-xs font-bold cursor-pointer hover:bg-blue-600">➕ Dodaj</button>
          </div>
          <div className={`text-xs font-semibold ${t.text} mb-2.5`}>📋 Aktywne ({alerts.length})</div>
          {alerts.length === 0 ? <div className={`p-5 text-center ${t.muted} text-xs`}>Brak alertów</div> : (
            <div className="flex flex-col gap-2">
              {alerts.map(alert => (
                <div key={alert.id} className={`flex justify-between items-center p-3 ${t.card} rounded-lg border-l-4 ${alert.condition === 'below' ? 'border-l-red-500' : 'border-l-green-500'}`}>
                  <div><div className={`text-xs font-semibold ${t.text}`}>{alert.name}</div><div className={`text-[10px] ${t.muted}`}>{alert.condition === 'below' ? '↓' : '↑'} {alert.value}</div></div>
                  <button onClick={() => onDeleteAlert(alert.id)} className="px-2.5 py-1.5 rounded-md border-none bg-red-500/20 text-red-500 text-[10px] font-semibold cursor-pointer">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TradingViewChart = ({ symbol, theme }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({ autosize: true, symbol, interval: 'D', timezone: 'Europe/Warsaw', theme: theme === 'dark' ? 'dark' : 'light', style: '1', locale: 'pl', hide_top_toolbar: true, save_image: false });
    containerRef.current.appendChild(script);
  }, [symbol, theme]);
  return <div ref={containerRef} className="h-[400px] w-full rounded-xl overflow-hidden" />;
};

const TradingViewTechnicalAnalysis = ({ symbol, interval, theme }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
    script.async = true;
    script.innerHTML = JSON.stringify({ interval, width: '100%', isTransparent: true, height: '100%', symbol, showIntervalTabs: false, locale: 'pl', colorTheme: theme === 'dark' ? 'dark' : 'light' });
    containerRef.current.appendChild(script);
  }, [symbol, interval, theme]);
  return <div ref={containerRef} className="h-[380px] w-full" />;
};

// ============== BINANCE POST GENERATOR ==============
const BinancePostGenerator = ({ cgData, binanceData, defiData, altseasonData, dayScore, swingScore, hodlScore, theme, onClose }) => {
  const t = useTheme(theme);
  const [format, setFormat] = useState('standard');
  const [copied, setCopied] = useState(false);
  const [generatedText, setGeneratedText] = useState('');

  const CONFIG = {
    appUrl: 'crypto-decision-hub.vercel.app',
    thresholds: {
      dayTrading: { high: 65, neutral: 50, low: 35 },
      swing: { high: 55, neutral: 45, low: 30 },
      hodl: { high: 50, neutral: 40, low: 25 }
    }
  };

  const getScoreSignal = (score, type) => {
    const th = CONFIG.thresholds[type];
    if (score >= th.high + 15) return { emoji: '🟢', pl: 'Akumuluj' };
    if (score >= th.high) return { emoji: '🟢', pl: 'Pozytywny' };
    if (score >= th.neutral) return { emoji: '🟡', pl: 'Neutralny' };
    if (score >= th.low) return { emoji: '🟠', pl: 'Ostrożnie' };
    return { emoji: '🔴', pl: 'Ryzyko' };
  };

  const generateAnalysis = useCallback(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    const fg = cgData?.fearGreed?.value || 50;
    const fgClass = fg < 25 ? 'Extreme Fear' : fg < 45 ? 'Fear' : fg < 55 ? 'Neutral' : fg < 75 ? 'Greed' : 'Extreme Greed';
    const btcPrice = cgData?.btcPrice?.value || 0;
    const btcChange = cgData?.btcPrice?.change || 0;
    const ethPrice = cgData?.ethPrice?.value || 0;
    const ethChange = cgData?.ethPrice?.change || 0;
    const funding = binanceData?.fundingRate?.value || 0;
    const btcDom = cgData?.btcDominance?.value || 50;
    const tvl = defiData?.tvl?.value || 0;

    const daySignal = getScoreSignal(dayScore, 'dayTrading');
    const swingSignal = getScoreSignal(swingScore, 'swing');
    const hodlSignal = getScoreSignal(hodlScore, 'hodl');
    const avgScore = Math.round((dayScore + swingScore + hodlScore) / 3);

    const formatPrice = (p) => p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p.toFixed(2);
    const formatChange = (c) => c >= 0 ? `+${c.toFixed(1)}%` : `${c.toFixed(1)}%`;
    const formatTVL = (t) => `$${t.toFixed(1)}B`;

    let marketSummary = '';
    if (fg < 25) marketSummary = 'Rynek w strefie STRACHU. Historycznie okolice dna - rozważ akumulację.';
    else if (fg > 75) marketSummary = 'Rynek w strefie CHCIWOŚCI. Podwyższone ryzyko korekty.';
    else if (btcChange > 5) marketSummary = 'Silne momentum wzrostowe. Trend byczy.';
    else if (btcChange < -5) marketSummary = 'Korekta w toku. Czekaj na stabilizację.';
    else marketSummary = 'Konsolidacja. Brak wyraźnego kierunku.';

    if (format === 'standard') {
      return `═══════════════════════════════════════
📊 CRYPTO MARKET ANALYSIS
📅 ${dateStr}
═══════════════════════════════════════

💰 CENY GŁÓWNYCH KRYPTO

BTC: $${formatPrice(btcPrice)} (${formatChange(btcChange)})
ETH: $${formatPrice(ethPrice)} (${formatChange(ethChange)})

📈 KLUCZOWE WSKAŹNIKI

Fear & Greed Index: ${fg}/100 (${fgClass})
BTC Dominance: ${btcDom.toFixed(1)}%
Funding Rate: ${(funding * 100).toFixed(4)}%
DeFi TVL: ${formatTVL(tvl)}

🎯 THREE SCORES ANALYSIS

${daySignal.emoji} Day Trading: ${dayScore}/100 - ${daySignal.pl}
${swingSignal.emoji} Swing (tygodnie): ${swingScore}/100 - ${swingSignal.pl}
${hodlSignal.emoji} HODL (długoterm): ${hodlScore}/100 - ${hodlSignal.pl}

Średnia: ${avgScore}/100

📝 PODSUMOWANIE

${marketSummary}

⚠️ To nie jest porada inwestycyjna. DYOR.

🔗 Więcej analiz: ${CONFIG.appUrl}

#Bitcoin #Crypto #Trading #MarketAnalysis`;
    }

    if (format === 'short') {
      return `📊 Crypto Update ${dateStr.split(',')[0]}

BTC $${formatPrice(btcPrice)} ${formatChange(btcChange)}
F&G: ${fg} | Dom: ${btcDom.toFixed(0)}%

Scores: Day ${dayScore} | Swing ${swingScore} | HODL ${hodlScore}

${marketSummary}

🔗 ${CONFIG.appUrl}

#BTC #Crypto`;
    }

    if (format === 'thread') {
      return `🧵 THREAD: Analiza rynku crypto ${dateStr.split(',')[0]}

Dziś patrzymy na:
• Fear & Greed Index
• Derivatives (Funding)
• Three Scores System

👇 Szczegóły w komentarzach

---

1/ SENTYMENT

Fear & Greed: ${fg}/100
${fg < 30 ? '→ Strach = potencjalne dno' : fg > 70 ? '→ Chciwość = ostrożność' : '→ Neutralnie'}

---

2/ CENY

$BTC: $${formatPrice(btcPrice)} (${formatChange(btcChange)})
$ETH: $${formatPrice(ethPrice)} (${formatChange(ethChange)})

BTC Dominance: ${btcDom.toFixed(1)}%

---

3/ THREE SCORES

${daySignal.emoji} Day: ${dayScore}
${swingSignal.emoji} Swing: ${swingScore}
${hodlSignal.emoji} HODL: ${hodlScore}

AVG: ${avgScore}/100

---

4/ WNIOSKI

${marketSummary}

⚠️ NFA/DYOR
🔗 ${CONFIG.appUrl}

#Crypto #Bitcoin #Trading`;
    }

    return '';
  }, [cgData, binanceData, defiData, dayScore, swingScore, hodlScore, format]);

  useEffect(() => {
    setGeneratedText(generateAnalysis());
  }, [generateAnalysis]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback dla starszych przeglądarek
      const textarea = document.createElement('textarea');
      textarea.value = generatedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div 
        className={`w-full max-w-lg max-h-[85vh] overflow-y-auto ${t.card} rounded-t-2xl sm:rounded-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-bold ${t.text}`}>📝 Binance Post Generator</h2>
              <p className={`text-xs ${t.muted}`}>Generuj analizy na Binance Square</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
                  copied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {copied ? '✓ OK!' : '📋 Kopiuj'}
              </button>
              <button
                onClick={onClose}
                className={`w-8 h-8 rounded-lg ${t.isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'} ${t.text} text-lg`}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Format selector */}
          <div className="flex gap-2">
            {[
              { id: 'standard', label: '📄 Standard', desc: 'Pełna analiza' },
              { id: 'short', label: '⚡ Krótki', desc: 'Quick update' },
              { id: 'thread', label: '🧵 Thread', desc: 'Multi-post' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`flex-1 p-2 rounded-lg text-center transition-all ${
                  format === f.id 
                    ? 'bg-blue-500/20 border-blue-500 border-2' 
                    : `${t.bg} border ${t.border}`
                }`}
              >
                <div className={`text-xs font-semibold ${format === f.id ? 'text-blue-400' : t.text}`}>{f.label}</div>
                <div className={`text-[10px] ${t.muted}`}>{f.desc}</div>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className={`p-3 rounded-xl ${t.isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold ${t.muted}`}>PODGLĄD</span>
              <span className={`text-[10px] ${t.muted}`}>{generatedText.length} znaków</span>
            </div>
            <pre className={`text-[11px] ${t.text} whitespace-pre-wrap font-mono leading-relaxed p-2 rounded-lg ${t.isDark ? 'bg-slate-900' : 'bg-white'} max-h-[300px] overflow-y-auto`}>
              {generatedText}
            </pre>
          </div>
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
  const [cgData, setCgData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [defiData, setDefiData] = useState(null);
  const [fredData, setFredData] = useState(null);
  const [msData, setMsData] = useState(null);
  const [altseasonData, setAltseasonData] = useState(null);
  const [polygonData, setPolygonData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading', polygon: 'loading' });
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  const [chartView, setChartView] = useState('analysis');
  const [taInterval, setTaInterval] = useState('1D');
  const [alerts, setAlerts] = useState([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [portfolioApiKey, setPortfolioApiKey] = useState('');
  const [portfolioSecretKey, setPortfolioSecretKey] = useState('');
  const [portfolioConnected, setPortfolioConnected] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState(null);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [spotBalance, setSpotBalance] = useState(null);
  const [futuresBalance, setFuturesBalance] = useState(null);
  const [futuresPositions, setFuturesPositions] = useState(null);
  const [openOrders, setOpenOrders] = useState(null);
  const [tradeSymbol, setTradeSymbol] = useState('BTCUSDT');
  const [tradeMarket, setTradeMarket] = useState('SPOT');
  const [tradeSide, setTradeSide] = useState('BUY');
  const [tradeType, setTradeType] = useState('MARKET');
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeResult, setTradeResult] = useState(null);
  const [showAllGainers, setShowAllGainers] = useState(false);
  const [showAllLosers, setShowAllLosers] = useState(false);
  const [ethBtcHistory, setEthBtcHistory] = useState(null);
  const [ethBtcTimeframe, setEthBtcTimeframe] = useState(30);
  const [ethBtcLoading, setEthBtcLoading] = useState(false);
  const [showPWAInstall, setShowPWAInstall] = useState(true);
  const [showPWAUpdate, setShowPWAUpdate] = useState(false);
  const [showPostGenerator, setShowPostGenerator] = useState(false);
  const t = useTheme(theme);

  useEffect(() => {
    const savedKeys = loadApiKeys();
    if (savedKeys.apiKey && savedKeys.secretKey) { setPortfolioApiKey(savedKeys.apiKey); setPortfolioSecretKey(savedKeys.secretKey); }
    setAlerts(loadAlerts());
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(p => setNotificationsEnabled(p === 'granted'));
    else if ('Notification' in window) setNotificationsEnabled(Notification.permission === 'granted');
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const [cg, bin, defi, fred, ms, alt, poly] = await Promise.all([fetchCoinGeckoData(), fetchBinanceData(), fetchDefiLlamaData(), fetchFredData(), fetchMarketStructure(), fetchAltseasonData(), fetchPolygonData()]);
    setCgData(cg); setBinanceData(bin); setDefiData(defi); setFredData(fred); setMsData(ms); setAltseasonData(alt); setPolygonData(poly);
    setApiStatus({ coingecko: cg ? 'live' : 'error', binance: bin ? 'live' : 'error', defillama: defi ? 'live' : 'error', fred: fred ? 'live' : 'error', polygon: poly ? 'live' : 'error' });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAllData(); const interval = setInterval(fetchAllData, 60000); return () => clearInterval(interval); }, [fetchAllData]);

  // Fetch ETH/BTC history when timeframe changes
  useEffect(() => {
    const loadEthBtcHistory = async () => {
      setEthBtcLoading(true);
      const data = await fetchEthBtcHistory(ethBtcTimeframe);
      setEthBtcHistory(data);
      setEthBtcLoading(false);
    };
    loadEthBtcHistory();
  }, [ethBtcTimeframe]);

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
    
    // Polygon data integration
    const dxy = polygonData?.dxy?.value || 104;
    const dxyChange = polygonData?.dxy?.change || 0;
    const vix = polygonData?.vix?.value || 15;
    const sp500Change = polygonData?.sp500?.change || 0;
    
    // M2 Supply
    if (m2Trend === 'expanding') { if (m2Change > 5) score += 15; else if (m2Change > 2) score += 10; else score += 5; }
    else { if (m2Change < -2) score -= 10; else score -= 5; }
    
    // Stablecoins
    if (stableChange > 5) score += 12; else if (stableChange > 2) score += 6; else if (stableChange < -5) score -= 12; else if (stableChange < -2) score -= 6;
    
    // TVL
    if (tvlChange > 8) score += 8; else if (tvlChange > 3) score += 4; else if (tvlChange < -8) score -= 8; else if (tvlChange < -3) score -= 4;
    
    // Fear & Greed
    if (fg < 20) score += 8; else if (fg < 35) score += 4; else if (fg > 85) score -= 8; else if (fg > 70) score -= 4;
    
    // DXY (Dollar Index) - inversely correlated with crypto
    if (dxy < 101 && dxyChange < 0) score += 10;      // Very bullish
    else if (dxy < 103) score += 5;                    // Bullish
    else if (dxy > 106 && dxyChange > 0) score -= 10; // Very bearish
    else if (dxy > 105) score -= 5;                    // Bearish
    
    // VIX (Volatility/Fear Index)
    if (vix < 14) score += 6;                          // Risk-on environment
    else if (vix > 30) score -= 8;                     // Extreme fear
    else if (vix > 25) score -= 4;                     // High fear
    
    // S&P 500 (risk-on/risk-off correlation)
    if (sp500Change > 1) score += 4;                   // Strong risk-on
    else if (sp500Change > 0) score += 2;              // Mild risk-on
    else if (sp500Change < -2) score -= 6;             // Strong risk-off
    else if (sp500Change < -1) score -= 3;             // Mild risk-off
    
    return Math.max(0, Math.min(100, score));
  }, [cgData, defiData, fredData, polygonData]);

  const dayScore = calculateDayTradingScore();
  const swingScore = calculateSwingScore();
  const hodlScore = calculateHodlScore();

  useEffect(() => {
    if (!cgData || alerts.length === 0) return;
    alerts.forEach(alert => {
      if (alert.triggered) return;
      let currentValue = 0;
      if (alert.type === 'score') { if (alert.metric === 'dayTrading') currentValue = dayScore; else if (alert.metric === 'swing') currentValue = swingScore; else if (alert.metric === 'hodl') currentValue = hodlScore; }
      else if (alert.type === 'price') { if (alert.metric === 'btc') currentValue = cgData.btcPrice?.value || 0; else if (alert.metric === 'eth') currentValue = cgData.ethPrice?.value || 0; else if (alert.metric === 'sol') currentValue = cgData.solPrice?.value || 0; }
      else if (alert.type === 'indicator') { if (alert.metric === 'fearGreed') currentValue = cgData.fearGreed?.value || 0; else if (alert.metric === 'funding') currentValue = binanceData?.fundingRate?.value || 0; else if (alert.metric === 'dominance') currentValue = cgData.btcDominance?.value || 0; }
      const triggered = (alert.condition === 'below' && currentValue < alert.value) || (alert.condition === 'above' && currentValue > alert.value);
      if (triggered) {
        setActiveToast(alert);
        if (notificationsEnabled && 'Notification' in window) new Notification(`🔔 ${alert.name}`, { body: `${alert.condition === 'below' ? 'Poniżej' : 'Powyżej'} ${alert.value}` });
        const updated = alerts.map(a => a.id === alert.id ? { ...a, triggered: true } : a);
        setAlerts(updated); saveAlerts(updated);
      }
    });
  }, [cgData, binanceData, dayScore, swingScore, hodlScore, alerts, notificationsEnabled]);

  const handleAddAlert = (alert) => { const newAlerts = [...alerts, alert]; setAlerts(newAlerts); saveAlerts(newAlerts); };
  const handleDeleteAlert = (id) => { const newAlerts = alerts.filter(a => a.id !== id); setAlerts(newAlerts); saveAlerts(newAlerts); };

  const connectPortfolio = async () => {
    if (!portfolioApiKey || !portfolioSecretKey) { setPortfolioError('Wprowadź klucze'); return; }
    setPortfolioLoading(true); setPortfolioError(null);
    const [spot, futures, positions, orders] = await Promise.all([fetchSpotBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesPositions(portfolioApiKey, portfolioSecretKey), fetchOpenOrders(portfolioApiKey, portfolioSecretKey)]);
    if (spot.error) { setPortfolioError(spot.error); setPortfolioLoading(false); return; }
    setSpotBalance(spot); setFuturesBalance(futures); setFuturesPositions(positions); setOpenOrders(orders);
    saveApiKeys(portfolioApiKey, portfolioSecretKey); setPortfolioConnected(true); setPortfolioLoading(false);
  };

  const disconnectPortfolio = () => { clearApiKeys(); setPortfolioConnected(false); setSpotBalance(null); setFuturesBalance(null); setFuturesPositions(null); setOpenOrders(null); setPortfolioApiKey(''); setPortfolioSecretKey(''); };

  const refreshPortfolio = async () => {
    if (!portfolioConnected) return;
    setPortfolioLoading(true);
    const [spot, futures, positions, orders] = await Promise.all([fetchSpotBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesBalance(portfolioApiKey, portfolioSecretKey), fetchFuturesPositions(portfolioApiKey, portfolioSecretKey), fetchOpenOrders(portfolioApiKey, portfolioSecretKey)]);
    setSpotBalance(spot); setFuturesBalance(futures); setFuturesPositions(positions); setOpenOrders(orders);
    setPortfolioLoading(false);
  };

  const executeTrade = async () => {
    if (!portfolioConnected || !tradeQuantity) return;
    const params = { symbol: tradeSymbol, side: tradeSide, type: tradeType, quantity: tradeQuantity };
    if (tradeType === 'LIMIT' && tradePrice) { params.price = tradePrice; params.timeInForce = 'GTC'; }
    const result = await placeOrder(portfolioApiKey, portfolioSecretKey, params, tradeMarket);
    setTradeResult(result);
    if (result.success) { setTradeQuantity(''); setTradePrice(''); refreshPortfolio(); }
  };

  const handleCancelOrder = async (symbol, orderId, market) => { const result = await cancelOrder(portfolioApiKey, portfolioSecretKey, symbol, orderId, market); if (result.success) refreshPortfolio(); };
  const handleClosePosition = async (symbol, positionAmt) => { const result = await closePosition(portfolioApiKey, portfolioSecretKey, symbol, positionAmt); if (result.success) refreshPortfolio(); };

  const tabs = [{ id: 'crypto', label: '₿ Crypto' }, { id: 'structure', label: '📊 Structure' }, { id: 'pulse', label: '⚡ Pulse' }, { id: 'compare', label: '⚖️ Compare' }, { id: 'macro', label: '🏦 Macro' }, { id: 'defi', label: '🦙 DeFi' }, { id: 'derivatives', label: '📊 Deriv' }, { id: 'charts', label: '📈 Charts' }, { id: 'portfolio', label: '💼 Portfolio' }];
  const formatPrice = (p) => { if (!p) return '$--'; if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`; return `$${p.toFixed(2)}`; };
  const formatChange = (c) => { if (c === undefined) return '--'; return c >= 0 ? `+${c.toFixed(1)}%` : `${c.toFixed(1)}%`; };

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} pb-20`}>
      {/* Header */}
      <div className={`${t.card} border-b ${t.border} px-4 py-3 sticky top-0 z-50`}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className={`text-base font-bold ${t.text} m-0`}>Crypto Decision Hub</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { const sections = generateMarketReportPDFContent(cgData, binanceData, defiData, altseasonData, dayScore, swingScore, hodlScore, theme); exportToPDF('Market Report', sections, theme); }} className={`p-2 rounded-lg ${t.bg} border ${t.border} cursor-pointer text-base`} title="Export Market Report">📑</button>
            <button onClick={() => setShowAlertPanel(true)} className={`relative p-2 rounded-lg ${t.bg} border ${t.border} cursor-pointer`}>
              <span className="text-base">🔔</span>
              {alerts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{alerts.length}</span>}
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg ${t.bg} border ${t.border} cursor-pointer text-base`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          </div>
        </div>
        <DataSourcesBadge apiStatus={apiStatus} theme={theme} />
      </div>

      {/* Score Gauges */}
      <div className={`flex justify-between gap-2 px-3 py-3 ${t.card} border-b ${t.border} overflow-hidden`}>
        <MiniScoreGauge score={dayScore} label="Day" icon="🎯" subtitle="godziny-dni" onHelp={() => setHelpModal('dayTradingScore')} theme={theme} />
        <MiniScoreGauge score={swingScore} label="Swing" icon="📊" subtitle="dni-tygodnie" onHelp={() => setHelpModal('swingScore')} theme={theme} />
        <MiniScoreGauge score={hodlScore} label="HODL" icon="🏦" subtitle="tygodnie-mce" onHelp={() => setHelpModal('hodlScore')} theme={theme} />
      </div>

      {/* AI Insight */}
      <AIInsight cgData={cgData} binanceData={binanceData} altseasonData={altseasonData} defiData={defiData} dayScore={dayScore} swingScore={swingScore} hodlScore={hodlScore} theme={theme} onOpenPost={() => setShowPostGenerator(true)} />

      {/* Main Content */}
      <div className="p-3 space-y-3">
        {/* Crypto Tab */}
        {activeTab === 'crypto' && (
          <div className="space-y-3">
            {/* Row 1: BTC, ETH */}
            <div className="grid grid-cols-2 gap-3">
              <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.btcPrice?.change || 0) > 0 ? 'positive' : (cgData?.btcPrice?.change || 0) < 0 ? 'negative' : undefined}>
                <div className={`text-[10px] ${t.muted} mb-1`}>₿ Bitcoin</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.btcPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.btcPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.btcPrice?.change)}</div>
                </>}
              </Card>
              <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.ethPrice?.change || 0) > 0 ? 'positive' : (cgData?.ethPrice?.change || 0) < 0 ? 'negative' : undefined}>
                <div className={`text-[10px] ${t.muted} mb-1`}>Ξ Ethereum</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.ethPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.ethPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.ethPrice?.change)}</div>
                </>}
              </Card>
            </div>
            {/* Row 2: SOL, BNB */}
            <div className="grid grid-cols-2 gap-3">
              <Card helpKey="solPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.solPrice?.change || 0) > 0 ? 'positive' : (cgData?.solPrice?.change || 0) < 0 ? 'negative' : undefined}>
                <div className={`text-[10px] ${t.muted} mb-1`}>◎ Solana</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.solPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.solPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.solPrice?.change)}</div>
                </>}
              </Card>
              <Card helpKey="bnbPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.bnbPrice?.change || 0) > 0 ? 'positive' : (cgData?.bnbPrice?.change || 0) < 0 ? 'negative' : undefined}>
                <div className={`text-[10px] ${t.muted} mb-1`}>🔶 BNB</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.bnbPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.bnbPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.bnbPrice?.change)}</div>
                </>}
              </Card>
            </div>
            {/* Row 3: Fear & Greed, Total Market Cap */}
            <div className="grid grid-cols-2 gap-3">
              <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.fearGreed?.value || 50) < 30 ? 'positive' : (cgData?.fearGreed?.value || 50) > 70 ? 'negative' : 'warning'}>
                <div className={`text-[10px] ${t.muted} mb-1`}>😱 Fear & Greed</div>
                {loading ? <SkeletonLoader width="w-16" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{cgData?.fearGreed?.value || '--'}</div>
                  <div className={`text-xs ${t.muted}`}>{cgData?.fearGreed?.text || '--'}</div>
                </>}
              </Card>
              <Card helpKey="totalMarketCap" onHelp={setHelpModal} theme={theme} isLive signalColor={parseFloat(cgData?.totalMarketCap?.value || 0) > 3.5 ? 'positive' : parseFloat(cgData?.totalMarketCap?.value || 0) < 2.5 ? 'negative' : 'warning'}>
                <div className={`text-[10px] ${t.muted} mb-1`}>🌍 Total Market Cap</div>
                {loading ? <SkeletonLoader width="w-20" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${parseFloat(cgData?.totalMarketCap?.value || 0) > 3.5 ? 'text-green-500' : parseFloat(cgData?.totalMarketCap?.value || 0) < 2.5 ? 'text-red-500' : 'text-yellow-500'}`}>${cgData?.totalMarketCap?.value || '--'}T</div>
                  <div className={`text-xs ${t.muted}`}>Vol: ${cgData?.totalVolume?.value || '--'}B</div>
                </>}
              </Card>
            </div>
          </div>
        )}

        {/* Structure Tab */}
        {activeTab === 'structure' && (
          <div className="space-y-3">
            <Card helpKey="altseasonIndex" onHelp={setHelpModal} theme={theme} isLive signalColor={(altseasonData?.altseasonIndex || 50) > 55 ? 'positive' : (altseasonData?.altseasonIndex || 50) < 45 ? 'negative' : 'warning'}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>🌊 Altseason Indicators</div>
              {loading ? <SkeletonLoader width="w-full" height="h-20" theme={theme} /> : (
                <div className="grid grid-cols-2 gap-2">
                  <div onClick={() => setHelpModal('altseasonIndex')} className={`p-2.5 ${t.bg} rounded-lg border-l-4 cursor-pointer hover:opacity-80 ${(altseasonData?.altseasonIndex || 0) > 60 ? 'border-l-green-500' : (altseasonData?.altseasonIndex || 0) < 40 ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
                    <div className={`text-[9px] ${t.muted}`}>Altseason Index</div>
                    <div className={`text-xl font-bold ${(altseasonData?.altseasonIndex || 0) > 60 ? 'text-green-500' : (altseasonData?.altseasonIndex || 0) < 40 ? 'text-red-500' : 'text-yellow-500'}`}>{altseasonData?.altseasonIndex || '--'}</div>
                  </div>
                  <div onClick={() => setHelpModal('ethBtcRatio')} className={`p-2.5 ${t.bg} rounded-lg border-l-4 cursor-pointer hover:opacity-80 ${(altseasonData?.ethBtcRatio || 0) > 0.05 ? 'border-l-green-500' : (altseasonData?.ethBtcRatio || 0) < 0.035 ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
                    <div className={`text-[9px] ${t.muted}`}>ETH/BTC</div>
                    <div className={`text-xl font-bold ${(altseasonData?.ethBtcRatio || 0) > 0.05 ? 'text-green-500' : (altseasonData?.ethBtcRatio || 0) < 0.035 ? 'text-red-500' : 'text-yellow-500'}`}>{altseasonData?.ethBtcRatio ? altseasonData.ethBtcRatio.toFixed(5) : '--'}</div>
                  </div>
                  <div onClick={() => setHelpModal('total2')} className={`p-2.5 ${t.bg} rounded-lg border-l-4 cursor-pointer hover:opacity-80 border-l-blue-500`}>
                    <div className={`text-[9px] ${t.muted}`}>Total2</div>
                    <div className={`text-xl font-bold text-blue-400`}>${altseasonData?.total2Cap ? altseasonData.total2Cap.toFixed(2) : '--'}T</div>
                  </div>
                  <div onClick={() => setHelpModal('btcDominance')} className={`p-2.5 ${t.bg} rounded-lg border-l-4 cursor-pointer hover:opacity-80 ${(altseasonData?.btcDominance || 50) > 55 ? 'border-l-red-500' : (altseasonData?.btcDominance || 50) < 45 ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
                    <div className={`text-[9px] ${t.muted}`}>BTC Dom</div>
                    <div className={`text-xl font-bold ${(altseasonData?.btcDominance || 50) > 55 ? 'text-red-500' : (altseasonData?.btcDominance || 50) < 45 ? 'text-green-500' : 'text-yellow-500'}`}>{altseasonData?.btcDominance ? altseasonData.btcDominance.toFixed(2) : '--'}%</div>
                  </div>
                </div>
              )}
            </Card>
            <EthBtcHistoryChart data={ethBtcHistory} timeframe={ethBtcTimeframe} onTimeframeChange={setEthBtcTimeframe} loading={ethBtcLoading} onHelp={() => setHelpModal('ethBtcHistory')} theme={theme} />
            <Card helpKey="stablecoinFlows" onHelp={setHelpModal} theme={theme} isLive signalColor={(parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) + parseFloat(defiData?.stablecoinSupply?.usdcChange || 0)) > 0 ? 'positive' : (parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) + parseFloat(defiData?.stablecoinSupply?.usdcChange || 0)) < 0 ? 'negative' : undefined}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>💵 Stablecoin Flows</div>
              {loading ? <SkeletonLoader width="w-full" height="h-16" theme={theme} /> : (
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <div className="flex justify-between items-center"><span className={`text-[9px] ${t.muted}`}>USDT</span><span className={`text-[9px] font-semibold ${parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{parseFloat(defiData?.stablecoinSupply?.usdtChange || 0) >= 0 ? '+' : ''}{defiData?.stablecoinSupply?.usdtChange || '--'}%</span></div>
                    <div className={`text-base font-bold ${t.text}`}>${defiData?.stablecoinSupply?.usdt || '--'}B</div>
                  </div>
                  <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${parseFloat(defiData?.stablecoinSupply?.usdcChange || 0) >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <div className="flex justify-between items-center"><span className={`text-[9px] ${t.muted}`}>USDC</span><span className={`text-[9px] font-semibold ${parseFloat(defiData?.stablecoinSupply?.usdcChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{parseFloat(defiData?.stablecoinSupply?.usdcChange || 0) >= 0 ? '+' : ''}{defiData?.stablecoinSupply?.usdcChange || '--'}%</span></div>
                    <div className={`text-base font-bold ${t.text}`}>${defiData?.stablecoinSupply?.usdc || '--'}B</div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Pulse Tab - Top Movers */}
        {activeTab === 'pulse' && (
          <div className="space-y-3">
            <SectorAnalysis topGainers={msData?.topGainers} theme={theme} />
            <Card helpKey="topGainers" onHelp={setHelpModal} theme={theme} isLive signalColor="positive">
              <div className="flex justify-between items-center mb-3">
                <div className={`text-xs font-semibold ${t.text}`}>🚀 Top Gainers 24h</div>
                <button onClick={() => setShowAllGainers(!showAllGainers)} className={`text-[9px] ${t.muted} bg-transparent border-none cursor-pointer hover:text-blue-500`}>{showAllGainers ? 'Mniej' : 'Więcej'}</button>
              </div>
              {loading ? <SkeletonLoader width="w-full" height="h-24" theme={theme} /> : (
                <div className="space-y-2">
                  {msData?.topGainers?.length > 0 ? (showAllGainers ? msData?.topGainers : msData?.topGainers?.slice(0, 5))?.map((coin, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                      <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{coin.name?.replace('USDT', '')}</span></div>
                      <span className="text-xs font-bold text-green-500">+{coin.change24h?.toFixed(2)}%</span>
                    </div>
                  )) : <div className={`text-center py-4 ${t.muted} text-xs`}>Ładowanie danych...</div>}
                </div>
              )}
            </Card>
            <Card helpKey="topLosers" onHelp={setHelpModal} theme={theme} isLive signalColor="negative">
              <div className="flex justify-between items-center mb-3">
                <div className={`text-xs font-semibold ${t.text}`}>📉 Top Losers 24h</div>
                <button onClick={() => setShowAllLosers(!showAllLosers)} className={`text-[9px] ${t.muted} bg-transparent border-none cursor-pointer hover:text-blue-500`}>{showAllLosers ? 'Mniej' : 'Więcej'}</button>
              </div>
              {loading ? <SkeletonLoader width="w-full" height="h-24" theme={theme} /> : (
                <div className="space-y-2">
                  {msData?.topLosers?.length > 0 ? (showAllLosers ? msData?.topLosers : msData?.topLosers?.slice(0, 5))?.map((coin, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                      <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{coin.name?.replace('USDT', '')}</span></div>
                      <span className="text-xs font-bold text-red-500">{coin.change24h?.toFixed(2)}%</span>
                    </div>
                  )) : <div className={`text-center py-4 ${t.muted} text-xs`}>Ładowanie danych...</div>}
                </div>
              )}
            </Card>
            <Card helpKey="marketBreadth" onHelp={setHelpModal} theme={theme} isLive signalColor={parseFloat(msData?.breadth?.bullishPercent || 50) > 50 ? 'positive' : parseFloat(msData?.breadth?.bullishPercent || 50) < 50 ? 'negative' : 'warning'}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>📊 Market Breadth</div>
              {loading ? <SkeletonLoader width="w-full" height="h-16" theme={theme} /> : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className={`p-2 ${t.bg} rounded-lg`}><div className="text-lg font-bold text-green-500">{msData?.breadth?.gainers || '--'}</div><div className={`text-[9px] ${t.muted}`}>Rosnące</div></div>
                  <div className={`p-2 ${t.bg} rounded-lg`}><div className="text-lg font-bold text-red-500">{msData?.breadth?.losers || '--'}</div><div className={`text-[9px] ${t.muted}`}>Spadające</div></div>
                  <div className={`p-2 ${t.bg} rounded-lg`}><div className={`text-lg font-bold ${parseFloat(msData?.breadth?.bullishPercent) > 50 ? 'text-green-500' : 'text-red-500'}`}>{msData?.breadth?.bullishPercent || '--'}%</div><div className={`text-[9px] ${t.muted}`}>Bullish</div></div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Compare Tab */}
        {activeTab === 'compare' && (
          <ComparisonMode theme={theme} onHelp={setHelpModal} />
        )}

        {/* Macro Tab */}
        {activeTab === 'macro' && (
          <div className="space-y-3">
            <Card helpKey="m2Supply" onHelp={setHelpModal} theme={theme} isLive signalColor={fredData?.m2Supply?.trend === 'expanding' ? 'positive' : 'negative'}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>🏦 M2 Money Supply</div>
              {loading ? <SkeletonLoader width="w-32" height="h-8" theme={theme} /> : <>
                <div className={`text-2xl font-bold ${t.text}`}>${fredData?.m2Supply?.value || '--'}T</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold ${(fredData?.m2Supply?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fredData?.m2Supply?.change >= 0 ? '+' : ''}{fredData?.m2Supply?.change || '--'}% YoY</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded ${fredData?.m2Supply?.trend === 'expanding' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{fredData?.m2Supply?.trend === 'expanding' ? '📈 Ekspansja' : '📉 Kontrakcja'}</span>
                </div>
              </>}
            </Card>

            {/* DXY - Dollar Index */}
            <Card helpKey="dxy" onHelp={setHelpModal} theme={theme} isLive signalColor={(polygonData?.dxy?.change || 0) < 0 ? 'positive' : (polygonData?.dxy?.change || 0) > 0.5 ? 'negative' : undefined}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>💵 DXY (Dollar Index)</div>
              {loading ? <SkeletonLoader width="w-24" height="h-8" theme={theme} /> : <>
                <div className={`text-2xl font-bold ${t.text}`}>{polygonData?.dxy?.value?.toFixed(2) || '--'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold ${(polygonData?.dxy?.change || 0) <= 0 ? 'text-green-500' : 'text-red-500'}`}>{polygonData?.dxy?.change >= 0 ? '+' : ''}{polygonData?.dxy?.change?.toFixed(2) || '--'}%</span>
                  <span className={`text-[9px] ${t.muted}`}>DXY ↓ = Crypto ↑</span>
                </div>
              </>}
            </Card>

            {/* S&P 500 & VIX Row */}
            <div className="grid grid-cols-2 gap-3">
              <Card theme={theme} isLive signalColor={(polygonData?.sp500?.change || 0) > 0 ? 'positive' : 'negative'}>
                <div className={`text-xs font-semibold mb-2 ${t.text}`}>📈 S&P 500</div>
                {loading ? <SkeletonLoader width="w-20" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{polygonData?.sp500?.value?.toLocaleString('en-US', {maximumFractionDigits: 0}) || '--'}</div>
                  <span className={`text-[11px] font-semibold ${(polygonData?.sp500?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{polygonData?.sp500?.change >= 0 ? '+' : ''}{polygonData?.sp500?.change?.toFixed(2) || '--'}%</span>
                </>}
              </Card>
              <Card theme={theme} isLive signalColor={(polygonData?.vix?.value || 0) < 20 ? 'positive' : (polygonData?.vix?.value || 0) > 25 ? 'negative' : undefined}>
                <div className={`text-xs font-semibold mb-2 ${t.text}`}>😱 VIX (Fear)</div>
                {loading ? <SkeletonLoader width="w-16" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{polygonData?.vix?.value?.toFixed(1) || '--'}</div>
                  <span className={`text-[11px] font-semibold ${(polygonData?.vix?.change || 0) <= 0 ? 'text-green-500' : 'text-red-500'}`}>{polygonData?.vix?.change >= 0 ? '+' : ''}{polygonData?.vix?.change?.toFixed(2) || '--'}%</span>
                </>}
              </Card>
            </div>

            {/* Gold & Silver Row */}
            <div className="grid grid-cols-2 gap-3">
              <Card theme={theme} isLive signalColor={(polygonData?.gold?.change || 0) > 0 ? 'positive' : 'negative'}>
                <div className={`text-xs font-semibold mb-2 ${t.text}`}>🥇 Gold</div>
                {loading ? <SkeletonLoader width="w-20" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>${polygonData?.gold?.value?.toLocaleString('en-US', {maximumFractionDigits: 0}) || '--'}</div>
                  <span className={`text-[11px] font-semibold ${(polygonData?.gold?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{polygonData?.gold?.change >= 0 ? '+' : ''}{polygonData?.gold?.change?.toFixed(2) || '--'}%</span>
                </>}
              </Card>
              <Card theme={theme} isLive signalColor={(polygonData?.silver?.change || 0) > 0 ? 'positive' : 'negative'}>
                <div className={`text-xs font-semibold mb-2 ${t.text}`}>🥈 Silver</div>
                {loading ? <SkeletonLoader width="w-16" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>${polygonData?.silver?.value?.toFixed(2) || '--'}</div>
                  <span className={`text-[11px] font-semibold ${(polygonData?.silver?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{polygonData?.silver?.change >= 0 ? '+' : ''}{polygonData?.silver?.change?.toFixed(2) || '--'}%</span>
                </>}
              </Card>
            </div>

            {/* Gold/Silver Ratio */}
            <div className={`p-3 ${t.bg} rounded-lg flex justify-between items-center`}>
              <span className={`text-[11px] ${t.muted}`}>📊 Gold/Silver Ratio</span>
              <span className={`text-sm font-bold ${t.text}`}>{polygonData?.gold?.value && polygonData?.silver?.value ? (polygonData.gold.value / polygonData.silver.value).toFixed(1) : '--'}x</span>
            </div>

            {/* Macro Insight */}
            <div className={`p-4 ${t.card} rounded-xl border ${t.border}`}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>🔍 Macro Insight</div>
              <div className={`text-[11px] ${t.muted} leading-relaxed space-y-1.5`}>
                <p>• <strong>DXY {(polygonData?.dxy?.value || 104).toFixed(1)}</strong>: {
                  (polygonData?.dxy?.value || 104) < 101 ? '🟢 Bardzo słaby dolar - idealne dla crypto' :
                  (polygonData?.dxy?.value || 104) < 103 ? '🟢 Korzystne warunki dla ryzykownych aktywów' :
                  (polygonData?.dxy?.value || 104) < 105 ? '🟡 Neutralny - obserwuj kierunek' :
                  '🔴 Silny dolar - presja na crypto'
                }</p>
                <p>• <strong>VIX {(polygonData?.vix?.value || 15).toFixed(1)}</strong>: {
                  (polygonData?.vix?.value || 15) < 14 ? '🟢 Bardzo niski strach - risk-on mode' :
                  (polygonData?.vix?.value || 15) < 20 ? '🟢 Normalny - sprzyjające warunki' :
                  (polygonData?.vix?.value || 15) < 25 ? '🟡 Podwyższony - ostrożność wskazana' :
                  (polygonData?.vix?.value || 15) < 30 ? '🟠 Wysoki strach - risk-off' :
                  '🔴 Panika na rynkach - potencjalne dno'
                }</p>
                <p>• <strong>S&P 500 {(polygonData?.sp500?.change || 0) >= 0 ? '+' : ''}{(polygonData?.sp500?.change || 0).toFixed(2)}%</strong>: {
                  (polygonData?.sp500?.change || 0) > 1 ? '🟢 Silny risk-on - korelacja z BTC' :
                  (polygonData?.sp500?.change || 0) > 0 ? '🟢 Pozytywny sentyment' :
                  (polygonData?.sp500?.change || 0) > -1 ? '🟡 Lekka korekta' :
                  '🔴 Risk-off - możliwa presja na crypto'
                }</p>
                <p>• <strong>Gold/Silver {polygonData?.gold?.value && polygonData?.silver?.value ? (polygonData.gold.value / polygonData.silver.value).toFixed(1) : '--'}x</strong>: {
                  polygonData?.gold?.value && polygonData?.silver?.value ? (
                    (polygonData.gold.value / polygonData.silver.value) > 90 ? '🟢 Srebro tanie - historycznie dobry moment' :
                    (polygonData.gold.value / polygonData.silver.value) > 80 ? '🟡 Normalny zakres' :
                    (polygonData.gold.value / polygonData.silver.value) > 70 ? '🟡 Srebro drożeje względem złota' :
                    '🟠 Srebro drogie - ostrożność'
                  ) : '—'
                }</p>
                <p>• <strong>M2</strong>: {fredData?.m2Supply?.trend === 'expanding' ? '🟢 Ekspansja monetarna - więcej płynności' : '🔴 Kontrakcja - mniej kapitału na rynkach'}</p>
              </div>
              
              {/* Overall Macro Score */}
              <div className={`mt-3 pt-3 border-t ${t.border}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-semibold ${t.muted}`}>OGÓLNA OCENA MAKRO</span>
                  <span className={`text-sm font-bold ${
                    (() => {
                      let score = 0;
                      if ((polygonData?.dxy?.value || 104) < 103) score++;
                      if ((polygonData?.dxy?.value || 104) < 101) score++;
                      if ((polygonData?.vix?.value || 15) < 20) score++;
                      if ((polygonData?.vix?.value || 15) < 14) score++;
                      if ((polygonData?.sp500?.change || 0) > 0) score++;
                      if (fredData?.m2Supply?.trend === 'expanding') score++;
                      if ((polygonData?.vix?.value || 15) > 25) score--;
                      if ((polygonData?.dxy?.value || 104) > 105) score--;
                      return score >= 4 ? 'text-green-500' : score >= 2 ? 'text-yellow-500' : score >= 0 ? 'text-orange-500' : 'text-red-500';
                    })()
                  }`}>{
                    (() => {
                      let score = 0;
                      if ((polygonData?.dxy?.value || 104) < 103) score++;
                      if ((polygonData?.dxy?.value || 104) < 101) score++;
                      if ((polygonData?.vix?.value || 15) < 20) score++;
                      if ((polygonData?.vix?.value || 15) < 14) score++;
                      if ((polygonData?.sp500?.change || 0) > 0) score++;
                      if (fredData?.m2Supply?.trend === 'expanding') score++;
                      if ((polygonData?.vix?.value || 15) > 25) score--;
                      if ((polygonData?.dxy?.value || 104) > 105) score--;
                      return score >= 4 ? '🟢 BULLISH' : score >= 2 ? '🟡 NEUTRALNY' : score >= 0 ? '🟠 OSTROŻNIE' : '🔴 BEARISH';
                    })()
                  }</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DeFi Tab */}
        {activeTab === 'defi' && (
          <div className="space-y-3">
            <Card helpKey="tvl" onHelp={setHelpModal} theme={theme} isLive signalColor={(defiData?.tvl?.change || 0) > 0 ? 'positive' : (defiData?.tvl?.change || 0) < 0 ? 'negative' : undefined}>
              <div className={`text-xs font-semibold mb-2 ${t.text}`}>🔒 Total Value Locked</div>
              {loading ? <SkeletonLoader width="w-24" height="h-8" theme={theme} /> : <>
                <div className={`text-2xl font-bold ${t.text}`}>${defiData?.tvl?.value || '--'}B</div>
                <div className={`text-xs font-semibold ${(defiData?.tvl?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{defiData?.tvl?.change >= 0 ? '+' : ''}{defiData?.tvl?.change || '--'}% 7d</div>
              </>}
            </Card>
            <Card helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme} isLive signalColor={(defiData?.stablecoinSupply?.change || 0) > 0 ? 'positive' : (defiData?.stablecoinSupply?.change || 0) < 0 ? 'negative' : undefined}>
              <div className={`text-xs font-semibold mb-2 ${t.text}`}>💵 Stablecoin Supply</div>
              {loading ? <SkeletonLoader width="w-24" height="h-8" theme={theme} /> : <>
                <div className={`text-2xl font-bold ${t.text}`}>${defiData?.stablecoinSupply?.value || '--'}B</div>
                <div className={`text-xs font-semibold ${(defiData?.stablecoinSupply?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{defiData?.stablecoinSupply?.change >= 0 ? '+' : ''}{defiData?.stablecoinSupply?.change || '--'}% 30d</div>
              </>}
            </Card>
            <Card theme={theme}>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>🏆 Top 5 Protocols</div>
              {loading ? <SkeletonLoader width="w-full" height="h-32" theme={theme} /> : (
                <div className="space-y-2">
                  {defiData?.topProtocols?.map((p, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                      <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted}`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{p.name}</span></div>
                      <div className="text-right">
                        <div className={`text-xs font-bold ${t.text}`}>${(p.tvl / 1e9).toFixed(2)}B</div>
                        <div className={`text-[9px] ${p.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.change >= 0 ? '+' : ''}{p.change?.toFixed(1)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Derivatives Tab */}
        {activeTab === 'derivatives' && (
          <div className="space-y-3">
            <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme} isLive signalColor={(binanceData?.fundingRate?.value || 0) < 0 ? 'positive' : (binanceData?.fundingRate?.value || 0) > 0 ? 'negative' : undefined}>
              <div className={`text-xs font-semibold mb-2 ${t.text}`}>💰 BTC Funding Rate</div>
              {loading ? <SkeletonLoader width="w-24" height="h-8" theme={theme} /> : <>
                <div className={`text-2xl font-bold ${(binanceData?.fundingRate?.value || 0) < 0 ? 'text-green-500' : (binanceData?.fundingRate?.value || 0) > 0.03 ? 'text-red-500' : t.text}`}>{binanceData?.fundingRate?.value || '--'}%</div>
                <div className={`text-[10px] ${t.muted}`}>8h • Ann: {((binanceData?.fundingRate?.value || 0) * 3 * 365).toFixed(1)}%</div>
              </>}
            </Card>
            <Card helpKey="openInterest" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-xs font-semibold mb-2 ${t.text}`}>📊 BTC Open Interest</div>
              {loading ? <SkeletonLoader width="w-24" height="h-8" theme={theme} /> : <div className={`text-2xl font-bold ${t.text}`}>${binanceData?.openInterest?.value || '--'}B</div>}
            </Card>
            <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme} isLive signalColor={(binanceData?.longShortRatio?.value || 1) < 1 ? 'positive' : (binanceData?.longShortRatio?.value || 1) > 1 ? 'negative' : undefined}>
              <div className={`text-xs font-semibold mb-2 ${t.text}`}>⚖️ Long/Short Ratio</div>
              {loading ? <SkeletonLoader width="w-16" height="h-8" theme={theme} /> : <>
                <div className={`text-2xl font-bold ${t.text}`}>{binanceData?.longShortRatio?.value || '--'}</div>
                <div className={`text-[10px] ${t.muted}`}>{(binanceData?.longShortRatio?.value || 1) > 1 ? 'Więcej Longów' : 'Więcej Shortów'}</div>
              </>}
            </Card>
            <PositionCalculator theme={theme} onHelp={() => setHelpModal('positionCalculator')} />
          </div>
        )}

        {/* Charts Tab */}
        {activeTab === 'charts' && (
          <div className="space-y-3">
            <Card theme={theme}>
              <div className="flex flex-wrap gap-2 mb-3">
                {[{ s: 'BINANCE:BTCUSDT', l: 'BTC' }, { s: 'BINANCE:ETHUSDT', l: 'ETH' }, { s: 'BINANCE:SOLUSDT', l: 'SOL' }, { s: 'CRYPTOCAP:TOTAL', l: 'Total' }, { s: 'CRYPTOCAP:BTC.D', l: 'BTC.D' }].map(x => (
                  <button key={x.s} onClick={() => setTvSymbol(x.s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${tvSymbol === x.s ? 'bg-blue-500 text-white' : `${t.bg} ${t.muted} border ${t.border}`}`}>{x.l}</button>
                ))}
              </div>
              <div className="flex gap-2 mb-3">
                {['chart', 'analysis', 'both'].map(v => (
                  <button key={v} onClick={() => setChartView(v)} className={`flex-1 py-2 rounded-lg text-[10px] font-semibold cursor-pointer ${chartView === v ? 'bg-blue-500 text-white' : `${t.bg} ${t.muted} border ${t.border}`}`}>{v === 'chart' ? '📈' : v === 'analysis' ? '📊' : '📈📊'} {v}</button>
                ))}
              </div>
              {(chartView === 'analysis' || chartView === 'both') && (
                <div className="flex gap-1 mb-3">
                  {[{ label: '15m', val: '15' }, { label: '1h', val: '60' }, { label: '4h', val: '240' }, { label: '1D', val: '1D' }, { label: '1W', val: '1W' }].map(i => (
                    <button key={i.val} onClick={() => setTaInterval(i.val)} className={`flex-1 py-1.5 rounded text-[9px] font-semibold cursor-pointer ${taInterval === i.val ? 'bg-blue-500/20 text-blue-500 border-2 border-blue-500' : `${t.bg} ${t.muted} border ${t.border}`}`}>{i.label}</button>
                  ))}
                </div>
              )}
            </Card>
            {(chartView === 'chart' || chartView === 'both') && <Card theme={theme}><TradingViewChart symbol={tvSymbol} theme={theme} /></Card>}
            {(chartView === 'analysis' || chartView === 'both') && <Card theme={theme}><TradingViewTechnicalAnalysis symbol={tvSymbol} interval={taInterval} theme={theme} /></Card>}
          </div>
        )}

        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <div className="space-y-3">
            {!portfolioConnected ? (
              <Card helpKey="portfolio" onHelp={setHelpModal} theme={theme}>
                <div className={`text-xs font-semibold mb-3 ${t.text}`}>🔐 Połącz z Binance</div>
                <div className={`p-3 ${t.bg} rounded-lg mb-3`}>
                  <div className={`text-[10px] ${t.muted} mb-2`}>⚠️ Read Only + Trading</div>
                  <div className="text-[9px] text-red-500">❌ NIGDY Withdrawals!</div>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <input type={showApiKeys ? 'text' : 'password'} placeholder="API Key" value={portfolioApiKey} onChange={e => setPortfolioApiKey(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border ${t.input} text-xs pr-10`} />
                    <button onClick={() => setShowApiKeys(!showApiKeys)} className={`absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none ${t.muted} cursor-pointer`}>{showApiKeys ? '👁️' : '👁️‍🗨️'}</button>
                  </div>
                  <input type={showApiKeys ? 'text' : 'password'} placeholder="Secret Key" value={portfolioSecretKey} onChange={e => setPortfolioSecretKey(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border ${t.input} text-xs`} />
                  {portfolioError && <div className="p-2 bg-red-500/20 text-red-500 text-xs rounded-lg">{portfolioError}</div>}
                  <button onClick={connectPortfolio} disabled={portfolioLoading} className="w-full py-3 rounded-lg border-none bg-blue-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{portfolioLoading ? '⏳...' : '🔗 Połącz'}</button>
                </div>
              </Card>
            ) : (
              <>
                <div className="flex gap-2">
                  <button onClick={refreshPortfolio} disabled={portfolioLoading} className={`flex-1 py-2.5 rounded-lg border ${t.border} ${t.bg} ${t.text} text-xs font-semibold cursor-pointer disabled:opacity-50`}>{portfolioLoading ? '⏳' : '🔄'} Odśwież</button>
                  <button onClick={disconnectPortfolio} className="py-2.5 px-4 rounded-lg border-none bg-red-500/20 text-red-500 text-xs font-semibold cursor-pointer">🔌</button>
                </div>
                {spotBalance && (
                  <Card theme={theme}>
                    <div className={`text-xs font-semibold mb-3 ${t.text}`}>💰 Spot</div>
                    <div className="space-y-2">
                      {spotBalance.balances?.slice(0, 10).map((b, i) => (
                        <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                          <span className={`text-xs font-semibold ${t.text}`}>{b.asset}</span>
                          <div className="text-right">
                            <div className={`text-xs font-bold ${t.text}`}>{b.total.toFixed(6)}</div>
                            {b.locked > 0 && <div className={`text-[9px] ${t.muted}`}>Locked: {b.locked.toFixed(6)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {futuresPositions?.positions?.length > 0 && (
                  <Card theme={theme}>
                    <div className={`text-xs font-semibold mb-3 ${t.text}`}>📈 Pozycje</div>
                    <div className="space-y-2">
                      {futuresPositions.positions.map((p, i) => (
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
                      ))}
                    </div>
                  </Card>
                )}
                <Card theme={theme}>
                  <div className={`text-xs font-semibold mb-3 ${t.text}`}>⚡ Quick Trade</div>
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      <select value={tradeSymbol} onChange={e => setTradeSymbol(e.target.value)} className={`flex-[2] px-2 py-2 rounded-lg border ${t.input} text-[11px]`}>
                        <option value="BTCUSDT">BTC/USDT</option><option value="ETHUSDT">ETH/USDT</option><option value="SOLUSDT">SOL/USDT</option>
                      </select>
                      <select value={tradeMarket} onChange={e => setTradeMarket(e.target.value)} className={`flex-1 px-2 py-2 rounded-lg border ${t.input} text-[11px]`}>
                        <option value="SPOT">Spot</option><option value="FUTURES">Futures</option>
                      </select>
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
                    {tradeResult && <div className={`p-2 rounded-lg text-[11px] ${tradeResult.success ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{tradeResult.success ? `✅ ID: ${tradeResult.order.orderId}` : `❌ ${tradeResult.error}`}</div>}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className={`fixed bottom-0 left-0 right-0 ${t.card} border-t ${t.border} z-50 px-1 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]`}>
        <div className="flex overflow-x-auto gap-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border-none min-w-[48px] flex-shrink-0 cursor-pointer ${activeTab === tab.id ? 'bg-blue-500/20 text-blue-500' : `bg-transparent ${t.muted}`}`}>
              <span className="text-base">{tab.label.split(' ')[0]}</span>
              <span className="text-[8px] font-semibold whitespace-nowrap">{tab.label.split(' ')[1] || ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
      {showAlertPanel && <AlertPanel alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onClose={() => setShowAlertPanel(false)} theme={theme} />}
      {showPostGenerator && <BinancePostGenerator cgData={cgData} binanceData={binanceData} defiData={defiData} altseasonData={altseasonData} dayScore={dayScore} swingScore={swingScore} hodlScore={hodlScore} theme={theme} onClose={() => setShowPostGenerator(false)} />}
      {activeToast && <AlertToast alert={activeToast} onClose={() => setActiveToast(null)} theme={theme} />}
      
      {/* PWA Components */}
      <OfflineIndicator theme={theme} />
      {showPWAInstall && <PWAInstallBanner theme={theme} onDismiss={() => setShowPWAInstall(false)} />}
      {showPWAUpdate && <PWAUpdateBanner theme={theme} onUpdate={() => window.location.reload()} onDismiss={() => setShowPWAUpdate(false)} />}
    </div>
  );
}

export default App;
