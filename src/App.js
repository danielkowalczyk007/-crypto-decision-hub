import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import helpContent from './helpContent';

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

// ============ SCORE GAUGE WITH NEEDLE AND COLORED SEGMENTS ============
const ScoreGauge = ({ score, label, icon, thresholds, size = 180, onHelpClick, theme }) => {
  const t = themes[theme] || themes.dark;
  const percentage = score / 100;
  
  // Use thresholds from props or default
  const th = thresholds || { accumulate: 70, holdPlus: 55, hold: 45, caution: 30 };
  
  // Get signal based on score and thresholds
  const getSignal = (s) => {
    if (s >= th.accumulate) return { text: 'AKUMULUJ', color: t.positive, emoji: '🟢' };
    if (s >= th.holdPlus) return { text: 'HOLD+', color: t.positive, emoji: '🟢' };
    if (s >= th.hold) return { text: 'HOLD', color: t.warning, emoji: '🟡' };
    if (s >= th.caution) return { text: 'OSTROŻNIE', color: t.warning, emoji: '🟠' };
    return { text: 'REDUKUJ', color: t.negative, emoji: '🔴' };
  };
  
  const signal = getSignal(score);
  
  // Calculate needle angle (0 = left, 180 = right)
  const needleAngle = percentage * 180;
  
  // Gauge segments with colors based on thresholds
  const segments = [
    { value: th.caution, color: '#ff4757', label: 'Redukuj' },
    { value: th.hold - th.caution, color: '#ffa726', label: 'Ostrożnie' },
    { value: th.holdPlus - th.hold, color: '#ffd93d', label: 'Hold' },
    { value: th.accumulate - th.holdPlus, color: '#6bcf7f', label: 'Hold+' },
    { value: 100 - th.accumulate, color: '#00d4aa', label: 'Akumuluj' }
  ];
  
  // SVG Needle component
  const Needle = ({ cx, cy, angle, length }) => {
    const radian = (180 - angle) * (Math.PI / 180);
    const x = cx + length * Math.cos(radian);
    const y = cy - length * Math.sin(radian);
    
    return (
      <g>
        {/* Needle shadow */}
        <line
          x1={cx}
          y1={cy}
          x2={x + 2}
          y2={y + 2}
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke={t.text}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="8" fill={t.accent} stroke={t.text} strokeWidth="2" />
        {/* Inner dot */}
        <circle cx={cx} cy={cy} r="4" fill={t.text} />
      </g>
    );
  };
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      padding: '15px',
      background: t.cardBg,
      borderRadius: '16px',
      border: `1px solid ${t.cardBorder}`,
      position: 'relative'
    }}>
      {/* Help button */}
      <button
        onClick={onHelpClick}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: `1px solid ${t.cardBorder}`,
          background: 'transparent',
          color: t.textSecondary,
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ?
      </button>
      
      {/* Label */}
      <div style={{ 
        fontSize: '14px', 
        fontWeight: '600', 
        color: t.text,
        marginBottom: '5px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        {icon} {label}
      </div>
      
      {/* Gauge */}
      <div style={{ position: 'relative', width: size, height: size / 2 + 30 }}>
        <ResponsiveContainer width="100%" height={size / 2 + 20}>
          <PieChart>
            <Pie
              data={segments}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={size * 0.35}
              outerRadius={size * 0.45}
              dataKey="value"
              stroke="none"
            >
              {segments.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        
        {/* Needle overlay */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
          viewBox={`0 0 ${size} ${size / 2 + 30}`}
        >
          <Needle
            cx={size / 2}
            cy={size / 2 + 10}
            angle={needleAngle}
            length={size * 0.32}
          />
        </svg>
        
        {/* Score display */}
        <div style={{
          position: 'absolute',
          bottom: '0',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center'
        }}>
          <div style={{ 
            fontSize: '28px', 
            fontWeight: '700', 
            color: signal.color,
            textShadow: `0 0 20px ${signal.color}40`
          }}>
            {score}
          </div>
        </div>
      </div>
      
      {/* Signal */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        background: `${signal.color}20`,
        borderRadius: '20px',
        marginTop: '5px'
      }}>
        <span>{signal.emoji}</span>
        <span style={{ 
          fontSize: '13px', 
          fontWeight: '600', 
          color: signal.color 
        }}>
          {signal.text}
        </span>
      </div>
      
      {/* Threshold legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: '10px',
        fontSize: '9px',
        color: t.textSecondary
      }}>
        <span>0</span>
        <span style={{ color: '#ffa726' }}>{th.caution}</span>
        <span style={{ color: '#ffd93d' }}>{th.hold}</span>
        <span style={{ color: '#6bcf7f' }}>{th.holdPlus}</span>
        <span style={{ color: '#00d4aa' }}>{th.accumulate}</span>
        <span>100</span>
      </div>
    </div>
  );
};

// ============ HELP MODAL ============
const HelpModal = ({ helpKey, onClose, theme }) => {
  const t = themes[theme] || themes.dark;
  const content = helpContent[helpKey];
  
  if (!content) return null;
  
  return (
    <div 
      style={{
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
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: t.cardBg,
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          border: `1px solid ${t.cardBorder}`
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ 
            margin: 0, 
            color: t.text,
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {content.emoji} {content.title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: t.textSecondary,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1'
            }}
          >
            ×
          </button>
        </div>
        
        {/* Description */}
        <p style={{ 
          color: t.textSecondary, 
          fontSize: '14px',
          lineHeight: '1.6',
          marginBottom: '16px'
        }}>
          {content.description}
        </p>
        
        {/* Thresholds info if available */}
        {content.thresholds && (
          <div style={{
            background: `${t.accent}15`,
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: t.accent, marginBottom: '8px' }}>
              📊 PROGI DLA TEGO WSKAŹNIKA
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
              <div><span style={{color: '#00d4aa'}}>●</span> AKUMULUJ: ≥{content.thresholds.accumulate}</div>
              <div><span style={{color: '#6bcf7f'}}>●</span> HOLD+: ≥{content.thresholds.holdPlus}</div>
              <div><span style={{color: '#ffd93d'}}>●</span> HOLD: ≥{content.thresholds.hold}</div>
              <div><span style={{color: '#ffa726'}}>●</span> OSTROŻNIE: ≥{content.thresholds.caution}</div>
              <div><span style={{color: '#ff4757'}}>●</span> REDUKUJ: &lt;{content.thresholds.caution}</div>
            </div>
          </div>
        )}
        
        {/* Interpretation */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: '600', 
            color: t.text,
            marginBottom: '8px'
          }}>
            🎯 INTERPRETACJA
          </div>
          {content.interpretation.map((item, i) => (
            <div 
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px',
                background: item.signal === 'bullish' ? 'rgba(0,212,170,0.1)' :
                           item.signal === 'bearish' ? 'rgba(255,71,87,0.1)' :
                           item.signal === 'warning' ? 'rgba(255,167,38,0.1)' :
                           'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                marginBottom: '6px'
              }}
            >
              <div style={{ fontSize: '12px', color: t.textSecondary, minWidth: '120px' }}>
                {item.condition}
              </div>
              <div style={{ fontSize: '12px', color: t.text }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
        
        {/* Tip */}
        <div style={{
          background: `${t.accent}15`,
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '12px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: t.accent, marginBottom: '4px' }}>
            💡 PRO TIP
          </div>
          <div style={{ fontSize: '12px', color: t.textSecondary, lineHeight: '1.5' }}>
            {content.tip}
          </div>
        </div>
        
        {/* Source */}
        <div style={{ fontSize: '11px', color: t.textSecondary }}>
          📊 Źródło: {content.source}
        </div>
      </div>
    </div>
  );
};

// ============ CARD COMPONENT ============
const Card = ({ children, helpKey, onHelp, theme, style = {} }) => {
  const t = themes[theme] || themes.dark;
  
  return (
    <div style={{
      background: t.cardBg,
      borderRadius: '12px',
      padding: '16px',
      border: `1px solid ${t.cardBorder}`,
      position: 'relative',
      ...style
    }}>
      {helpKey && (
        <button
          onClick={() => onHelp(helpKey)}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: `1px solid ${t.cardBorder}`,
            background: 'transparent',
            color: t.textSecondary,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ?
        </button>
      )}
      {children}
    </div>
  );
};

// ============ LIVE TAG ============
const LiveTag = ({ theme }) => {
  const t = themes[theme] || themes.dark;
  return (
    <span style={{
      background: t.positive,
      color: '#000',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '9px',
      fontWeight: '700',
      marginLeft: '6px',
      animation: 'pulse 2s infinite'
    }}>
      LIVE
    </span>
  );
};

// ============ METRIC TILE ============
const MetricTile = ({ label, value, change, icon, helpKey, onHelp, theme }) => {
  const t = themes[theme] || themes.dark;
  const isPositive = change && parseFloat(change) >= 0;
  
  return (
    <Card helpKey={helpKey} onHelp={onHelp} theme={theme}>
      <div style={{ fontSize: '11px', color: t.textSecondary, marginBottom: '4px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: t.text }}>
        {value}
      </div>
      {change && (
        <div style={{ 
          fontSize: '11px', 
          color: isPositive ? t.positive : t.negative,
          marginTop: '4px'
        }}>
          {isPositive ? '▲' : '▼'} {change}
        </div>
      )}
    </Card>
  );
};

// ============ MAIN APP ============
export default function App() {
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('scores');
  const [helpModal, setHelpModal] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Simulated scores - replace with real API data
  const [scores, setScores] = useState({
    dayTrading: 72,
    swing: 58,
    hodl: 65
  });
  
  // Simulated market data
  const [marketData, setMarketData] = useState({
    btcPrice: 98500,
    btcChange: '+2.4%',
    ethPrice: 3450,
    ethChange: '+1.8%',
    fearGreed: 68,
    btcDominance: 52.3,
    tvl: 185.4,
    stablecoinSupply: 142.8
  });
  
  const t = themes[theme];
  
  useEffect(() => {
    // Simulate loading
    setTimeout(() => setLoading(false), 1000);
  }, []);
  
  const tabs = [
    { id: 'scores', label: '📊 Scores', icon: '📊' },
    { id: 'crypto', label: '₿ Crypto', icon: '₿' },
    { id: 'macro', label: '🏛️ Macro', icon: '🏛️' },
    { id: 'defi', label: '🦙 DeFi', icon: '🦙' },
    { id: 'charts', label: '📈 Charts', icon: '📈' }
  ];
  
  return (
    <div style={{
      minHeight: '100vh',
      background: t.bg,
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: `1px solid ${t.cardBorder}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <span style={{ fontWeight: '700', fontSize: '16px' }}>Crypto Decision Hub</span>
          <LiveTag theme={theme} />
        </div>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: '8px',
            padding: '8px 12px',
            color: t.text,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      
      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        overflowX: 'auto',
        borderBottom: `1px solid ${t.cardBorder}`
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === tab.id ? t.accent : t.cardBg,
              color: activeTab === tab.id ? '#fff' : t.textSecondary,
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Content */}
      <div style={{ padding: '16px' }}>
        {activeTab === 'scores' && (
          <div>
            {/* Info banner */}
            <div style={{
              background: `${t.accent}15`,
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '16px',
              fontSize: '12px',
              color: t.textSecondary,
              lineHeight: '1.5'
            }}>
              <strong style={{ color: t.accent }}>💡 Różne progi dla różnych horyzontów:</strong><br />
              🎯 Day Trading: agresywne (80/65/50/35) • 
              📊 Swing: standardowe (70/55/45/30) • 
              🏦 HODL: konserwatywne (60/50/40/25)
            </div>
            
            {/* Three Score Gauges */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}>
              <ScoreGauge
                score={scores.dayTrading}
                label="Day Trading"
                icon="🎯"
                thresholds={helpContent.dayTradingScore?.thresholds}
                onHelpClick={() => setHelpModal('dayTradingScore')}
                theme={theme}
              />
              <ScoreGauge
                score={scores.swing}
                label="Swing"
                icon="📊"
                thresholds={helpContent.swingScore?.thresholds}
                onHelpClick={() => setHelpModal('swingScore')}
                theme={theme}
              />
              <ScoreGauge
                score={scores.hodl}
                label="HODL"
                icon="🏦"
                thresholds={helpContent.hodlScore?.thresholds}
                onHelpClick={() => setHelpModal('hodlScore')}
                theme={theme}
              />
            </div>
            
            {/* Quick metrics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px'
            }}>
              <MetricTile
                label="BTC"
                value={`$${marketData.btcPrice.toLocaleString()}`}
                change={marketData.btcChange}
                icon="₿"
                helpKey="btcPrice"
                onHelp={setHelpModal}
                theme={theme}
              />
              <MetricTile
                label="ETH"
                value={`$${marketData.ethPrice.toLocaleString()}`}
                change={marketData.ethChange}
                icon="◆"
                helpKey="ethPrice"
                onHelp={setHelpModal}
                theme={theme}
              />
              <MetricTile
                label="Fear & Greed"
                value={marketData.fearGreed}
                icon="😱"
                helpKey="fearGreed"
                onHelp={setHelpModal}
                theme={theme}
              />
              <MetricTile
                label="BTC Dom"
                value={`${marketData.btcDominance}%`}
                icon="👑"
                helpKey="btcDominance"
                onHelp={setHelpModal}
                theme={theme}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'crypto' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px'
          }}>
            <MetricTile label="BTC" value={`$${marketData.btcPrice.toLocaleString()}`} change={marketData.btcChange} icon="₿" helpKey="btcPrice" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="ETH" value={`$${marketData.ethPrice.toLocaleString()}`} change={marketData.ethChange} icon="◆" helpKey="ethPrice" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="Fear & Greed" value={marketData.fearGreed} icon="😱" helpKey="fearGreed" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="BTC Dominance" value={`${marketData.btcDominance}%`} icon="👑" helpKey="btcDominance" onHelp={setHelpModal} theme={theme} />
          </div>
        )}
        
        {activeTab === 'macro' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px'
          }}>
            <MetricTile label="M2 Supply" value="$21.4T" change="+3.2% YoY" icon="💵" helpKey="m2Supply" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="DXY" value="104.2" change="-0.5%" icon="💲" helpKey="dxyIndex" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="Fed Rate" value="5.25%" icon="🏛️" helpKey="fedRates" onHelp={setHelpModal} theme={theme} />
          </div>
        )}
        
        {activeTab === 'defi' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px'
          }}>
            <MetricTile label="Total TVL" value={`$${marketData.tvl}B`} change="+5.2%" icon="🔒" helpKey="tvl" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="Stablecoins" value={`$${marketData.stablecoinSupply}B`} change="+1.8%" icon="💰" helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="Exchange Reserves" value="2.1M BTC" change="-2.3%" icon="🏦" helpKey="exchangeReserves" onHelp={setHelpModal} theme={theme} />
            <MetricTile label="MVRV Z-Score" value="2.1" icon="📊" helpKey="mvrvZScore" onHelp={setHelpModal} theme={theme} />
          </div>
        )}
        
        {activeTab === 'charts' && (
          <Card theme={theme}>
            <div style={{ textAlign: 'center', padding: '40px', color: t.textSecondary }}>
              📈 TradingView charts coming soon...
            </div>
          </Card>
        )}
      </div>
      
      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: '16px',
        color: t.textSecondary,
        fontSize: '10px',
        borderTop: `1px solid ${t.cardBorder}`
      }}>
        ⚡ Day Trade: godziny-dni | 📊 Swing: tygodnie | 🏦 HODL: miesiące-lata
        <br />
        Kliknij ? aby zobaczyć interpretację wskaźnika
      </div>
      
      {/* Help Modal */}
      {helpModal && (
        <HelpModal
          helpKey={helpModal}
          onClose={() => setHelpModal(null)}
          theme={theme}
        />
      )}
      
      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
