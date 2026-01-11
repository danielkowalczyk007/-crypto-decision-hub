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
    const queryString = \`timestamp=\${timestamp}\`;
    const signature = await generateSignature(queryString, secretKey);
    const response = await fetch(\`https://api.binance.com/api/v3/account?\${queryString}&signature=\${signature}\`, { headers: { 'X-MBX-APIKEY': apiKey } });
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
    const queryString = \`timestamp=\${timestamp}\`;
    const signature = await generateSignature(queryString, secretKey);
    const response = await fetch(\`https://fapi.binance.com/fapi/v2/balance?\${queryString}&signature=\${signature}\`, { headers: { 'X-MBX-APIKEY': apiKey } });
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
    const queryString = \`timestamp=\${timestamp}\`;
    const signature = await generateSignature(queryString, secretKey);
    const response = await fetch(\`https://fapi.binance.com/fapi/v2/positionRisk?\${queryString}&signature=\${signature}\`, { headers: { 'X-MBX-APIKEY': apiKey } });
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
    const queryString = \`timestamp=\${timestamp}\`;
    const signature = await generateSignature(queryString, secretKey);
    const [spotRes, futuresRes] = await Promise.all([
      fetch(\`https://api.binance.com/api/v3/openOrders?\${queryString}&signature=\${signature}\`, { headers: { 'X-MBX-APIKEY': apiKey } }),
      fetch(\`https://fapi.binance.com/fapi/v1/openOrders?\${queryString}&signature=\${signature}\`, { headers: { 'X-MBX-APIKEY': apiKey } })
    ]);
    const spotOrders = spotRes.ok ? (await spotRes.json()).map(o => ({ ...o, market: 'SPOT' })) : [];
    const futuresOrders = futuresRes.ok ? (await futuresRes.json()).map(o => ({ ...o, market: 'FUTURES' })) : [];
    return { spot: spotOrders, futures: futuresOrders };
  } catch (error) { return { error: error.message }; }
};

const placeOrder = async (apiKey, secretKey, params, market = 'SPOT') => {
  try {
    const timestamp = Date.now();
    const queryString = \`\${new URLSearchParams({ ...params, timestamp }).toString()}\`;
    const signature = await generateSignature(queryString, secretKey);
    const baseUrl = market === 'SPOT' ? 'https://api.binance.com/api/v3/order' : 'https://fapi.binance.com/fapi/v1/order';
    const response = await fetch(\`\${baseUrl}?\${queryString}&signature=\${signature}\`, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Order failed');
    return { success: true, order: data };
  } catch (error) { return { success: false, error: error.message }; }
};

const cancelOrder = async (apiKey, secretKey, symbol, orderId, market = 'SPOT') => {
  try {
    const timestamp = Date.now();
    const queryString = \`symbol=\${symbol}&orderId=\${orderId}&timestamp=\${timestamp}\`;
    const signature = await generateSignature(queryString, secretKey);
    const baseUrl = market === 'SPOT' ? 'https://api.binance.com/api/v3/order' : 'https://fapi.binance.com/fapi/v1/order';
    const response = await fetch(\`\${baseUrl}?\${queryString}&signature=\${signature}\`, { method: 'DELETE', headers: { 'X-MBX-APIKEY': apiKey } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.msg || 'Cancel failed'); }
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
};

const closePosition = async (apiKey, secretKey, symbol, positionAmt) => {
  const side = parseFloat(positionAmt) > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(parseFloat(positionAmt));
  return placeOrder(apiKey, secretKey, { symbol, side, type: 'MARKET', quantity: quantity.toString(), reduceOnly: 'true' }, 'FUTURES');
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
  const borderClass = signalColor === 'positive' ? 'border-l-4 border-l-green-500 bg-green-500/5' : signalColor === 'negative' ? 'border-l-4 border-l-red-500 bg-red-500/5' : signalColor === 'warning' ? 'border-l-4 border-l-yellow-500 bg-yellow-500/5' : '';
  return (
    <div className={`relative p-3.5 ${t.card} rounded-xl border ${t.border} ${borderClass} ${className}`}>
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
  const sources = [{ name: 'CG', status: apiStatus.coingecko }, { name: 'Bin', status: apiStatus.binance }, { name: 'DeFi', status: apiStatus.defillama }, { name: 'FRED', status: apiStatus.fred }];
  const statusClass = (s) => s === 'live' ? 'bg-green-500/20 text-green-500' : s === 'error' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500';
  return (
    <div className={`flex items-center gap-1 text-[8px] ${t.muted} flex-wrap`}>
      {sources.map((s, i) => <span key={i} className={`px-1.5 py-0.5 rounded ${statusClass(s.status)}`}>{s.name}</span>)}
    </div>
  );
};

const AIInsight = ({ cgData, binanceData, altseasonData, dayScore, swingScore, hodlScore, theme }) => {
  const t = useTheme(theme);
  let insight = '', signal = 'neutral', emoji = '🤔';
  const fg = cgData?.fearGreed?.value || 50;
  const funding = binanceData?.fundingRate?.value || 0;
  const btcChange = cgData?.btcPrice?.change || 0;
  const altIndex = altseasonData?.altseasonIndex || 50;
  if (fg < 25 && funding < 0) { insight = \`Extreme Fear (\${fg}) + ujemny Funding = potencjalne dno.\`; signal = 'bullish'; emoji = '🟢'; }
  else if (fg > 75 && funding > 0.03) { insight = \`Extreme Greed (\${fg}) + wysoki Funding = rynek przegrzany.\`; signal = 'bearish'; emoji = '🔴'; }
  else if (altIndex > 60) { insight = \`Altseason Index (\${altIndex}) wysoki = rotacja do altów.\`; signal = 'bullish'; emoji = '🚀'; }
  else if (btcChange > 5) { insight = \`BTC +\${btcChange.toFixed(1)}% = silne momentum.\`; signal = 'bullish'; emoji = '📈'; }
  else if (btcChange < -5) { insight = \`BTC \${btcChange.toFixed(1)}% = korekta.\`; signal = 'bearish'; emoji = '📉'; }
  else { const avg = Math.round((dayScore + swingScore + hodlScore) / 3); insight = \`Mieszane sygnały (avg: \${avg}). Obserwuj.\`; }
  const signalClass = signal === 'bullish' ? 'bg-green-500/15 border-l-green-500' : signal === 'bearish' ? 'bg-red-500/15 border-l-red-500' : 'bg-yellow-500/15 border-l-yellow-500';
  return (
    <div className={`p-2.5 ${signalClass} border-l-4 rounded-r-lg mx-3 mb-2.5`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{emoji}</span>
        <div>
          <div className={`text-[9px] ${t.text} opacity-70 mb-0.5`}>🤖 AI INSIGHT</div>
          <div className={`text-[11px] ${t.text} leading-relaxed`}>{insight}</div>
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
    <div className={`flex flex-col items-center w-[31%] min-w-[95px] p-1.5 ${t.isDark ? 'bg-slate-800/50' : 'bg-slate-100/70'} rounded-lg`}>
      <div className="flex items-center justify-between w-full mb-0.5 px-0.5">
        <span className={`text-[10px] font-bold ${t.text}`}>{icon} {label}</span>
        <button onClick={onHelp} className={`w-4 h-4 rounded-full ${t.isDark ? 'bg-white/10' : 'bg-black/10'} border-none ${t.muted} text-[9px] cursor-pointer flex items-center justify-center`}>?</button>
      </div>
      <svg viewBox="0 0 100 52" className="w-full max-w-[90px] h-[46px]">
        <defs><linearGradient id={\`gauge-\${label}\`} x1="0%" y1="0%" x2="100%" y2="0%">{gaugeColors.map((c, i) => <stop key={i} offset={\`\${i * 25}%\`} stopColor={c} />)}</linearGradient></defs>
        <path d="M 10 48 A 40 40 0 0 1 90 48" fill="none" stroke={t.isDark ? '#334155' : '#e2e8f0'} strokeWidth="7" strokeLinecap="round" />
        <path d="M 10 48 A 40 40 0 0 1 90 48" fill="none" stroke={\`url(#gauge-\${label})\`} strokeWidth="7" strokeLinecap="round" strokeDasharray={\`\${(score / 100) * 126} 126\`} />
        <g transform={\`rotate(\${needleAngle} 50 48)\`}><line x1="50" y1="48" x2="50" y2="18" stroke={signal.color} strokeWidth="2.5" strokeLinecap="round" /><circle cx="50" cy="48" r="4" fill={signal.color} /></g>
        <text x="50" y="42" textAnchor="middle" className="text-lg font-bold" fill={signal.color}>{score}</text>
      </svg>
      <div className="text-center -mt-1">
        <div className="text-[9px] font-bold" style={{ color: signal.color }}>{signal.text}</div>
        {subtitle && <div className={`text-[7px] ${t.muted}`}>{subtitle}</div>}
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
        <div className="flex gap-1 mt-1">{['1', '2', '3', '5', '10', '20'].map(l => (<button key={l} onClick={() => setLeverage(l)} className={`flex-1 py-1.5 rounded-md border-2 text-[10px] font-semibold cursor-pointer ${leverage === l ? 'border-blue-500 bg-blue-500/20 text-blue-500' : \`border-transparent \${t.card} \${t.muted}\`}\`}>{l}x</button>))}</div>
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
    const maxLen = Math.max(...comparisonData.map(c => c.sparkline?.length || 0));
    const points = [];
    for (let i = 0; i < maxLen; i += Math.ceil(maxLen / 50)) {
      const point = { index: i };
      comparisonData.forEach(coin => {
        if (coin.sparkline && coin.sparkline.length > 0) {
          const idx = Math.floor(i * coin.sparkline.length / maxLen);
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
          <div className="grid grid-cols-2 gap-3">
            {radarData.map(coin => (
              <div key={coin.id} className={`p-3 ${t.bg} rounded-lg`}>
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
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ coingecko: 'loading', binance: 'loading', defillama: 'loading', fred: 'loading' });
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
    const [cg, bin, defi, fred, ms, alt] = await Promise.all([fetchCoinGeckoData(), fetchBinanceData(), fetchDefiLlamaData(), fetchFredData(), fetchMarketStructure(), fetchAltseasonData()]);
    setCgData(cg); setBinanceData(bin); setDefiData(defi); setFredData(fred); setMsData(ms); setAltseasonData(alt);
    setApiStatus({ coingecko: cg ? 'live' : 'error', binance: bin ? 'live' : 'error', defillama: defi ? 'live' : 'error', fred: fred ? 'live' : 'error' });
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
    const tvlChange = defiData.tvl?.change || 0;
    const btcDom = cgData.btcDominance?.value || 50;
    const stableChange = defiData.stablecoinSupply?.change || 0;
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
    const m2Change = fredData.m2Supply?.change || 0;
    const m2Trend = fredData.m2Supply?.trend || 'stable';
    const stableChange = defiData.stablecoinSupply?.change || 0;
    const tvlChange = defiData.tvl?.change || 0;
    const fg = cgData?.fearGreed?.value || 50;
    if (m2Trend === 'expanding') { if (m2Change > 5) score += 15; else if (m2Change > 2) score += 10; else score += 5; }
    else { if (m2Change < -2) score -= 10; else score -= 5; }
    if (stableChange > 5) score += 12; else if (stableChange > 2) score += 6; else if (stableChange < -5) score -= 12; else if (stableChange < -2) score -= 6;
    if (tvlChange > 8) score += 8; else if (tvlChange > 3) score += 4; else if (tvlChange < -8) score -= 8; else if (tvlChange < -3) score -= 4;
    if (fg < 20) score += 8; else if (fg < 35) score += 4; else if (fg > 85) score -= 8; else if (fg > 70) score -= 4;
    return Math.max(0, Math.min(100, score));
  }, [cgData, defiData, fredData]);

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
        if (notificationsEnabled && 'Notification' in window) new Notification(\`🔔 \${alert.name}\`, { body: \`\${alert.condition === 'below' ? 'Poniżej' : 'Powyżej'} \${alert.value}\` });
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

  const tabs = [{ id: 'crypto', label: '₿ Crypto' }, { id: 'structure', label: '📊 Structure' }, { id: 'compare', label: '⚖️ Compare' }, { id: 'macro', label: '🏦 Macro' }, { id: 'defi', label: '🦙 DeFi' }, { id: 'derivatives', label: '📊 Deriv' }, { id: 'charts', label: '📈 Charts' }, { id: 'portfolio', label: '💼 Portfolio' }];
  const formatPrice = (p) => { if (!p) return '$--'; if (p >= 1000) return \`$\${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}\`; return \`$\${p.toFixed(2)}\`; };
  const formatChange = (c) => { if (c === undefined) return '--'; return c >= 0 ? \`+\${c.toFixed(1)}%\` : \`\${c.toFixed(1)}%\`; };

  return (
    <div className={\`min-h-screen \${t.bg} \${t.text} pb-20\`}>
      {/* Header */}
      <div className={\`\${t.card} border-b \${t.border} px-4 py-3 sticky top-0 z-50\`}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className={\`text-base font-bold \${t.text} m-0\`}>Crypto Decision Hub</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { const sections = generateMarketReportPDFContent(cgData, binanceData, defiData, altseasonData, dayScore, swingScore, hodlScore, theme); exportToPDF('Market Report', sections, theme); }} className={\`p-2 rounded-lg \${t.bg} border \${t.border} cursor-pointer text-base\`} title="Export Market Report">📑</button>
            <button onClick={() => setShowAlertPanel(true)} className={\`relative p-2 rounded-lg \${t.bg} border \${t.border} cursor-pointer\`}>
              <span className="text-base">🔔</span>
              {alerts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{alerts.length}</span>}
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={\`p-2 rounded-lg \${t.bg} border \${t.border} cursor-pointer text-base\`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          </div>
        </div>
        <DataSourcesBadge apiStatus={apiStatus} theme={theme} />
      </div>

      {/* Score Gauges */}
      <div className={\`flex justify-between gap-2 px-3 py-3 \${t.card} border-b \${t.border}\`}>
        <MiniScoreGauge score={dayScore} label="Day" icon="🎯" subtitle="godziny-dni" onHelp={() => setHelpModal('dayTradingScore')} theme={theme} />
        <MiniScoreGauge score={swingScore} label="Swing" icon="📊" subtitle="dni-tygodnie" onHelp={() => setHelpModal('swingScore')} theme={theme} />
        <MiniScoreGauge score={hodlScore} label="HODL" icon="🏦" subtitle="tygodnie-mce" onHelp={() => setHelpModal('hodlScore')} theme={theme} />
      </div>

      {/* AI Insight */}
      <AIInsight cgData={cgData} binanceData={binanceData} altseasonData={altseasonData} dayScore={dayScore} swingScore={swingScore} hodlScore={hodlScore} theme={theme} />

      {/* Main Content */}
      <div className="p-3 space-y-3">
        {/* Crypto Tab */}
        {activeTab === 'crypto' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme} isLive>
                <div className={`text-[10px] ${t.muted} mb-1`}>₿ Bitcoin</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.btcPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.btcPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.btcPrice?.change)}</div>
                </>}
              </Card>
              <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme} isLive>
                <div className={`text-[10px] ${t.muted} mb-1`}>Ξ Ethereum</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.ethPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.ethPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.ethPrice?.change)}</div>
                </>}
              </Card>
              <Card helpKey="solPrice" onHelp={setHelpModal} theme={theme} isLive>
                <div className={`text-[10px] ${t.muted} mb-1`}>◎ Solana</div>
                {loading ? <SkeletonLoader width="w-24" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{formatPrice(cgData?.solPrice?.value)}</div>
                  <div className={`text-xs font-semibold ${(cgData?.solPrice?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatChange(cgData?.solPrice?.change)}</div>
                </>}
              </Card>
              <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme} isLive signalColor={cgData?.fearGreed?.value < 30 ? 'positive' : cgData?.fearGreed?.value > 70 ? 'negative' : 'warning'}>
                <div className={`text-[10px] ${t.muted} mb-1`}>😱 Fear & Greed</div>
                {loading ? <SkeletonLoader width="w-16" height="h-6" theme={theme} /> : <>
                  <div className={`text-lg font-bold ${t.text}`}>{cgData?.fearGreed?.value || '--'}</div>
                  <div className={`text-xs ${t.muted}`}>{cgData?.fearGreed?.text || '--'}</div>
                </>}
              </Card>
            </div>
            <Card helpKey="btcDominance" onHelp={setHelpModal} theme={theme} isLive>
              <div className="flex justify-between items-center">
                <div>
                  <div className={`text-[10px] ${t.muted} mb-1`}>👑 BTC Dominance</div>
                  {loading ? <SkeletonLoader width="w-16" height="h-5" theme={theme} /> : <div className={`text-base font-bold ${t.text}`}>{cgData?.btcDominance?.value || '--'}%</div>}
                </div>
                <div className="text-right">
                  <div className={`text-[10px] ${t.muted} mb-1`}>📊 Volume 24h</div>
                  {loading ? <SkeletonLoader width="w-16" height="h-5" theme={theme} /> : <div className={`text-base font-bold ${t.text}`}>${cgData?.totalVolume?.value || '--'}B</div>}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Structure Tab */}
        {activeTab === 'structure' && (
          <div className="space-y-3">
            <Card helpKey="marketBreadth" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>📊 Market Breadth</div>
              {loading ? <SkeletonLoader width="w-full" height="h-16" theme={theme} /> : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className={`p-2 ${t.bg} rounded-lg`}><div className="text-lg font-bold text-green-500">{msData?.gainers || '--'}</div><div className={`text-[9px] ${t.muted}`}>Rosnące</div></div>
                  <div className={`p-2 ${t.bg} rounded-lg`}><div className="text-lg font-bold text-red-500">{msData?.losers || '--'}</div><div className={`text-[9px] ${t.muted}`}>Spadające</div></div>
                  <div className={`p-2 ${t.bg} rounded-lg`}><div className={`text-lg font-bold ${parseFloat(msData?.bullishPercent) > 50 ? 'text-green-500' : 'text-red-500'}`}>{msData?.bullishPercent || '--'}%</div><div className={`text-[9px] ${t.muted}`}>Bullish</div></div>
                </div>
              )}
            </Card>
            <Card helpKey="altseasonIndex" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>🌊 Altseason Indicators</div>
              {loading ? <SkeletonLoader width="w-full" height="h-20" theme={theme} /> : (
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2.5 ${t.bg} rounded-lg border-l-4 ${(altseasonData?.altseasonIndex || 0) > 50 ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
                    <div className={`text-[9px] ${t.muted}`}>Altseason Index</div>
                    <div className={`text-xl font-bold ${(altseasonData?.altseasonIndex || 0) > 60 ? 'text-green-500' : (altseasonData?.altseasonIndex || 0) < 40 ? 'text-red-500' : 'text-yellow-500'}`}>{altseasonData?.altseasonIndex || '--'}</div>
                  </div>
                  <div className={`p-2.5 ${t.bg} rounded-lg`}><div className={`text-[9px] ${t.muted}`}>ETH/BTC</div><div className={`text-xl font-bold ${t.text}`}>{altseasonData?.ethBtcRatio || '--'}</div></div>
                  <div className={`p-2.5 ${t.bg} rounded-lg`}><div className={`text-[9px] ${t.muted}`}>Total2</div><div className={`text-xl font-bold ${t.text}`}>${altseasonData?.total2 || '--'}T</div></div>
                  <div className={`p-2.5 ${t.bg} rounded-lg`}><div className={`text-[9px] ${t.muted}`}>BTC Dom</div><div className={`text-xl font-bold ${t.text}`}>{altseasonData?.btcDominance || '--'}%</div></div>
                </div>
              )}
            </Card>
            <EthBtcHistoryChart data={ethBtcHistory} timeframe={ethBtcTimeframe} onTimeframeChange={setEthBtcTimeframe} loading={ethBtcLoading} onHelp={() => setHelpModal('ethBtcHistory')} theme={theme} />
            <Card helpKey="stablecoinFlows" onHelp={setHelpModal} theme={theme} isLive>
              <div className={`text-xs font-semibold mb-3 ${t.text}`}>💵 Stablecoin Flows</div>
              {loading ? <SkeletonLoader width="w-full" height="h-16" theme={theme} /> : (
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2.5 ${t.bg} rounded-lg`}>
                    <div className="flex justify-between items-center"><span className={`text-[9px] ${t.muted}`}>USDT</span><span className={`text-[9px] font-semibold ${(altseasonData?.usdt?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{altseasonData?.usdt?.change >= 0 ? '+' : ''}{altseasonData?.usdt?.change?.toFixed(2) || '--'}%</span></div>
                    <div className={`text-base font-bold ${t.text}`}>${altseasonData?.usdt?.mcap || '--'}B</div>
                  </div>
                  <div className={`p-2.5 ${t.bg} rounded-lg`}>
                    <div className="flex justify-between items-center"><span className={`text-[9px] ${t.muted}`}>USDC</span><span className={`text-[9px] font-semibold ${(altseasonData?.usdc?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{altseasonData?.usdc?.change >= 0 ? '+' : ''}{altseasonData?.usdc?.change?.toFixed(2) || '--'}%</span></div>
                    <div className={`text-base font-bold ${t.text}`}>${altseasonData?.usdc?.mcap || '--'}B</div>
                  </div>
                </div>
              )}
            </Card>
            <SectorAnalysis topGainers={msData?.topGainers} theme={theme} />
            <Card helpKey="topGainers" onHelp={setHelpModal} theme={theme} isLive>
              <div className="flex justify-between items-center mb-3">
                <div className={`text-xs font-semibold ${t.text}`}>🚀 Top Gainers</div>
                <button onClick={() => setShowAllGainers(!showAllGainers)} className={`text-[9px] ${t.muted} bg-transparent border-none cursor-pointer hover:text-blue-500`}>{showAllGainers ? 'Mniej' : 'Więcej'}</button>
              </div>
              {loading ? <SkeletonLoader width="w-full" height="h-24" theme={theme} /> : (
                <div className="space-y-2">
                  {(showAllGainers ? msData?.topGainers : msData?.topGainers?.slice(0, 5))?.map((coin, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                      <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{coin.name}</span></div>
                      <span className="text-xs font-bold text-green-500">+{coin.change24h}%</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card helpKey="topLosers" onHelp={setHelpModal} theme={theme} isLive>
              <div className="flex justify-between items-center mb-3">
                <div className={`text-xs font-semibold ${t.text}`}>📉 Top Losers</div>
                <button onClick={() => setShowAllLosers(!showAllLosers)} className={`text-[9px] ${t.muted} bg-transparent border-none cursor-pointer hover:text-blue-500`}>{showAllLosers ? 'Mniej' : 'Więcej'}</button>
              </div>
              {loading ? <SkeletonLoader width="w-full" height="h-24" theme={theme} /> : (
                <div className="space-y-2">
                  {(showAllLosers ? msData?.topLosers : msData?.topLosers?.slice(0, 5))?.map((coin, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 ${t.bg} rounded-lg`}>
                      <div className="flex items-center gap-2"><span className={`text-[10px] font-bold ${t.muted} w-4`}>{i + 1}</span><span className={`text-xs font-semibold ${t.text}`}>{coin.name}</span></div>
                      <span className="text-xs font-bold text-red-500">{coin.change24h}%</span>
                    </div>
                  ))}
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
            <div className={`p-4 ${t.card} rounded-xl border ${t.border}`}>
              <div className={`text-xs font-semibold mb-2 ${t.text}`}>📈 M2 vs BTC</div>
              <p className={`text-[11px] ${t.muted} leading-relaxed`}>BTC reaguje na M2 z opóźnieniem ~10-12 tygodni. Ekspansja M2 = risk-on.</p>
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
            <Card helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme} isLive>
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
            <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme} isLive signalColor={(binanceData?.fundingRate?.value || 0) < 0 ? 'positive' : (binanceData?.fundingRate?.value || 0) > 0.03 ? 'negative' : undefined}>
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
            <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme} isLive signalColor={(binanceData?.longShortRatio?.value || 1) < 0.9 ? 'positive' : (binanceData?.longShortRatio?.value || 1) > 1.8 ? 'negative' : undefined}>
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
                  {['15m', '1h', '4h', '1D', '1W'].map(i => {
                    const val = i === '15m' ? '15' : i === '1h' ? '60' : i === '4h' ? '240' : i;
                    return <button key={i} onClick={() => setTaInterval(val)} className={`flex-1 py-1.5 rounded text-[9px] font-semibold cursor-pointer ${taInterval === val ? 'bg-blue-500/20 text-blue-500 border-2 border-blue-500' : `${t.bg} ${t.muted} border ${t.border}`}`}>{i}</button>;
                  })}
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
      <div className={`fixed bottom-0 left-0 right-0 ${t.card} border-t ${t.border} z-50 px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]`}>
        <div className="flex justify-around items-center">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border-none min-w-[44px] cursor-pointer ${activeTab === tab.id ? 'bg-blue-500/20 text-blue-500' : `bg-transparent ${t.muted}`}`}>
              <span className="text-base">{tab.label.split(' ')[0]}</span>
              <span className="text-[8px] font-semibold">{tab.label.split(' ')[1] || ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
      {showAlertPanel && <AlertPanel alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onClose={() => setShowAlertPanel(false)} theme={theme} />}
      {activeToast && <AlertToast alert={activeToast} onClose={() => setActiveToast(null)} theme={theme} />}
      
      {/* PWA Components */}
      <OfflineIndicator theme={theme} />
      {showPWAInstall && <PWAInstallBanner theme={theme} onDismiss={() => setShowPWAInstall(false)} />}
      {showPWAUpdate && <PWAUpdateBanner theme={theme} onUpdate={() => window.location.reload()} onDismiss={() => setShowPWAUpdate(false)} />}
    </div>
  );
}

export default App;
