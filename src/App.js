import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

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

const cancelOrder = async (apiKey, secretKey, symbol, orderId, market = 'SPOT') => {
  try {
    const timestamp = Date.now();
    const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = await generateSignature(params, secretKey);
    const baseUrl = market === 'FUTURES' ? 'https://fapi.binance.com/fapi/v1/order' : 'https://api.binance.com/api/v3/order';
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, { method: 'DELETE', headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Cancel failed');
    return { success: true, order: data };
  } catch (error) { return { success: false, error: error.message }; }
};

const closeFuturesPosition = async (apiKey, secretKey, symbol, positionAmt) => {
  const side = positionAmt > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(positionAmt);
  return await placeFuturesOrder(apiKey, secretKey, symbol, side, 'MARKET', quantity, null, true);
};

// ============== PUBLIC API FUNCTIONS ==============
const fetchCoinGeckoData = async () => {
  try {
    const [pricesRes, globalRes, fearGreedRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'),
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.alternative.me/fng/?limit=1')
    ]);
    const prices = await pricesRes.json();
    const global = await globalRes.json();
    const fearGreed = await fearGreedRes.json();
    return {
      btcPrice: { value: Math.round(prices.bitcoin.usd), change: parseFloat(prices.bitcoin.usd_24h_change?.toFixed(2)) || 0 },
      ethPrice: { value: Math.round(prices.ethereum.usd), change: parseFloat(prices.ethereum.usd_24h_change?.toFixed(2)) || 0 },
      solPrice: { value: parseFloat(prices.solana.usd.toFixed(2)), change: parseFloat(prices.solana.usd_24h_change?.toFixed(2)) || 0 },
      btcDominance: { value: parseFloat(global.data.market_cap_percentage.btc.toFixed(1)), change: 0 },
      totalMarketCap: global.data.total_market_cap.usd,
      volume24h: parseFloat((global.data.total_volume.usd / 1e9).toFixed(1)),
      fearGreed: { value: parseInt(fearGreed.data[0].value), label: fearGreed.data[0].value_classification }
    };
  } catch (error) { return null; }
};

const fetchBinanceData = async () => {
  try {
    const [fundingRes, oiRes, longShortRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1')
    ]);
    const funding = await fundingRes.json();
    const oi = await oiRes.json();
    const longShort = await longShortRes.json();
    const fundingRate = parseFloat(funding.lastFundingRate) * 100;
    const oiValue = parseFloat(oi.openInterest);
    const lsRatio = parseFloat(longShort[0]?.longShortRatio || 1);
    return {
      fundingRate: { value: parseFloat(fundingRate.toFixed(4)), sentiment: fundingRate > 0.05 ? 'overleveraged' : fundingRate < -0.01 ? 'bearish' : 'neutral' },
      openInterest: { value: parseFloat((oiValue * 95000 / 1e9).toFixed(2)), change: 0 },
      longShortRatio: { value: parseFloat(lsRatio.toFixed(2)) }
    };
  } catch (error) { return null; }
};

const fetchDefiLlamaData = async () => {
  try {
    const [tvlRes, stableRes, protocolsRes] = await Promise.all([
      fetch('https://api.llama.fi/v2/historicalChainTvl'),
      fetch('https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1'),
      fetch('https://api.llama.fi/protocols')
    ]);
    const tvlData = await tvlRes.json();
    const stableData = await stableRes.json();
    const protocols = await protocolsRes.json();
    const latestTvl = tvlData[tvlData.length - 1]?.tvl || 0;
    const prevTvl = tvlData[tvlData.length - 8]?.tvl || latestTvl;
    const tvlChange = ((latestTvl - prevTvl) / prevTvl * 100).toFixed(1);
    const latestStable = stableData[stableData.length - 1]?.totalCirculating?.peggedUSD || 0;
    const prevStable = stableData[stableData.length - 31]?.totalCirculating?.peggedUSD || latestStable;
    const stableChange = ((latestStable - prevStable) / prevStable * 100).toFixed(1);
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

// ============== TRADINGVIEW WIDGETS ==============
const TradingViewChart = ({ symbol = 'BINANCE:BTCUSDT', theme = 'dark' }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.innerHTML = JSON.stringify({ autosize: true, symbol, interval: 'D', timezone: 'Europe/Warsaw', theme, style: '1', locale: 'pl', allow_symbol_change: true, studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'] });
      containerRef.current.appendChild(script);
    }
  }, [symbol, theme]);
  return <div ref={containerRef} style={{ height: '400px', width: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
};

const TradingViewTechnicalAnalysis = ({ symbol = 'BINANCE:BTCUSDT', theme = 'dark', interval = '1D' }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
      script.async = true;
      script.innerHTML = JSON.stringify({ interval, width: '100%', isTransparent: true, height: '450', symbol, showIntervalTabs: true, displayMode: 'single', locale: 'pl', colorTheme: theme });
      containerRef.current.appendChild(script);
    }
  }, [symbol, theme, interval]);
  return <div ref={containerRef} style={{ height: '450px', width: '100%' }} />;
};

// ============== HELP CONTENT ==============
const helpContent = {
  dayTradingScore: { title: '🎯 Day Trading Score', emoji: '🎯', description: 'Wskaźnik dla aktywnych traderów. Horyzont: godziny do dni.', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD' }, { condition: '30-44', signal: 'warning', text: '🟠 OSTROŻNIE' }, { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ' }], tip: 'Składowe: Fear & Greed, Funding Rate, Momentum BTC, Long/Short Ratio.', source: 'CoinGecko, Binance' },
  swingScore: { title: '📊 Swing Score', emoji: '📊', description: 'Wskaźnik dla swing traderów. Horyzont: tygodnie.', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD' }, { condition: '30-44', signal: 'warning', text: '🟠 OSTROŻNIE' }, { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ' }], tip: 'Składowe: TVL trend, BTC Dominance, Stablecoin inflows.', source: 'DefiLlama, CoinGecko' },
  hodlScore: { title: '🏦 HODL Score', emoji: '🏦', description: 'Wskaźnik dla długoterminowych inwestorów. Horyzont: miesiące.', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 AKUMULUJ' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD' }, { condition: '30-44', signal: 'warning', text: '🟠 OSTROŻNIE' }, { condition: '0-29', signal: 'bearish', text: '🔴 REDUKUJ' }], tip: 'Składowe: M2 Money Supply, Stablecoin supply, TVL, F&G ekstrema.', source: 'FRED, DefiLlama' },
  fearGreed: { title: '😱 Fear & Greed Index', emoji: '😱', description: 'Wskaźnik sentymentu rynku 0-100.', interpretation: [{ condition: '0-25', signal: 'bullish', text: '🟢 Extreme Fear - okazja' }, { condition: '26-45', signal: 'bullish', text: '🟢 Fear - akumuluj' }, { condition: '46-55', signal: 'neutral', text: '🟡 Neutral' }, { condition: '56-75', signal: 'warning', text: '🟠 Greed - ostrożnie' }, { condition: '76-100', signal: 'bearish', text: '🔴 Extreme Greed - realizuj' }], tip: 'Kontrariański wskaźnik.', source: 'Alternative.me' },
  fundingRate: { title: '💸 Funding Rate', emoji: '💸', description: 'Opłata między long/short na perpetuals.', interpretation: [{ condition: '> 0.05%', signal: 'bearish', text: '🔴 Overleveraged' }, { condition: '0-0.03%', signal: 'neutral', text: '🟡 Neutral' }, { condition: '< 0', signal: 'bullish', text: '🟢 Bearish sentiment' }], tip: 'Wysoki funding = lokalne szczyty.', source: 'Binance API' },
  portfolio: { title: '💼 Portfolio', emoji: '💼', description: 'Twoje portfolio na Binance.', interpretation: [{ condition: 'Połączony', signal: 'bullish', text: '🟢 API działa' }, { condition: 'Błąd', signal: 'bearish', text: '🔴 Sprawdź klucze' }], tip: 'Nigdy nie włączaj Withdrawals!', source: 'Binance Auth API' }
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

const ApiStatusBadge = ({ status, label, theme }) => {
  const colors = { live: theme === 'dark' ? '#22c55e' : '#16a34a', loading: theme === 'dark' ? '#f59e0b' : '#d97706', error: theme === 'dark' ? '#ef4444' : '#dc2626', offline: theme === 'dark' ? '#64748b' : '#94a3b8' };
  const color = colors[status] || colors.offline;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: `${color}18`, fontSize: '9px', fontWeight: '600', color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, animation: status === 'live' ? 'pulse 2s infinite' : 'none' }} />{label}</span>;
};

const MiniScoreGauge = ({ score, label, icon, subtitle, onHelp, theme }) => {
  const isDark = theme === 'dark';
  const t = isDark ? { text: '#f1f5f9', textSecondary: '#64748b' } : { text: '#1e293b', textSecondary: '#64748b' };
  const getSignalInfo = (s) => { if (s >= 70) return { text: 'AKUMULUJ', color: '#22c55e' }; if (s >= 55) return { text: 'HOLD+', color: '#84cc16' }; if (s >= 45) return { text: 'HOLD', color: '#eab308' }; if (s >= 30) return { text: 'OSTROŻNIE', color: '#f97316' }; return { text: 'REDUKUJ', color: '#ef4444' }; };
  const signal = getSignalInfo(score);
  const needleAngle = -90 + (score / 100) * 180;
  const gaugeColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '108px', padding: '6px', background: isDark ? 'rgba(30,41,59,0.4)' : 'rgba(241,245,249,0.6)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '2px' }}>
        <span style={{ fontSize: '10px', fontWeight: '600', color: t.text }}>{icon} {label}</span>
        <button onClick={onHelp} style={{ width: '16px', height: '16px', borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', border: 'none', color: t.textSecondary, fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
      </div>
      <svg viewBox="0 0 100 58" style={{ width: '100%', height: '50px' }}>
        {gaugeColors.map((c, i) => { const startAngle = 180 + (i * 36); const endAngle = 180 + ((i + 1) * 36); const startRad = (startAngle * Math.PI) / 180; const endRad = (endAngle * Math.PI) / 180; const cx = 50, cy = 50, r = 38; return <path key={i} d={`M ${cx + r * Math.cos(startRad)} ${cy + r * Math.sin(startRad)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(endRad)} ${cy + r * Math.sin(endRad)}`} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" opacity={isDark ? 0.9 : 0.85} />; })}
        <g transform={`rotate(${needleAngle}, 50, 50)`}><line x1="50" y1="50" x2="50" y2="18" stroke={t.text} strokeWidth="2.5" strokeLinecap="round" /><circle cx="50" cy="50" r="4" fill={signal.color} /></g>
      </svg>
      <div style={{ fontSize: '20px', fontWeight: '700', color: signal.color, lineHeight: '1', marginTop: '-8px' }}>{score}</div>
      <div style={{ marginTop: '3px', padding: '2px 6px', borderRadius: '4px', background: `${signal.color}18`, border: `1px solid ${signal.color}40`, fontSize: '8px', fontWeight: '700', color: signal.color }}>{signal.text}</div>
      <div style={{ fontSize: '8px', color: t.textSecondary, marginTop: '2px' }}>{subtitle}</div>
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
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // API Status
  const [apiStatus, setApiStatus] = useState({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading', marketStructure: 'loading' });
  
  // Charts state
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  const [chartView, setChartView] = useState('both');
  const [taInterval, setTaInterval] = useState('1D');
  
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
  
  // Load API keys on mount
  useEffect(() => {
    const saved = loadApiKeys();
    if (saved.apiKey && saved.secretKey) {
      setPortfolioApiKey(saved.apiKey);
      setPortfolioSecretKey(saved.secretKey);
    }
  }, []);
  
  // Mock data
  const mockData = { dxy: { value: 103.42, change: -1.8 }, liquidations: { long: 45.2, short: 12.8, total: 58 } };

  // Fetch all public data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setApiStatus({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading', marketStructure: 'loading' });
    const [cg, bn, defi, fred, ms, altseason] = await Promise.all([fetchCoinGeckoData(), fetchBinanceData(), fetchDefiLlamaData(), fetchFredData(), fetchMarketStructure(), fetchAltseasonData()]);
    if (cg) { setCgData(cg); setApiStatus(prev => ({ ...prev, coingecko: 'live' })); } else { setApiStatus(prev => ({ ...prev, coingecko: 'error' })); }
    if (bn) { setBinanceData(bn); setApiStatus(prev => ({ ...prev, binance: 'live' })); } else { setApiStatus(prev => ({ ...prev, binance: 'error' })); }
    if (defi) { setDefiData(defi); setApiStatus(prev => ({ ...prev, defillama: 'live' })); } else { setApiStatus(prev => ({ ...prev, defillama: 'error' })); }
    if (fred) { setFredData(fred); setApiStatus(prev => ({ ...prev, fred: 'live' })); } else { setApiStatus(prev => ({ ...prev, fred: 'error' })); }
    if (ms) { setMsData(ms); setApiStatus(prev => ({ ...prev, marketStructure: 'live' })); } else { setApiStatus(prev => ({ ...prev, marketStructure: 'error' })); }
    if (altseason) { setAltseasonData(altseason); }
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAllData(); const interval = setInterval(fetchAllData, 60000); return () => clearInterval(interval); }, [fetchAllData]);

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
  
  const tabs = [
    { id: 'crypto', label: '₿ Crypto' },
    { id: 'structure', label: '📊 Structure' },
    { id: 'macro', label: '🏦 Macro' },
    { id: 'defi', label: '🦙 DeFi' },
    { id: 'derivatives', label: '📉 Deriv' },
    { id: 'charts', label: '📈 Charts' },
    { id: 'portfolio', label: '💼 Portfolio' }
  ];
  
  const formatChange = (val) => val >= 0 ? `+${val}%` : `${val}%`;
  const formatUSD = (val) => val >= 1000 ? `$${(val/1000).toFixed(1)}k` : `$${val.toFixed(2)}`;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: t.bg, zIndex: 100 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>🎯 Crypto Decision Hub {cgData && <LiveTag theme={theme} />}</h1>
          <span style={{ fontSize: '9px', color: t.textSecondary }}>{lastUpdate ? `${lastUpdate.toLocaleTimeString('pl-PL')}` : 'Ładowanie...'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={fetchAllData} disabled={loading} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px', color: t.text }}>{loading ? '⏳' : '🔄'}</button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>

      {/* Three Scores */}
      <div style={{ padding: '12px' }}>
        <Card theme={theme}>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <MiniScoreGauge score={dayTradingScore} label="Day" icon="🎯" subtitle="godziny-dni" onHelp={() => setHelpModal('dayTradingScore')} theme={theme} />
            <MiniScoreGauge score={swingScore} label="Swing" icon="📊" subtitle="tygodnie" onHelp={() => setHelpModal('swingScore')} theme={theme} />
            <MiniScoreGauge score={hodlScore} label="HODL" icon="🏦" subtitle="miesiące" onHelp={() => setHelpModal('hodlScore')} theme={theme} />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '5px' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '7px 12px', borderRadius: '8px', border: 'none', whiteSpace: 'nowrap',
              background: activeTab === tab.id ? t.accent : t.cardBg,
              color: activeTab === tab.id ? '#fff' : t.textSecondary,
              fontSize: '11px', fontWeight: '600', cursor: 'pointer'
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ padding: '0 12px 80px' }}>
        
        {/* CRYPTO TAB */}
        {activeTab === 'crypto' && (
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} signalColor={(cgData?.btcPrice?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!cgData?.btcPrice}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>₿ Bitcoin</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.btcPrice?.value?.toLocaleString() || '---'}</div>
              <span style={{ fontSize: '11px', color: (cgData?.btcPrice?.change || 0) >= 0 ? t.positive : t.negative }}>{cgData?.btcPrice?.change ? formatChange(cgData.btcPrice.change) : '---'}</span>
            </Card>
            <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme} signalColor={(cgData?.ethPrice?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!cgData?.ethPrice}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>◆ Ethereum</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.ethPrice?.value?.toLocaleString() || '---'}</div>
              <span style={{ fontSize: '11px', color: (cgData?.ethPrice?.change || 0) >= 0 ? t.positive : t.negative }}>{cgData?.ethPrice?.change ? formatChange(cgData.ethPrice.change) : '---'}</span>
            </Card>
            <Card theme={theme} signalColor={(cgData?.solPrice?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!cgData?.solPrice}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>◎ Solana</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.solPrice?.value || '---'}</div>
              <span style={{ fontSize: '11px', color: (cgData?.solPrice?.change || 0) >= 0 ? t.positive : t.negative }}>{cgData?.solPrice?.change ? formatChange(cgData.solPrice.change) : '---'}</span>
            </Card>
            <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} signalColor={(cgData?.fearGreed?.value || 50) < 35 ? t.positive : (cgData?.fearGreed?.value || 50) > 65 ? t.negative : t.warning} isLive={!!cgData?.fearGreed}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>😱 Fear & Greed</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.fearGreed?.value || '---'}</div>
              <span style={{ fontSize: '10px', color: t.textSecondary }}>{cgData?.fearGreed?.label || '---'}</span>
            </Card>
            <Card helpKey="btcDominance" onHelp={setHelpModal} theme={theme} isLive={!!cgData?.btcDominance}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>👑 BTC Dominance</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.btcDominance?.value || '---'}%</div>
            </Card>
            <Card theme={theme} isLive={!!cgData?.volume24h}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>📊 Volume 24h</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.volume24h || '---'}B</div>
            </Card>
          </div>
        )}

        {/* STRUCTURE TAB */}
        {activeTab === 'structure' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {msData?.marketBreadth && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>📊 Market Breadth ({msData.source})</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                  <div><div style={{ fontSize: '16px', fontWeight: '700', color: t.positive }}>{msData.marketBreadth.gainers}</div><div style={{ fontSize: '9px', color: t.textSecondary }}>Gainers</div></div>
                  <div><div style={{ fontSize: '16px', fontWeight: '700', color: t.negative }}>{msData.marketBreadth.losers}</div><div style={{ fontSize: '9px', color: t.textSecondary }}>Losers</div></div>
                  <div><div style={{ fontSize: '16px', fontWeight: '700', color: t.accent }}>{msData.marketBreadth.ratio}%</div><div style={{ fontSize: '9px', color: t.textSecondary }}>Bullish</div></div>
                </div>
              </Card>
            )}
            {msData?.topGainers && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: t.positive }}>🚀 Top 5 Gainers 24h</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {msData.topGainers.slice(0, 5).map((coin, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px', background: t.bg, borderRadius: '6px' }}>
                      <span style={{ fontWeight: '600', fontSize: '11px' }}>{coin.name}</span>
                      <span style={{ color: t.positive, fontWeight: '600', fontSize: '11px' }}>+{coin.change24h}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {msData?.topLosers && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: t.negative }}>📉 Top 5 Losers 24h</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {msData.topLosers.slice(0, 5).map((coin, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px', background: t.bg, borderRadius: '6px' }}>
                      <span style={{ fontWeight: '600', fontSize: '11px' }}>{coin.name}</span>
                      <span style={{ color: t.negative, fontWeight: '600', fontSize: '11px' }}>{coin.change24h}%</span>
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
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${fredData?.m2Supply?.value || '---'}T</div>
              <span style={{ fontSize: '11px', color: fredData?.m2Supply?.trend === 'expanding' ? t.positive : t.negative }}>{fredData?.m2Supply?.change ? formatChange(fredData.m2Supply.change) : '---'} (YoY)</span>
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
                <div style={{ fontSize: '18px', fontWeight: '700' }}>${defiData?.tvl?.value || '---'}B</div>
                <span style={{ fontSize: '11px', color: (defiData?.tvl?.change || 0) >= 0 ? t.positive : t.negative }}>{defiData?.tvl?.change ? formatChange(defiData.tvl.change) : '---'} (7d)</span>
              </Card>
              <Card helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme} signalColor={(defiData?.stablecoinSupply?.change || 0) >= 0 ? t.positive : t.negative} isLive={!!defiData?.stablecoinSupply}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💵 Stablecoin</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>${defiData?.stablecoinSupply?.value || '---'}B</div>
                <span style={{ fontSize: '11px', color: (defiData?.stablecoinSupply?.change || 0) >= 0 ? t.positive : t.negative }}>{defiData?.stablecoinSupply?.change ? formatChange(defiData.stablecoinSupply.change) : '---'} (30d)</span>
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
          </div>
        )}

        {/* DERIVATIVES TAB */}
        {activeTab === 'derivatives' && (
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme} signalColor={(binanceData?.fundingRate?.value || 0) < 0 ? t.positive : (binanceData?.fundingRate?.value || 0) > 0.05 ? t.negative : t.warning} isLive={!!binanceData?.fundingRate}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💸 Funding Rate</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{binanceData?.fundingRate?.value?.toFixed(4) || '---'}%</div>
              <span style={{ fontSize: '9px', color: t.textSecondary }}>BTC Perpetual</span>
            </Card>
            <Card helpKey="openInterest" onHelp={setHelpModal} theme={theme} isLive={!!binanceData?.openInterest}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>📊 Open Interest</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${binanceData?.openInterest?.value || '---'}B</div>
              <span style={{ fontSize: '9px', color: t.textSecondary }}>BTC Futures</span>
            </Card>
            <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme} signalColor={(binanceData?.longShortRatio?.value || 1) < 1 ? t.positive : (binanceData?.longShortRatio?.value || 1) > 1.8 ? t.negative : t.warning} isLive={!!binanceData?.longShortRatio}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>⚖️ Long/Short</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{binanceData?.longShortRatio?.value || '---'}</div>
            </Card>
            <Card theme={theme} signalColor={mockData.liquidations.long > mockData.liquidations.short ? t.negative : t.positive}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💥 Liquidations 24h</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${mockData.liquidations.total}M</div>
              <div style={{ fontSize: '9px' }}><span style={{ color: t.positive }}>L: ${mockData.liquidations.long}M</span> | <span style={{ color: t.negative }}>S: ${mockData.liquidations.short}M</span></div>
            </Card>
          </div>
        )}

        {/* CHARTS TAB */}
        {activeTab === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Card theme={theme}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>🎯 Wybierz parę</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT', 'CRYPTOCAP:TOTAL', 'CRYPTOCAP:BTC.D'].map(s => (
                  <button key={s} onClick={() => setTvSymbol(s)} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: tvSymbol === s ? t.accent : t.bg, color: tvSymbol === s ? '#fff' : t.textSecondary, fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>{s.split(':')[1]}</button>
                ))}
              </div>
            </Card>
            <Card theme={theme}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>👁️ Widok</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {[{ id: 'analysis', label: '📊 Analiza' }, { id: 'chart', label: '📈 Wykres' }, { id: 'both', label: '🔀 Oba' }].map(v => (
                  <button key={v.id} onClick={() => setChartView(v.id)} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: chartView === v.id ? t.accent : t.bg, color: chartView === v.id ? '#fff' : t.textSecondary, fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>{v.label}</button>
                ))}
              </div>
            </Card>
            {(chartView === 'analysis' || chartView === 'both') && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>📊 Analiza Techniczna - {tvSymbol.split(':')[1]} <LiveTag theme={theme} /></div>
                <TradingViewTechnicalAnalysis symbol={tvSymbol} theme={theme} interval={taInterval} />
              </Card>
            )}
            {(chartView === 'chart' || chartView === 'both') && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>📈 Wykres - {tvSymbol.split(':')[1]}</div>
                <TradingViewChart symbol={tvSymbol} theme={theme} />
              </Card>
            )}
          </div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab === 'portfolio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* API Settings */}
            <Card helpKey="portfolio" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔐 Binance API</span>
                {portfolioConnected && <ApiStatusBadge status="live" label="Połączony" theme={theme} />}
              </div>
              
              {!portfolioConnected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input type={showApiKeys ? 'text' : 'password'} placeholder="API Key" value={portfolioApiKey} onChange={e => setPortfolioApiKey(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
                  <input type={showApiKeys ? 'text' : 'password'} placeholder="Secret Key" value={portfolioSecretKey} onChange={e => setPortfolioSecretKey(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowApiKeys(!showApiKeys)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.textSecondary, fontSize: '11px', cursor: 'pointer' }}>{showApiKeys ? '🙈 Ukryj' : '👁️ Pokaż'}</button>
                    <button onClick={connectPortfolio} disabled={portfolioLoading} style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: t.accent, color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>{portfolioLoading ? '⏳ Łączenie...' : '🔗 Połącz'}</button>
                  </div>
                  {portfolioError && <div style={{ padding: '8px', background: `${t.negative}20`, borderRadius: '6px', color: t.negative, fontSize: '11px' }}>❌ {portfolioError}</div>}
                  <div style={{ fontSize: '9px', color: t.textSecondary, padding: '8px', background: t.bg, borderRadius: '6px' }}>
                    ⚠️ Klucze są przechowywane lokalnie w Twojej przeglądarce (LocalStorage). Nigdy nie włączaj uprawnień "Withdrawals"!
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={refreshPortfolio} disabled={portfolioLoading} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '11px', cursor: 'pointer' }}>{portfolioLoading ? '⏳' : '🔄 Odśwież'}</button>
                  <button onClick={disconnectPortfolio} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${t.negative}`, background: 'transparent', color: t.negative, fontSize: '11px', cursor: 'pointer' }}>🔓 Rozłącz</button>
                </div>
              )}
            </Card>

            {portfolioConnected && (
              <>
                {/* Spot Balance */}
                {spotBalance?.balances && (
                  <Card theme={theme}>
                    <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>💰 Spot Balance</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {spotBalance.balances.slice(0, 10).map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: t.bg, borderRadius: '6px' }}>
                          <span style={{ fontWeight: '600', fontSize: '12px' }}>{b.asset}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600' }}>{b.total.toFixed(b.total < 1 ? 6 : 2)}</div>
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
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: t.bg, borderRadius: '6px' }}>
                          <span style={{ fontWeight: '600', fontSize: '12px' }}>{b.asset}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600' }}>{b.balance.toFixed(2)}</div>
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

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '14px', color: t.textSecondary, fontSize: '9px', position: 'fixed', bottom: 0, left: 0, right: 0, background: t.bg, borderTop: `1px solid ${t.border}` }}>
        💡 v3.0 Portfolio & Trading | Auto-refresh: 60s
      </div>

      {/* Help Modal */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
    </div>
  );
}

export default App;
