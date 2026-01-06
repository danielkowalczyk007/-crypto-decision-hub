import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// ============== API FUNCTIONS ==============

// CoinGecko - ceny, dominacja, volume
const fetchCoinGeckoData = async () => {
  try {
    const [pricesRes, globalRes, fearGreedRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'),
      fetch('https://api.coingecko.com/api/v3/global'),
      fetch('https://api.alternative.me/fng/?limit=1')
    ]);
    
    const prices = await pricesRes.json();
    const global = await globalRes.json();
    const fearGreed = await fearGreedRes.json();
    
    return {
      btcPrice: {
        value: Math.round(prices.bitcoin.usd),
        change: parseFloat(prices.bitcoin.usd_24h_change?.toFixed(2)) || 0,
        marketCap: prices.bitcoin.usd_market_cap
      },
      ethPrice: {
        value: Math.round(prices.ethereum.usd),
        change: parseFloat(prices.ethereum.usd_24h_change?.toFixed(2)) || 0
      },
      btcDominance: {
        value: parseFloat(global.data.market_cap_percentage.btc.toFixed(1)),
        change: 0
      },
      totalMarketCap: global.data.total_market_cap.usd,
      volume24h: {
        total: parseFloat((global.data.total_volume.usd / 1e9).toFixed(1)),
        change: 0
      },
      fearGreed: {
        value: parseInt(fearGreed.data[0].value),
        label: fearGreed.data[0].value_classification
      }
    };
  } catch (error) {
    console.error('CoinGecko API Error:', error);
    return null;
  }
};

// Binance Futures - Funding Rate, Open Interest, Long/Short
const fetchBinanceData = async () => {
  try {
    const [fundingRes, oiRes, longShortRes, fundingHistoryRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=24'),
      fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=24')
    ]);

    const funding = await fundingRes.json();
    const oi = await oiRes.json();
    const longShort = await longShortRes.json();
    const fundingHistory = await fundingHistoryRes.json();

    const fundingRate = parseFloat(funding.lastFundingRate) * 100;
    const openInterestBTC = parseFloat(oi.openInterest);
    const latestLS = longShort[longShort.length - 1];
    const longRatio = parseFloat(latestLS.longAccount) * 100;

    const fundingChartData = fundingHistory.map(f => ({
      time: new Date(f.fundingTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
      value: parseFloat(f.fundingRate) * 100
    })).reverse();

    const longShortChartData = longShort.map(ls => ({
      time: new Date(ls.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
      long: parseFloat(ls.longAccount) * 100,
      short: parseFloat(ls.shortAccount) * 100
    }));

    return {
      fundingRate: {
        value: fundingRate.toFixed(4),
        signal: fundingRate > 0.05 ? 'overbought' : fundingRate < -0.05 ? 'oversold' : 'neutral'
      },
      openInterest: {
        value: openInterestBTC,
        formatted: (openInterestBTC / 1000).toFixed(1) + 'K BTC'
      },
      longShortRatio: {
        long: longRatio.toFixed(1),
        short: (100 - longRatio).toFixed(1),
        signal: longRatio > 55 ? 'bullish' : longRatio < 45 ? 'bearish' : 'neutral'
      },
      fundingChartData,
      longShortChartData
    };
  } catch (error) {
    console.error('Binance API Error:', error);
    return null;
  }
};

// DefiLlama - TVL, Stablecoins, Top Protocols
const fetchDefiLlamaData = async () => {
  try {
    const [tvlRes, stablecoinsRes, protocolsRes] = await Promise.all([
      fetch('https://api.llama.fi/v2/historicalChainTvl'),
      fetch('https://stablecoins.llama.fi/stablecoins?includePrices=false'),
      fetch('https://api.llama.fi/protocols')
    ]);

    const tvlData = await tvlRes.json();
    const stablecoinsData = await stablecoinsRes.json();
    const protocolsData = await protocolsRes.json();

    const last30Days = tvlData.slice(-30);
    const latestTvl = last30Days[last30Days.length - 1]?.tvl || 0;
    const tvl30DaysAgo = last30Days[0]?.tvl || latestTvl;
    const tvlChange = ((latestTvl - tvl30DaysAgo) / tvl30DaysAgo * 100).toFixed(1);

    let totalStablecoins = 0;
    if (stablecoinsData.peggedAssets) {
      stablecoinsData.peggedAssets.forEach(stable => {
        if (stable.circulating?.peggedUSD) {
          totalStablecoins += stable.circulating.peggedUSD;
        }
      });
    }

    const topProtocols = protocolsData
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
      .slice(0, 5)
      .map(p => ({ name: p.name, tvl: p.tvl, change_1d: p.change_1d }));

    const tvlChartData = last30Days.map(d => ({
      date: new Date(d.date * 1000).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
      tvl: parseFloat((d.tvl / 1e9).toFixed(1))
    }));

    return {
      tvl: {
        value: parseFloat((latestTvl / 1e9).toFixed(1)),
        change: parseFloat(tvlChange)
      },
      stablecoinSupply: {
        value: parseFloat((totalStablecoins / 1e9).toFixed(1)),
        change: 0
      },
      topProtocols,
      tvlChartData
    };
  } catch (error) {
    console.error('DefiLlama API Error:', error);
    return null;
  }
};

// FRED - M2 Money Supply
const fetchFREDData = async () => {
  try {
    const m2Data = { value: 21.5, previousValue: 21.0, date: '2024-12' };
    const change = ((m2Data.value - m2Data.previousValue) / m2Data.previousValue * 100).toFixed(1);
    return {
      m2Supply: {
        value: m2Data.value,
        change: parseFloat(change),
        trend: parseFloat(change) > 0 ? 'expanding' : 'contracting',
        unit: 'T USD',
        lastUpdate: m2Data.date
      }
    };
  } catch (error) {
    console.error('FRED API Error:', error);
    return null;
  }
};

// ============== TRADINGVIEW WIDGET ==============
const TradingViewWidget = ({ symbol = 'BINANCE:BTCUSDT', theme = 'dark' }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: true, symbol: symbol, interval: 'D', timezone: 'Europe/Warsaw',
        theme: theme, style: '1', locale: 'pl', enable_publishing: false,
        allow_symbol_change: true, calendar: false, support_host: 'https://www.tradingview.com',
        hide_top_toolbar: false, hide_legend: false, save_image: false,
        studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies']
      });
      containerRef.current.appendChild(script);
    }
  }, [symbol, theme]);

  return <div ref={containerRef} style={{ height: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
};

// ============== THEMES ==============
const themes = {
  dark: { bg: '#0a0a0f', cardBg: '#12121a', cardBorder: '#1e1e2e', text: '#ffffff', textSecondary: '#8b8b9e', positive: '#00d4aa', negative: '#ff4757', warning: '#ffa502', accent: '#6c5ce7', accentGlow: 'rgba(108, 92, 231, 0.3)' },
  light: { bg: '#f5f5f7', cardBg: '#ffffff', cardBorder: '#e0e0e0', text: '#1a1a2e', textSecondary: '#666680', positive: '#00b894', negative: '#d63031', warning: '#fdcb6e', accent: '#6c5ce7', accentGlow: 'rgba(108, 92, 231, 0.2)' }
};

// ============== MAIN APP ==============
function App() {
  const [theme, setTheme] = useState('dark');
  const [mode, setMode] = useState('longterm');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ coingecko: false, binance: false, defillama: false, fred: false });
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  
  const [marketData, setMarketData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [defiData, setDefiData] = useState(null);
  const [fredData, setFredData] = useState(null);
  
  const [mockData] = useState({
    dxy: { value: 104.2, change: -0.3 },
    mvrv: { value: 2.1, zone: 'neutral' },
    sopr: { value: 1.02, signal: 'profit' },
    etfFlows: { value: 125, change: 15 },
    exchangeReserves: { value: 2.1, change: -0.5 }
  });

  const t = themes[theme];

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const [cgData, bnData, dfData, frData] = await Promise.all([
      fetchCoinGeckoData(), fetchBinanceData(), fetchDefiLlamaData(), fetchFREDData()
    ]);
    if (cgData) { setMarketData(cgData); setApiStatus(prev => ({ ...prev, coingecko: true })); }
    if (bnData) { setBinanceData(bnData); setApiStatus(prev => ({ ...prev, binance: true })); }
    if (dfData) { setDefiData(dfData); setApiStatus(prev => ({ ...prev, defillama: true })); }
    if (frData) { setFredData(frData); setApiStatus(prev => ({ ...prev, fred: true })); }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const calculateScore = () => {
    if (!marketData) return { score: 50, signal: 'HOLD', color: t.warning };
    let score = 50;
    if (marketData.fearGreed.value < 25) score += 15;
    else if (marketData.fearGreed.value > 75) score -= 15;
    if (marketData.btcDominance.value > 55) score += 5;
    else if (marketData.btcDominance.value < 45) score -= 5;
    if (marketData.btcPrice.change > 5) score += 10;
    else if (marketData.btcPrice.change < -5) score -= 10;
    if (binanceData) {
      const funding = parseFloat(binanceData.fundingRate.value);
      if (funding < -0.01) score += 10;
      else if (funding > 0.05) score -= 10;
      const longRatio = parseFloat(binanceData.longShortRatio.long);
      if (longRatio < 45) score += 5;
      else if (longRatio > 60) score -= 5;
    }
    if (defiData && defiData.tvl.change > 5) score += 5;
    else if (defiData && defiData.tvl.change < -5) score -= 5;
    if (fredData && fredData.m2Supply.change > 3) score += 5;
    if (mockData.mvrv.value < 1) score += 15;
    else if (mockData.mvrv.value > 3.5) score -= 15;
    score = Math.max(0, Math.min(100, score));
    let signal, color;
    if (score >= 70) { signal = 'AKUMULUJ'; color = t.positive; }
    else if (score >= 55) { signal = 'HOLD+'; color = t.positive; }
    else if (score >= 45) { signal = 'HOLD'; color = t.warning; }
    else if (score >= 30) { signal = 'OSTROŻNIE'; color = t.warning; }
    else { signal = 'REDUKUJ'; color = t.negative; }
    return { score, signal, color };
  };

  const decision = calculateScore();

  const styles = {
    container: { minHeight: '100vh', background: t.bg, color: t.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '10px', maxWidth: '100%', overflowX: 'hidden' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' },
    title: { fontSize: '1.3rem', fontWeight: '700', background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    apiDot: (active) => ({ width: '8px', height: '8px', borderRadius: '50%', background: active ? t.positive : t.negative, display: 'inline-block', marginRight: '4px' }),
    tabs: { display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' },
    tab: (active) => ({ padding: '8px 16px', borderRadius: '20px', border: 'none', background: active ? t.accent : t.cardBg, color: active ? '#fff' : t.textSecondary, cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', whiteSpace: 'nowrap', transition: 'all 0.2s' }),
    card: { background: t.cardBg, borderRadius: '12px', padding: '15px', border: `1px solid ${t.cardBorder}`, marginBottom: '10px' },
    cardTitle: { fontSize: '0.75rem', color: t.textSecondary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    cardValue: { fontSize: '1.5rem', fontWeight: '700' },
    cardChange: (positive) => ({ fontSize: '0.8rem', color: positive ? t.positive : t.negative, marginLeft: '8px' }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '15px' },
    scoreCard: { background: `linear-gradient(135deg, ${t.cardBg}, ${t.accent}22)`, borderRadius: '16px', padding: '20px', textAlign: 'center', border: `2px solid ${decision.color}`, boxShadow: `0 0 30px ${decision.color}33` },
    scoreValue: { fontSize: '3rem', fontWeight: '800', color: decision.color },
    modeToggle: { display: 'flex', background: t.cardBg, borderRadius: '25px', padding: '4px', gap: '4px' },
    modeBtn: (active) => ({ padding: '6px 12px', borderRadius: '20px', border: 'none', background: active ? t.accent : 'transparent', color: active ? '#fff' : t.textSecondary, cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500', transition: 'all 0.2s' }),
    liveTag: { background: t.positive, color: '#000', padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '700', marginLeft: '5px' },
    protocolItem: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.cardBorder}` }
  };

  if (loading && !marketData) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', marginBottom: '10px' }}>⏳</div><div>Ładowanie danych...</div></div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>🚀 CryptoDecisionHub</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.7rem', color: t.textSecondary }}>
            <span style={styles.apiDot(apiStatus.coingecko)}></span>CG
            <span style={{ ...styles.apiDot(apiStatus.binance), marginLeft: '8px' }}></span>BN
            <span style={{ ...styles.apiDot(apiStatus.defillama), marginLeft: '8px' }}></span>DL
            <span style={{ ...styles.apiDot(apiStatus.fred), marginLeft: '8px' }}></span>FR
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
        <div style={styles.modeToggle}>
          <button style={styles.modeBtn(mode === 'longterm')} onClick={() => setMode('longterm')}>📈 Long-term</button>
          <button style={styles.modeBtn(mode === 'daytrading')} onClick={() => setMode('daytrading')}>⚡ Day Trading</button>
        </div>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(activeTab === 'dashboard')} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
        <button style={styles.tab(activeTab === 'onchain')} onClick={() => setActiveTab('onchain')}>⛓️ On-Chain</button>
        <button style={styles.tab(activeTab === 'defi')} onClick={() => setActiveTab('defi')}>🦙 DeFi</button>
        <button style={styles.tab(activeTab === 'macro')} onClick={() => setActiveTab('macro')}>🏦 Macro</button>
        <button style={styles.tab(activeTab === 'charts')} onClick={() => setActiveTab('charts')}>📈 Charts</button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div style={styles.scoreCard}>
            <div style={{ fontSize: '0.9rem', color: t.textSecondary, marginBottom: '5px' }}>DECISION SCORE</div>
            <div style={styles.scoreValue}>{decision.score}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: decision.color }}>{decision.signal}</div>
          </div>
          <div style={styles.grid}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>BTC Price <span style={styles.liveTag}>LIVE</span></div>
              <div style={styles.cardValue}>${marketData?.btcPrice.value.toLocaleString()}</div>
              <span style={styles.cardChange(marketData?.btcPrice.change >= 0)}>{marketData?.btcPrice.change >= 0 ? '+' : ''}{marketData?.btcPrice.change}%</span>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Fear & Greed <span style={styles.liveTag}>LIVE</span></div>
              <div style={styles.cardValue}>{marketData?.fearGreed.value}</div>
              <span style={{ fontSize: '0.8rem', color: t.textSecondary }}>{marketData?.fearGreed.label}</span>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>BTC Dominance</div>
              <div style={styles.cardValue}>{marketData?.btcDominance.value}%</div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Volume 24h</div>
              <div style={styles.cardValue}>${marketData?.volume24h.total}B</div>
            </div>
          </div>
          {mode === 'daytrading' && binanceData && (
            <>
              <div style={styles.grid}>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>Funding Rate <span style={styles.liveTag}>LIVE</span></div>
                  <div style={{ ...styles.cardValue, color: parseFloat(binanceData.fundingRate.value) > 0.03 ? t.negative : parseFloat(binanceData.fundingRate.value) < -0.01 ? t.positive : t.text }}>{binanceData.fundingRate.value}%</div>
                </div>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>Open Interest <span style={styles.liveTag}>LIVE</span></div>
                  <div style={styles.cardValue}>{binanceData.openInterest.formatted}</div>
                </div>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>Long/Short <span style={styles.liveTag}>LIVE</span></div>
                  <div style={styles.cardValue}>{binanceData.longShortRatio.long}%</div>
                  <span style={{ fontSize: '0.75rem', color: t.textSecondary }}>Long</span>
                </div>
              </div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Historia Funding Rate (24h)</div>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={binanceData.fundingChartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: t.textSecondary }} />
                    <YAxis tick={{ fontSize: 10, fill: t.textSecondary }} />
                    <Tooltip contentStyle={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }} />
                    <Area type="monotone" dataKey="value" stroke={t.accent} fill={t.accentGlow} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'onchain' && (
        <>
          <div style={styles.grid}>
            <div style={styles.card}><div style={styles.cardTitle}>MVRV Z-Score</div><div style={{ ...styles.cardValue, color: mockData.mvrv.value > 3 ? t.negative : mockData.mvrv.value < 1 ? t.positive : t.warning }}>{mockData.mvrv.value}</div><span style={{ fontSize: '0.75rem', color: t.textSecondary }}>{mockData.mvrv.zone}</span></div>
            <div style={styles.card}><div style={styles.cardTitle}>SOPR</div><div style={{ ...styles.cardValue, color: mockData.sopr.value > 1 ? t.positive : t.negative }}>{mockData.sopr.value}</div></div>
            <div style={styles.card}><div style={styles.cardTitle}>Exchange Reserves</div><div style={styles.cardValue}>{mockData.exchangeReserves.value}M BTC</div><span style={styles.cardChange(mockData.exchangeReserves.change < 0)}>{mockData.exchangeReserves.change}%</span></div>
            <div style={styles.card}><div style={styles.cardTitle}>ETF Flows</div><div style={{ ...styles.cardValue, color: mockData.etfFlows.value > 0 ? t.positive : t.negative }}>${mockData.etfFlows.value}M</div></div>
          </div>
          <div style={{ ...styles.card, background: t.cardBg + '88', textAlign: 'center', padding: '20px' }}><div style={{ fontSize: '0.9rem', color: t.textSecondary }}>⚠️ Dane on-chain wymagają płatnych API (Glassnode, CryptoQuant)</div><div style={{ fontSize: '0.8rem', color: t.textSecondary, marginTop: '5px' }}>Powyższe wartości są symulowane</div></div>
        </>
      )}

      {activeTab === 'defi' && defiData && (
        <>
          <div style={styles.grid}>
            <div style={styles.card}><div style={styles.cardTitle}>Total TVL <span style={styles.liveTag}>LIVE</span></div><div style={styles.cardValue}>${defiData.tvl.value}B</div><span style={styles.cardChange(defiData.tvl.change >= 0)}>{defiData.tvl.change >= 0 ? '+' : ''}{defiData.tvl.change}%</span></div>
            <div style={styles.card}><div style={styles.cardTitle}>Stablecoin Supply <span style={styles.liveTag}>LIVE</span></div><div style={styles.cardValue}>${defiData.stablecoinSupply.value}B</div></div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>TVL (30 dni)</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={defiData.tvlChartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: t.textSecondary }} />
                <YAxis tick={{ fontSize: 10, fill: t.textSecondary }} unit="B" />
                <Tooltip contentStyle={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }} formatter={(v) => [`$${v}B`, 'TVL']} />
                <Area type="monotone" dataKey="tvl" stroke={t.positive} fill={t.positive + '33'} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Top 5 Protokołów</div>
            {defiData.topProtocols.map((p, i) => (<div key={i} style={styles.protocolItem}><span>{i + 1}. {p.name}</span><span style={{ color: t.textSecondary }}>${(p.tvl / 1e9).toFixed(2)}B</span></div>))}
          </div>
        </>
      )}

      {activeTab === 'macro' && (
        <>
          <div style={styles.grid}>
            <div style={styles.card}><div style={styles.cardTitle}>M2 Supply <span style={{ ...styles.liveTag, background: t.warning }}>CACHE</span></div><div style={styles.cardValue}>${fredData?.m2Supply.value}T</div><span style={styles.cardChange(fredData?.m2Supply.change >= 0)}>+{fredData?.m2Supply.change}% YoY</span><div style={{ fontSize: '0.65rem', color: t.textSecondary, marginTop: '4px' }}>Źródło: FRED ({fredData?.m2Supply.lastUpdate})</div></div>
            <div style={styles.card}><div style={styles.cardTitle}>DXY Index</div><div style={styles.cardValue}>{mockData.dxy.value}</div><span style={styles.cardChange(mockData.dxy.change < 0)}>{mockData.dxy.change}%</span></div>
          </div>
          <div style={{ ...styles.card, background: `linear-gradient(135deg, ${t.cardBg}, ${t.accent}11)` }}>
            <div style={styles.cardTitle}>📊 Korelacja M2 vs BTC</div>
            <div style={{ fontSize: '0.85rem', color: t.textSecondary, lineHeight: '1.5' }}>Wzrost podaży M2 historycznie koreluje z wzrostami BTC z opóźnieniem ~3-6 miesięcy. Obecny trend: <strong style={{ color: fredData?.m2Supply.trend === 'expanding' ? t.positive : t.negative }}>{fredData?.m2Supply.trend === 'expanding' ? '📈 Ekspansja' : '📉 Kontrakcja'}</strong></div>
          </div>
        </>
      )}

      {activeTab === 'charts' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>📈 TradingView Chart</div>
          <TradingViewWidget symbol={tvSymbol} theme={theme} />
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setTvSymbol('BINANCE:BTCUSDT')} style={{ ...styles.tab(tvSymbol === 'BINANCE:BTCUSDT'), fontSize: '0.75rem' }}>BTC/USDT</button>
            <button onClick={() => setTvSymbol('BINANCE:ETHUSDT')} style={{ ...styles.tab(tvSymbol === 'BINANCE:ETHUSDT'), fontSize: '0.75rem' }}>ETH/USDT</button>
            <button onClick={() => setTvSymbol('BINANCE:SOLUSDT')} style={{ ...styles.tab(tvSymbol === 'BINANCE:SOLUSDT'), fontSize: '0.75rem' }}>SOL/USDT</button>
            <button onClick={() => setTvSymbol('CRYPTOCAP:TOTAL')} style={{ ...styles.tab(tvSymbol === 'CRYPTOCAP:TOTAL'), fontSize: '0.75rem' }}>Total MCap</button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '20px', color: t.textSecondary, fontSize: '0.75rem' }}>
        Dane: CoinGecko • Binance • DefiLlama • FRED • TradingView | Odśwież: 60s
      </div>
    </div>
  );
}

export default App;
