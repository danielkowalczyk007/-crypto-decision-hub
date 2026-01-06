import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// ============== API FUNCTIONS ==============
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
        btc: parseFloat((global.data.total_volume.usd * 0.4 / 1e9).toFixed(1)),
        change: parseFloat(global.data.market_cap_change_percentage_24h_usd?.toFixed(1)) || 0
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

const fetchBinanceData = async () => {
  try {
    // Funding Rate - BTC i ETH
    const [btcFundingRes, ethFundingRes, btcOIRes, ethOIRes, btcLiqRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1'),
      fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1'),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT'),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1')
    ]);

    const btcFunding = await btcFundingRes.json();
    const ethFunding = await ethFundingRes.json();
    const btcOI = await btcOIRes.json();
    const ethOI = await ethOIRes.json();
    const btcLongShort = await btcLiqRes.json();

    // Pobierz poprzedni OI dla zmiany procentowej
    const btcOIPrevRes = await fetch('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=2');
    const btcOIPrev = await btcOIPrevRes.json();
    
    let oiChange = 0;
    if (btcOIPrev && btcOIPrev.length >= 2) {
      const current = parseFloat(btcOIPrev[0].sumOpenInterestValue);
      const previous = parseFloat(btcOIPrev[1].sumOpenInterestValue);
      oiChange = ((current - previous) / previous * 100).toFixed(2);
    }

    // Long/Short ratio do obliczenia liquidation bias
    let longPercent = 50;
    if (btcLongShort && btcLongShort.length > 0) {
      const ratio = parseFloat(btcLongShort[0].longShortRatio);
      longPercent = Math.round((ratio / (1 + ratio)) * 100);
    }

    return {
      fundingRate: {
        btc: parseFloat(btcFunding[0]?.fundingRate) || 0,
        eth: parseFloat(ethFunding[0]?.fundingRate) || 0,
      },
      openInterest: {
        btc: parseFloat(btcOI.openInterest) || 0,
        eth: parseFloat(ethOI.openInterest) || 0,
        btcValue: parseFloat(btcOI.openInterest) * 94000 / 1e9, // przybliżona wartość w mld USD
        change: parseFloat(oiChange)
      },
      longShortRatio: {
        longPercent: longPercent,
        shortPercent: 100 - longPercent
      }
    };
  } catch (error) {
    console.error('Binance API Error:', error);
    return null;
  }
};

// Pobierz historię funding rate
const fetchFundingHistory = async () => {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=20');
    const data = await res.json();
    return data.map((item, index) => ({
      time: new Date(item.fundingTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
      rate: (parseFloat(item.fundingRate) * 100).toFixed(4),
      rateNum: parseFloat(item.fundingRate) * 100
    })).reverse();
  } catch (error) {
    console.error('Funding history error:', error);
    return [];
  }
};

// Pobierz top liquidacje (symulowane na podstawie long/short)
const fetchLiquidations = async () => {
  try {
    // Binance nie ma publicznego API dla likwidacji, używamy long/short ratio jako proxy
    const res = await fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=24');
    const data = await res.json();
    
    return data.map((item) => {
      const ratio = parseFloat(item.longShortRatio);
      const longPct = (ratio / (1 + ratio)) * 100;
      return {
        time: new Date(item.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
        longs: Math.round(longPct),
        shorts: Math.round(100 - longPct)
      };
    }).reverse().slice(-12);
  } catch (error) {
    console.error('Liquidations error:', error);
    return [];
  }
};

// ============== LOCAL STORAGE HELPERS ==============
const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage error:', e);
  }
};

const loadFromStorage = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

// ============== NOTIFICATION HELPER ==============
const requestNotificationPermission = async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

const sendNotification = (title, body) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '🚀' });
  }
};

// ============== MOCK DATA GENERATOR ==============
const generateMockData = (apiData = null, binanceData = null) => {
  const base = {
    // MACRO
    m2Supply: { value: 21.5 + (Math.random() * 0.3 - 0.15), trend: 'up', change: 2.3 + (Math.random() * 0.5 - 0.25) },
    dxy: { value: 103.42 + (Math.random() * 2 - 1), trend: 'down', change: -1.8 + (Math.random() * 0.5 - 0.25) },
    fedWatch: { nextCut: '2025-03', probability: 68 + Math.floor(Math.random() * 10 - 5) },
    // PRICES (will be overwritten by API if available)
    btcPrice: { value: 94250 + Math.floor(Math.random() * 2000 - 1000), change: 3.2 + (Math.random() * 2 - 1), ath: 109000 },
    ethPrice: { value: 3420 + Math.floor(Math.random() * 100 - 50), change: 2.8 + (Math.random() * 2 - 1) },
    // ON-CHAIN
    stablecoinSupply: { value: 178.5 + (Math.random() * 2 - 1), change: 5.2 + (Math.random() * 1 - 0.5) },
    tvl: { value: 89.4 + (Math.random() * 5 - 2.5), change: 12.3 + (Math.random() * 3 - 1.5) },
    mvrvZScore: { value: 1.8 + (Math.random() * 0.4 - 0.2), zone: 'neutral' },
    sopr: { value: 0.98 + (Math.random() * 0.04 - 0.02), signal: 'accumulation' },
    exchangeReserves: { btc: 2.1 + (Math.random() * 0.1 - 0.05), eth: 17.8, trend: 'outflow' },
    // FLOWS
    etfFlows: { daily: 245 + Math.floor(Math.random() * 100 - 50), weekly: 1820 + Math.floor(Math.random() * 200 - 100) },
    institutionalBtc: { percentage: 20.4 + (Math.random() * 0.5 - 0.25) },
    // DAY TRADING (will be overwritten by Binance if available)
    rsi: { value: Math.floor(30 + Math.random() * 50), signal: 'neutral' },
    fundingRate: { btc: 0.005 + Math.random() * 0.02, eth: 0.004 + Math.random() * 0.015, signal: 'bullish' },
    openInterest: { value: 18.2 + (Math.random() * 2 - 1), change: 5.4 + (Math.random() * 4 - 2) },
    liquidations: { 
      last24h: 100 + Math.floor(Math.random() * 100), 
      longPercent: 30 + Math.floor(Math.random() * 40), 
      shortPercent: 0,
      largest: 1.5 + Math.random() * 2
    },
    fearGreed: { value: 50 + Math.floor(Math.random() * 40 - 20), label: 'Neutral' },
    volume24h: { btc: 42.3 + (Math.random() * 5 - 2.5), total: 98.7 + (Math.random() * 10 - 5), change: 12.1 + (Math.random() * 5 - 2.5) },
    btcDominance: { value: 54.2 + (Math.random() * 2 - 1), change: -0.8 + (Math.random() * 0.4 - 0.2) },
    volatility: { value: 2 + Math.random() * 3, label: 'Moderate' },
    orderFlow: { buyPressure: 45 + Math.floor(Math.random() * 20), sellPressure: 0 },
  };
  
  // Fix calculated values
  base.liquidations.shortPercent = 100 - base.liquidations.longPercent;
  base.orderFlow.sellPressure = 100 - base.orderFlow.buyPressure;
  base.mvrvZScore.zone = base.mvrvZScore.value < 1 ? 'undervalued' : base.mvrvZScore.value > 3 ? 'overvalued' : 'neutral';
  base.volatility.label = base.volatility.value < 2 ? 'Low' : base.volatility.value > 4 ? 'High' : 'Moderate';
  
  // Merge with CoinGecko API data
  if (apiData) {
    if (apiData.btcPrice) base.btcPrice = { ...base.btcPrice, ...apiData.btcPrice };
    if (apiData.ethPrice) base.ethPrice = { ...base.ethPrice, ...apiData.ethPrice };
    if (apiData.btcDominance) base.btcDominance = apiData.btcDominance;
    if (apiData.volume24h) base.volume24h = apiData.volume24h;
    if (apiData.fearGreed) base.fearGreed = apiData.fearGreed;
  }

  // Merge with Binance data
  if (binanceData) {
    if (binanceData.fundingRate) {
      base.fundingRate = {
        btc: binanceData.fundingRate.btc,
        eth: binanceData.fundingRate.eth,
        signal: binanceData.fundingRate.btc > 0.0005 ? 'bearish' : binanceData.fundingRate.btc < 0 ? 'very bullish' : 'bullish'
      };
    }
    if (binanceData.openInterest) {
      base.openInterest = {
        value: parseFloat(binanceData.openInterest.btcValue?.toFixed(1)) || base.openInterest.value,
        change: binanceData.openInterest.change || 0,
        btcAmount: binanceData.openInterest.btc,
        ethAmount: binanceData.openInterest.eth
      };
    }
    if (binanceData.longShortRatio) {
      base.liquidations.longPercent = binanceData.longShortRatio.longPercent;
      base.liquidations.shortPercent = binanceData.longShortRatio.shortPercent;
      base.orderFlow.buyPressure = binanceData.longShortRatio.longPercent;
      base.orderFlow.sellPressure = binanceData.longShortRatio.shortPercent;
    }
  }
  
  return base;
};

// ============== THEME DEFINITIONS ==============
const themes = {
  dark: {
    bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    cardBg: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(255,255,255,0.1)',
    text: '#fff',
    textSecondary: '#888',
    positive: '#00ff88',
    negative: '#ff4757',
    neutral: '#ffa502',
  },
  light: {
    bg: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 50%, #d1d8e0 100%)',
    cardBg: 'rgba(255,255,255,0.9)',
    cardBorder: 'rgba(0,0,0,0.1)',
    text: '#1a1a2e',
    textSecondary: '#666',
    positive: '#00a65a',
    negative: '#dc3545',
    neutral: '#f39c12',
  }
};

// ============== DEFAULT WEIGHTS ==============
const defaultWeights = {
  // Long-term
  m2Supply: 15,
  dxy: 15,
  mvrvZScore: 20,
  sopr: 15,
  exchangeReserves: 10,
  etfFlows: 15,
  stablecoinSupply: 10,
  // Day trading
  rsi: 25,
  fundingRate: 20,
  liquidations: 20,
  fearGreed: 15,
  orderFlow: 20,
};

// ============== MAIN APP ==============
function App() {
  // State
  const [data, setData] = useState(generateMockData());
  const [activeTab, setActiveTab] = useState('macro');
  const [tradingMode, setTradingMode] = useState('longterm');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [theme, setTheme] = useState(loadFromStorage('theme', 'dark'));
  const [weights, setWeights] = useState(loadFromStorage('weights', defaultWeights));
  const [favorites, setFavorites] = useState(loadFromStorage('favorites', []));
  const [portfolio, setPortfolio] = useState(loadFromStorage('portfolio', { btc: 0, eth: 0 }));
  const [scoreHistory, setScoreHistory] = useState(loadFromStorage('scoreHistory', []));
  const [alerts, setAlerts] = useState(loadFromStorage('alerts', { enabled: false, bullishThreshold: 70, bearishThreshold: 30 }));
  const [showSettings, setShowSettings] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [apiData, setApiData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [fundingHistory, setFundingHistory] = useState([]);
  const [longShortHistory, setLongShortHistory] = useState([]);
  const [apiStatus, setApiStatus] = useState({ coingecko: false, binance: false });

  const t = themes[theme];

  // Fetch real data
  const fetchData = useCallback(async () => {
    // CoinGecko
    const cgData = await fetchCoinGeckoData();
    if (cgData) {
      setApiData(cgData);
      setApiStatus(prev => ({ ...prev, coingecko: true }));
    }

    // Binance
    const bnData = await fetchBinanceData();
    if (bnData) {
      setBinanceData(bnData);
      setApiStatus(prev => ({ ...prev, binance: true }));
    }

    // Funding history
    const fundingHist = await fetchFundingHistory();
    if (fundingHist.length > 0) {
      setFundingHistory(fundingHist);
    }

    // Long/Short history
    const lsHist = await fetchLiquidations();
    if (lsHist.length > 0) {
      setLongShortHistory(lsHist);
    }

    setData(generateMockData(cgData, bnData));
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, tradingMode === 'daytrading' ? 15000 : 60000);
    return () => clearInterval(interval);
  }, [tradingMode, fetchData]);

  // Calculate scores
  const calculateLongTermScore = useCallback(() => {
    let score = 0;
    let totalWeight = 0;
    
    if (data.m2Supply.trend === 'up') score += weights.m2Supply;
    totalWeight += weights.m2Supply;
    
    if (data.dxy.trend === 'down') score += weights.dxy;
    totalWeight += weights.dxy;
    
    if (data.mvrvZScore.value < 2) score += weights.mvrvZScore;
    else if (data.mvrvZScore.value < 3) score += weights.mvrvZScore * 0.5;
    totalWeight += weights.mvrvZScore;
    
    if (data.sopr.value < 1) score += weights.sopr;
    else if (data.sopr.value < 1.02) score += weights.sopr * 0.5;
    totalWeight += weights.sopr;
    
    if (data.exchangeReserves.trend === 'outflow') score += weights.exchangeReserves;
    totalWeight += weights.exchangeReserves;
    
    if (data.etfFlows.daily > 100) score += weights.etfFlows;
    else if (data.etfFlows.daily > 0) score += weights.etfFlows * 0.5;
    totalWeight += weights.etfFlows;
    
    if (data.stablecoinSupply.change > 3) score += weights.stablecoinSupply;
    else if (data.stablecoinSupply.change > 0) score += weights.stablecoinSupply * 0.5;
    totalWeight += weights.stablecoinSupply;
    
    return Math.round((score / totalWeight) * 100);
  }, [data, weights]);

  const calculateDayTradingScore = useCallback(() => {
    let score = 0;
    let totalWeight = 0;
    
    // RSI
    if (data.rsi.value < 30) score += weights.rsi;
    else if (data.rsi.value < 45) score += weights.rsi * 0.7;
    else if (data.rsi.value < 55) score += weights.rsi * 0.5;
    else if (data.rsi.value < 70) score += weights.rsi * 0.3;
    totalWeight += weights.rsi;
    
    // Funding Rate (Binance live!)
    const fundingPct = data.fundingRate.btc * 100;
    if (fundingPct < 0.01) score += weights.fundingRate;
    else if (fundingPct < 0.03) score += weights.fundingRate * 0.7;
    else if (fundingPct < 0.05) score += weights.fundingRate * 0.3;
    totalWeight += weights.fundingRate;
    
    // Long/Short ratio (Binance live!)
    if (data.liquidations.shortPercent > 60) score += weights.liquidations;
    else if (data.liquidations.shortPercent > 55) score += weights.liquidations * 0.7;
    else if (data.liquidations.shortPercent > 50) score += weights.liquidations * 0.5;
    totalWeight += weights.liquidations;
    
    // Fear & Greed
    if (data.fearGreed.value < 25) score += weights.fearGreed;
    else if (data.fearGreed.value < 40) score += weights.fearGreed * 0.7;
    else if (data.fearGreed.value < 60) score += weights.fearGreed * 0.5;
    totalWeight += weights.fearGreed;
    
    // Order Flow (Binance live!)
    if (data.orderFlow.buyPressure > 55) score += weights.orderFlow;
    else if (data.orderFlow.buyPressure > 50) score += weights.orderFlow * 0.5;
    totalWeight += weights.orderFlow;
    
    return Math.round((score / totalWeight) * 100);
  }, [data, weights]);

  const score = tradingMode === 'longterm' ? calculateLongTermScore() : calculateDayTradingScore();

  // Save score history
  useEffect(() => {
    const now = new Date();
    const newEntry = {
      time: now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
      date: now.toLocaleDateString('pl-PL'),
      score,
      mode: tradingMode,
      btcPrice: data.btcPrice.value
    };
    
    setScoreHistory(prev => {
      const updated = [...prev, newEntry].slice(-100);
      saveToStorage('scoreHistory', updated);
      return updated;
    });
  }, [score, tradingMode, data.btcPrice.value]);

  // Check alerts
  useEffect(() => {
    if (alerts.enabled) {
      if (score >= alerts.bullishThreshold) {
        sendNotification('🟢 Bullish Alert!', `Score reached ${score} - Consider buying`);
      } else if (score <= alerts.bearishThreshold) {
        sendNotification('🔴 Bearish Alert!', `Score dropped to ${score} - Consider selling`);
      }
    }
  }, [score, alerts]);

  // Save settings
  useEffect(() => { saveToStorage('theme', theme); }, [theme]);
  useEffect(() => { saveToStorage('weights', weights); }, [weights]);
  useEffect(() => { saveToStorage('favorites', favorites); }, [favorites]);
  useEffect(() => { saveToStorage('portfolio', portfolio); }, [portfolio]);
  useEffect(() => { saveToStorage('alerts', alerts); }, [alerts]);

  // Helpers
  const getDecisionColor = () => {
    if (score >= 70) return t.positive;
    if (score >= 40) return t.neutral;
    return t.negative;
  };

  const getDecisionLabel = () => {
    if (tradingMode === 'daytrading') {
      if (score >= 70) return 'LONG BIAS';
      if (score >= 40) return 'NEUTRAL';
      return 'SHORT BIAS';
    }
    if (score >= 70) return 'BULLISH';
    if (score >= 40) return 'NEUTRAL';
    return 'BEARISH';
  };

  const toggleFavorite = (indicator) => {
    setFavorites(prev => 
      prev.includes(indicator) 
        ? prev.filter(f => f !== indicator)
        : [...prev, indicator]
    );
  };

  const portfolioValue = (portfolio.btc * data.btcPrice.value) + (portfolio.eth * data.ethPrice.value);

  const backtestData = scoreHistory
    .filter(h => h.mode === tradingMode)
    .slice(-30)
    .map((h, i, arr) => ({
      ...h,
      signal: h.score >= 70 ? 'buy' : h.score <= 30 ? 'sell' : 'hold',
      priceChange: i > 0 ? ((h.btcPrice - arr[i-1].btcPrice) / arr[i-1].btcPrice * 100).toFixed(2) : 0
    }));

  // ============== STYLES ==============
  const styles = {
    app: {
      minHeight: '100vh',
      background: t.bg,
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    container: {
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '12px',
    },
    header: {
      textAlign: 'center',
      marginBottom: '20px',
      padding: '15px',
      background: t.cardBg,
      borderRadius: '16px',
      border: `1px solid ${t.cardBorder}`,
    },
    title: {
      fontSize: '1.8rem',
      fontWeight: '700',
      background: 'linear-gradient(90deg, #00d4ff, #7b2ff7)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      marginBottom: '8px',
    },
    subtitle: {
      color: t.textSecondary,
      fontSize: '0.85rem',
    },
    apiStatus: {
      display: 'flex',
      justifyContent: 'center',
      gap: '15px',
      marginTop: '8px',
      fontSize: '0.75rem',
    },
    statusBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 8px',
      borderRadius: '12px',
      background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    },
    statusDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
    },
    topBar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '10px',
      marginBottom: '15px',
    },
    iconButton: {
      background: t.cardBg,
      border: `1px solid ${t.cardBorder}`,
      borderRadius: '10px',
      padding: '10px 15px',
      cursor: 'pointer',
      color: t.text,
      fontSize: '1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '15px',
      marginBottom: '20px',
    },
    card: {
      background: t.cardBg,
      borderRadius: '16px',
      padding: '15px',
      border: `1px solid ${t.cardBorder}`,
    },
    cardLive: {
      background: t.cardBg,
      borderRadius: '16px',
      padding: '15px',
      border: `2px solid ${t.positive}`,
      position: 'relative',
    },
    liveBadge: {
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: t.positive,
      color: '#000',
      padding: '2px 8px',
      borderRadius: '10px',
      fontSize: '0.65rem',
      fontWeight: '700',
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: '0.8rem',
      color: t.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    starButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '1.2rem',
      padding: '0',
    },
    cardValue: {
      fontSize: '1.8rem',
      fontWeight: '700',
      marginBottom: '5px',
    },
    cardChange: {
      fontSize: '0.85rem',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    },
    signalBox: {
      background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      borderRadius: '10px',
      padding: '10px',
      marginTop: '10px',
      fontSize: '0.8rem',
    },
    tabs: {
      display: 'flex',
      gap: '8px',
      marginBottom: '15px',
      flexWrap: 'wrap',
    },
    tab: {
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.85rem',
      transition: 'all 0.3s',
    },
    tabActive: {
      background: 'linear-gradient(90deg, #00d4ff, #7b2ff7)',
      color: '#fff',
    },
    tabInactive: {
      background: t.cardBg,
      color: t.textSecondary,
      border: `1px solid ${t.cardBorder}`,
    },
    modeSelector: {
      display: 'flex',
      justifyContent: 'center',
      gap: '10px',
      marginBottom: '15px',
    },
    modeButton: {
      padding: '10px 25px',
      borderRadius: '25px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: '700',
      fontSize: '0.9rem',
    },
    decisionPanel: {
      background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,247,0.15))',
      borderRadius: '16px',
      padding: '20px',
      textAlign: 'center',
      border: '2px solid rgba(0,212,255,0.2)',
      marginBottom: '20px',
    },
    decisionScore: {
      fontSize: '3rem',
      fontWeight: '800',
    },
    decisionLabel: {
      fontSize: '1.2rem',
      fontWeight: '600',
      marginBottom: '10px',
    },
    meter: {
      height: '15px',
      background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '10px',
    },
    meterFill: {
      height: '100%',
      borderRadius: '10px',
      background: 'linear-gradient(90deg, #ff4757, #ffa502, #00ff88)',
      transition: 'width 1s ease-out',
    },
    chartContainer: {
      background: t.cardBg,
      borderRadius: '16px',
      padding: '15px',
      marginBottom: '20px',
      border: `1px solid ${t.cardBorder}`,
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    },
    modalContent: {
      background: theme === 'dark' ? '#1a1a2e' : '#fff',
      borderRadius: '16px',
      padding: '25px',
      maxWidth: '500px',
      width: '100%',
      maxHeight: '80vh',
      overflow: 'auto',
      color: t.text,
    },
    modalTitle: {
      fontSize: '1.3rem',
      fontWeight: '700',
      marginBottom: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    closeButton: {
      background: 'none',
      border: 'none',
      fontSize: '1.5rem',
      cursor: 'pointer',
      color: t.textSecondary,
    },
    slider: {
      width: '100%',
      marginTop: '5px',
    },
    input: {
      width: '100%',
      padding: '10px',
      borderRadius: '8px',
      border: `1px solid ${t.cardBorder}`,
      background: t.cardBg,
      color: t.text,
      marginBottom: '10px',
    },
    button: {
      padding: '10px 20px',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: '600',
      background: 'linear-gradient(90deg, #00d4ff, #7b2ff7)',
      color: '#fff',
      marginRight: '10px',
    },
    liquidationBar: {
      display: 'flex',
      height: '25px',
      borderRadius: '8px',
      overflow: 'hidden',
      marginTop: '10px',
    },
    footer: {
      textAlign: 'center',
      padding: '15px',
      color: t.textSecondary,
      fontSize: '0.75rem',
    },
  };

  // ============== RENDER ==============
  return (
    <div style={styles.app}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.title}>🚀 Crypto Decision Hub</h1>
          <p style={styles.subtitle}>
            Aktualizacja: {lastUpdate.toLocaleTimeString('pl-PL')}
          </p>
          <div style={styles.apiStatus}>
            <div style={styles.statusBadge}>
              <div style={{ ...styles.statusDot, background: apiStatus.coingecko ? t.positive : t.negative }} />
              CoinGecko
            </div>
            <div style={styles.statusBadge}>
              <div style={{ ...styles.statusDot, background: apiStatus.binance ? t.positive : t.negative }} />
              Binance
            </div>
          </div>
        </header>

        {/* Top Bar */}
        <div style={styles.topBar}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button style={styles.iconButton} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button style={styles.iconButton} onClick={() => setShowSettings(true)}>
              ⚙️
            </button>
            <button style={styles.iconButton} onClick={() => setShowPortfolio(true)}>
              💼
            </button>
            <button style={styles.iconButton} onClick={() => setShowBacktest(true)}>
              📊
            </button>
          </div>
          <button 
            style={styles.iconButton} 
            onClick={async () => {
              const granted = await requestNotificationPermission();
              if (granted) {
                setAlerts(prev => ({ ...prev, enabled: !prev.enabled }));
              }
            }}
          >
            {alerts.enabled ? '🔔' : '🔕'}
          </button>
        </div>

        {/* Mode Selector */}
        <div style={styles.modeSelector}>
          <button
            style={{ ...styles.modeButton, ...(tradingMode === 'longterm' ? styles.tabActive : styles.tabInactive) }}
            onClick={() => { setTradingMode('longterm'); setActiveTab('macro'); }}
          >
            📈 Long-Term
          </button>
          <button
            style={{ ...styles.modeButton, ...(tradingMode === 'daytrading' ? styles.tabActive : styles.tabInactive) }}
            onClick={() => { setTradingMode('daytrading'); setActiveTab('momentum'); }}
          >
            ⚡ Day Trading
          </button>
        </div>

        {/* Decision Panel */}
        <div style={styles.decisionPanel}>
          <div style={{ ...styles.decisionScore, color: getDecisionColor() }}>{score}</div>
          <div style={{ ...styles.decisionLabel, color: getDecisionColor() }}>{getDecisionLabel()}</div>
          <div style={styles.meter}>
            <div style={{ ...styles.meterFill, width: `${score}%` }} />
          </div>
          <p style={{ color: t.textSecondary, fontSize: '0.85rem' }}>
            {tradingMode === 'longterm' 
              ? 'Agregacja: makro + on-chain + przepływy'
              : '🟢 Binance Live: funding, OI, long/short ratio'}
          </p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {tradingMode === 'longterm' ? (
            <>
              {['macro', 'onchain', 'flows'].map(tab => (
                <button
                  key={tab}
                  style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : styles.tabInactive) }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'macro' && '📊 Makro'}
                  {tab === 'onchain' && '⛓️ On-Chain'}
                  {tab === 'flows' && '💰 Przepływy'}
                </button>
              ))}
            </>
          ) : (
            <>
              {['momentum', 'sentiment', 'liquidations'].map(tab => (
                <button
                  key={tab}
                  style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : styles.tabInactive) }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'momentum' && '📉 Momentum'}
                  {tab === 'sentiment' && '🎭 Sentyment'}
                  {tab === 'liquidations' && '💥 Pozycje'}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Cards Grid - Long Term */}
        {tradingMode === 'longterm' && (
          <div style={styles.grid}>
            {activeTab === 'macro' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>💵 M2 Money Supply</div>
                    <button style={styles.starButton} onClick={() => toggleFavorite('m2Supply')}>
                      {favorites.includes('m2Supply') ? '⭐' : '☆'}
                    </button>
                  </div>
                  <div style={styles.cardValue}>${data.m2Supply.value.toFixed(1)}T</div>
                  <div style={{ ...styles.cardChange, color: t.positive }}>
                    ▲ {data.m2Supply.change.toFixed(1)}% YoY
                  </div>
                  <div style={styles.signalBox}>
                    Ekspansja płynności - pozytywne dla ryzyka
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>💲 DXY (Dollar Index)</div>
                  </div>
                  <div style={styles.cardValue}>{data.dxy.value.toFixed(2)}</div>
                  <div style={{ ...styles.cardChange, color: t.positive }}>
                    ▼ {Math.abs(data.dxy.change).toFixed(1)}%
                  </div>
                  <div style={styles.signalBox}>
                    Słabszy dolar sprzyja ryzyku
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>🏛️ FedWatch</div>
                  </div>
                  <div style={styles.cardValue}>{data.fedWatch.probability}%</div>
                  <div style={{ ...styles.cardChange, color: t.neutral }}>
                    Cięcie: {data.fedWatch.nextCut}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'onchain' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>📈 MVRV Z-Score</div>
                  </div>
                  <div style={styles.cardValue}>{data.mvrvZScore.value.toFixed(2)}</div>
                  <div style={{ ...styles.cardChange, color: t.positive }}>
                    {data.mvrvZScore.zone}
                  </div>
                  <div style={styles.signalBox}>
                    &lt;2 = niedowartościowanie
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>💎 SOPR</div>
                  </div>
                  <div style={styles.cardValue}>{data.sopr.value.toFixed(3)}</div>
                  <div style={{ ...styles.cardChange, color: t.positive }}>
                    {data.sopr.signal}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>🏦 Rezerwy giełd</div>
                  </div>
                  <div style={styles.cardValue}>{data.exchangeReserves.btc.toFixed(2)}M BTC</div>
                  <div style={{ ...styles.cardChange, color: t.positive }}>
                    {data.exchangeReserves.trend}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'flows' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>📊 ETF Flows</div>
                  </div>
                  <div style={{ ...styles.cardValue, color: data.etfFlows.daily >= 0 ? t.positive : t.negative }}>
                    {data.etfFlows.daily >= 0 ? '+' : ''}${data.etfFlows.daily}M
                  </div>
                  <div style={styles.cardChange}>
                    Tydzień: +${data.etfFlows.weekly}M
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>🏢 Instytucjonalny BTC</div>
                  </div>
                  <div style={styles.cardValue}>{data.institutionalBtc.percentage.toFixed(1)}%</div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>💰 Stablecoin Supply</div>
                  </div>
                  <div style={styles.cardValue}>${data.stablecoinSupply.value.toFixed(1)}B</div>
                  <div style={{ ...styles.cardChange, color: t.positive }}>
                    ▲ {data.stablecoinSupply.change.toFixed(1)}%
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Cards Grid - Day Trading with LIVE Binance data */}
        {tradingMode === 'daytrading' && (
          <div style={styles.grid}>
            {activeTab === 'momentum' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>📉 RSI (14)</div>
                  </div>
                  <div style={{ 
                    ...styles.cardValue, 
                    color: data.rsi.value < 30 ? t.positive : data.rsi.value > 70 ? t.negative : t.neutral 
                  }}>
                    {data.rsi.value}
                  </div>
                  <div style={{
                    height: '15px',
                    background: 'linear-gradient(90deg, #00ff88, #ffa502, #ff4757)',
                    borderRadius: '8px',
                    position: 'relative',
                    marginTop: '10px',
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: `${data.rsi.value}%`,
                      top: '-3px',
                      width: '4px',
                      height: '21px',
                      background: '#fff',
                      borderRadius: '2px',
                      transform: 'translateX(-50%)',
                    }} />
                  </div>
                  <div style={styles.signalBox}>
                    {data.rsi.value < 30 ? '🟢 Wyprzedanie' : 
                     data.rsi.value > 70 ? '🔴 Wykupienie' : '🟡 Neutralne'}
                  </div>
                </div>

                {/* LIVE Funding Rate */}
                <div style={styles.cardLive}>
                  <div style={styles.liveBadge}>LIVE</div>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>💹 Funding Rate</div>
                  </div>
                  <div style={{ 
                    ...styles.cardValue,
                    color: data.fundingRate.btc > 0.0003 ? t.negative : data.fundingRate.btc < 0 ? t.positive : t.neutral
                  }}>
                    {(data.fundingRate.btc * 100).toFixed(4)}%
                  </div>
                  <div style={styles.cardChange}>
                    ETH: {(data.fundingRate.eth * 100).toFixed(4)}%
                  </div>
                  <div style={styles.signalBox}>
                    {data.fundingRate.btc > 0.0005 ? '🔴 Przegrzany - dużo longów' : 
                     data.fundingRate.btc < 0 ? '🟢 Ujemny - shorty płacą' : 
                     '🟡 Neutralny funding'}
                  </div>
                </div>

                {/* LIVE Open Interest */}
                <div style={styles.cardLive}>
                  <div style={styles.liveBadge}>LIVE</div>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>📊 Open Interest BTC</div>
                  </div>
                  <div style={styles.cardValue}>
                    {data.openInterest.btcAmount ? 
                      `${(data.openInterest.btcAmount / 1000).toFixed(1)}K BTC` : 
                      `$${data.openInterest.value?.toFixed(1)}B`}
                  </div>
                  <div style={{ ...styles.cardChange, color: data.openInterest.change >= 0 ? t.positive : t.negative }}>
                    {data.openInterest.change >= 0 ? '▲' : '▼'} {Math.abs(data.openInterest.change).toFixed(1)}%
                  </div>
                  <div style={styles.signalBox}>
                    Rosnący OI = więcej zaangażowania
                  </div>
                </div>
              </>
            )}

            {activeTab === 'sentiment' && (
              <>
                {/* LIVE Fear & Greed */}
                <div style={apiStatus.coingecko ? styles.cardLive : styles.card}>
                  {apiStatus.coingecko && <div style={styles.liveBadge}>LIVE</div>}
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>😱 Fear & Greed</div>
                  </div>
                  <div style={{ 
                    ...styles.cardValue,
                    color: data.fearGreed.value < 30 ? t.negative : data.fearGreed.value > 70 ? t.positive : t.neutral
                  }}>
                    {data.fearGreed.value}
                  </div>
                  <div style={styles.cardChange}>{data.fearGreed.label}</div>
                  <div style={styles.signalBox}>
                    {data.fearGreed.value < 25 ? '🟢 Ekstremalny strach - okazja?' : 
                     data.fearGreed.value > 75 ? '🔴 Chciwość - ostrożność' : '🟡 Neutralne'}
                  </div>
                </div>

                {/* LIVE Volume */}
                <div style={apiStatus.coingecko ? styles.cardLive : styles.card}>
                  {apiStatus.coingecko && <div style={styles.liveBadge}>LIVE</div>}
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>📈 Volume 24h</div>
                  </div>
                  <div style={styles.cardValue}>${data.volume24h.total.toFixed(1)}B</div>
                  <div style={{ ...styles.cardChange, color: data.volume24h.change >= 0 ? t.positive : t.negative }}>
                    {data.volume24h.change >= 0 ? '▲' : '▼'} {Math.abs(data.volume24h.change).toFixed(1)}%
                  </div>
                </div>

                {/* LIVE BTC Dominance */}
                <div style={apiStatus.coingecko ? styles.cardLive : styles.card}>
                  {apiStatus.coingecko && <div style={styles.liveBadge}>LIVE</div>}
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>👑 BTC Dominance</div>
                  </div>
                  <div style={styles.cardValue}>{data.btcDominance.value.toFixed(1)}%</div>
                  <div style={styles.signalBox}>
                    {data.btcDominance.change < -1 ? 'Alt season?' : 'BTC lideruje'}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'liquidations' && (
              <>
                {/* LIVE Long/Short Ratio */}
                <div style={styles.cardLive}>
                  <div style={styles.liveBadge}>LIVE</div>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>⚖️ Long/Short Ratio</div>
                  </div>
                  <div style={styles.cardValue}>
                    {(data.liquidations.longPercent / data.liquidations.shortPercent).toFixed(2)}
                  </div>
                  <div style={styles.liquidationBar}>
                    <div style={{ 
                      width: `${data.liquidations.longPercent}%`, 
                      background: t.positive,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.75rem',
                    }}>
                      L {data.liquidations.longPercent}%
                    </div>
                    <div style={{ 
                      width: `${data.liquidations.shortPercent}%`, 
                      background: t.negative,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.75rem',
                    }}>
                      S {data.liquidations.shortPercent}%
                    </div>
                  </div>
                  <div style={styles.signalBox}>
                    {data.liquidations.longPercent > 55 ? '🔴 Więcej longów - ryzyko spadku' : 
                     data.liquidations.shortPercent > 55 ? '🟢 Więcej shortów - short squeeze?' : 
                     '🟡 Zbalansowane'}
                  </div>
                </div>

                {/* LIVE Order Flow */}
                <div style={styles.cardLive}>
                  <div style={styles.liveBadge}>LIVE</div>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>📊 Order Flow</div>
                  </div>
                  <div style={styles.cardValue}>{data.orderFlow.buyPressure}% Long</div>
                  <div style={styles.liquidationBar}>
                    <div style={{ 
                      width: `${data.orderFlow.buyPressure}%`, 
                      background: t.positive,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.75rem',
                    }}>
                      Buy
                    </div>
                    <div style={{ 
                      width: `${data.orderFlow.sellPressure}%`, 
                      background: t.negative,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.75rem',
                    }}>
                      Sell
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitle}>🌊 Volatility</div>
                  </div>
                  <div style={styles.cardValue}>{data.volatility.value.toFixed(1)}%</div>
                  <div style={styles.cardChange}>{data.volatility.label}</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Funding Rate History Chart (Day Trading only) */}
        {tradingMode === 'daytrading' && fundingHistory.length > 0 && (
          <div style={styles.chartContainer}>
            <h3 style={{ marginBottom: '15px', fontSize: '1rem' }}>📈 Historia Funding Rate (Binance)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={fundingHistory}>
                <XAxis dataKey="time" stroke={t.textSecondary} fontSize={10} />
                <YAxis stroke={t.textSecondary} fontSize={10} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  contentStyle={{ 
                    background: theme === 'dark' ? '#1a1a2e' : '#fff', 
                    border: `1px solid ${t.cardBorder}`,
                    borderRadius: '8px',
                    color: t.text
                  }}
                  formatter={(value) => [`${value}%`, 'Funding']}
                />
                <Bar 
                  dataKey="rateNum" 
                  fill="#7b2ff7"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Long/Short History Chart */}
        {tradingMode === 'daytrading' && longShortHistory.length > 0 && (
          <div style={styles.chartContainer}>
            <h3 style={{ marginBottom: '15px', fontSize: '1rem' }}>⚖️ Long/Short History (Binance)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={longShortHistory}>
                <XAxis dataKey="time" stroke={t.textSecondary} fontSize={10} />
                <YAxis domain={[0, 100]} stroke={t.textSecondary} fontSize={10} />
                <Tooltip 
                  contentStyle={{ 
                    background: theme === 'dark' ? '#1a1a2e' : '#fff', 
                    border: `1px solid ${t.cardBorder}`,
                    borderRadius: '8px',
                    color: t.text
                  }} 
                />
                <Area type="monotone" dataKey="longs" stackId="1" stroke={t.positive} fill={t.positive} name="Longs %" />
                <Area type="monotone" dataKey="shorts" stackId="1" stroke={t.negative} fill={t.negative} name="Shorts %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Score History Chart */}
        <div style={styles.chartContainer}>
          <h3 style={{ marginBottom: '15px', fontSize: '1rem' }}>📊 Historia Score</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={scoreHistory.filter(h => h.mode === tradingMode).slice(-20)}>
              <XAxis dataKey="time" stroke={t.textSecondary} fontSize={10} />
              <YAxis domain={[0, 100]} stroke={t.textSecondary} fontSize={10} />
              <Tooltip 
                contentStyle={{ 
                  background: theme === 'dark' ? '#1a1a2e' : '#fff', 
                  border: `1px solid ${t.cardBorder}`,
                  borderRadius: '8px',
                  color: t.text
                }} 
              />
              <Area type="monotone" dataKey="score" stroke="#7b2ff7" fill="rgba(123,47,247,0.3)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Prices */}
        <div style={styles.grid}>
          <div style={apiStatus.coingecko ? styles.cardLive : styles.card}>
            {apiStatus.coingecko && <div style={styles.liveBadge}>LIVE</div>}
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>₿ Bitcoin</div>
              <button style={styles.starButton} onClick={() => toggleFavorite('btcPrice')}>
                {favorites.includes('btcPrice') ? '⭐' : '☆'}
              </button>
            </div>
            <div style={styles.cardValue}>${data.btcPrice.value.toLocaleString()}</div>
            <div style={{ ...styles.cardChange, color: data.btcPrice.change >= 0 ? t.positive : t.negative }}>
              {data.btcPrice.change >= 0 ? '▲' : '▼'} {Math.abs(data.btcPrice.change).toFixed(1)}%
            </div>
          </div>
          <div style={apiStatus.coingecko ? styles.cardLive : styles.card}>
            {apiStatus.coingecko && <div style={styles.liveBadge}>LIVE</div>}
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>Ξ Ethereum</div>
            </div>
            <div style={styles.cardValue}>${data.ethPrice.value.toLocaleString()}</div>
            <div style={{ ...styles.cardChange, color: data.ethPrice.change >= 0 ? t.positive : t.negative }}>
              {data.ethPrice.change >= 0 ? '▲' : '▼'} {Math.abs(data.ethPrice.change).toFixed(1)}%
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>🔒 TVL DeFi</div>
            </div>
            <div style={styles.cardValue}>${data.tvl.value.toFixed(1)}B</div>
            <div style={{ ...styles.cardChange, color: t.positive }}>
              ▲ {data.tvl.change.toFixed(1)}%
            </div>
          </div>
        </div>

        <footer style={styles.footer}>
          <p>⚠️ To nie jest porada inwestycyjna. DYOR.</p>
          <p style={{ marginTop: '5px', fontSize: '0.7rem' }}>
            Data: CoinGecko, Binance Futures, Alternative.me
          </p>
        </footer>

        {/* Settings Modal */}
        {showSettings && (
          <div style={styles.modal} onClick={() => setShowSettings(false)}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>
                ⚙️ Ustawienia
                <button style={styles.closeButton} onClick={() => setShowSettings(false)}>×</button>
              </div>
              
              <h4 style={{ marginBottom: '15px' }}>Long-Term Wagi</h4>
              {['m2Supply', 'dxy', 'mvrvZScore', 'sopr', 'exchangeReserves', 'etfFlows'].map(key => (
                <div key={key} style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '0.85rem' }}>
                    {key}: {weights[key]}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={weights[key]}
                    onChange={e => setWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                    style={styles.slider}
                  />
                </div>
              ))}
              
              <h4 style={{ margin: '20px 0 15px' }}>Day Trading Wagi</h4>
              {['rsi', 'fundingRate', 'liquidations', 'fearGreed', 'orderFlow'].map(key => (
                <div key={key} style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '0.85rem' }}>
                    {key}: {weights[key]}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={weights[key]}
                    onChange={e => setWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                    style={styles.slider}
                  />
                </div>
              ))}

              <h4 style={{ margin: '20px 0 15px' }}>🔔 Alerty</h4>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.85rem' }}>
                  Próg bullish: {alerts.bullishThreshold}
                </label>
                <input
                  type="range"
                  min="50"
                  max="90"
                  value={alerts.bullishThreshold}
                  onChange={e => setAlerts(prev => ({ ...prev, bullishThreshold: parseInt(e.target.value) }))}
                  style={styles.slider}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.85rem' }}>
                  Próg bearish: {alerts.bearishThreshold}
                </label>
                <input
                  type="range"
                  min="10"
                  max="50"
                  value={alerts.bearishThreshold}
                  onChange={e => setAlerts(prev => ({ ...prev, bearishThreshold: parseInt(e.target.value) }))}
                  style={styles.slider}
                />
              </div>

              <button 
                style={styles.button} 
                onClick={() => setWeights(defaultWeights)}
              >
                Reset domyślne
              </button>
            </div>
          </div>
        )}

        {/* Portfolio Modal */}
        {showPortfolio && (
          <div style={styles.modal} onClick={() => setShowPortfolio(false)}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>
                💼 Portfolio
                <button style={styles.closeButton} onClick={() => setShowPortfolio(false)}>×</button>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '5px' }}>
                  BTC Holdings:
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={portfolio.btc}
                  onChange={e => setPortfolio(prev => ({ ...prev, btc: parseFloat(e.target.value) || 0 }))}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '5px' }}>
                  ETH Holdings:
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={portfolio.eth}
                  onChange={e => setPortfolio(prev => ({ ...prev, eth: parseFloat(e.target.value) || 0 }))}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={{ 
                background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,247,0.2))',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '0.85rem', color: t.textSecondary, marginBottom: '5px' }}>
                  Wartość Portfolio (LIVE)
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: t.positive }}>
                  ${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'BTC', value: portfolio.btc * data.btcPrice.value },
                      { name: 'ETH', value: portfolio.eth * data.ethPrice.value },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#f7931a" />
                    <Cell fill="#627eea" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Backtest Modal */}
        {showBacktest && (
          <div style={styles.modal} onClick={() => setShowBacktest(false)}>
            <div style={{ ...styles.modalContent, maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>
                📊 Backtest
                <button style={styles.closeButton} onClick={() => setShowBacktest(false)}>×</button>
              </div>
              
              <div style={{ marginBottom: '15px', fontSize: '0.85rem', color: t.textSecondary }}>
                🟢 Buy (≥70) | 🔴 Sell (≤30) | 🟡 Hold
              </div>

              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Czas</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Score</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Sygnał</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>BTC</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Δ%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                        <td style={{ padding: '8px' }}>{row.time}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{row.score}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {row.signal === 'buy' ? '🟢' : row.signal === 'sell' ? '🔴' : '🟡'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>${row.btcPrice?.toLocaleString()}</td>
                        <td style={{ 
                          padding: '8px', 
                          textAlign: 'right',
                          color: parseFloat(row.priceChange) >= 0 ? t.positive : t.negative
                        }}>
                          {row.priceChange}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ 
                marginTop: '20px', 
                padding: '15px', 
                background: t.cardBg, 
                borderRadius: '8px',
                fontSize: '0.85rem'
              }}>
                <strong>Statystyki:</strong><br/>
                Buy: {backtestData.filter(d => d.signal === 'buy').length} |
                Sell: {backtestData.filter(d => d.signal === 'sell').length} |
                Hold: {backtestData.filter(d => d.signal === 'hold').length}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
