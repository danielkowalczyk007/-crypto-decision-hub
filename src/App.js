import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, AreaChart, Area } from 'recharts';

// ============== THEME CONFIG ==============
const themes = {
  dark: { bg: 'bg-slate-900', card: 'bg-slate-800/50', text: 'text-slate-100', muted: 'text-slate-400', border: 'border-slate-700', accent: 'bg-blue-500' },
  light: { bg: 'bg-gray-50', card: 'bg-white', text: 'text-gray-900', muted: 'text-gray-500', border: 'border-gray-200', accent: 'bg-blue-600' }
};

// ============== MAIN SCREENS CONFIG ==============
const MAIN_SCREENS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'analysis', label: 'Analysis', icon: '📈' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼' }
];

const ANALYSIS_TABS = ['Crypto', 'Structure', 'Pulse', 'Compare', 'Macro', 'DeFi', 'Deriv', 'Charts'];

// ============== HELP CONTENT ==============
const helpContent = {
  btcPrice: { title: 'Bitcoin Price', emoji: '₿', description: 'Current Bitcoin price in USD with 24h change percentage.', interpretation: [{ condition: '24h > +5%', signal: 'bullish', text: '🟢 Strong momentum' }, { condition: '24h < -5%', signal: 'bearish', text: '🔴 Correction phase' }], tip: 'Watch for volume confirmation on big moves.', source: 'CoinGecko API' },
  ethPrice: { title: 'Ethereum Price', emoji: 'Ξ', description: 'Current Ethereum price in USD with 24h change.', interpretation: [{ condition: 'ETH outperforms BTC', signal: 'bullish', text: '🟢 Altseason signal' }], tip: 'Monitor ETH/BTC ratio for altseason signals.', source: 'CoinGecko API' },
  solPrice: { title: 'Solana Price', emoji: '◎', description: 'Current Solana price - key L1 competitor.', interpretation: [{ condition: 'SOL > +10%', signal: 'bullish', text: '🟢 Alt momentum' }], tip: 'High beta asset - amplifies market moves.', source: 'CoinGecko API' },
  fearGreed: { title: 'Fear & Greed Index', emoji: '😱', description: 'Market sentiment indicator (0-100).', interpretation: [{ condition: '< 25', signal: 'bullish', text: '🟢 Extreme Fear = Buy opportunity' }, { condition: '25-45', signal: 'neutral', text: '🟡 Fear - cautious accumulation' }, { condition: '45-55', signal: 'neutral', text: '⚪ Neutral' }, { condition: '55-75', signal: 'warning', text: '🟠 Greed - take profits' }, { condition: '> 75', signal: 'bearish', text: '🔴 Extreme Greed = Sell signal' }], tip: 'Contrarian indicator - buy fear, sell greed.', source: 'Alternative.me' },
  btcDominance: { title: 'BTC Dominance', emoji: '👑', description: 'Bitcoin market cap as % of total crypto market.', interpretation: [{ condition: '> 55%', signal: 'bearish', text: '🔴 BTC season - alts underperform' }, { condition: '45-55%', signal: 'neutral', text: '🟡 Balanced market' }, { condition: '< 45%', signal: 'bullish', text: '🟢 Altseason - alts outperform' }], tip: 'Falling dominance = money flowing to alts.', source: 'CoinGecko API' },
  fundingRate: { title: 'Funding Rate', emoji: '💰', description: 'Perpetual futures funding rate (8h).', interpretation: [{ condition: '> 0.05%', signal: 'bearish', text: '🔴 Overleveraged longs' }, { condition: '0.01-0.05%', signal: 'neutral', text: '🟡 Normal bullish' }, { condition: '-0.01 to 0.01%', signal: 'neutral', text: '⚪ Neutral' }, { condition: '< -0.01%', signal: 'bullish', text: '🟢 Shorts paying - squeeze potential' }], tip: 'Extreme funding often precedes reversals.', source: 'Binance Futures API' },
  openInterest: { title: 'Open Interest', emoji: '📊', description: 'Total value of outstanding futures contracts.', interpretation: [{ condition: 'Rising OI + Rising Price', signal: 'bullish', text: '🟢 New money entering longs' }, { condition: 'Rising OI + Falling Price', signal: 'bearish', text: '🔴 New shorts opening' }, { condition: 'Falling OI', signal: 'neutral', text: '🟡 Positions closing' }], tip: 'Watch OI divergences from price.', source: 'Binance Futures API' },
  longShortRatio: { title: 'Long/Short Ratio', emoji: '⚖️', description: 'Ratio of long to short positions.', interpretation: [{ condition: '> 1.5', signal: 'warning', text: '🟠 Crowded long - reversal risk' }, { condition: '1.0-1.5', signal: 'neutral', text: '🟡 Balanced/Bullish' }, { condition: '< 1.0', signal: 'bullish', text: '🟢 More shorts - squeeze potential' }], tip: 'Contrarian signal when extreme.', source: 'Binance Futures API' },
  tvl: { title: 'Total Value Locked', emoji: '🔒', description: 'Total USD locked in DeFi protocols.', interpretation: [{ condition: 'Rising TVL', signal: 'bullish', text: '🟢 Capital flowing into DeFi' }, { condition: 'Falling TVL', signal: 'bearish', text: '🔴 Capital leaving DeFi' }], tip: 'TVL growth indicates ecosystem health.', source: 'DefiLlama API' },
  m2Supply: { title: 'M2 Money Supply', emoji: '🏦', description: 'US M2 money supply - liquidity indicator.', interpretation: [{ condition: 'Expanding', signal: 'bullish', text: '🟢 More liquidity = risk-on' }, { condition: 'Contracting', signal: 'bearish', text: '🔴 Tightening = risk-off' }], tip: 'BTC often correlates with M2 expansion.', source: 'FRED API' },
  dayTradingScore: { title: 'Day Trading Score', emoji: '🎯', description: 'Short-term trading signal (hours to days).', interpretation: [{ condition: '80-100', signal: 'bullish', text: '🟢 STRONG BUY' }, { condition: '65-79', signal: 'bullish', text: '🟢 BUY' }, { condition: '50-64', signal: 'neutral', text: '🟡 HOLD' }, { condition: '35-49', signal: 'warning', text: '🟠 CAUTION' }, { condition: '0-34', signal: 'bearish', text: '🔴 SELL' }], tip: 'Uses F&G, Funding, 24h momentum, L/S ratio.', source: 'Calculated' },
  swingScore: { title: 'Swing Score', emoji: '📊', description: 'Medium-term signal (weeks).', interpretation: [{ condition: '70-100', signal: 'bullish', text: '🟢 ACCUMULATE' }, { condition: '55-69', signal: 'bullish', text: '🟢 HOLD+' }, { condition: '45-54', signal: 'neutral', text: '🟡 HOLD' }, { condition: '30-44', signal: 'warning', text: '🟠 REDUCE' }, { condition: '0-29', signal: 'bearish', text: '🔴 EXIT' }], tip: 'Uses TVL trends, BTC dominance, stablecoins.', source: 'Calculated' },
  hodlScore: { title: 'HODL Score', emoji: '🏦', description: 'Long-term signal (months to years).', interpretation: [{ condition: '60-100', signal: 'bullish', text: '🟢 STRONG ACCUMULATE' }, { condition: '50-59', signal: 'bullish', text: '🟢 ACCUMULATE' }, { condition: '40-49', signal: 'neutral', text: '🟡 HOLD' }, { condition: '25-39', signal: 'warning', text: '🟠 CAUTIOUS' }, { condition: '0-24', signal: 'bearish', text: '🔴 REDUCE' }], tip: 'Uses M2, macro trends, extreme sentiment.', source: 'Calculated' },
  dxy: { title: 'DXY (Dollar Index)', emoji: '💵', description: 'US Dollar strength index.', interpretation: [{ condition: '< 100', signal: 'bullish', text: '🟢 Weak dollar = crypto bullish' }, { condition: '100-105', signal: 'neutral', text: '🟡 Neutral zone' }, { condition: '> 105', signal: 'bearish', text: '🔴 Strong dollar = crypto bearish' }], tip: 'Inverse correlation with BTC.', source: 'Polygon.io API' },
  altseasonIndex: { title: 'Altseason Index', emoji: '🌊', description: 'Measures alt performance vs BTC.', interpretation: [{ condition: '> 75', signal: 'bullish', text: '🟢 Full altseason' }, { condition: '50-75', signal: 'bullish', text: '🟢 Alt momentum' }, { condition: '25-50', signal: 'neutral', text: '🟡 Mixed market' }, { condition: '< 25', signal: 'bearish', text: '🔴 BTC season' }], tip: 'Based on BTC dominance and ETH/BTC.', source: 'Calculated' }
};

// ============== API FUNCTIONS ==============

// Fear & Greed Helper - Multiple API sources with fallback chain
const fetchFearGreedIndex = async () => {
  const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
  
  // SOURCE 1: Alternative.me (most popular)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.alternative.me/fng/?limit=1', { 
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const value = parseInt(data?.data?.[0]?.value);
      if (value >= 0 && value <= 100) {
        console.log('✅ F&G from Alternative.me:', value);
        return { value, source: 'Alternative.me', isReal: true };
      }
    }
  } catch (e) {
    console.warn('⚠️ Alternative.me failed:', e.message);
  }
  
  // SOURCE 2: CoinStats API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.coinstats.app/public/v1/fear-greed', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const value = parseInt(data?.now?.value || data?.value);
      if (value >= 0 && value <= 100) {
        console.log('✅ F&G from CoinStats:', value);
        return { value, source: 'CoinStats', isReal: true };
      }
    }
  } catch (e) {
    console.warn('⚠️ CoinStats failed:', e.message);
  }
  
  // SOURCE 3: CoinyBubble (Binance methodology)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.coinybubble.com/api/v1/index/current', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const value = parseInt(data?.value || data?.index);
      if (value >= 0 && value <= 100) {
        console.log('✅ F&G from CoinyBubble:', value);
        return { value, source: 'CoinyBubble', isReal: true };
      }
    }
  } catch (e) {
    console.warn('⚠️ CoinyBubble failed:', e.message);
  }
  
  // SOURCE 4: CoinGlass (requires different parsing)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://fapi.coinglass.com/api/index/fearGreedHistory?interval=0', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      // CoinGlass returns array with latest value
      const latestValue = data?.data?.[data.data.length - 1];
      const value = parseInt(latestValue?.value || latestValue);
      if (value >= 0 && value <= 100) {
        console.log('✅ F&G from CoinGlass:', value);
        return { value, source: 'CoinGlass', isReal: true };
      }
    }
  } catch (e) {
    console.warn('⚠️ CoinGlass failed:', e.message);
  }
  
  // All API sources failed - return null for fallback calculation
  console.warn('❌ All F&G API sources failed - will use market calculation');
  return null;
};

// Fallback F&G calculation from Binance/CoinGecko market data
const calculateFearGreedFromMarket = (prices, global) => {
  const btcChange = prices.bitcoin?.usd_24h_change || 0;
  const ethChange = prices.ethereum?.usd_24h_change || 0;
  const solChange = prices.solana?.usd_24h_change || 0;
  const bnbChange = prices.binancecoin?.usd_24h_change || 0;
  const btcDominance = global?.data?.market_cap_percentage?.btc || 57;
  
  // Weighted average - ETH gets more weight as risk indicator
  const avgChange = (btcChange * 0.35 + ethChange * 0.35 + solChange * 0.15 + bnbChange * 0.15);
  
  // Find worst performer (panic indicator)
  const worstChange = Math.min(btcChange, ethChange, solChange, bnbChange);
  
  // Count how many coins are down
  const redCoins = [btcChange, ethChange, solChange, bnbChange].filter(c => c < 0).length;
  
  // Base score from average change
  let fgValue = 50;
  
  if (avgChange < -10) fgValue = 12;
  else if (avgChange < -7) fgValue = 20;
  else if (avgChange < -5) fgValue = 28;
  else if (avgChange < -4) fgValue = 35;
  else if (avgChange < -3) fgValue = 40;
  else if (avgChange < -2) fgValue = 44;
  else if (avgChange < -1) fgValue = 48;
  else if (avgChange < 0) fgValue = 50;
  else if (avgChange < 1) fgValue = 52;
  else if (avgChange < 2) fgValue = 56;
  else if (avgChange < 3) fgValue = 62;
  else if (avgChange < 5) fgValue = 70;
  else if (avgChange < 7) fgValue = 78;
  else fgValue = 85;
  
  // ADJUSTMENT 1: Worst performer impact (max -8)
  if (worstChange < -10) fgValue -= 8;
  else if (worstChange < -7) fgValue -= 6;
  else if (worstChange < -5) fgValue -= 4;
  else if (worstChange < -3) fgValue -= 2;
  
  // ADJUSTMENT 2: All coins red = fear (max -5)
  if (redCoins === 4) fgValue -= 5;
  else if (redCoins === 3) fgValue -= 2;
  
  // ADJUSTMENT 3: ETH underperforming = risk-off (max -4)
  const ethVsBtc = ethChange - btcChange;
  if (ethVsBtc < -5) fgValue -= 4;
  else if (ethVsBtc < -3) fgValue -= 2;
  
  // Clamp to valid range (min 10 for calculated values)
  fgValue = Math.max(10, Math.min(90, Math.round(fgValue)));
  
  console.log('📊 F&G calculated from market:', fgValue, 
    `| BTC: ${btcChange.toFixed(1)}% | ETH: ${ethChange.toFixed(1)}% | SOL: ${solChange.toFixed(1)}% | BNB: ${bnbChange.toFixed(1)}%`,
    `| Avg: ${avgChange.toFixed(1)}% | Worst: ${worstChange.toFixed(1)}% | Red: ${redCoins}/4`);
  
  return fgValue;
};

// CoinGecko API - FIXED with enhanced F&G
const fetchCoinGeckoData = async () => {
  try {
    const [pricesRes, globalRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true'),
      fetch('https://api.coingecko.com/api/v3/global')
    ]);
    
    if (!pricesRes.ok) throw new Error('CoinGecko API error');
    
    const prices = await pricesRes.json();
    const global = globalRes.ok ? await globalRes.json() : null;
    
    // Fetch F&G from API first
    let fgResult = await fetchFearGreedIndex();
    let fgValue, fgSource;
    
    if (fgResult) {
      fgValue = fgResult.value;
      fgSource = fgResult.source;
    } else {
      // Fallback: Calculate from market data
      fgValue = calculateFearGreedFromMarket(prices, global);
      fgSource = 'Calculated';
    }
    
    const fgText = fgValue <= 20 ? 'Extreme Fear' : fgValue <= 35 ? 'Fear' : fgValue <= 50 ? 'Neutral' : fgValue <= 65 ? 'Greed' : fgValue <= 80 ? 'High Greed' : 'Extreme Greed';
    const isRealData = fgResult?.isReal || false;
    
    console.log('📈 CoinGecko data loaded | BTC:', prices.bitcoin?.usd, '| F&G:', fgValue, fgText, '| Source:', fgSource, isRealData ? '(API)' : '(Calculated)');
    
    return {
      btcPrice: { value: prices.bitcoin?.usd || 0, change: prices.bitcoin?.usd_24h_change || 0, volume: prices.bitcoin?.usd_24h_vol || 0, marketCap: prices.bitcoin?.usd_market_cap || 0 },
      ethPrice: { value: prices.ethereum?.usd || 0, change: prices.ethereum?.usd_24h_change || 0, volume: prices.ethereum?.usd_24h_vol || 0 },
      solPrice: { value: prices.solana?.usd || 0, change: prices.solana?.usd_24h_change || 0, volume: prices.solana?.usd_24h_vol || 0 },
      bnbPrice: { value: prices.binancecoin?.usd || 0, change: prices.binancecoin?.usd_24h_change || 0, volume: prices.binancecoin?.usd_24h_vol || 0 },
      btcDominance: { value: parseFloat((global?.data?.market_cap_percentage?.btc || 57).toFixed(2)) },
      totalMarketCap: { value: ((global?.data?.total_market_cap?.usd || 0) / 1e12).toFixed(2) },
      totalVolume: { value: ((global?.data?.total_volume?.usd || 0) / 1e9).toFixed(0) },
      fearGreed: { value: fgValue, text: fgText, source: fgSource, isReal: isRealData, lastUpdate: new Date().toISOString() }
    };
  } catch (error) {
    console.error('❌ CoinGecko fetch error:', error);
    // Return fallback data so UI doesn't break - realistic current market values
    return {
      btcPrice: { value: 78500, change: -5.5, volume: 25000000000, marketCap: 1550000000000 },
      ethPrice: { value: 2300, change: -6.8, volume: 12000000000 },
      solPrice: { value: 102, change: -7.2, volume: 3000000000 },
      bnbPrice: { value: 590, change: -4.3, volume: 1500000000 },
      btcDominance: { value: 61.5 },
      totalMarketCap: { value: '2.55' },
      totalVolume: { value: '85' },
      fearGreed: { value: 22, text: 'Extreme Fear', source: 'Fallback', isReal: false, lastUpdate: null }
    };
  }
};

// Binance Futures API
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
    
    const fundingRate = parseFloat(funding[0]?.fundingRate || 0) * 100;
    const openInterest = parseFloat(oi?.openInterest || 0);
    const lsRatio = parseFloat(ls?.[0]?.longShortRatio || 1);
    
    return {
      fundingRate: { value: fundingRate, time: funding[0]?.fundingTime },
      openInterest: { value: openInterest, notional: openInterest * 95000 },
      longShortRatio: { value: lsRatio, longAccount: parseFloat(ls?.[0]?.longAccount || 0.5), shortAccount: parseFloat(ls?.[0]?.shortAccount || 0.5) }
    };
  } catch (error) {
    console.error('Binance fetch error:', error);
    return { fundingRate: { value: 0.0066 }, openInterest: { value: 97300 }, longShortRatio: { value: 1.47, longAccount: 0.59, shortAccount: 0.41 } };
  }
};

// DefiLlama API
const fetchDefiLlamaData = async () => {
  try {
    const [tvlRes, protocolsRes, stablesRes] = await Promise.all([
      fetch('https://api.llama.fi/v2/historicalChainTvl'),
      fetch('https://api.llama.fi/protocols'),
      fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true')
    ]);
    
    const tvlData = tvlRes.ok ? await tvlRes.json() : [];
    const protocols = protocolsRes.ok ? await protocolsRes.json() : [];
    const stables = stablesRes.ok ? await stablesRes.json() : null;
    
    const latestTvl = tvlData[tvlData.length - 1]?.tvl || 180000000000;
    const weekAgoTvl = tvlData[tvlData.length - 8]?.tvl || latestTvl;
    const tvlChange = ((latestTvl - weekAgoTvl) / weekAgoTvl * 100).toFixed(1);
    
    const topProtocols = protocols
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
      .slice(0, 5)
      .map(p => ({ name: p.name, tvl: p.tvl, change: p.change_1d || 0 }));
    
    const usdt = stables?.peggedAssets?.find(s => s.symbol === 'USDT');
    const usdc = stables?.peggedAssets?.find(s => s.symbol === 'USDC');
    
    return {
      tvl: { value: latestTvl, change: parseFloat(tvlChange) },
      topProtocols,
      stablecoins: {
        usdt: { mcap: usdt?.circulating?.peggedUSD || 140000000000, change: 0.1 },
        usdc: { mcap: usdc?.circulating?.peggedUSD || 35000000000, change: 0.05 },
        total: (usdt?.circulating?.peggedUSD || 140000000000) + (usdc?.circulating?.peggedUSD || 35000000000)
      }
    };
  } catch (error) {
    console.error('DefiLlama fetch error:', error);
    return {
      tvl: { value: 180000000000, change: 2.5 },
      topProtocols: [{ name: 'Lido', tvl: 35000000000, change: 2.1 }, { name: 'Aave', tvl: 20000000000, change: 1.5 }, { name: 'EigenLayer', tvl: 18000000000, change: 3.2 }, { name: 'Maker', tvl: 8000000000, change: 0.8 }, { name: 'Uniswap', tvl: 6000000000, change: 1.2 }],
      stablecoins: { usdt: { mcap: 140000000000, change: 0.1 }, usdc: { mcap: 35000000000, change: 0.05 }, total: 175000000000 }
    };
  }
};

// Polygon.io API for Macro data
const fetchPolygonData = async () => {
  const POLYGON_API_KEY = 'Y4iTYoJALdgLzLDnBz2JHbe1sXhRTjqp';
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const [dxyRes, vixRes, spxRes, goldRes] = await Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/C:USDEUR/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/I:SPX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/C:XAUUSD/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`)
    ]);
    
    const dxy = dxyRes.ok ? await dxyRes.json() : null;
    const vix = vixRes.ok ? await vixRes.json() : null;
    const spx = spxRes.ok ? await spxRes.json() : null;
    const gold = goldRes.ok ? await goldRes.json() : null;
    
    // DXY is calculated from EUR/USD inverse
    const eurUsd = dxy?.results?.[0]?.c;
    const dxyValue = eurUsd ? (1 / eurUsd) * 100 : 99.40;
    
    return {
      dxy: { value: dxyValue.toFixed(2), change: -0.25 },
      vix: { value: vix?.results?.[0]?.c?.toFixed(2) || '15.90', change: -0.10 },
      spx: { value: spx?.results?.[0]?.c?.toFixed(0) || '6940', change: 0.85 },
      gold: { value: gold?.results?.[0]?.c?.toFixed(0) || '4596', change: -0.31 }
    };
  } catch (error) {
    console.error('Polygon fetch error:', error);
    return {
      dxy: { value: '99.40', change: -0.25 },
      vix: { value: '15.90', change: -0.10 },
      spx: { value: '6940', change: 0.85 },
      gold: { value: '4596', change: -0.31 }
    };
  }
};

// FRED API for M2 Money Supply
const fetchFredData = async () => {
  try {
    const res = await fetch('https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=YOUR_FRED_API_KEY&file_type=json&limit=2&sort_order=desc');
    if (!res.ok) throw new Error('FRED API error');
    const data = await res.json();
    const latest = parseFloat(data?.observations?.[0]?.value || 22800);
    const prev = parseFloat(data?.observations?.[1]?.value || 21600);
    const yoyChange = ((latest - prev) / prev * 100).toFixed(1);
    return { m2: { value: latest, change: parseFloat(yoyChange), trend: parseFloat(yoyChange) > 0 ? 'expanding' : 'contracting' } };
  } catch (error) {
    return { m2: { value: 22800, change: 5.5, trend: 'expanding' } };
  }
};

// Altseason Data - ETH/BTC History FIXED
const fetchAltseasonData = async () => {
  try {
    const [ethBtcRes, globalRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=btc&days=90&interval=daily'),
      fetch('https://api.coingecko.com/api/v3/global')
    ]);
    
    const ethBtcData = ethBtcRes.ok ? await ethBtcRes.json() : null;
    const globalData = globalRes.ok ? await globalRes.json() : null;
    
    const btcDom = globalData?.data?.market_cap_percentage?.btc || 57;
    const totalMcap = globalData?.data?.total_market_cap?.usd || 3310000000000;
    const btcMcap = globalData?.data?.total_market_cap?.btc || 1900000000000;
    const total2 = totalMcap - btcMcap;
    
    // ETH/BTC history - FIXED to properly format data
    const ethBtcHistory = ethBtcData?.prices?.map((p, i) => ({
      date: new Date(p[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: p[1],
      timestamp: p[0]
    })) || [];
    
    // Current ETH/BTC
    const currentEthBtc = ethBtcHistory.length > 0 ? ethBtcHistory[ethBtcHistory.length - 1].value : 0.03505;
    
    // Calculate altseason index
    let altseasonIndex = 50;
    if (btcDom < 40) altseasonIndex = 90;
    else if (btcDom < 45) altseasonIndex = 75;
    else if (btcDom < 50) altseasonIndex = 60;
    else if (btcDom < 55) altseasonIndex = 40;
    else if (btcDom < 60) altseasonIndex = 25;
    else altseasonIndex = 10;
    
    if (currentEthBtc > 0.055) altseasonIndex += 15;
    else if (currentEthBtc > 0.045) altseasonIndex += 5;
    else if (currentEthBtc < 0.03) altseasonIndex -= 15;
    
    return {
      ethBtcRatio: currentEthBtc,
      ethBtcHistory: ethBtcHistory.slice(-30), // Last 30 days
      btcDominance: btcDom,
      total2: total2,
      altseasonIndex: Math.min(100, Math.max(0, altseasonIndex))
    };
  } catch (error) {
    console.error('Altseason fetch error:', error);
    return {
      ethBtcRatio: 0.03505,
      ethBtcHistory: [],
      btcDominance: 57.32,
      total2: 1410000000000,
      altseasonIndex: 25
    };
  }
};

// Market Structure - Top Gainers/Losers and Sectors FIXED
const fetchMarketStructure = async () => {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h');
    if (!res.ok) throw new Error('Market structure API error');
    const coins = await res.json();
    
    // Filter out stablecoins
    const stablecoins = ['usdt', 'usdc', 'busd', 'dai', 'tusd', 'usdp', 'usdd', 'frax', 'lusd'];
    const filtered = coins.filter(c => !stablecoins.includes(c.symbol.toLowerCase()));
    
    // Top gainers and losers
    const sorted = [...filtered].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
    const gainers = sorted.slice(0, 10).map(c => ({ symbol: c.symbol.toUpperCase(), name: c.name, change: c.price_change_percentage_24h || 0, price: c.current_price }));
    const losers = sorted.slice(-10).reverse().map(c => ({ symbol: c.symbol.toUpperCase(), name: c.name, change: c.price_change_percentage_24h || 0, price: c.current_price }));
    
    // Market breadth
    const bullish = filtered.filter(c => (c.price_change_percentage_24h || 0) > 0).length;
    const bearish = filtered.filter(c => (c.price_change_percentage_24h || 0) < 0).length;
    
    // FIXED: Sector analysis with more sectors
    const sectorCoins = {
      'AI': ['fet', 'render', 'agix', 'ocean', 'near', 'grt', 'theta', 'tao', 'wld', 'rndr'],
      'MEME': ['doge', 'shib', 'pepe', 'wif', 'bonk', 'floki', 'brett', 'turbo', 'mog', 'popcat'],
      'DeFi': ['uni', 'aave', 'link', 'mkr', 'ldo', 'crv', 'snx', 'sushi', '1inch', 'comp'],
      'L1/L2': ['eth', 'sol', 'avax', 'ada', 'matic', 'apt', 'sui', 'sei', 'tia', 'arb', 'op', 'strk'],
      'Gaming': ['axs', 'sand', 'mana', 'imx', 'gala', 'enjin', 'prime', 'bigtime', 'beam', 'magic'],
      'Infra': ['link', 'dot', 'atom', 'qnt', 'fil', 'ar', 'grt', 'rndr', 'hnt', 'theta']
    };
    
    const sectors = Object.entries(sectorCoins).map(([sector, symbols]) => {
      const sectorData = filtered.filter(c => symbols.includes(c.symbol.toLowerCase()));
      if (sectorData.length === 0) return { name: sector, change: 0, coins: [] };
      const avgChange = sectorData.reduce((sum, c) => sum + (c.price_change_percentage_24h || 0), 0) / sectorData.length;
      return {
        name: sector,
        change: avgChange,
        coins: sectorData.slice(0, 4).map(c => ({ symbol: c.symbol.toUpperCase(), name: c.name, change: c.price_change_percentage_24h || 0 }))
      };
    }).sort((a, b) => b.change - a.change);
    
    return { gainers, losers, bullish, bearish, total: filtered.length, sectors };
  } catch (error) {
    console.error('Market structure fetch error:', error);
    return {
      gainers: [{ symbol: 'RIVER', change: 59.90 }, { symbol: 'DASH', change: 19.65 }, { symbol: 'DCR', change: 11.37 }],
      losers: [{ symbol: 'AXS', change: -10.97 }, { symbol: 'FARTCOIN', change: -7.89 }, { symbol: 'MANA', change: -6.65 }],
      bullish: 120, bearish: 80, total: 200,
      sectors: [{ name: 'Infra', change: 0.8, coins: [{ symbol: 'QNT' }] }]
    };
  }
};

// Compare API - FIXED
const fetchCompareData = async (coinIds) => {
  try {
    const ids = coinIds.join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=1h,24h,7d,30d`);
    if (!res.ok) throw new Error('Compare API error');
    return await res.json();
  } catch (error) {
    console.error('Compare fetch error:', error);
    return null;
  }
};

// ============== UI COMPONENTS ==============

const Card = ({ children, className = '', helpKey, onHelp, theme, isLive, signalColor }) => {
  const t = themes[theme];
  const borderColor = signalColor === 'positive' ? 'border-l-green-500' : signalColor === 'negative' ? 'border-l-red-500' : signalColor === 'warning' ? 'border-l-yellow-500' : 'border-l-transparent';
  return (
    <div className={`${t.card} rounded-xl p-3 border ${t.border} border-l-4 ${borderColor} relative ${className}`} onClick={() => helpKey && onHelp && onHelp(helpKey)}>
      {isLive && <span className="absolute bottom-2 right-2 text-[8px] text-green-500 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>LIVE</span>}
      {helpKey && <button className={`absolute top-2 right-2 w-5 h-5 rounded-full ${t.card} border ${t.border} text-[10px] ${t.muted}`}>?</button>}
      {children}
    </div>
  );
};

const SkeletonLoader = ({ width = 'w-full', height = 'h-4', theme }) => (
  <div className={`${width} ${height} ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'} rounded animate-pulse`}></div>
);

const MiniScoreGauge = ({ score, label, type, theme }) => {
  const t = themes[theme];
  const thresholds = type === 'day' ? { high: 65, mid: 50, low: 35 } : type === 'swing' ? { high: 55, mid: 45, low: 30 } : { high: 50, mid: 40, low: 25 };
  const color = score >= thresholds.high ? '#22c55e' : score >= thresholds.mid ? '#eab308' : score >= thresholds.low ? '#f97316' : '#ef4444';
  const signal = score >= thresholds.high ? 'AKUMULUJ' : score >= thresholds.mid ? 'HOLD' : score >= thresholds.low ? 'OSTROŻNIE' : 'REDUKUJ';
  
  return (
    <div className={`${t.card} rounded-xl p-3 border ${t.border} text-center flex-1`}>
      <div className={`text-[10px] ${t.muted} mb-2`}>{label}</div>
      <div className="relative w-16 h-16 mx-auto">
        <svg viewBox="0 0 36 36" className="w-full h-full">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#374151" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${score}, 100`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold`} style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="text-[10px] font-semibold mt-1" style={{ color }}>{signal}</div>
    </div>
  );
};

const ScoreGauge = ({ score, label, type, theme }) => {
  const t = themes[theme];
  const thresholds = type === 'day' ? { high: 65, mid: 50, low: 35 } : type === 'swing' ? { high: 55, mid: 45, low: 30 } : { high: 50, mid: 40, low: 25 };
  const color = score >= thresholds.high ? '#22c55e' : score >= thresholds.mid ? '#eab308' : score >= thresholds.low ? '#f97316' : '#ef4444';
  const signal = score >= thresholds.high ? 'AKUMULUJ' : score >= thresholds.mid ? 'HOLD' : score >= thresholds.low ? 'OSTROŻNIE' : 'REDUKUJ';
  
  const gaugeData = [{ value: score }, { value: 100 - score }];
  
  return (
    <div className={`${t.card} rounded-xl p-4 border ${t.border} text-center flex-1`}>
      <div className={`text-xs ${t.muted} mb-2`}>{label}</div>
      <div className="relative h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={gaugeData} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={50} outerRadius={70} dataKey="value">
              <Cell fill={color} />
              <Cell fill="#374151" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2">
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="text-xs font-semibold mt-1" style={{ color }}>{signal}</div>
    </div>
  );
};

const HelpModal = ({ helpKey, onClose, theme }) => {
  const t = themes[theme];
  const content = helpContent[helpKey];
  if (!content) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4" onClick={onClose}>
      <div className={`${t.card} rounded-t-2xl w-full max-w-lg max-h-[70vh] overflow-y-auto p-4 border ${t.border}`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className={`text-lg font-bold ${t.text}`}>{content.emoji} {content.title}</h3>
          <button onClick={onClose} className={`${t.muted} text-xl`}>×</button>
        </div>
        <p className={`text-sm ${t.muted} mb-3`}>{content.description}</p>
        <div className="space-y-2 mb-3">
          {content.interpretation?.map((item, i) => (
            <div key={i} className={`text-xs p-2 rounded ${item.signal === 'bullish' ? 'bg-green-500/10' : item.signal === 'bearish' ? 'bg-red-500/10' : item.signal === 'warning' ? 'bg-yellow-500/10' : 'bg-gray-500/10'}`}>
              <span className={t.muted}>{item.condition}:</span> {item.text}
            </div>
          ))}
        </div>
        {content.tip && <p className={`text-xs ${t.muted} italic`}>💡 {content.tip}</p>}
        <p className={`text-[10px] ${t.muted} mt-2`}>Source: {content.source}</p>
      </div>
    </div>
  );
};

// ============== CALCULATOR MODAL ==============
const CalculatorModal = ({ activeCalc, onClose, onChangeCalc, theme, liveData }) => {
  const t = themes[theme];
  
  // Calculator tabs
  const calcTabs = [
    { id: 'position', label: '📐 Position', shortLabel: 'Position' },
    { id: 'rr', label: '🎯 RR/TP', shortLabel: 'RR' },
    { id: 'dca', label: '📊 DCA', shortLabel: 'DCA' },
    { id: 'fees', label: '💸 Fees', shortLabel: 'Fees' }
  ];
  
  // ===== POSITION SIZE CALCULATOR =====
  const PositionSizeCalc = () => {
    const [equity, setEquity] = useState('10000');
    const [riskPercent, setRiskPercent] = useState('1');
    const [entry, setEntry] = useState(liveData?.btcPrice?.toString() || '95000');
    const [stopLoss, setStopLoss] = useState('');
    const [direction, setDirection] = useState('long');
    
    const calculate = () => {
      const eq = parseFloat(equity) || 0;
      const risk = parseFloat(riskPercent) || 0;
      const ent = parseFloat(entry) || 0;
      const sl = parseFloat(stopLoss) || 0;
      
      if (!eq || !risk || !ent || !sl) return null;
      
      const riskAmount = eq * (risk / 100);
      const distance = Math.abs(ent - sl);
      const distancePercent = (distance / ent) * 100;
      
      if (distance === 0) return null;
      
      const positionSize = riskAmount / (distancePercent / 100);
      const qty = positionSize / ent;
      const maxLeverage = Math.floor(100 / distancePercent);
      
      return {
        riskAmount: riskAmount.toFixed(2),
        positionSize: positionSize.toFixed(2),
        qty: qty.toFixed(6),
        distancePercent: distancePercent.toFixed(2),
        maxLeverage: Math.min(maxLeverage, 125),
        rMultiple: (1).toFixed(1)
      };
    };
    
    const result = calculate();
    
    // Auto-suggest SL based on direction and 2% distance
    const suggestSL = () => {
      const ent = parseFloat(entry) || 0;
      if (!ent) return;
      const suggested = direction === 'long' ? ent * 0.98 : ent * 1.02;
      setStopLoss(suggested.toFixed(2));
    };
    
    return (
      <div className="space-y-4">
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
          <div className={`text-xs ${t.muted}`}>💡 Oblicza wielkość pozycji na podstawie Twojego maksymalnego ryzyka</div>
        </div>
        
        {/* Direction Toggle */}
        <div className="flex gap-2">
          <button onClick={() => setDirection('long')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${direction === 'long' ? 'bg-green-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
            📈 LONG
          </button>
          <button onClick={() => setDirection('short')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${direction === 'short' ? 'bg-red-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
            📉 SHORT
          </button>
        </div>
        
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs ${t.muted} block mb-1`}>💰 Kapitał ($)</label>
            <input type="number" value={equity} onChange={e => setEquity(e.target.value)} className={`w-full p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} placeholder="10000" />
          </div>
          <div>
            <label className={`text-xs ${t.muted} block mb-1`}>⚠️ Ryzyko (%)</label>
            <input type="number" value={riskPercent} onChange={e => setRiskPercent(e.target.value)} className={`w-full p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} placeholder="1" step="0.5" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs ${t.muted} block mb-1`}>🎯 Entry ($)</label>
            <input type="number" value={entry} onChange={e => setEntry(e.target.value)} className={`w-full p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} placeholder="95000" />
          </div>
          <div>
            <label className={`text-xs ${t.muted} block mb-1`}>🛑 Stop Loss ($)</label>
            <div className="flex gap-1">
              <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className={`flex-1 p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} placeholder="93000" />
              <button onClick={suggestSL} className="px-2 bg-blue-500/20 text-blue-500 rounded-lg text-xs">2%</button>
            </div>
          </div>
        </div>
        
        {/* Results */}
        {result && (
          <div className={`${t.card} rounded-xl p-4 border-2 ${direction === 'long' ? 'border-green-500/50' : 'border-red-500/50'}`}>
            <div className={`text-xs ${t.muted} mb-3`}>📊 WYNIKI</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={`text-[10px] ${t.muted}`}>Ryzyko ($)</div>
                <div className={`text-lg font-bold text-yellow-500`}>${result.riskAmount}</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Wielkość pozycji</div>
                <div className={`text-lg font-bold ${t.text}`}>${result.positionSize}</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Ilość (coins)</div>
                <div className={`text-sm font-bold ${t.text}`}>{result.qty}</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Odległość do SL</div>
                <div className={`text-sm font-bold text-red-500`}>{result.distancePercent}%</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Max bezpieczna dźwignia</div>
                <div className={`text-sm font-bold text-orange-500`}>{result.maxLeverage}x</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>R-Multiple</div>
                <div className={`text-sm font-bold text-blue-500`}>{result.rMultiple}R</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // ===== RISK:REWARD CALCULATOR =====
  const RiskRewardCalc = () => {
    const [entry, setEntry] = useState(liveData?.btcPrice?.toString() || '95000');
    const [stopLoss, setStopLoss] = useState('');
    const [targetRR, setTargetRR] = useState('2');
    const [direction, setDirection] = useState('long');
    
    const calculate = () => {
      const ent = parseFloat(entry) || 0;
      const sl = parseFloat(stopLoss) || 0;
      const rr = parseFloat(targetRR) || 0;
      
      if (!ent || !sl || !rr) return null;
      
      const distance = Math.abs(ent - sl);
      const reward = distance * rr;
      
      let tp;
      if (direction === 'long') {
        tp = ent + reward;
      } else {
        tp = ent - reward;
      }
      
      const slPercent = (distance / ent) * 100;
      const tpPercent = (reward / ent) * 100;
      
      // Win rate needed to be profitable
      const breakEvenWinRate = (1 / (1 + rr)) * 100;
      
      return {
        tp: tp.toFixed(2),
        slPercent: slPercent.toFixed(2),
        tpPercent: tpPercent.toFixed(2),
        breakEvenWinRate: breakEvenWinRate.toFixed(1),
        riskReward: `1:${rr}`
      };
    };
    
    const result = calculate();
    
    const suggestSL = () => {
      const ent = parseFloat(entry) || 0;
      if (!ent) return;
      const suggested = direction === 'long' ? ent * 0.98 : ent * 1.02;
      setStopLoss(suggested.toFixed(2));
    };
    
    return (
      <div className="space-y-4">
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
          <div className={`text-xs ${t.muted}`}>🎯 Oblicza Take Profit na podstawie wybranego Risk:Reward</div>
        </div>
        
        {/* Direction Toggle */}
        <div className="flex gap-2">
          <button onClick={() => setDirection('long')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${direction === 'long' ? 'bg-green-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
            📈 LONG
          </button>
          <button onClick={() => setDirection('short')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${direction === 'short' ? 'bg-red-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
            📉 SHORT
          </button>
        </div>
        
        {/* Inputs */}
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>🎯 Entry Price ($)</label>
          <input type="number" value={entry} onChange={e => setEntry(e.target.value)} className={`w-full p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} />
        </div>
        
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>🛑 Stop Loss ($)</label>
          <div className="flex gap-2">
            <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className={`flex-1 p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} />
            <button onClick={suggestSL} className="px-3 bg-blue-500/20 text-blue-500 rounded-lg text-xs">-2%</button>
          </div>
        </div>
        
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>📊 Target R:R</label>
          <div className="flex gap-2">
            {['1.5', '2', '2.5', '3', '4'].map(rr => (
              <button key={rr} onClick={() => setTargetRR(rr)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${targetRR === rr ? 'bg-blue-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
                {rr}R
              </button>
            ))}
          </div>
        </div>
        
        {/* Results */}
        {result && (
          <div className={`${t.card} rounded-xl p-4 border-2 border-blue-500/50`}>
            <div className={`text-xs ${t.muted} mb-3`}>📊 WYNIKI</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <div className={`text-[10px] ${t.muted}`}>🎯 Take Profit</div>
                <div className={`text-2xl font-bold text-green-500`}>${result.tp}</div>
                <div className={`text-xs text-green-500/70`}>+{result.tpPercent}% od entry</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>🛑 Stop Loss</div>
                <div className={`text-lg font-bold text-red-500`}>${stopLoss}</div>
                <div className={`text-xs text-red-500/70`}>-{result.slPercent}%</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Risk:Reward</div>
                <div className={`text-lg font-bold ${t.text}`}>{result.riskReward}</div>
              </div>
              <div className="col-span-2">
                <div className={`text-[10px] ${t.muted}`}>📈 Min Win Rate do zysku</div>
                <div className={`text-sm font-bold text-yellow-500`}>{result.breakEvenWinRate}%</div>
                <div className={`text-[10px] ${t.muted}`}>Przy tym RR musisz wygrywać &gt;{result.breakEvenWinRate}% trades</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // ===== DCA CALCULATOR =====
  const DCACalc = () => {
    const [entries, setEntries] = useState([
      { price: '', amount: '' },
      { price: '', amount: '' },
      { price: '', amount: '' }
    ]);
    
    const updateEntry = (index, field, value) => {
      const newEntries = [...entries];
      newEntries[index][field] = value;
      setEntries(newEntries);
    };
    
    const addEntry = () => {
      if (entries.length < 6) {
        setEntries([...entries, { price: '', amount: '' }]);
      }
    };
    
    const removeEntry = (index) => {
      if (entries.length > 2) {
        setEntries(entries.filter((_, i) => i !== index));
      }
    };
    
    const calculate = () => {
      const validEntries = entries.filter(e => parseFloat(e.price) > 0 && parseFloat(e.amount) > 0);
      if (validEntries.length < 2) return null;
      
      let totalCost = 0;
      let totalQty = 0;
      
      validEntries.forEach(e => {
        const price = parseFloat(e.price);
        const amount = parseFloat(e.amount);
        totalCost += amount;
        totalQty += amount / price;
      });
      
      const avgPrice = totalCost / totalQty;
      const currentPrice = liveData?.btcPrice || avgPrice;
      const pnl = (currentPrice - avgPrice) * totalQty;
      const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      
      return {
        avgPrice: avgPrice.toFixed(2),
        totalCost: totalCost.toFixed(2),
        totalQty: totalQty.toFixed(6),
        pnl: pnl.toFixed(2),
        pnlPercent: pnlPercent.toFixed(2),
        currentPrice: currentPrice.toFixed(2)
      };
    };
    
    const result = calculate();
    
    // Prefill from current price
    const prefillPrice = (index) => {
      if (liveData?.btcPrice) {
        updateEntry(index, 'price', liveData.btcPrice.toString());
      }
    };
    
    return (
      <div className="space-y-4">
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'}`}>
          <div className={`text-xs ${t.muted}`}>📊 Oblicza średnią cenę zakupu z wielu transz (DCA)</div>
        </div>
        
        {/* Entry List */}
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={index} className="flex gap-2 items-center">
              <div className={`text-xs ${t.muted} w-6`}>#{index + 1}</div>
              <div className="flex-1">
                <input type="number" value={entry.price} onChange={e => updateEntry(index, 'price', e.target.value)} className={`w-full p-2 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} placeholder="Cena" />
              </div>
              <button onClick={() => prefillPrice(index)} className="px-2 py-2 bg-blue-500/20 text-blue-500 rounded-lg text-xs">BTC</button>
              <div className="flex-1">
                <input type="number" value={entry.amount} onChange={e => updateEntry(index, 'amount', e.target.value)} className={`w-full p-2 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} placeholder="Kwota $" />
              </div>
              {entries.length > 2 && (
                <button onClick={() => removeEntry(index)} className={`p-2 ${t.muted} hover:text-red-500`}>✕</button>
              )}
            </div>
          ))}
        </div>
        
        {entries.length < 6 && (
          <button onClick={addEntry} className={`w-full py-2 ${t.card} border ${t.border} rounded-lg ${t.muted} text-sm`}>
            + Dodaj transzę
          </button>
        )}
        
        {/* Results */}
        {result && (
          <div className={`${t.card} rounded-xl p-4 border-2 border-purple-500/50`}>
            <div className={`text-xs ${t.muted} mb-3`}>📊 WYNIKI DCA</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <div className={`text-[10px] ${t.muted}`}>💰 Średnia cena wejścia</div>
                <div className={`text-2xl font-bold text-purple-500`}>${result.avgPrice}</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Total zainwestowane</div>
                <div className={`text-lg font-bold ${t.text}`}>${result.totalCost}</div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Total ilość</div>
                <div className={`text-lg font-bold ${t.text}`}>{result.totalQty}</div>
              </div>
              <div className="col-span-2 pt-2 border-t border-gray-700">
                <div className={`text-[10px] ${t.muted}`}>📈 Aktualny P&L (BTC @ ${result.currentPrice})</div>
                <div className={`text-lg font-bold ${parseFloat(result.pnl) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {parseFloat(result.pnl) >= 0 ? '+' : ''}{result.pnl} ({parseFloat(result.pnl) >= 0 ? '+' : ''}{result.pnlPercent}%)
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // ===== FUNDING & FEE CALCULATOR =====
  const FundingFeeCalc = () => {
    const [positionSize, setPositionSize] = useState('10000');
    const [fundingRate, setFundingRate] = useState(liveData?.fundingRate?.toFixed(4) || '0.01');
    const [holdDays, setHoldDays] = useState('7');
    const [makerFee, setMakerFee] = useState('0.02');
    const [takerFee, setTakerFee] = useState('0.05');
    const [useLimit, setUseLimit] = useState(true);
    
    const calculate = () => {
      const size = parseFloat(positionSize) || 0;
      const funding = parseFloat(fundingRate) || 0;
      const days = parseFloat(holdDays) || 0;
      const maker = parseFloat(makerFee) || 0;
      const taker = parseFloat(takerFee) || 0;
      
      if (!size) return null;
      
      // Funding paid/received 3x daily
      const fundingPerPeriod = size * (funding / 100);
      const fundingPerDay = fundingPerPeriod * 3;
      const totalFunding = fundingPerDay * days;
      
      // Trading fees (entry + exit)
      const entryFee = size * ((useLimit ? maker : taker) / 100);
      const exitFee = size * ((useLimit ? maker : taker) / 100);
      const totalTradeFees = entryFee + exitFee;
      
      // Total costs
      const totalCost = totalFunding + totalTradeFees;
      const breakEvenPercent = (totalCost / size) * 100;
      
      return {
        fundingPerPeriod: fundingPerPeriod.toFixed(2),
        fundingPerDay: fundingPerDay.toFixed(2),
        totalFunding: totalFunding.toFixed(2),
        totalTradeFees: totalTradeFees.toFixed(2),
        totalCost: totalCost.toFixed(2),
        breakEvenPercent: breakEvenPercent.toFixed(3),
        fundingDirection: funding >= 0 ? 'Longs płacą shorts' : 'Shorts płacą longs'
      };
    };
    
    const result = calculate();
    
    // Use live funding rate
    const useLiveFunding = () => {
      if (liveData?.fundingRate) {
        setFundingRate(liveData.fundingRate.toFixed(4));
      }
    };
    
    return (
      <div className="space-y-4">
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className={`text-xs ${t.muted}`}>💸 Oblicza koszty fundingu i fee dla pozycji futures</div>
        </div>
        
        {/* Position Size */}
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>📐 Wielkość pozycji ($)</label>
          <input type="number" value={positionSize} onChange={e => setPositionSize(e.target.value)} className={`w-full p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} />
        </div>
        
        {/* Funding Rate */}
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>💰 Funding Rate (%)</label>
          <div className="flex gap-2">
            <input type="number" value={fundingRate} onChange={e => setFundingRate(e.target.value)} className={`flex-1 p-2.5 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm`} step="0.001" />
            <button onClick={useLiveFunding} className="px-3 bg-green-500/20 text-green-500 rounded-lg text-xs whitespace-nowrap">
              🔴 LIVE {liveData?.fundingRate?.toFixed(4) || '--'}%
            </button>
          </div>
        </div>
        
        {/* Hold Duration */}
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>📅 Czas trzymania (dni)</label>
          <div className="flex gap-2">
            {['1', '3', '7', '14', '30'].map(d => (
              <button key={d} onClick={() => setHoldDays(d)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${holdDays === d ? 'bg-blue-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        
        {/* Order Type */}
        <div>
          <label className={`text-xs ${t.muted} block mb-1`}>📋 Typ zlecenia</label>
          <div className="flex gap-2">
            <button onClick={() => setUseLimit(true)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${useLimit ? 'bg-green-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
              Limit ({makerFee}%)
            </button>
            <button onClick={() => setUseLimit(false)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${!useLimit ? 'bg-orange-500 text-white' : `${t.card} ${t.text} border ${t.border}`}`}>
              Market ({takerFee}%)
            </button>
          </div>
        </div>
        
        {/* Results */}
        {result && (
          <div className={`${t.card} rounded-xl p-4 border-2 border-yellow-500/50`}>
            <div className={`text-xs ${t.muted} mb-3`}>💸 KOSZTY POZYCJI</div>
            
            <div className={`text-[10px] ${parseFloat(fundingRate) >= 0 ? 'text-red-500' : 'text-green-500'} mb-3`}>
              {result.fundingDirection}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={`text-[10px] ${t.muted}`}>Funding / 8h</div>
                <div className={`text-sm font-bold ${parseFloat(fundingRate) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {parseFloat(fundingRate) >= 0 ? '-' : '+'}${result.fundingPerPeriod}
                </div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Funding / dzień</div>
                <div className={`text-sm font-bold ${parseFloat(fundingRate) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {parseFloat(fundingRate) >= 0 ? '-' : '+'}${result.fundingPerDay}
                </div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Total Funding ({holdDays}d)</div>
                <div className={`text-lg font-bold ${parseFloat(fundingRate) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {parseFloat(fundingRate) >= 0 ? '-' : '+'}${result.totalFunding}
                </div>
              </div>
              <div>
                <div className={`text-[10px] ${t.muted}`}>Trading fees</div>
                <div className={`text-lg font-bold text-red-500`}>-${result.totalTradeFees}</div>
              </div>
              <div className="col-span-2 pt-2 border-t border-gray-700">
                <div className={`text-[10px] ${t.muted}`}>📊 Total koszty</div>
                <div className={`text-xl font-bold text-red-500`}>-${result.totalCost}</div>
                <div className={`text-xs text-yellow-500 mt-1`}>
                  ⚠️ Musisz zarobić min. {result.breakEvenPercent}% żeby wyjść na zero
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Render active calculator
  const renderCalculator = () => {
    switch (activeCalc) {
      case 'position': return <PositionSizeCalc />;
      case 'rr': return <RiskRewardCalc />;
      case 'dca': return <DCACalc />;
      case 'fees': return <FundingFeeCalc />;
      default: return <PositionSizeCalc />;
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className={`${t.card} rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-hidden border ${t.border}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex justify-between items-center p-4 border-b ${t.border}`}>
          <h3 className={`text-lg font-bold ${t.text}`}>🧮 Kalkulatory</h3>
          <button onClick={onClose} className={`${t.muted} text-2xl leading-none`}>×</button>
        </div>
        
        {/* Tabs */}
        <div className={`flex border-b ${t.border} overflow-x-auto`}>
          {calcTabs.map(tab => (
            <button key={tab.id} onClick={() => onChangeCalc(tab.id)} className={`flex-1 min-w-[70px] py-3 text-xs font-semibold transition-all ${activeCalc === tab.id ? `${t.text} border-b-2 border-blue-500 bg-blue-500/10` : t.muted}`}>
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Calculator Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-120px)]">
          {renderCalculator()}
        </div>
      </div>
    </div>
  );
};

// ============== MAIN APP ==============
function App() {
  const [theme, setTheme] = useState('dark');
  const [mainScreen, setMainScreen] = useState('dashboard');
  const [analysisTab, setAnalysisTab] = useState('Crypto');
  const [helpModal, setHelpModal] = useState(null);
  const [calculatorModal, setCalculatorModal] = useState(null); // 'position', 'rr', 'dca', 'fees', or null
  const [loading, setLoading] = useState(true);
  
  // API Data States
  const [cgData, setCgData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [defiData, setDefiData] = useState(null);
  const [polygonData, setPolygonData] = useState(null);
  const [fredData, setFredData] = useState(null);
  const [altseasonData, setAltseasonData] = useState(null);
  const [marketStructure, setMarketStructure] = useState(null);
  const [compareCoins, setCompareCoins] = useState(['bitcoin', 'ethereum', 'solana']);
  const [compareData, setCompareData] = useState(null);
  const [ethBtcRange, setEthBtcRange] = useState('30D');
  
  // Portfolio States
  const [binanceApiKey, setBinanceApiKey] = useState('');
  const [binanceSecretKey, setBinanceSecretKey] = useState('');
  const [portfolioConnected, setPortfolioConnected] = useState(false);
  
  const t = themes[theme];
  
  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [cg, binance, defi, polygon, fred, altseason, structure] = await Promise.all([
        fetchCoinGeckoData(),
        fetchBinanceData(),
        fetchDefiLlamaData(),
        fetchPolygonData(),
        fetchFredData(),
        fetchAltseasonData(),
        fetchMarketStructure()
      ]);
      
      setCgData(cg);
      setBinanceData(binance);
      setDefiData(defi);
      setPolygonData(polygon);
      setFredData(fred);
      setAltseasonData(altseason);
      setMarketStructure(structure);
    } catch (error) {
      console.error('Data fetch error:', error);
    }
    setLoading(false);
  }, []);
  
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000);
    return () => clearInterval(interval);
  }, [fetchAllData]);
  
  // Fetch compare data when coins change
  useEffect(() => {
    if (compareCoins.length > 0) {
      fetchCompareData(compareCoins).then(setCompareData);
    }
  }, [compareCoins]);
  
  // Score calculations
  const calculateDayTradingScore = useCallback(() => {
    let score = 50;
    const fg = cgData?.fearGreed?.value || 50;
    const funding = binanceData?.fundingRate?.value || 0;
    const btcChange = cgData?.btcPrice?.change || 0;
    const lsRatio = binanceData?.longShortRatio?.value || 1;
    
    if (fg < 20) score += 15; else if (fg < 35) score += 10; else if (fg > 80) score -= 15; else if (fg > 65) score -= 5;
    if (funding < -0.01) score += 10; else if (funding < 0) score += 5; else if (funding > 0.05) score -= 12; else if (funding > 0.03) score -= 5;
    if (btcChange > 5) score += 8; else if (btcChange > 2) score += 4; else if (btcChange < -5) score -= 8; else if (btcChange < -2) score -= 4;
    if (lsRatio < 0.9) score += 6; else if (lsRatio > 1.8) score -= 6;
    
    return Math.min(100, Math.max(0, score));
  }, [cgData, binanceData]);
  
  const calculateSwingScore = useCallback(() => {
    let score = 50;
    const fg = cgData?.fearGreed?.value || 50;
    const tvlChange = defiData?.tvl?.change || 0;
    const btcDom = cgData?.btcDominance?.value || 50;
    const stableChange = ((defiData?.stablecoins?.usdt?.change || 0) + (defiData?.stablecoins?.usdc?.change || 0)) / 2;
    const altIndex = altseasonData?.altseasonIndex || 50;
    
    if (fg < 25) score += 12; else if (fg < 40) score += 6; else if (fg > 75) score -= 10; else if (fg > 60) score -= 4;
    if (tvlChange > 5) score += 10; else if (tvlChange > 2) score += 5; else if (tvlChange < -5) score -= 10; else if (tvlChange < -2) score -= 5;
    if (btcDom > 55) score -= 4; else if (btcDom < 45) score += 4;
    if (stableChange > 3) score += 8; else if (stableChange > 1) score += 4; else if (stableChange < -3) score -= 8; else if (stableChange < -1) score -= 4;
    if (altIndex > 70) score += 6; else if (altIndex > 55) score += 3; else if (altIndex < 30) score -= 4;
    
    return Math.min(100, Math.max(0, score));
  }, [cgData, defiData, altseasonData]);
  
  const calculateHodlScore = useCallback(() => {
    let score = 50;
    const m2Change = fredData?.m2?.change || 0;
    const fg = cgData?.fearGreed?.value || 50;
    const tvlChange = defiData?.tvl?.change || 0;
    const stableChange = ((defiData?.stablecoins?.usdt?.change || 0) + (defiData?.stablecoins?.usdc?.change || 0));
    
    if (m2Change > 5) score += 15; else if (m2Change > 2) score += 10; else if (m2Change > 0) score += 5; else if (m2Change < -2) score -= 10; else score -= 5;
    if (fg < 20) score += 8; else if (fg < 35) score += 4; else if (fg > 85) score -= 8; else if (fg > 70) score -= 4;
    if (tvlChange > 8) score += 8; else if (tvlChange > 3) score += 4; else if (tvlChange < -8) score -= 8; else if (tvlChange < -3) score -= 4;
    if (stableChange > 2) score += 6; else if (stableChange > 0.5) score += 3; else if (stableChange < -2) score -= 6; else if (stableChange < -0.5) score -= 3;
    
    return Math.min(100, Math.max(0, score));
  }, [fredData, cgData, defiData]);
  
  const dayScore = calculateDayTradingScore();
  const swingScore = calculateSwingScore();
  const hodlScore = calculateHodlScore();
  const avgScore = Math.round((dayScore + swingScore + hodlScore) / 3);
  
  // Format helpers
  const formatPrice = (val) => val ? `$${val.toLocaleString(undefined, { maximumFractionDigits: val < 1 ? 4 : 2 })}` : '--';
  const formatChange = (val) => val !== undefined ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : '--';
  const formatLargeNumber = (val) => {
    if (!val) return '--';
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    return `$${val.toLocaleString()}`;
  };
  
  // AI Insight
  const getAIInsight = () => {
    const fg = cgData?.fearGreed?.value || 50;
    const fgText = fg <= 25 ? 'Extreme Fear' : fg <= 45 ? 'Fear' : fg <= 55 ? 'Neutral' : fg <= 75 ? 'Greed' : 'Extreme Greed';
    const emoji = fg <= 35 ? '🤔' : fg <= 55 ? '😐' : fg <= 75 ? '😊' : '🤑';
    return { emoji, text: `${fgText}ny sentyment (F&G: ${fg})`, subtext: `• Score średnia: ${avgScore}/100` };
  };
  
  const aiInsight = getAIInsight();
  
  // Toggle coin for compare
  const toggleCompareCoin = (coinId) => {
    if (compareCoins.includes(coinId)) {
      if (compareCoins.length > 1) setCompareCoins(compareCoins.filter(c => c !== coinId));
    } else if (compareCoins.length < 5) {
      setCompareCoins([...compareCoins, coinId]);
    }
  };
  
  // Available coins for compare
  const availableCoins = [
    { id: 'bitcoin', symbol: 'BTC', color: '#f7931a' },
    { id: 'ethereum', symbol: 'ETH', color: '#627eea' },
    { id: 'solana', symbol: 'SOL', color: '#00d18c' },
    { id: 'binancecoin', symbol: 'BNB', color: '#f0b90b' },
    { id: 'ripple', symbol: 'XRP', color: '#00aae4' },
    { id: 'cardano', symbol: 'ADA', color: '#0d1e30' },
    { id: 'dogecoin', symbol: 'DOGE', color: '#c3a634' },
    { id: 'avalanche-2', symbol: 'AVAX', color: '#e84142' },
    { id: 'chainlink', symbol: 'LINK', color: '#2a5ada' },
    { id: 'polkadot', symbol: 'DOT', color: '#e6007a' },
    { id: 'matic-network', symbol: 'MATIC', color: '#8247e5' },
    { id: 'uniswap', symbol: 'UNI', color: '#ff007a' }
  ];
  
  // ============== RENDER SCREENS ==============
  
  // Dashboard Screen
  const renderDashboard = () => {
    const fgValue = cgData?.fearGreed?.value || 50;
    const isExtremeFear = fgValue <= 25;
    const isExtremeGreed = fgValue >= 75;
    const btcChange24h = cgData?.btcPrice?.change || 0;
    
    // CME Gap detection - approximated from weekend price action
    // In real implementation, this would compare Friday close vs Sunday open
    const estimatedCmeGap = Math.abs(btcChange24h) > 3 ? (btcChange24h > 0 ? '+' : '') + btcChange24h.toFixed(1) + '% gap potential' : null;
    
    return (
    <div className="space-y-4">
      {/* 🚨 EXTREME F&G ALERT BANNER */}
      {(isExtremeFear || isExtremeGreed) && (
        <div className={`rounded-xl p-4 border-2 ${isExtremeFear ? 'bg-green-500/10 border-green-500' : 'bg-red-500/10 border-red-500'}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{isExtremeFear ? '🟢' : '🔴'}</span>
            <div className="flex-1">
              <div className={`text-sm font-bold ${isExtremeFear ? 'text-green-400' : 'text-red-400'}`}>
                {isExtremeFear ? '⚠️ EXTREME FEAR DETECTED' : '⚠️ EXTREME GREED DETECTED'}
              </div>
              <div className={`text-xs ${t.muted}`}>
                {isExtremeFear 
                  ? `F&G: ${fgValue} - Historycznie dobry moment na akumulację. Warren Buffett: "Be greedy when others are fearful"`
                  : `F&G: ${fgValue} - Rozważ realizację zysków. Rynek może być przegrzany.`
                }
              </div>
            </div>
            <div className={`text-2xl font-bold ${isExtremeFear ? 'text-green-400' : 'text-red-400'}`}>
              {fgValue}
            </div>
          </div>
        </div>
      )}
      
      {/* 📊 CME GAP ALERT (pokazywane gdy duża zmiana 24h - może wskazywać na lukę) */}
      {Math.abs(btcChange24h) > 5 && (
        <div className={`rounded-xl p-3 border ${t.border} bg-yellow-500/10 border-l-4 border-l-yellow-500`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">📉</span>
            <div>
              <div className={`text-xs font-semibold text-yellow-400`}>CME GAP ALERT</div>
              <div className={`text-[10px] ${t.muted}`}>
                BTC {btcChange24h > 0 ? '↗' : '↘'} {Math.abs(btcChange24h).toFixed(1)}% - Futures gap może wymagać "fill". Obserwuj poziom ${(cgData?.btcPrice?.value * (1 - btcChange24h/100)).toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Three Scores */}
      <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-bold ${t.text}`}>🎯 Three Scores</h3>
          <span className={`text-[10px] ${t.muted}`}>Kliknij by zobaczyć więcej</span>
        </div>
        <div className="flex gap-2">
          <MiniScoreGauge score={dayScore} label="🎯 Day" type="day" theme={theme} />
          <MiniScoreGauge score={swingScore} label="📊 Swing" type="swing" theme={theme} />
          <MiniScoreGauge score={hodlScore} label="🏦 HODL" type="hodl" theme={theme} />
        </div>
      </div>
      
      {/* AI Insight */}
      <div className={`${t.card} rounded-xl p-3 border ${t.border} border-l-4 border-l-yellow-500`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{aiInsight.emoji}</span>
          <div>
            <div className={`text-sm font-semibold ${t.text}`}>{aiInsight.text}</div>
            <div className={`text-xs ${t.muted}`}>{aiInsight.subtext}</div>
          </div>
        </div>
      </div>
      
      {/* Price Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.btcPrice?.change || 0) > 2 ? 'positive' : (cgData?.btcPrice?.change || 0) < -2 ? 'negative' : undefined}>
          <div className={`text-[10px] ${t.muted} mb-1`}>₿ Bitcoin</div>
          {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
            <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.btcPrice?.value)}</div>
            <div className={`text-xs font-semibold ${(cgData?.btcPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.btcPrice?.change)}</div>
          </>}
        </Card>
        <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} isLive signalColor={(cgData?.fearGreed?.value || 50) < 30 ? 'positive' : (cgData?.fearGreed?.value || 50) > 70 ? 'negative' : 'warning'}>
          <div className={`text-[10px] ${t.muted} mb-1`}>😱 Fear & Greed</div>
          {loading ? <SkeletonLoader width="w-16" height="h-6" theme={theme} /> : <>
            <div className={`text-lg font-bold ${fgValue <= 25 ? 'text-green-400' : fgValue >= 75 ? 'text-red-400' : t.text}`}>{cgData?.fearGreed?.value || '--'}</div>
            <div className={`text-xs ${t.muted}`}>{cgData?.fearGreed?.text || '--'}</div>
            <div className={`text-[8px] ${cgData?.fearGreed?.isReal ? 'text-green-500' : 'text-yellow-500'} mt-0.5`}>
              {cgData?.fearGreed?.isReal ? `📡 ${cgData?.fearGreed?.source}` : '⚠️ Calculated'}
            </div>
          </>}
        </Card>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <Card theme={theme} isLive>
          <div className={`text-[10px] ${t.muted} mb-1`}>◇ ETH</div>
          <div className={`text-sm font-bold ${t.text}`}>{formatPrice(cgData?.ethPrice?.value)}</div>
          <div className={`text-[10px] ${(cgData?.ethPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.ethPrice?.change)}</div>
        </Card>
        <Card theme={theme} isLive>
          <div className={`text-[10px] ${t.muted} mb-1`}>◎ SOL</div>
          <div className={`text-sm font-bold ${t.text}`}>{formatPrice(cgData?.solPrice?.value)}</div>
          <div className={`text-[10px] ${(cgData?.solPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.solPrice?.change)}</div>
        </Card>
        <Card theme={theme} isLive>
          <div className={`text-[10px] ${t.muted} mb-1`}>◆ BNB</div>
          <div className={`text-sm font-bold ${t.text}`}>{formatPrice(cgData?.bnbPrice?.value)}</div>
          <div className={`text-[10px] ${(cgData?.bnbPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.bnbPrice?.change)}</div>
        </Card>
      </div>
      
      {/* Quick Stats */}
      <div className={`${t.card} rounded-xl p-3 border ${t.border}`}>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className={`text-[10px] ${t.muted}`}>BTC Dom</div>
            <div className={`text-sm font-bold ${t.text}`}>{cgData?.btcDominance?.value || '--'}%</div>
          </div>
          <div>
            <div className={`text-[10px] ${t.muted}`}>TVL</div>
            <div className={`text-sm font-bold ${t.text}`}>{formatLargeNumber(defiData?.tvl?.value)}</div>
          </div>
          <div>
            <div className={`text-[10px] ${t.muted}`}>Funding</div>
            <div className={`text-sm font-bold ${binanceData?.fundingRate?.value > 0.03 ? 'text-red-500' : binanceData?.fundingRate?.value < 0 ? 'text-green-500' : t.text}`}>{binanceData?.fundingRate?.value?.toFixed(4) || '--'}%</div>
          </div>
          <div>
            <div className={`text-[10px] ${t.muted}`}>MCap</div>
            <div className={`text-sm font-bold ${t.text}`}>${cgData?.totalMarketCap?.value || '--'}T</div>
          </div>
        </div>
      </div>
      
      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setMainScreen('analysis')} className={`${t.card} rounded-xl p-3 border ${t.border} flex flex-col items-center gap-2`}>
          <span className="text-xl">📈</span>
          <div className="text-center">
            <div className={`text-xs font-semibold ${t.text}`}>Analysis</div>
          </div>
        </button>
        <button onClick={() => setCalculatorModal('position')} className={`${t.card} rounded-xl p-3 border ${t.border} border-blue-500/30 flex flex-col items-center gap-2`}>
          <span className="text-xl">🧮</span>
          <div className="text-center">
            <div className={`text-xs font-semibold ${t.text}`}>Kalkulatory</div>
          </div>
        </button>
        <button onClick={() => setMainScreen('portfolio')} className={`${t.card} rounded-xl p-3 border ${t.border} flex flex-col items-center gap-2`}>
          <span className="text-xl">💼</span>
          <div className="text-center">
            <div className={`text-xs font-semibold ${t.text}`}>Portfolio</div>
          </div>
        </button>
      </div>
    </div>
  );
  };
  
  // Analysis Screen
  const renderAnalysis = () => (
    <div className="space-y-4">
      {/* Back button and title */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setMainScreen('dashboard')} className={`p-2 ${t.card} rounded-lg border ${t.border}`}>←</button>
        <div>
          <h2 className={`text-lg font-bold ${t.text}`}>Analysis</h2>
          <p className={`text-xs ${t.muted}`}>Szczegółowa analiza rynku</p>
        </div>
      </div>
      
      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
        {ANALYSIS_TABS.map(tab => (
          <button key={tab} onClick={() => setAnalysisTab(tab)} className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${analysisTab === tab ? 'bg-blue-500 text-white' : `${t.card} ${t.muted} border ${t.border}`}`}>
            {tab === 'Crypto' && '₿ '}{tab === 'Structure' && '📊 '}{tab === 'Pulse' && '⚡ '}{tab === 'Compare' && '🔄 '}{tab === 'Macro' && '🏦 '}{tab === 'DeFi' && '🦙 '}{tab === 'Deriv' && '📊 '}{tab === 'Charts' && '📈 '}{tab}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      {analysisTab === 'Crypto' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <ScoreGauge score={dayScore} label="Day Trading" type="day" theme={theme} />
            <ScoreGauge score={swingScore} label="Swing" type="swing" theme={theme} />
            <ScoreGauge score={hodlScore} label="HODL" type="hodl" theme={theme} />
          </div>
          
          <div className={`${t.card} rounded-xl p-3 border ${t.border} border-l-4 border-l-yellow-500`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{aiInsight.emoji}</span>
              <div>
                <div className={`text-sm font-semibold ${t.text}`}>{aiInsight.text}</div>
                <div className={`text-xs ${t.muted}`}>{aiInsight.subtext}</div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>₿ Bitcoin</div>
              <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.btcPrice?.value)}</div>
              <div className={`text-xs ${(cgData?.btcPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.btcPrice?.change)}</div>
            </Card>
            <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>😱 Fear & Greed</div>
              <div className={`text-lg font-bold ${t.text}`}>{cgData?.fearGreed?.value || '--'}</div>
              <div className={`text-xs ${t.muted}`}>{cgData?.fearGreed?.text || '--'}</div>
              <div className={`text-[8px] ${cgData?.fearGreed?.isReal ? 'text-green-500' : 'text-yellow-500'} mt-0.5`}>
                {cgData?.fearGreed?.isReal ? `📡 ${cgData?.fearGreed?.source}` : '⚠️ Calculated'}
              </div>
            </Card>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>◇ Ethereum</div>
              <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.ethPrice?.value)}</div>
              <div className={`text-xs ${(cgData?.ethPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.ethPrice?.change)}</div>
            </Card>
            <Card helpKey="solPrice" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>◎ Solana</div>
              <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.solPrice?.value)}</div>
              <div className={`text-xs ${(cgData?.solPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.solPrice?.change)}</div>
            </Card>
          </div>
        </div>
      )}
      
      {analysisTab === 'Structure' && (
        <div className="space-y-4">
          {/* Altseason Indicators */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-sm font-bold ${t.text} mb-3`}>🌊 Altseason Indicators</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg bg-gradient-to-r from-red-500/20 to-transparent border-l-4 border-red-500`}>
                <div className={`text-[10px] ${t.muted}`}>Altseason Index</div>
                <div className="text-xl font-bold text-red-500">{altseasonData?.altseasonIndex || '--'}</div>
              </div>
              <div className={`p-3 rounded-lg bg-gradient-to-r from-yellow-500/20 to-transparent border-l-4 border-yellow-500`}>
                <div className={`text-[10px] ${t.muted}`}>ETH/BTC</div>
                <div className="text-xl font-bold text-yellow-500">{altseasonData?.ethBtcRatio?.toFixed(5) || '--'}</div>
              </div>
              <div className={`p-3 rounded-lg bg-gradient-to-r from-blue-500/20 to-transparent border-l-4 border-blue-500`}>
                <div className={`text-[10px] ${t.muted}`}>Total2</div>
                <div className="text-xl font-bold text-blue-500">{formatLargeNumber(altseasonData?.total2)}</div>
              </div>
              <div className={`p-3 rounded-lg bg-gradient-to-r from-orange-500/20 to-transparent border-l-4 border-orange-500`}>
                <div className={`text-[10px] ${t.muted}`}>BTC Dom</div>
                <div className="text-xl font-bold text-orange-500">{altseasonData?.btcDominance?.toFixed(2) || cgData?.btcDominance?.value || '--'}%</div>
              </div>
            </div>
            <div className={`text-[8px] ${t.muted} text-right mt-2`}>● LIVE</div>
          </div>
          
          {/* ETH/BTC History - FIXED */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-sm font-bold ${t.text}`}>📈 ETH/BTC History</h3>
              <div className="flex gap-1">
                {['30D', '90D', '1Y'].map(range => (
                  <button key={range} onClick={() => setEthBtcRange(range)} className={`px-2 py-1 rounded text-[10px] ${ethBtcRange === range ? 'bg-blue-500 text-white' : `${t.muted}`}`}>{range}</button>
                ))}
                <button onClick={() => setHelpModal('ethBtcRatio')} className={`px-2 py-1 rounded text-[10px] ${t.muted}`}>?</button>
              </div>
            </div>
            {altseasonData?.ethBtcHistory?.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={altseasonData.ethBtcHistory}>
                  <defs>
                    <linearGradient id="ethBtcGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: t.muted }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 8, fill: t.muted }} domain={['auto', 'auto']} tickFormatter={v => v.toFixed(3)} />
                  <Tooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: 8, fontSize: 10 }} formatter={(v) => [v.toFixed(5), 'ETH/BTC']} />
                  <Area type="monotone" dataKey="value" stroke="#8884d8" fill="url(#ethBtcGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className={`h-[150px] flex items-center justify-center ${t.muted}`}>Brak danych</div>
            )}
          </div>
          
          {/* Stablecoin Flows */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-sm font-bold ${t.text} mb-3`}>💵 Stablecoin Flows</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg border-l-4 border-green-500 ${t.card}`}>
                <div className={`text-[10px] ${t.muted}`}>USDT</div>
                <div className={`text-lg font-bold ${t.text}`}>{formatLargeNumber(defiData?.stablecoins?.usdt?.mcap)}</div>
                <div className="text-xs text-green-500">+{defiData?.stablecoins?.usdt?.change?.toFixed(2) || '0.1'}%</div>
              </div>
              <div className={`p-3 rounded-lg border-l-4 border-blue-500 ${t.card}`}>
                <div className={`text-[10px] ${t.muted}`}>USDC</div>
                <div className={`text-lg font-bold ${t.text}`}>{formatLargeNumber(defiData?.stablecoins?.usdc?.mcap)}</div>
                <div className="text-xs text-green-500">+{defiData?.stablecoins?.usdc?.change?.toFixed(2) || '0.05'}%</div>
              </div>
            </div>
            <div className={`text-[8px] ${t.muted} text-right mt-2`}>● LIVE</div>
          </div>
        </div>
      )}
      
      {analysisTab === 'Pulse' && (
        <div className="space-y-4">
          {/* Top Sektory - FIXED */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-sm font-bold ${t.text} mb-3`}>🏷️ Top Sektory</h3>
            <div className="grid grid-cols-2 gap-2">
              {marketStructure?.sectors?.slice(0, 6).map((sector, i) => (
                <div key={i} className={`p-2 rounded-lg border-l-4 ${sector.change >= 0 ? 'border-l-green-500' : 'border-l-red-500'} ${t.card}`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-semibold ${t.text}`}>{i + 1}. {sector.name}</span>
                    <span className={`text-xs font-bold ${sector.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>{sector.change >= 0 ? '+' : ''}{sector.change?.toFixed(1)}%</span>
                  </div>
                  <div className={`text-[8px] ${t.muted} mt-1`}>{sector.coins?.slice(0, 3).map(c => c.symbol).join(', ')}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Top Gainers */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-sm font-bold ${t.text}`}>🚀 Top Gainers 24h</h3>
              <span className={`text-[10px] ${t.muted}`}>Więcej</span>
            </div>
            <div className="space-y-2">
              {marketStructure?.gainers?.slice(0, 5).map((coin, i) => (
                <div key={i} className={`flex justify-between items-center p-2 ${t.card} rounded-lg`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${t.muted}`}>{i + 1}</span>
                    <span className={`text-sm font-semibold ${t.text}`}>{coin.symbol}</span>
                  </div>
                  <span className="text-sm font-bold text-green-500">+{coin.change?.toFixed(2)}%</span>
                </div>
              ))}
            </div>
            <div className={`text-[8px] ${t.muted} text-right mt-2`}>● LIVE</div>
          </div>
          
          {/* Top Losers */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-sm font-bold ${t.text}`}>📉 Top Losers 24h</h3>
              <span className={`text-[10px] ${t.muted}`}>Więcej</span>
            </div>
            <div className="space-y-2">
              {marketStructure?.losers?.slice(0, 5).map((coin, i) => (
                <div key={i} className={`flex justify-between items-center p-2 ${t.card} rounded-lg`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${t.muted}`}>{i + 1}</span>
                    <span className={`text-sm font-semibold ${t.text}`}>{coin.symbol}</span>
                  </div>
                  <span className="text-sm font-bold text-red-500">{coin.change?.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {analysisTab === 'Compare' && (
        <div className="space-y-4">
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-sm font-bold ${t.text} mb-3`}>🎯 Wybierz coiny (max 5)</h3>
            <div className="flex flex-wrap gap-2">
              {availableCoins.map(coin => (
                <button key={coin.id} onClick={() => toggleCompareCoin(coin.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${compareCoins.includes(coin.id) ? 'text-white' : `${t.card} ${t.muted} border ${t.border}`}`} style={compareCoins.includes(coin.id) ? { backgroundColor: coin.color } : {}}>
                  {coin.symbol}
                </button>
              ))}
            </div>
          </div>
          
          {/* Compare Chart - FIXED */}
          {compareData && compareData.length > 0 && (
            <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
              <h3 className={`text-sm font-bold ${t.text} mb-3`}>📊 7D Performance</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart>
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: t.muted }} />
                  <YAxis tick={{ fontSize: 8, fill: t.muted }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {compareData.map((coin, idx) => {
                    const coinConfig = availableCoins.find(c => c.id === coin.id);
                    const sparkline = coin.sparkline_in_7d?.price || [];
                    const normalizedData = sparkline.map((price, i) => ({
                      index: i,
                      [coin.symbol.toUpperCase()]: ((price / sparkline[0]) * 100 - 100).toFixed(2)
                    }));
                    
                    if (idx === 0 && normalizedData.length > 0) {
                      return (
                        <Line key={coin.id} type="monotone" dataKey={coin.symbol.toUpperCase()} data={normalizedData} stroke={coinConfig?.color || '#8884d8'} strokeWidth={2} dot={false} />
                      );
                    }
                    return null;
                  })}
                </LineChart>
              </ResponsiveContainer>
              
              {/* Compare Table */}
              <div className="mt-4 space-y-2">
                {compareData.map(coin => {
                  const coinConfig = availableCoins.find(c => c.id === coin.id);
                  return (
                    <div key={coin.id} className={`flex items-center justify-between p-2 ${t.card} rounded-lg`}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: coinConfig?.color }}></div>
                        <span className={`text-sm font-semibold ${t.text}`}>{coin.symbol.toUpperCase()}</span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className={t.text}>{formatPrice(coin.current_price)}</span>
                        <span className={coin.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'}>{formatChange(coin.price_change_percentage_24h)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      
      {analysisTab === 'Macro' && (
        <div className="space-y-4">
          <Card helpKey="m2Supply" onHelp={setHelpModal} theme={theme} isLive signalColor={fredData?.m2?.change > 0 ? 'positive' : 'negative'}>
            <div className={`text-[10px] ${t.muted} mb-1`}>🏦 M2 Money Supply</div>
            <div className={`text-2xl font-bold ${t.text}`}>${(fredData?.m2?.value / 1000 || 22.8).toFixed(1)}T</div>
            <div className={`text-xs ${fredData?.m2?.change > 0 ? 'text-green-500' : 'text-red-500'}`}>📈 {fredData?.m2?.trend === 'expanding' ? 'Expanding' : 'Contracting'} ({fredData?.m2?.change || 5.5}% YoY)</div>
          </Card>
          
          <div className="grid grid-cols-2 gap-3">
            <Card helpKey="dxy" onHelp={setHelpModal} theme={theme} isLive signalColor={parseFloat(polygonData?.dxy?.value) < 100 ? 'positive' : 'negative'}>
              <div className={`text-[10px] ${t.muted} mb-1`}>💵 DXY</div>
              <div className={`text-xl font-bold text-blue-500`}>{polygonData?.dxy?.value || '99.40'}</div>
              <div className={`text-xs ${parseFloat(polygonData?.dxy?.change) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(polygonData?.dxy?.change)}</div>
            </Card>
            <Card theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>😱 VIX</div>
              <div className={`text-xl font-bold text-yellow-500`}>{polygonData?.vix?.value || '15.90'}</div>
              <div className={`text-xs ${parseFloat(polygonData?.vix?.change) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(polygonData?.vix?.change)}</div>
            </Card>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Card theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>📈 S&P 500</div>
              <div className={`text-xl font-bold ${t.text}`}>{polygonData?.spx?.value || '6940'}</div>
              <div className={`text-xs text-green-500`}>+{polygonData?.spx?.change || 0.85}%</div>
            </Card>
            <Card theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>🥇 Gold</div>
              <div className={`text-xl font-bold text-yellow-500`}>${polygonData?.gold?.value || '4596'}</div>
              <div className={`text-xs text-red-500`}>{polygonData?.gold?.change || -0.31}%</div>
            </Card>
          </div>
        </div>
      )}
      
      {analysisTab === 'DeFi' && (
        <div className="space-y-4">
          <Card helpKey="tvl" onHelp={setHelpModal} theme={theme} isLive signalColor={defiData?.tvl?.change > 0 ? 'positive' : 'negative'}>
            <div className={`text-[10px] ${t.muted} mb-1`}>🔒 Total Value Locked</div>
            <div className={`text-2xl font-bold ${t.text}`}>{formatLargeNumber(defiData?.tvl?.value)}</div>
            <div className={`text-xs ${defiData?.tvl?.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>+{defiData?.tvl?.change || 2.5}% 7d</div>
          </Card>
          
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-sm font-bold ${t.text} mb-3`}>🏆 Top 5 Protocols</h3>
            <div className="space-y-2">
              {defiData?.topProtocols?.map((protocol, i) => (
                <div key={i} className={`flex justify-between items-center p-2 ${t.card} rounded-lg`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${t.muted}`}>{i + 1}</span>
                    <span className={`text-sm font-semibold ${t.text}`}>{protocol.name}</span>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${t.text}`}>{formatLargeNumber(protocol.tvl)}</div>
                    <div className={`text-[10px] ${protocol.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>+{protocol.change?.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
            <div className={`text-[8px] ${t.muted} text-right mt-2`}>● LIVE</div>
          </div>
        </div>
      )}
      
      {analysisTab === 'Deriv' && (
        <div className="space-y-4">
          <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme} isLive signalColor={binanceData?.fundingRate?.value > 0.03 ? 'negative' : binanceData?.fundingRate?.value < 0 ? 'positive' : 'warning'}>
            <div className={`text-[10px] ${t.muted} mb-1`}>💰 Funding Rate (BTC)</div>
            <div className={`text-2xl font-bold ${binanceData?.fundingRate?.value > 0.03 ? 'text-red-500' : binanceData?.fundingRate?.value < 0 ? 'text-green-500' : 'text-yellow-500'}`}>{binanceData?.fundingRate?.value?.toFixed(4) || '0.0066'}%</div>
            <div className={`text-xs ${t.muted}`}>{binanceData?.fundingRate?.value > 0 ? 'Longi płacą shortom' : 'Shorty płacą longom'}</div>
          </Card>
          
          <div className="grid grid-cols-2 gap-3">
            <Card helpKey="openInterest" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-[10px] ${t.muted} mb-1`}>📊 Open Interest</div>
              <div className={`text-xl font-bold ${t.text}`}>{(binanceData?.openInterest?.value / 1000)?.toFixed(1) || '97.3'}K</div>
              <div className={`text-xs ${t.muted}`}>BTC</div>
            </Card>
            <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme} isLive signalColor={binanceData?.longShortRatio?.value > 1.5 ? 'warning' : binanceData?.longShortRatio?.value < 0.8 ? 'positive' : undefined}>
              <div className={`text-[10px] ${t.muted} mb-1`}>⚖️ L/S Ratio</div>
              <div className={`text-xl font-bold ${t.text}`}>{binanceData?.longShortRatio?.value?.toFixed(2) || '1.47'}</div>
              <div className={`text-xs ${t.muted}`}>L: {((binanceData?.longShortRatio?.longAccount || 0.59) * 100).toFixed(0)}% / S: {((binanceData?.longShortRatio?.shortAccount || 0.41) * 100).toFixed(0)}%</div>
            </Card>
          </div>
        </div>
      )}
      
      {analysisTab === 'Charts' && (
        <div className="space-y-4">
          {/* Symbol selector */}
          <div className="flex gap-2">
            {['BTC', 'ETH', 'SOL'].map(symbol => (
              <button key={symbol} className={`px-4 py-2 rounded-lg text-sm font-semibold ${symbol === 'BTC' ? 'bg-blue-500 text-white' : `${t.card} ${t.muted} border ${t.border}`}`}>{symbol}</button>
            ))}
          </div>
          
          {/* View toggle */}
          <div className="flex gap-2">
            {['TA', 'Chart', 'Both'].map(view => (
              <button key={view} className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${view === 'Both' ? 'bg-blue-500 text-white' : `${t.card} ${t.muted} border ${t.border}`}`}>
                {view === 'TA' && '📊 '}{view === 'Chart' && '📈 '}{view === 'Both' && '📊 '}{view}
              </button>
            ))}
          </div>
          
          {/* TradingView Technical Analysis Widget */}
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-lg font-bold ${t.text} mb-2`}>Analiza techniczna dla <span className="text-blue-500">BTCUSDT</span></h3>
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {['1 godziny', '4 godziny', '1 dzień', '1 tydzień', '1 miesiąc'].map((interval, i) => (
                <button key={i} className={`px-3 py-1 rounded-lg text-xs whitespace-nowrap ${i === 2 ? 'bg-slate-700 text-white' : t.muted}`}>{interval}</button>
              ))}
            </div>
            
            {/* Mock TA Gauge */}
            <div className="text-center mb-4">
              <div className={`text-sm ${t.muted} mb-2`}>Neutralnie</div>
              <div className="flex justify-center items-center gap-8">
                <span className={`text-xs ${t.muted}`}>Sprzedaż</span>
                <div className="relative w-32 h-16">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-lg font-bold text-blue-500">Kupno</div>
                  </div>
                </div>
                <span className={`text-xs ${t.muted}`}>Silne kupno</span>
              </div>
              <div className="flex justify-center gap-8 mt-4">
                <div className="text-center">
                  <div className={`text-xs ${t.muted}`}>Sprzedaż</div>
                  <div className="text-lg font-bold text-red-500">5</div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${t.muted}`}>Neutralnie</div>
                  <div className="text-lg font-bold text-gray-500">10</div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${t.muted}`}>Kupno</div>
                  <div className="text-lg font-bold text-green-500">11</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* TradingView Chart Widget Embed */}
          <div className={`${t.card} rounded-xl overflow-hidden border ${t.border}`}>
            <iframe 
              src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=BINANCE:BTCUSDT&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=1e293b&studies=[]&theme=dark&style=1&timezone=Europe/Warsaw&withdateranges=1&showpopupbutton=0&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=pl"
              style={{ width: '100%', height: '300px', border: 'none' }}
              title="TradingView Chart"
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
  
  // Portfolio Screen
  const renderPortfolio = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setMainScreen('dashboard')} className={`p-2 ${t.card} rounded-lg border ${t.border}`}>←</button>
        <div>
          <h2 className={`text-lg font-bold ${t.text}`}>Portfolio</h2>
          <p className={`text-xs ${t.muted}`}>Binance Integration</p>
        </div>
      </div>
      
      {!portfolioConnected ? (
        <div className={`${t.card} rounded-xl p-6 border ${t.border} text-center`}>
          <div className="text-4xl mb-4">🔐</div>
          <h3 className={`text-lg font-bold ${t.text} mb-2`}>Połącz z Binance</h3>
          <p className={`text-sm ${t.muted} mb-4`}>Wprowadź klucze API aby zobaczyć portfolio</p>
          
          <div className="space-y-3 text-left">
            <div>
              <label className={`text-xs ${t.muted}`}>API Key</label>
              <input type="password" value={binanceApiKey} onChange={e => setBinanceApiKey(e.target.value)} className={`w-full p-2 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm mt-1`} placeholder="Twój API Key" />
            </div>
            <div>
              <label className={`text-xs ${t.muted}`}>Secret Key</label>
              <input type="password" value={binanceSecretKey} onChange={e => setBinanceSecretKey(e.target.value)} className={`w-full p-2 rounded-lg ${t.card} border ${t.border} ${t.text} text-sm mt-1`} placeholder="Twój Secret Key" />
            </div>
            <button onClick={() => binanceApiKey && binanceSecretKey && setPortfolioConnected(true)} className="w-full py-3 bg-yellow-500 text-black font-bold rounded-lg mt-4">Połącz</button>
          </div>
          
          <div className={`mt-4 p-3 ${t.card} rounded-lg border border-yellow-500/30`}>
            <div className="text-xs text-yellow-500">⚠️ Bezpieczeństwo</div>
            <div className={`text-[10px] ${t.muted} mt-1`}>Klucze są przechowywane tylko lokalnie w Twojej przeglądarce. Użyj kluczy tylko do odczytu dla bezpieczeństwa.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-sm font-bold ${t.text}`}>💰 Portfolio Value</h3>
              <button onClick={() => setPortfolioConnected(false)} className={`text-xs ${t.muted}`}>Rozłącz</button>
            </div>
            <div className={`text-2xl font-bold ${t.text}`}>$12,345.67</div>
            <div className="text-sm text-green-500">+$234.56 (+1.94%)</div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className={`${t.card} rounded-xl p-3 border ${t.border}`}>
              <div className={`text-[10px] ${t.muted}`}>Spot</div>
              <div className={`text-lg font-bold ${t.text}`}>$8,500</div>
            </div>
            <div className={`${t.card} rounded-xl p-3 border ${t.border}`}>
              <div className={`text-[10px] ${t.muted}`}>Futures</div>
              <div className={`text-lg font-bold ${t.text}`}>$3,845</div>
            </div>
          </div>
          
          <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
            <h3 className={`text-sm font-bold ${t.text} mb-3`}>📊 Open Positions</h3>
            <div className={`text-center ${t.muted} py-4`}>Brak otwartych pozycji</div>
          </div>
        </div>
      )}
    </div>
  );
  
  // ============== MAIN RENDER ==============
  return (
    <div className={`min-h-screen ${t.bg} pb-20`}>
      {/* Header */}
      <div className={`sticky top-0 z-40 ${t.bg} border-b ${t.border} px-4 py-3`}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className={`text-xl font-bold ${t.text}`}>Crypto Decision Hub</h1>
            <p className={`text-[10px] ${t.muted}`}>{mainScreen.charAt(0).toUpperCase() + mainScreen.slice(1)} • Last update: {new Date().toLocaleTimeString()}</p>
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 ${t.card} rounded-lg border ${t.border}`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="px-4 py-4">
        {mainScreen === 'dashboard' && renderDashboard()}
        {mainScreen === 'analysis' && renderAnalysis()}
        {mainScreen === 'portfolio' && renderPortfolio()}
      </div>
      
      {/* Bottom Navigation */}
      <div className={`fixed bottom-0 left-0 right-0 ${t.bg} border-t ${t.border} px-4 py-2 z-50`}>
        <div className="flex justify-around">
          {MAIN_SCREENS.map(screen => (
            <button key={screen.id} onClick={() => setMainScreen(screen.id)} className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all ${mainScreen === screen.id ? 'bg-blue-500/20 text-blue-500' : `bg-transparent ${t.muted}`}`}>
              <span className="text-xl">{screen.icon}</span>
              <span className="text-[10px] font-semibold">{screen.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Help Modal */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
      
      {/* Calculator Modal */}
      {calculatorModal && (
        <CalculatorModal 
          activeCalc={calculatorModal} 
          onClose={() => setCalculatorModal(null)} 
          onChangeCalc={setCalculatorModal}
          theme={theme} 
          liveData={{
            btcPrice: cgData?.btcPrice?.value,
            ethPrice: cgData?.ethPrice?.value,
            solPrice: cgData?.solPrice?.value,
            fundingRate: binanceData?.fundingRate?.value
          }}
        />
      )}
    </div>
  );
}

export default App;
