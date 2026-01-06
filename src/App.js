import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, AreaChart, Area } from 'recharts';

// ============ THEME ============
const themes = {
  dark: {
    bg: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%)',
    cardBg: 'rgba(20, 20, 35, 0.9)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    text: '#ffffff',
    textSecondary: '#8b8b9e',
    positive: '#00d4aa',
    negative: '#ff4757',
    warning: '#ffa726',
    accent: '#7c4dff',
    accentGlow: 'rgba(124, 77, 255, 0.3)',
  },
  light: {
    bg: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #f8f9fa 100%)',
    cardBg: 'rgba(255, 255, 255, 0.95)',
    cardBorder: 'rgba(0, 0, 0, 0.1)',
    text: '#1a1a2e',
    textSecondary: '#6c757d',
    positive: '#00b894',
    negative: '#d63031',
    warning: '#f39c12',
    accent: '#6c5ce7',
    accentGlow: 'rgba(108, 92, 231, 0.2)',
  }
};

// ============ SCORE GAUGE COMPONENT ============
const ScoreGauge = ({ score, label, icon, colorStart, colorEnd, size = 180, onHelpClick }) => {
  const percentage = score / 100;
  const angle = percentage * 180;
  const theme = themes.dark;
  
  const getSignal = (s) => {
    if (s >= 70) return { text: 'AKUMULUJ', color: theme.positive, emoji: '🟢' };
    if (s >= 55) return { text: 'HOLD+', color: theme.positive, emoji: '🟢' };
    if (s >= 45) return { text: 'HOLD', color: theme.warning, emoji: '🟡' };
    if (s >= 30) return { text: 'OSTROŻNIE', color: theme.warning, emoji: '🟠' };
    return { text: 'REDUKUJ', color: theme.negative, emoji: '🔴' };
  };
  
  const signal = getSignal(score);
  
  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size * 0.65,
      margin: '0 auto'
    }}>
      <svg viewBox="0 0 200 120" style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id={`grad-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colorStart} />
            <stop offset="100%" stopColor={colorEnd} />
          </linearGradient>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Score arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={`url(#grad-${label})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${angle * 2.79} 1000`}
          filter={`url(#glow-${label})`}
          style={{ transition: 'stroke-dasharray 1s ease-out' }}
        />
        
        {/* Score text */}
        <text x="100" y="75" textAnchor="middle" fill={theme.text} fontSize="32" fontWeight="bold">
          {score}
        </text>
        <text x="100" y="95" textAnchor="middle" fill={signal.color} fontSize="14" fontWeight="600">
          {signal.emoji} {signal.text}
        </text>
      </svg>
      
      {/* Help button */}
      <button
        onClick={onHelpClick}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.1)',
          color: theme.textSecondary,
          cursor: 'pointer',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ?
      </button>
      
      {/* Label */}
      <div style={{
        textAlign: 'center',
        marginTop: '5px',
        fontSize: '13px',
        fontWeight: '600',
        color: theme.text
      }}>
        {icon} {label}
      </div>
    </div>
  );
};

// ============ MINI INDICATOR CARD ============
const MiniIndicator = ({ label, value, change, isPositive, icon }) => {
  const theme = themes.dark;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '10px',
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      border: '1px solid rgba(255,255,255,0.05)'
    }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: theme.textSecondary }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{value}</div>
      </div>
      {change && (
        <div style={{
          fontSize: '12px',
          fontWeight: '600',
          color: isPositive ? theme.positive : theme.negative,
          background: isPositive ? 'rgba(0,212,170,0.15)' : 'rgba(255,71,87,0.15)',
          padding: '3px 8px',
          borderRadius: '6px'
        }}>
          {isPositive ? '↑' : '↓'} {change}
        </div>
      )}
    </div>
  );
};

// ============ HELP MODAL ============
const HelpModal = ({ isOpen, onClose, title, content }) => {
  const theme = themes.dark;
  if (!isOpen) return null;
  
  return (
    <div style={{
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
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: theme.cardBg,
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '500px',
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
        border: `1px solid ${theme.cardBorder}`
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: '18px' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: theme.textSecondary,
            fontSize: '24px',
            cursor: 'pointer'
          }}>×</button>
        </div>
        <div style={{ color: theme.text, fontSize: '14px', lineHeight: '1.6' }}>
          {content}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN APP ============
function App() {
  const [theme] = useState('dark');
  const t = themes[theme];
  
  const [prices, setPrices] = useState({ btc: 0, eth: 0, btcChange: 0, ethChange: 0 });
  const [fearGreed, setFearGreed] = useState({ value: 50, classification: 'Neutral' });
  const [funding, setFunding] = useState(0.01);
  const [openInterest, setOpenInterest] = useState({ value: 0, change: 0 });
  const [volume24h, setVolume24h] = useState(0);
  const [btcDominance, setBtcDominance] = useState(0);
  const [m2Growth, setM2Growth] = useState(0);
  const [stablecoinMcap, setStablecoinMcap] = useState({ value: 0, change: 0 });
  const [tvl, setTvl] = useState({ value: 0, change: 0 });
  const [isLive, setIsLive] = useState(false);
  
  const [helpModal, setHelpModal] = useState({ isOpen: false, title: '', content: null });
  
  // Fetch real data
  const fetchData = useCallback(async () => {
    try {
      // CoinGecko - prices
      const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
      const cgData = await cgRes.json();
      setPrices({
        btc: cgData.bitcoin?.usd || 0,
        eth: cgData.ethereum?.usd || 0,
        btcChange: cgData.bitcoin?.usd_24h_change?.toFixed(2) || 0,
        ethChange: cgData.ethereum?.usd_24h_change?.toFixed(2) || 0
      });
      
      // Fear & Greed
      const fgRes = await fetch('https://api.alternative.me/fng/');
      const fgData = await fgRes.json();
      setFearGreed({
        value: parseInt(fgData.data[0]?.value) || 50,
        classification: fgData.data[0]?.value_classification || 'Neutral'
      });
      
      // Global data
      const globalRes = await fetch('https://api.coingecko.com/api/v3/global');
      const globalData = await globalRes.json();
      setBtcDominance(globalData.data?.market_cap_percentage?.btc?.toFixed(1) || 0);
      setVolume24h(globalData.data?.total_volume?.usd || 0);
      
      // DefiLlama TVL
      const tvlRes = await fetch('https://api.llama.fi/v2/historicalChainTvl');
      const tvlData = await tvlRes.json();
      if (tvlData.length > 0) {
        const latest = tvlData[tvlData.length - 1]?.tvl || 0;
        const weekAgo = tvlData[Math.max(0, tvlData.length - 8)]?.tvl || latest;
        const change = ((latest - weekAgo) / weekAgo * 100).toFixed(1);
        setTvl({ value: latest, change });
      }
      
      // Stablecoins
      const stableRes = await fetch('https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1');
      const stableData = await stableRes.json();
      if (stableData.length > 0) {
        const latest = stableData[stableData.length - 1]?.totalCirculating?.peggedUSD || 0;
        const monthAgo = stableData[Math.max(0, stableData.length - 31)]?.totalCirculating?.peggedUSD || latest;
        const change = ((latest - monthAgo) / monthAgo * 100).toFixed(1);
        setStablecoinMcap({ value: latest, change });
      }
      
      setIsLive(true);
    } catch (err) {
      console.error('Fetch error:', err);
      // Demo data
      setPrices({ btc: 97500, eth: 3450, btcChange: 2.3, ethChange: 1.8 });
      setFearGreed({ value: 65, classification: 'Greed' });
      setFunding(0.012);
      setOpenInterest({ value: 28500000000, change: 3.2 });
      setVolume24h(85000000000);
      setBtcDominance(52.4);
      setM2Growth(3.8);
      setStablecoinMcap({ value: 175000000000, change: 2.1 });
      setTvl({ value: 95000000000, change: 4.5 });
      setIsLive(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);
  
  // ============ SCORE CALCULATIONS ============
  
  // DAY TRADING SCORE (short-term: hours-days)
  const calculateDayTradingScore = () => {
    let score = 50;
    
    // Fear & Greed (inverted - extreme fear = buy opportunity for day traders)
    if (fearGreed.value <= 20) score += 15;
    else if (fearGreed.value <= 35) score += 10;
    else if (fearGreed.value >= 80) score -= 15;
    else if (fearGreed.value >= 65) score -= 5;
    
    // Funding Rate
    if (funding < -0.01) score += 10; // Shorts paying = squeeze potential
    else if (funding < 0) score += 5;
    else if (funding > 0.05) score -= 15; // Overleveraged longs
    else if (funding > 0.02) score -= 5;
    
    // 24h price momentum
    const btcMomentum = parseFloat(prices.btcChange);
    if (btcMomentum > 5) score += 10;
    else if (btcMomentum > 2) score += 5;
    else if (btcMomentum < -5) score -= 10;
    else if (btcMomentum < -2) score -= 5;
    
    // Volume spike indicator
    if (volume24h > 100000000000) score += 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };
  
  // SWING SCORE (medium-term: weeks)
  const calculateSwingScore = () => {
    let score = 50;
    
    // Fear & Greed with medium-term interpretation
    if (fearGreed.value <= 25) score += 12;
    else if (fearGreed.value <= 40) score += 6;
    else if (fearGreed.value >= 75) score -= 12;
    else if (fearGreed.value >= 60) score -= 4;
    
    // TVL trend (weekly)
    const tvlChange = parseFloat(tvl.change);
    if (tvlChange > 5) score += 10;
    else if (tvlChange > 2) score += 5;
    else if (tvlChange < -5) score -= 10;
    else if (tvlChange < -2) score -= 5;
    
    // BTC Dominance (for altcoin timing)
    if (btcDominance > 55) score -= 5; // Alts underperforming
    else if (btcDominance < 45) score += 5; // Alt season potential
    
    // Stablecoin inflows (weekly view)
    const stableChange = parseFloat(stablecoinMcap.change);
    if (stableChange > 3) score += 8;
    else if (stableChange > 1) score += 4;
    else if (stableChange < -3) score -= 8;
    else if (stableChange < -1) score -= 4;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };
  
  // HODL SCORE (long-term: months-years)
  const calculateHodlScore = () => {
    let score = 50;
    
    // M2 Money Supply trend
    if (m2Growth > 5) score += 15;
    else if (m2Growth > 2) score += 10;
    else if (m2Growth > 0) score += 5;
    else if (m2Growth < -2) score -= 10;
    else if (m2Growth < 0) score -= 5;
    
    // Stablecoin supply (long-term liquidity)
    const stableChange = parseFloat(stablecoinMcap.change);
    if (stableChange > 5) score += 12;
    else if (stableChange > 2) score += 6;
    else if (stableChange < -5) score -= 12;
    else if (stableChange < -2) score -= 6;
    
    // TVL as adoption metric
    const tvlChange = parseFloat(tvl.change);
    if (tvlChange > 8) score += 10;
    else if (tvlChange > 3) score += 5;
    else if (tvlChange < -8) score -= 10;
    else if (tvlChange < -3) score -= 5;
    
    // Fear & Greed (long-term accumulation in fear)
    if (fearGreed.value <= 20) score += 8;
    else if (fearGreed.value <= 35) score += 4;
    else if (fearGreed.value >= 85) score -= 8;
    else if (fearGreed.value >= 70) score -= 4;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };
  
  const dayTradingScore = calculateDayTradingScore();
  const swingScore = calculateSwingScore();
  const hodlScore = calculateHodlScore();
  
  // Help content
  const dayTradingHelp = (
    <div>
      <p style={{ marginTop: 0 }}><strong>🎯 Day Trading Score</strong> - wskaźnik dla aktywnych traderów (horyzont: godziny-dni)</p>
      
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}>
        <table style={{ width: '100%', fontSize: '13px' }}>
          <tbody>
            <tr><td>70-100</td><td style={{ color: t.positive }}>🟢 AKUMULUJ</td><td>Silny sygnał kupna</td></tr>
            <tr><td>55-69</td><td style={{ color: t.positive }}>🟢 HOLD+</td><td>Rozważ pozycję</td></tr>
            <tr><td>45-54</td><td style={{ color: t.warning }}>🟡 HOLD</td><td>Neutralnie</td></tr>
            <tr><td>30-44</td><td style={{ color: t.warning }}>🟠 OSTROŻNIE</td><td>Ryzyko korekty</td></tr>
            <tr><td>0-29</td><td style={{ color: t.negative }}>🔴 REDUKUJ</td><td>Rozważ wyjście</td></tr>
          </tbody>
        </table>
      </div>
      
      <p><strong>Składowe:</strong></p>
      <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
        <li>Fear & Greed Index (odwrócony)</li>
        <li>Funding Rate (8h)</li>
        <li>Momentum cenowy 24h</li>
        <li>Wolumen 24h</li>
      </ul>
      
      <p style={{ fontSize: '12px', color: t.textSecondary }}>
        Wskaźnik reaguje na krótkoterminowe ekstremum sentymentu i leverage w systemie.
      </p>
    </div>
  );
  
  const swingHelp = (
    <div>
      <p style={{ marginTop: 0 }}><strong>📊 Swing Score</strong> - wskaźnik dla swing traderów (horyzont: tygodnie)</p>
      
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}>
        <table style={{ width: '100%', fontSize: '13px' }}>
          <tbody>
            <tr><td>70-100</td><td style={{ color: t.positive }}>🟢 AKUMULUJ</td><td>Dobry moment na zakup</td></tr>
            <tr><td>55-69</td><td style={{ color: t.positive }}>🟢 HOLD+</td><td>Dokupuj na korektach</td></tr>
            <tr><td>45-54</td><td style={{ color: t.warning }}>🟡 HOLD</td><td>Czekaj na sygnał</td></tr>
            <tr><td>30-44</td><td style={{ color: t.warning }}>🟠 OSTROŻNIE</td><td>Zmniejsz ekspozycję</td></tr>
            <tr><td>0-29</td><td style={{ color: t.negative }}>🔴 REDUKUJ</td><td>Realizuj zyski</td></tr>
          </tbody>
        </table>
      </div>
      
      <p><strong>Składowe:</strong></p>
      <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
        <li>Fear & Greed (uśredniony)</li>
        <li>TVL trend (7 dni)</li>
        <li>BTC Dominance</li>
        <li>Stablecoin inflows</li>
      </ul>
      
      <p style={{ fontSize: '12px', color: t.textSecondary }}>
        Łączy sentyment z on-chain i DeFi metrykamidla średnioterminowych pozycji.
      </p>
    </div>
  );
  
  const hodlHelp = (
    <div>
      <p style={{ marginTop: 0 }}><strong>🏦 HODL Score</strong> - wskaźnik dla długoterminowych inwestorów (horyzont: miesiące-lata)</p>
      
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}>
        <table style={{ width: '100%', fontSize: '13px' }}>
          <tbody>
            <tr><td>70-100</td><td style={{ color: t.positive }}>🟢 AKUMULUJ</td><td>Idealny czas na DCA</td></tr>
            <tr><td>55-69</td><td style={{ color: t.positive }}>🟢 HOLD+</td><td>Kontynuuj DCA</td></tr>
            <tr><td>45-54</td><td style={{ color: t.warning }}>🟡 HOLD</td><td>Trzymaj pozycje</td></tr>
            <tr><td>30-44</td><td style={{ color: t.warning }}>🟠 OSTROŻNIE</td><td>Wstrzymaj DCA</td></tr>
            <tr><td>0-29</td><td style={{ color: t.negative }}>🔴 REDUKUJ</td><td>Rozważ częściową realizację</td></tr>
          </tbody>
        </table>
      </div>
      
      <p><strong>Składowe:</strong></p>
      <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
        <li>M2 Money Supply trend</li>
        <li>Stablecoin supply (30 dni)</li>
        <li>TVL jako miara adopcji</li>
        <li>Fear & Greed (ekstrema)</li>
      </ul>
      
      <p style={{ fontSize: '12px', color: t.textSecondary }}>
        Bazuje na makroekonomicznych wskaźnikach płynności i długoterminowych trendach adopcji.
      </p>
    </div>
  );
  
  const formatNumber = (num) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
  };
  
  return (
    <div style={{
      minHeight: '100vh',
      background: t.bg,
      color: t.text,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '16px',
      paddingBottom: '80px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>
            🎯 Crypto Decision Hub
          </h1>
          <div style={{ fontSize: '12px', color: t.textSecondary, marginTop: '4px' }}>
            {isLive ? (
              <span style={{ color: t.positive }}>🟢 Live Data</span>
            ) : (
              <span style={{ color: t.warning }}>🟡 Demo Data</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>
            ${prices.btc.toLocaleString()}
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: parseFloat(prices.btcChange) >= 0 ? t.positive : t.negative 
          }}>
            BTC {parseFloat(prices.btcChange) >= 0 ? '+' : ''}{prices.btcChange}%
          </div>
        </div>
      </div>
      
      {/* Three Score Gauges */}
      <div style={{
        background: t.cardBg,
        borderRadius: '20px',
        padding: '20px 15px',
        marginBottom: '20px',
        border: `1px solid ${t.cardBorder}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px'
        }}>
          {/* Day Trading Score */}
          <div>
            <ScoreGauge
              score={dayTradingScore}
              label="Day Trading"
              icon="🎯"
              colorStart="#ff6b6b"
              colorEnd="#ffa726"
              size={140}
              onHelpClick={() => setHelpModal({ isOpen: true, title: '🎯 Day Trading Score', content: dayTradingHelp })}
            />
            <div style={{ fontSize: '10px', color: t.textSecondary, textAlign: 'center', marginTop: '5px' }}>
              godziny-dni
            </div>
          </div>
          
          {/* Swing Score */}
          <div>
            <ScoreGauge
              score={swingScore}
              label="Swing"
              icon="📊"
              colorStart="#7c4dff"
              colorEnd="#00d4aa"
              size={140}
              onHelpClick={() => setHelpModal({ isOpen: true, title: '📊 Swing Score', content: swingHelp })}
            />
            <div style={{ fontSize: '10px', color: t.textSecondary, textAlign: 'center', marginTop: '5px' }}>
              tygodnie
            </div>
          </div>
          
          {/* HODL Score */}
          <div>
            <ScoreGauge
              score={hodlScore}
              label="HODL"
              icon="🏦"
              colorStart="#00d4aa"
              colorEnd="#4fc3f7"
              size={140}
              onHelpClick={() => setHelpModal({ isOpen: true, title: '🏦 HODL Score', content: hodlHelp })}
            />
            <div style={{ fontSize: '10px', color: t.textSecondary, textAlign: 'center', marginTop: '5px' }}>
              miesiące-lata
            </div>
          </div>
        </div>
      </div>
      
      {/* Key Indicators Grid */}
      <div style={{
        background: t.cardBg,
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '16px',
        border: `1px solid ${t.cardBorder}`
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
          📈 Kluczowe Wskaźniki
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <MiniIndicator
            label="Fear & Greed"
            value={`${fearGreed.value} - ${fearGreed.classification}`}
            icon="😱"
          />
          <MiniIndicator
            label="BTC Dominance"
            value={`${btcDominance}%`}
            icon="👑"
          />
          <MiniIndicator
            label="Stablecoins"
            value={formatNumber(stablecoinMcap.value)}
            change={`${stablecoinMcap.change}%`}
            isPositive={parseFloat(stablecoinMcap.change) > 0}
            icon="💵"
          />
          <MiniIndicator
            label="DeFi TVL"
            value={formatNumber(tvl.value)}
            change={`${tvl.change}%`}
            isPositive={parseFloat(tvl.change) > 0}
            icon="🔒"
          />
          <MiniIndicator
            label="Volume 24h"
            value={formatNumber(volume24h)}
            icon="📊"
          />
          <MiniIndicator
            label="ETH Price"
            value={`$${prices.eth.toLocaleString()}`}
            change={`${prices.ethChange}%`}
            isPositive={parseFloat(prices.ethChange) > 0}
            icon="💎"
          />
        </div>
      </div>
      
      {/* Score Breakdown */}
      <div style={{
        background: t.cardBg,
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '16px',
        border: `1px solid ${t.cardBorder}`
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
          🧮 Składowe Score'ów
        </h3>
        
        <div style={{ marginBottom: '15px' }}>
          <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>
            🎯 Day Trading ({dayTradingScore})
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', background: 'rgba(255,107,107,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              F&G: {fearGreed.value}
            </span>
            <span style={{ fontSize: '11px', background: 'rgba(255,167,38,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              Funding: {(funding * 100).toFixed(3)}%
            </span>
            <span style={{ fontSize: '11px', background: 'rgba(255,107,107,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              BTC 24h: {prices.btcChange}%
            </span>
          </div>
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>
            📊 Swing ({swingScore})
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', background: 'rgba(124,77,255,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              TVL: {tvl.change}%
            </span>
            <span style={{ fontSize: '11px', background: 'rgba(0,212,170,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              BTC.D: {btcDominance}%
            </span>
            <span style={{ fontSize: '11px', background: 'rgba(124,77,255,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              Stable: {stablecoinMcap.change}%
            </span>
          </div>
        </div>
        
        <div>
          <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '6px' }}>
            🏦 HODL ({hodlScore})
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', background: 'rgba(0,212,170,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              M2: {m2Growth > 0 ? '+' : ''}{m2Growth}%
            </span>
            <span style={{ fontSize: '11px', background: 'rgba(79,195,247,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              Stable: {stablecoinMcap.change}%
            </span>
            <span style={{ fontSize: '11px', background: 'rgba(0,212,170,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              TVL: {tvl.change}%
            </span>
          </div>
        </div>
      </div>
      
      {/* Quick Summary */}
      <div style={{
        background: t.cardBg,
        borderRadius: '16px',
        padding: '16px',
        border: `1px solid ${t.cardBorder}`
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
          📋 Podsumowanie
        </h3>
        <div style={{ fontSize: '13px', lineHeight: '1.6', color: t.textSecondary }}>
          {hodlScore >= 60 && (
            <p style={{ margin: '0 0 8px 0' }}>
              <span style={{ color: t.positive }}>🏦 HODL:</span> Warunki makro sprzyjają akumulacji. Rozważ regularne DCA.
            </p>
          )}
          {hodlScore < 40 && (
            <p style={{ margin: '0 0 8px 0' }}>
              <span style={{ color: t.negative }}>🏦 HODL:</span> Ostrożność z nowymi pozycjami długoterminowymi.
            </p>
          )}
          {swingScore >= 60 && (
            <p style={{ margin: '0 0 8px 0' }}>
              <span style={{ color: t.positive }}>📊 Swing:</span> Dobry moment na średnioterminowe pozycje.
            </p>
          )}
          {swingScore < 40 && (
            <p style={{ margin: '0 0 8px 0' }}>
              <span style={{ color: t.negative }}>📊 Swing:</span> Rozważ redukcję ekspozycji lub hedging.
            </p>
          )}
          {dayTradingScore >= 65 && (
            <p style={{ margin: '0 0 8px 0' }}>
              <span style={{ color: t.positive }}>🎯 Day Trading:</span> Sentyment wspiera pozycje long.
            </p>
          )}
          {dayTradingScore < 35 && (
            <p style={{ margin: '0 0 8px 0' }}>
              <span style={{ color: t.negative }}>🎯 Day Trading:</span> Rozważ pozycje short lub pozostań w gotówce.
            </p>
          )}
          {dayTradingScore >= 40 && dayTradingScore <= 60 && swingScore >= 40 && swingScore <= 60 && hodlScore >= 40 && hodlScore <= 60 && (
            <p style={{ margin: 0 }}>
              <span style={{ color: t.warning }}>⚖️</span> Rynek w neutralnej fazie. Obserwuj i czekaj na wyraźniejsze sygnały.
            </p>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: '20px',
        color: t.textSecondary,
        fontSize: '11px'
      }}>
        Dane: CoinGecko • DefiLlama • Alternative.me<br/>
        Kliknij ? przy score aby zobaczyć szczegóły<br/>
        <span style={{ opacity: 0.7 }}>DYOR - to nie jest porada inwestycyjna</span>
      </div>
      
      {/* Help Modal */}
      <HelpModal
        isOpen={helpModal.isOpen}
        onClose={() => setHelpModal({ isOpen: false, title: '', content: null })}
        title={helpModal.title}
        content={helpModal.content}
      />
    </div>
  );
}

export default App;
