import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';

const generateMockData = () => ({
  m2Supply: { value: 21.5, trend: 'up', change: 2.3 },
  dxy: { value: 103.42, trend: 'down', change: -1.8 },
  fedWatch: { nextCut: '2025-03', probability: 68 },
  btcPrice: { value: 94250, change: 3.2, ath: 109000 },
  ethPrice: { value: 3420, change: 2.8 },
  stablecoinSupply: { value: 178.5, change: 5.2 },
  tvl: { value: 89.4, change: 12.3 },
  mvrvZScore: { value: 1.8, zone: 'neutral' },
  sopr: { value: 0.98, signal: 'accumulation' },
  exchangeReserves: { btc: 2.1, eth: 17.8, trend: 'outflow' },
  etfFlows: { daily: 245, weekly: 1820 },
  institutionalBtc: { percentage: 20.4 },
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
  { name: 'Wrz', m2: 21.5, btc: 94000, dxy: 103.4 },
];

const MetricCard = ({ title, value, change, suffix = '', icon }) => (
  <div style={styles.card}>
    <div style={styles.cardHeader}>
      <span style={styles.cardIcon}>{icon}</span>
      <span style={styles.cardTitle}>{title}</span>
    </div>
    <div style={styles.cardValue}>{value}{suffix}</div>
    {change !== undefined && (
      <div style={{...styles.cardChange, color: change >= 0 ? '#10b981' : '#ef4444'}}>
        {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
      </div>
    )}
  </div>
);

const SignalIndicator = ({ signal, label }) => {
  const colors = { bullish: '#10b981', bearish: '#ef4444', neutral: '#f59e0b' };
  return (
    <div style={styles.signal}>
      <div style={{...styles.signalDot, backgroundColor: colors[signal]}} />
      <span>{label}</span>
    </div>
  );
};

export default function CryptoDecisionHub() {
  const [data, setData] = useState(generateMockData());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [decisionScore, setDecisionScore] = useState(72);

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generateMockData());
      setDecisionScore(Math.floor(Math.random() * 30) + 60);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const calculateOverallSignal = () => {
    let score = 0;
    if (data.m2Supply.trend === 'up') score += 20;
    if (data.dxy.trend === 'down') score += 15;
    if (data.mvrvZScore.value < 3) score += 15;
    if (data.sopr.value < 1) score += 20;
    if (data.exchangeReserves.trend === 'outflow') score += 15;
    if (data.etfFlows.daily > 0) score += 15;
    return score;
  };

  const signal = calculateOverallSignal();
  const signalType = signal >= 70 ? 'bullish' : signal >= 40 ? 'neutral' : 'bearish';

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🎯 Crypto Decision Hub</h1>
        <p style={styles.subtitle}>Agregator wskaźników dla świadomych decyzji</p>
      </header>

      <nav style={styles.nav}>
        {['dashboard', 'makro', 'onchain', 'automatyzacja'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{...styles.navButton, ...(activeTab === tab ? styles.navButtonActive : {})}}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div style={styles.decisionPanel}>
        <h2 style={styles.panelTitle}>🧠 Algorytm Decyzyjny</h2>
        <div style={styles.scoreContainer}>
          <div style={styles.scoreCircle}>
            <span style={styles.scoreValue}>{signal}</span>
            <span style={styles.scoreLabel}>/ 100</span>
          </div>
          <SignalIndicator signal={signalType} label={signalType === 'bullish' ? 'KUPUJ' : signalType === 'neutral' ? 'CZEKAJ' : 'SPRZEDAJ'} />
        </div>
        <div style={styles.factorsGrid}>
          <div style={styles.factor}>M2 Supply {data.m2Supply.trend === 'up' ? '✅' : '❌'}</div>
          <div style={styles.factor}>DXY Trend {data.dxy.trend === 'down' ? '✅' : '❌'}</div>
          <div style={styles.factor}>MVRV Z-Score {data.mvrvZScore.value < 3 ? '✅' : '❌'}</div>
          <div style={styles.factor}>SOPR {data.sopr.value < 1 ? '✅' : '❌'}</div>
          <div style={styles.factor}>Exchange Flow {data.exchangeReserves.trend === 'outflow' ? '✅' : '❌'}</div>
          <div style={styles.factor}>ETF Flows {data.etfFlows.daily > 0 ? '✅' : '❌'}</div>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📊 Przegląd Rynku</h2>
          <div style={styles.grid}>
            <MetricCard title="Bitcoin" value={`$${data.btcPrice.value.toLocaleString()}`} change={data.btcPrice.change} icon="₿" />
            <MetricCard title="Ethereum" value={`$${data.ethPrice.value.toLocaleString()}`} change={data.ethPrice.change} icon="Ξ" />
            <MetricCard title="Total TVL" value={`$${data.tvl.value}B`} change={data.tvl.change} icon="🔒" />
            <MetricCard title="Stablecoin Supply" value={`$${data.stablecoinSupply.value}B`} change={data.stablecoinSupply.change} icon="💵" />
          </div>
          <div style={styles.chartContainer}>
            <h3 style={styles.chartTitle}>BTC vs M2 Supply (korelacja)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <XAxis dataKey="name" stroke="#666" />
                <YAxis yAxisId="left" stroke="#f7931a" />
                <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" />
                <Tooltip />
                <Area yAxisId="left" type="monotone" dataKey="btc" stroke="#f7931a" fill="#f7931a33" />
                <Line yAxisId="right" type="monotone" dataKey="m2" stroke="#3b82f6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'makro' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🌍 Wskaźniki Makro</h2>
          <div style={styles.grid}>
            <MetricCard title="M2 Supply (Global)" value={`$${data.m2Supply.value}T`} change={data.m2Supply.change} icon="💰" />
            <MetricCard title="DXY Index" value={data.dxy.value} change={data.dxy.change} icon="💲" />
            <MetricCard title="Fed Rate Cut" value={`${data.fedWatch.probability}%`} suffix=" prob." icon="🏦" />
            <MetricCard title="ETF Daily Flow" value={`$${data.etfFlows.daily}M`} icon="📈" />
          </div>
          <div style={styles.infoBox}>
            <h4>📌 Interpretacja</h4>
            <p><strong>M2 ↑ + DXY ↓</strong> = Idealne warunki dla BTC (więcej płynności, słabszy dolar)</p>
            <p><strong>Fed pivot</strong> = Historycznie poprzedza rally 3-6 miesięcy</p>
          </div>
        </div>
      )}

      {activeTab === 'onchain' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>⛓️ Metryki On-Chain</h2>
          <div style={styles.grid}>
            <MetricCard title="MVRV Z-Score" value={data.mvrvZScore.value} icon="📉" />
            <MetricCard title="SOPR" value={data.sopr.value} icon="💎" />
            <MetricCard title="Exchange BTC" value={`${data.exchangeReserves.btc}M`} icon="🏪" />
            <MetricCard title="Institutional %" value={`${data.institutionalBtc.percentage}%`} icon="🏛️" />
          </div>
          <div style={styles.signalGrid}>
            <SignalIndicator signal={data.mvrvZScore.value < 2 ? 'bullish' : data.mvrvZScore.value < 5 ? 'neutral' : 'bearish'} label={`MVRV: ${data.mvrvZScore.zone}`} />
            <SignalIndicator signal={data.sopr.value < 1 ? 'bullish' : 'neutral'} label={`SOPR: ${data.sopr.signal}`} />
            <SignalIndicator signal={data.exchangeReserves.trend === 'outflow' ? 'bullish' : 'bearish'} label={`Exchanges: ${data.exchangeReserves.trend}`} />
          </div>
        </div>
      )}

      {activeTab === 'automatyzacja' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🤖 System Automatyzacji</h2>
          <div style={styles.automationCard}>
            <h3>Alert DCA</h3>
            <p>Kupuj gdy: MVRV &lt; 1.5 AND SOPR &lt; 0.95</p>
            <div style={styles.statusBadge}>Status: Aktywny ✅</div>
          </div>
          <div style={styles.automationCard}>
            <h3>Alert Take Profit</h3>
            <p>Sprzedaj gdy: MVRV &gt; 6 OR RSI &gt; 85</p>
            <div style={styles.statusBadge}>Status: Oczekuje 🟡</div>
          </div>
          <div style={styles.automationCard}>
            <h3>Rebalancing Portfolio</h3>
            <p>Sprawdzaj alokację co tydzień (70% BTC / 20% ETH / 10% Stable)</p>
            <div style={styles.statusBadge}>Status: Harmonogram ⏰</div>
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        <p>Dane odświeżane co 30s | Ostatnia aktualizacja: {new Date().toLocaleTimeString('pl-PL')}</p>
        <p style={styles.disclaimer}>⚠️ To nie jest porada inwestycyjna. Zawsze przeprowadzaj własną analizę (DYOR).</p>
      </footer>
    </div>
  );
}

const styles = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', backgroundColor: '#0f0f1a', color: '#fff', minHeight: '100vh', padding: '20px' },
  header: { textAlign: 'center', marginBottom: '30px' },
  title: { fontSize: '28px', margin: '0', background: 'linear-gradient(90deg, #f7931a, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#888', marginTop: '8px' },
  nav: { display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' },
  navButton: { padding: '10px 20px', backgroundColor: '#1a1a2e', border: 'none', borderRadius: '8px', color: '#888', cursor: 'pointer', transition: 'all 0.2s' },
  navButtonActive: { backgroundColor: '#3b82f6', color: '#fff' },
  decisionPanel: { backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '24px', marginBottom: '30px', border: '1px solid #333' },
  panelTitle: { margin: '0 0 20px', fontSize: '20px' },
  scoreContainer: { display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '20px' },
  scoreCircle: { width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#0f0f1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '4px solid #3b82f6' },
  scoreValue: { fontSize: '32px', fontWeight: 'bold' },
  scoreLabel: { fontSize: '12px', color: '#888' },
  factorsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' },
  factor: { padding: '10px', backgroundColor: '#0f0f1a', borderRadius: '8px', textAlign: 'center', fontSize: '14px' },
  section: { marginBottom: '30px' },
  sectionTitle: { fontSize: '20px', marginBottom: '20px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' },
  card: { backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '20px', border: '1px solid #333' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' },
  cardIcon: { fontSize: '20px' },
  cardTitle: { color: '#888', fontSize: '14px' },
  cardValue: { fontSize: '24px', fontWeight: 'bold' },
  cardChange: { fontSize: '14px', marginTop: '5px' },
  chartContainer: { backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '20px', border: '1px solid #333' },
  chartTitle: { margin: '0 0 15px', fontSize: '16px', color: '#888' },
  signal: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 15px', backgroundColor: '#1a1a2e', borderRadius: '8px' },
  signalDot: { width: '12px', height: '12px', borderRadius: '50%' },
  signalGrid: { display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '20px' },
  infoBox: { backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '20px', border: '1px solid #333' },
  automationCard: { backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '20px', marginBottom: '15px', border: '1px solid #333' },
  statusBadge: { display: 'inline-block', padding: '5px 10px', backgroundColor: '#0f0f1a', borderRadius: '6px', marginTop: '10px', fontSize: '14px' },
  footer: { textAlign: 'center', color: '#666', fontSize: '12px', marginTop: '40px' },
  disclaimer: { color: '#f59e0b', marginTop: '10px' },
};