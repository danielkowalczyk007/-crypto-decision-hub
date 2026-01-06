import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area, Tooltip, BarChart, Bar } from 'recharts';

const generateMockData = () => ({
  // MACRO
  m2Supply: { value: 21.5, trend: 'up', change: 2.3 },
  dxy: { value: 103.42, trend: 'down', change: -1.8 },
  fedWatch: { nextCut: '2025-03', probability: 68 },
  // PRICES
  btcPrice: { value: 94250, change: 3.2, ath: 109000 },
  ethPrice: { value: 3420, change: 2.8 },
  // ON-CHAIN
  stablecoinSupply: { value: 178.5, change: 5.2 },
  tvl: { value: 89.4, change: 12.3 },
  mvrvZScore: { value: 1.8, zone: 'neutral' },
  sopr: { value: 0.98, signal: 'accumulation' },
  exchangeReserves: { btc: 2.1, eth: 17.8, trend: 'outflow' },
  // FLOWS
  etfFlows: { daily: 245, weekly: 1820 },
  institutionalBtc: { percentage: 20.4 },
  // DAY TRADING - NEW
  rsi: { value: 62, signal: 'neutral' },
  fundingRate: { btc: 0.012, eth: 0.008, signal: 'bullish' },
  openInterest: { value: 18.2, change: 5.4 },
  liquidations: { 
    last24h: 124, 
    longPercent: 38, 
    shortPercent: 62,
    largest: 2.4
  },
  fearGreed: { value: 71, label: 'Greed' },
  volume24h: { btc: 42.3, total: 98.7, change: 12.1 },
  btcDominance: { value: 54.2, change: -0.8 },
  volatility: { value: 3.2, label: 'Moderate' },
  orderFlow: { buyPressure: 58, sellPressure: 42 },
});

const chartData = [
  { name: 'Sty', m2: 20.1, btc: 42000, dxy: 104 },
  { name: 'Lut', m2: 20.3, btc: 52000, dxy: 103.5 },
  { name: 'Mar', m2: 20.8, btc: 68000, dxy: 103.8 },
  { name: 'Kwi', m2: 21.0, btc: 64000, dxy: 104.2 },
  { name: 'Maj', m2: 21.2, btc: 71000, dxy: 104.8 },
  { name: 'Cze', m2: 21.3, btc: 69000, dxy: 105.2 },
  { name: 'Lip', m2: 21.1, btc: 58000, dxy: 104.5 },
  { name: 'Sie', m2: 21.4, btc: 61000, dxy: 103.2 },
  { name: 'Wrz', m2: 21.3, btc: 65000, dxy: 102.8 },
  { name: 'Paź', m2: 21.4, btc: 72000, dxy: 103.1 },
  { name: 'Lis', m2: 21.5, btc: 89000, dxy: 103.4 },
  { name: 'Gru', m2: 21.5, btc: 94250, dxy: 103.42 },
];

const rsiData = [
  { time: '00:00', rsi: 45 },
  { time: '04:00', rsi: 52 },
  { time: '08:00', rsi: 58 },
  { time: '12:00', rsi: 71 },
  { time: '16:00', rsi: 65 },
  { time: '20:00', rsi: 62 },
];

const liquidationData = [
  { time: '00:00', longs: 12, shorts: 8 },
  { time: '04:00', longs: 8, shorts: 15 },
  { time: '08:00', longs: 5, shorts: 22 },
  { time: '12:00', longs: 18, shorts: 6 },
  { time: '16:00', longs: 10, shorts: 14 },
  { time: '20:00', longs: 7, shorts: 11 },
];

const styles = {
  app: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
    padding: '20px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '16px',
    backdropFilter: 'blur(10px)',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: '700',
    background: 'linear-gradient(90deg, #00d4ff, #7b2ff7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '10px',
  },
  subtitle: {
    color: '#888',
    fontSize: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  card: {
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '20px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'transform 0.3s, box-shadow 0.3s',
  },
  cardTitle: {
    fontSize: '0.85rem',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '10px',
  },
  cardValue: {
    fontSize: '2rem',
    fontWeight: '700',
    marginBottom: '5px',
  },
  cardChange: {
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  positive: { color: '#00ff88' },
  negative: { color: '#ff4757' },
  neutral: { color: '#ffa502' },
  signalBox: {
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '15px',
    marginTop: '15px',
  },
  signalIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  dot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  chartContainer: {
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '30px',
  },
  tabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  tab: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'all 0.3s',
  },
  tabActive: {
    background: 'linear-gradient(90deg, #00d4ff, #7b2ff7)',
    color: '#fff',
  },
  tabInactive: {
    background: 'rgba(255,255,255,0.1)',
    color: '#888',
  },
  decisionPanel: {
    background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,247,0.2))',
    borderRadius: '16px',
    padding: '25px',
    textAlign: 'center',
    border: '2px solid rgba(0,212,255,0.3)',
  },
  decisionScore: {
    fontSize: '4rem',
    fontWeight: '800',
    marginBottom: '10px',
  },
  decisionLabel: {
    fontSize: '1.5rem',
    fontWeight: '600',
    marginBottom: '15px',
  },
  meter: {
    height: '20px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '15px',
  },
  meterFill: {
    height: '100%',
    borderRadius: '10px',
    transition: 'width 1s ease-out',
  },
  footer: {
    textAlign: 'center',
    padding: '20px',
    color: '#666',
    fontSize: '0.85rem',
  },
  // Day Trading specific
  rsiGauge: {
    position: 'relative',
    height: '20px',
    background: 'linear-gradient(90deg, #00ff88 0%, #ffa502 30%, #ffa502 70%, #ff4757 100%)',
    borderRadius: '10px',
    marginTop: '10px',
  },
  rsiMarker: {
    position: 'absolute',
    top: '-5px',
    width: '4px',
    height: '30px',
    background: '#fff',
    borderRadius: '2px',
    transform: 'translateX(-50%)',
  },
  liquidationBar: {
    display: 'flex',
    height: '30px',
    borderRadius: '8px',
    overflow: 'hidden',
    marginTop: '10px',
  },
  longBar: {
    background: '#00ff88',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '0.85rem',
  },
  shortBar: {
    background: '#ff4757',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '0.85rem',
  },
  modeSelector: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  modeButton: {
    padding: '12px 30px',
    borderRadius: '25px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '1rem',
    transition: 'all 0.3s',
  },
  modeActive: {
    background: 'linear-gradient(90deg, #00d4ff, #7b2ff7)',
    color: '#fff',
    boxShadow: '0 4px 15px rgba(0,212,255,0.4)',
  },
  modeInactive: {
    background: 'rgba(255,255,255,0.1)',
    color: '#888',
  },
};

function App() {
  const [data, setData] = useState(generateMockData());
  const [activeTab, setActiveTab] = useState('macro');
  const [tradingMode, setTradingMode] = useState('longterm'); // 'longterm' or 'daytrading'
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generateMockData());
      setLastUpdate(new Date());
    }, tradingMode === 'daytrading' ? 15000 : 60000); // 15s for day trading, 60s for long term
    return () => clearInterval(interval);
  }, [tradingMode]);

  // Long-term score
  const calculateLongTermScore = () => {
    let score = 50;
    if (data.m2Supply.trend === 'up') score += 10;
    if (data.dxy.trend === 'down') score += 10;
    if (data.mvrvZScore.value < 2) score += 10;
    if (data.sopr.value < 1) score += 10;
    if (data.exchangeReserves.trend === 'outflow') score += 5;
    if (data.etfFlows.daily > 0) score += 5;
    return Math.min(100, Math.max(0, score));
  };

  // Day trading score
  const calculateDayTradingScore = () => {
    let score = 50;
    // RSI
    if (data.rsi.value < 30) score += 15; // oversold = buy
    else if (data.rsi.value > 70) score -= 15; // overbought = sell
    else if (data.rsi.value > 50) score += 5;
    // Funding Rate
    if (data.fundingRate.btc < 0.01) score += 10; // low funding = bullish
    else if (data.fundingRate.btc > 0.05) score -= 10; // high funding = bearish
    // Liquidations
    if (data.liquidations.shortPercent > 60) score += 10; // shorts getting rekt = bullish
    if (data.liquidations.longPercent > 60) score -= 10; // longs getting rekt = bearish
    // Fear & Greed
    if (data.fearGreed.value < 25) score += 10; // extreme fear = buy
    else if (data.fearGreed.value > 75) score -= 5; // greed = caution
    // Order Flow
    if (data.orderFlow.buyPressure > 55) score += 5;
    if (data.orderFlow.sellPressure > 55) score -= 5;
    return Math.min(100, Math.max(0, score));
  };

  const score = tradingMode === 'longterm' ? calculateLongTermScore() : calculateDayTradingScore();
  
  const getDecisionColor = () => {
    if (score >= 70) return '#00ff88';
    if (score >= 40) return '#ffa502';
    return '#ff4757';
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

  const getRsiColor = (value) => {
    if (value < 30) return '#00ff88';
    if (value > 70) return '#ff4757';
    return '#ffa502';
  };

  const getFearGreedColor = (value) => {
    if (value < 25) return '#ff4757';
    if (value < 45) return '#ffa502';
    if (value < 55) return '#888';
    if (value < 75) return '#00ff88';
    return '#00ff88';
  };

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>🚀 Crypto Decision Hub</h1>
          <p style={styles.subtitle}>
            Agregator wskaźników | Ostatnia aktualizacja: {lastUpdate.toLocaleTimeString('pl-PL')}
          </p>
        </header>

        {/* Mode Selector */}
        <div style={styles.modeSelector}>
          <button
            style={{ ...styles.modeButton, ...(tradingMode === 'longterm' ? styles.modeActive : styles.modeInactive) }}
            onClick={() => { setTradingMode('longterm'); setActiveTab('macro'); }}
          >
            📈 Long-Term
          </button>
          <button
            style={{ ...styles.modeButton, ...(tradingMode === 'daytrading' ? styles.modeActive : styles.modeInactive) }}
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
            <div style={{
              ...styles.meterFill,
              width: `${score}%`,
              background: `linear-gradient(90deg, #ff4757, #ffa502, #00ff88)`,
            }} />
          </div>
          <p style={{ color: '#888' }}>
            {tradingMode === 'longterm' 
              ? 'Algorytm agreguje dane makro, on-chain i przepływy instytucjonalne'
              : 'Algorytm agreguje RSI, funding rate, likwidacje i order flow'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ ...styles.tabs, marginTop: '30px' }}>
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
                  {tab === 'liquidations' && '💥 Likwidacje'}
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
                  <div style={styles.cardTitle}>💵 M2 Money Supply (Global)</div>
                  <div style={styles.cardValue}>${data.m2Supply.value}T</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    ▲ {data.m2Supply.change}% YoY
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Ekspansja płynności - pozytywne dla ryzyka</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>💲 DXY (Dollar Index)</div>
                  <div style={styles.cardValue}>{data.dxy.value}</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    ▼ {Math.abs(data.dxy.change)}% (spadek = pozytywne)
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Słabszy dolar sprzyja aktywom ryzykownym</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>🏛️ FedWatch - Stopy %</div>
                  <div style={styles.cardValue}>{data.fedWatch.probability}%</div>
                  <div style={{ ...styles.cardChange, ...styles.neutral }}>
                    Prawdop. cięcia: {data.fedWatch.nextCut}
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(255,165,2,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#ffa502' }} />
                      <span>Rynek oczekuje luzowania polityki</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'onchain' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>📈 MVRV Z-Score</div>
                  <div style={styles.cardValue}>{data.mvrvZScore.value}</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    Strefa: {data.mvrvZScore.zone}
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>&lt;2 = niedowartościowanie, &gt;7 = szczyt</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>💎 SOPR</div>
                  <div style={styles.cardValue}>{data.sopr.value}</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    Sygnał: {data.sopr.signal}
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>&lt;1 = akumulacja (sprzedaż ze stratą)</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>🏦 Rezerwy giełd</div>
                  <div style={styles.cardValue}>{data.exchangeReserves.btc}M BTC</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    Trend: {data.exchangeReserves.trend}
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Outflow = mniej BTC na giełdach = bullish</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'flows' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>📊 ETF Flows (BTC)</div>
                  <div style={styles.cardValue}>+${data.etfFlows.daily}M</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    Tygodniowo: +${data.etfFlows.weekly}M
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Pozytywne napływy do ETF-ów</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>🏢 Instytucjonalny BTC</div>
                  <div style={styles.cardValue}>{data.institutionalBtc.percentage}%</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    Supply w rękach instytucji
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Rosnąca adopcja instytucjonalna</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>💰 Stablecoin Supply</div>
                  <div style={styles.cardValue}>${data.stablecoinSupply.value}B</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    ▲ {data.stablecoinSupply.change}% (30d)
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Więcej "amunicji" na rynku</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Cards Grid - Day Trading */}
        {tradingMode === 'daytrading' && (
          <div style={styles.grid}>
            {activeTab === 'momentum' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>📉 RSI (14)</div>
                  <div style={{ ...styles.cardValue, color: getRsiColor(data.rsi.value) }}>
                    {data.rsi.value}
                  </div>
                  <div style={styles.rsiGauge}>
                    <div style={{ ...styles.rsiMarker, left: `${data.rsi.value}%` }} />
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: `rgba(${data.rsi.value > 70 ? '255,71,87' : data.rsi.value < 30 ? '0,255,136' : '255,165,2'},0.2)` }}>
                      <div style={{ ...styles.dot, background: getRsiColor(data.rsi.value) }} />
                      <span>
                        {data.rsi.value > 70 ? 'Wykupienie - rozważ short' : 
                         data.rsi.value < 30 ? 'Wyprzedanie - rozważ long' : 
                         'Strefa neutralna'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>💹 Funding Rate</div>
                  <div style={styles.cardValue}>{(data.fundingRate.btc * 100).toFixed(3)}%</div>
                  <div style={{ ...styles.cardChange, color: data.fundingRate.btc > 0.03 ? '#ff4757' : '#00ff88' }}>
                    ETH: {(data.fundingRate.eth * 100).toFixed(3)}%
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: data.fundingRate.btc > 0.03 ? 'rgba(255,71,87,0.2)' : 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: data.fundingRate.btc > 0.03 ? '#ff4757' : '#00ff88' }} />
                      <span>
                        {data.fundingRate.btc > 0.05 ? 'Wysoki funding - rynek przegrzany' :
                         data.fundingRate.btc < 0 ? 'Ujemny funding - longi płacą mniej' :
                         'Normalny funding - brak ekstremalnego sentymentu'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>📊 Open Interest</div>
                  <div style={styles.cardValue}>${data.openInterest.value}B</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    ▲ {data.openInterest.change}% (24h)
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Rosnący OI = więcej zaangażowania</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'sentiment' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>😱 Fear & Greed Index</div>
                  <div style={{ ...styles.cardValue, color: getFearGreedColor(data.fearGreed.value) }}>
                    {data.fearGreed.value}
                  </div>
                  <div style={{ ...styles.cardChange, color: getFearGreedColor(data.fearGreed.value) }}>
                    {data.fearGreed.label}
                  </div>
                  <div style={styles.rsiGauge}>
                    <div style={{ ...styles.rsiMarker, left: `${data.fearGreed.value}%` }} />
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(255,165,2,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#ffa502' }} />
                      <span>
                        {data.fearGreed.value < 25 ? 'Ekstremalny strach - okazja?' :
                         data.fearGreed.value > 75 ? 'Ekstremalny chciwość - ostrożność' :
                         'Umiarkowany sentyment'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>📈 Volume 24h</div>
                  <div style={styles.cardValue}>${data.volume24h.total}B</div>
                  <div style={{ ...styles.cardChange, ...styles.positive }}>
                    ▲ {data.volume24h.change}% | BTC: ${data.volume24h.btc}B
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(0,255,136,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#00ff88' }} />
                      <span>Wysoki wolumen potwierdza ruch</span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>👑 BTC Dominance</div>
                  <div style={styles.cardValue}>{data.btcDominance.value}%</div>
                  <div style={{ ...styles.cardChange, color: data.btcDominance.change > 0 ? '#ffa502' : '#00ff88' }}>
                    {data.btcDominance.change > 0 ? '▲' : '▼'} {Math.abs(data.btcDominance.change)}%
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(255,165,2,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#ffa502' }} />
                      <span>
                        {data.btcDominance.change < 0 ? 'Spadająca dominacja - alt season?' : 'Rosnąca dominacja - BTC lideruje'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'liquidations' && (
              <>
                <div style={styles.card}>
                  <div style={styles.cardTitle}>💥 Likwidacje 24h</div>
                  <div style={styles.cardValue}>${data.liquidations.last24h}M</div>
                  <div style={{ ...styles.cardChange, ...styles.neutral }}>
                    Największa: ${data.liquidations.largest}M
                  </div>
                  <div style={styles.liquidationBar}>
                    <div style={{ ...styles.longBar, width: `${data.liquidations.longPercent}%` }}>
                      L {data.liquidations.longPercent}%
                    </div>
                    <div style={{ ...styles.shortBar, width: `${data.liquidations.shortPercent}%` }}>
                      S {data.liquidations.shortPercent}%
                    </div>
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: data.liquidations.shortPercent > 60 ? 'rgba(0,255,136,0.2)' : 'rgba(255,71,87,0.2)' }}>
                      <div style={{ ...styles.dot, background: data.liquidations.shortPercent > 60 ? '#00ff88' : '#ff4757' }} />
                      <span>
                        {data.liquidations.shortPercent > 60 ? 'Short squeeze - bullish momentum' :
                         data.liquidations.longPercent > 60 ? 'Long squeeze - bearish momentum' :
                         'Zrównoważone likwidacje'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>⚖️ Order Flow</div>
                  <div style={styles.cardValue}>{data.orderFlow.buyPressure}% Buy</div>
                  <div style={styles.liquidationBar}>
                    <div style={{ ...styles.longBar, width: `${data.orderFlow.buyPressure}%` }}>
                      Buy
                    </div>
                    <div style={{ ...styles.shortBar, width: `${data.orderFlow.sellPressure}%` }}>
                      Sell
                    </div>
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: data.orderFlow.buyPressure > 55 ? 'rgba(0,255,136,0.2)' : 'rgba(255,71,87,0.2)' }}>
                      <div style={{ ...styles.dot, background: data.orderFlow.buyPressure > 55 ? '#00ff88' : '#ff4757' }} />
                      <span>
                        {data.orderFlow.buyPressure > 55 ? 'Przewaga kupujących' : 'Przewaga sprzedających'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardTitle}>🌊 Volatility (ATR)</div>
                  <div style={styles.cardValue}>{data.volatility.value}%</div>
                  <div style={{ ...styles.cardChange, ...styles.neutral }}>
                    {data.volatility.label}
                  </div>
                  <div style={styles.signalBox}>
                    <div style={{ ...styles.signalIndicator, background: 'rgba(255,165,2,0.2)' }}>
                      <div style={{ ...styles.dot, background: '#ffa502' }} />
                      <span>
                        {data.volatility.value > 5 ? 'Wysoka zmienność - szersze SL' : 
                         data.volatility.value < 2 ? 'Niska zmienność - możliwy breakout' :
                         'Normalna zmienność'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Chart */}
        <div style={styles.chartContainer}>
          <h3 style={{ marginBottom: '20px' }}>
            {tradingMode === 'longterm' 
              ? '📈 BTC vs M2 Supply vs DXY (korelacja)' 
              : '📊 RSI & Likwidacje (24h)'}
          </h3>
          {tradingMode === 'longterm' ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <XAxis dataKey="name" stroke="#666" />
                <YAxis yAxisId="btc" orientation="left" stroke="#00d4ff" />
                <YAxis yAxisId="m2" orientation="right" stroke="#7b2ff7" />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
                />
                <Area yAxisId="btc" type="monotone" dataKey="btc" stroke="#00d4ff" fill="rgba(0,212,255,0.3)" name="BTC ($)" />
                <Line yAxisId="m2" type="monotone" dataKey="m2" stroke="#7b2ff7" strokeWidth={2} dot={false} name="M2 ($T)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={liquidationData}>
                <XAxis dataKey="time" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
                />
                <Bar dataKey="longs" fill="#00ff88" name="Longs ($M)" />
                <Bar dataKey="shorts" fill="#ff4757" name="Shorts ($M)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Price Cards */}
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>₿ Bitcoin</div>
            <div style={styles.cardValue}>${data.btcPrice.value.toLocaleString()}</div>
            <div style={{ ...styles.cardChange, ...styles.positive }}>
              ▲ {data.btcPrice.change}% (24h) | ATH: ${data.btcPrice.ath.toLocaleString()}
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Ξ Ethereum</div>
            <div style={styles.cardValue}>${data.ethPrice.value.toLocaleString()}</div>
            <div style={{ ...styles.cardChange, ...styles.positive }}>
              ▲ {data.ethPrice.change}% (24h)
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>🔒 Total TVL (DeFi)</div>
            <div style={styles.cardValue}>${data.tvl.value}B</div>
            <div style={{ ...styles.cardChange, ...styles.positive }}>
              ▲ {data.tvl.change}% (30d)
            </div>
          </div>
        </div>

        <footer style={styles.footer}>
          <p>⚠️ To nie jest porada inwestycyjna. Zawsze przeprowadzaj własną analizę (DYOR).</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
