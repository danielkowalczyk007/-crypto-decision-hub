import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

// ============== API FUNCTIONS ==============

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
  } catch (error) { console.error('CoinGecko Error:', error); return null; }
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
  } catch (error) { console.error('Binance Error:', error); return null; }
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
  } catch (error) { console.error('DefiLlama Error:', error); return null; }
};

const fetchFredData = async () => {
  try {
    const res = await fetch('https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=demo&file_type=json&sort_order=desc&limit=13');
    const data = await res.json();
    if (!data.observations?.length) return null;
    const latest = parseFloat(data.observations[0].value) / 1000;
    const yearAgo = parseFloat(data.observations[12]?.value || data.observations[0].value) / 1000;
    const change = ((latest - yearAgo) / yearAgo * 100).toFixed(1);
    return {
      m2Supply: { value: parseFloat(latest.toFixed(2)), change: parseFloat(change), trend: parseFloat(change) > 0 ? 'expanding' : 'contracting', lastUpdate: data.observations[0].date }
    };
  } catch (error) { console.error('FRED Error:', error); return null; }
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
      script.innerHTML = JSON.stringify({
        autosize: true, symbol, interval: 'D', timezone: 'Europe/Warsaw',
        theme, style: '1', locale: 'pl', allow_symbol_change: true,
        studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies']
      });
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
      script.innerHTML = JSON.stringify({
        interval, width: '100%', isTransparent: true, height: '450',
        symbol, showIntervalTabs: true, displayMode: 'single', locale: 'pl', colorTheme: theme
      });
      containerRef.current.appendChild(script);
    }
  }, [symbol, theme, interval]);
  return <div ref={containerRef} style={{ height: '450px', width: '100%' }} />;
};

// ============== HELP CONTENT ==============
const helpContent = {
  dayTradingScore: {
    title: '🎯 Day Trading Score',
    emoji: '🎯',
    description: 'Wskaźnik dla aktywnych traderów. Horyzont: godziny do dni. Reaguje na krótkoterminowe ekstremum sentymentu i leverage.',
    interpretation: [
      { condition: '70-100: AKUMULUJ', signal: 'bullish', text: '🟢 Silny sygnał kupna. Sentyment wspiera longi.' },
      { condition: '55-69: HOLD+', signal: 'bullish', text: '🟢 Pozytywne warunki. Rozważ pozycję long.' },
      { condition: '45-54: HOLD', signal: 'neutral', text: '🟡 Neutralnie. Czekaj na wyraźniejszy sygnał.' },
      { condition: '30-44: OSTROŻNIE', signal: 'warning', text: '🟠 Ryzyko korekty. Trzymaj się z boku.' },
      { condition: '0-29: REDUKUJ', signal: 'bearish', text: '🔴 Rozważ short lub pozostań w gotówce.' }
    ],
    tip: 'Składowe: Fear & Greed (odwrócony), Funding Rate (8h), Momentum BTC 24h, Long/Short Ratio. Reaguje szybko na zmiany sentymentu.',
    source: 'CoinGecko, Binance, Alternative.me'
  },
  swingScore: {
    title: '📊 Swing Score',
    emoji: '📊',
    description: 'Wskaźnik dla swing traderów. Horyzont: tygodnie. Łączy sentyment z on-chain i DeFi metrykami.',
    interpretation: [
      { condition: '70-100: AKUMULUJ', signal: 'bullish', text: '🟢 Dobry moment na średnioterminowe pozycje.' },
      { condition: '55-69: HOLD+', signal: 'bullish', text: '🟢 Dokupuj na korektach.' },
      { condition: '45-54: HOLD', signal: 'neutral', text: '🟡 Czekaj na lepszy setup.' },
      { condition: '30-44: OSTROŻNIE', signal: 'warning', text: '🟠 Zmniejsz ekspozycję.' },
      { condition: '0-29: REDUKUJ', signal: 'bearish', text: '🔴 Realizuj zyski, rozważ hedging.' }
    ],
    tip: 'Składowe: TVL trend (7d), BTC Dominance, Stablecoin inflows, Fear & Greed. Idealny dla pozycji na 1-4 tygodni.',
    source: 'DefiLlama, CoinGecko'
  },
  hodlScore: {
    title: '🏦 HODL Score',
    emoji: '🏦',
    description: 'Wskaźnik dla długoterminowych inwestorów. Horyzont: miesiące do lat. Bazuje na makroekonomii i adopcji.',
    interpretation: [
      { condition: '70-100: AKUMULUJ', signal: 'bullish', text: '🟢 Idealny czas na DCA. Warunki makro sprzyjają.' },
      { condition: '55-69: HOLD+', signal: 'bullish', text: '🟢 Kontynuuj regularne zakupy.' },
      { condition: '45-54: HOLD', signal: 'neutral', text: '🟡 Trzymaj pozycje. Obserwuj makro.' },
      { condition: '30-44: OSTROŻNIE', signal: 'warning', text: '🟠 Wstrzymaj DCA. Rozważ częściową realizację.' },
      { condition: '0-29: REDUKUJ', signal: 'bearish', text: '🔴 Rozważ zmniejszenie ekspozycji długoterminowej.' }
    ],
    tip: 'Składowe: M2 Money Supply, Stablecoin supply (30d), TVL jako adopcja, Fear & Greed (ekstrema). M2 koreluje z BTC z opóźnieniem 3-6 msc.',
    source: 'FRED, DefiLlama'
  },
  btcPrice: {
    title: '₿ Bitcoin Price',
    emoji: '₿',
    description: 'Aktualna cena Bitcoina w USD pobierana z CoinGecko API.',
    interpretation: [
      { condition: 'Wzrost > 5% dziennie', signal: 'bullish', text: 'Silny momentum wzrostowy' },
      { condition: 'Spadek > 5% dziennie', signal: 'bearish', text: 'Korekta lub panika' },
      { condition: 'Stabilność ±2%', signal: 'neutral', text: 'Konsolidacja' }
    ],
    tip: 'Porównuj z ATH - dystans od ATH pokazuje potencjał wzrostu lub ryzyko korekty.',
    source: 'CoinGecko API (LIVE)'
  },
  ethPrice: {
    title: '◆ Ethereum Price',
    emoji: '◆',
    description: 'Aktualna cena Ethereum w USD.',
    interpretation: [
      { condition: 'ETH/BTC ratio rośnie', signal: 'bullish', text: 'Altseason możliwy' },
      { condition: 'ETH/BTC ratio spada', signal: 'bearish', text: 'BTC dominacja rośnie' }
    ],
    tip: 'Obserwuj ratio ETH/BTC - pokazuje siłę altcoinów względem BTC.',
    source: 'CoinGecko API (LIVE)'
  },
  fearGreed: {
    title: '😱 Fear & Greed Index',
    emoji: '😱',
    description: 'Wskaźnik sentymentu rynku od 0 (ekstremalny strach) do 100 (ekstremalna chciwość).',
    interpretation: [
      { condition: '0-25: Extreme Fear', signal: 'bullish', text: '🟢 Okazja zakupowa - "kupuj gdy inni się boją"' },
      { condition: '26-45: Fear', signal: 'bullish', text: '🟢 Rozważ akumulację' },
      { condition: '46-55: Neutral', signal: 'neutral', text: '🟡 Brak wyraźnego sygnału' },
      { condition: '56-75: Greed', signal: 'warning', text: '🟠 Ostrożność, możliwa korekta' },
      { condition: '76-100: Extreme Greed', signal: 'bearish', text: '🔴 Rozważ realizację zysków' }
    ],
    tip: 'Kontrariański wskaźnik - kupuj przy strachu, sprzedawaj przy chciwości.',
    source: 'Alternative.me (LIVE)'
  },
  btcDominance: {
    title: '👑 BTC Dominance',
    emoji: '👑',
    description: 'Udział kapitalizacji BTC w całym rynku krypto.',
    interpretation: [
      { condition: '> 55%', signal: 'neutral', text: 'BTC season - kapitał w bezpiecznej przystani' },
      { condition: '45-55%', signal: 'neutral', text: 'Zrównoważony rynek' },
      { condition: '< 45%', signal: 'bullish', text: 'Altseason - kapitał płynie do altcoinów' }
    ],
    tip: 'Spadająca dominacja przy rosnącym BTC = altseason.',
    source: 'CoinGecko API (LIVE)'
  },
  stablecoinSupply: {
    title: '💵 Stablecoin Supply',
    emoji: '💵',
    description: 'Łączna podaż stablecoinów (USDT, USDC, DAI) - "suchy proch" gotowy do inwestycji.',
    interpretation: [
      { condition: 'Wzrost supply', signal: 'bullish', text: '🟢 Nowy kapitał wchodzi na rynek' },
      { condition: 'Spadek supply', signal: 'bearish', text: '🔴 Kapitał ucieka z krypto' }
    ],
    tip: 'Rosnąca podaż stablecoinów to paliwo dla przyszłych wzrostów.',
    source: 'DefiLlama API (LIVE)'
  },
  tvl: {
    title: '🔒 Total Value Locked',
    emoji: '🔒',
    description: 'Łączna wartość zablokowana w protokołach DeFi.',
    interpretation: [
      { condition: 'TVL rośnie', signal: 'bullish', text: '🟢 Rosnące zaufanie do DeFi' },
      { condition: 'TVL spada', signal: 'bearish', text: '🔴 Odpływ kapitału z DeFi' }
    ],
    tip: 'Porównuj TVL między chainami - pokazuje gdzie płynie kapitał DeFi.',
    source: 'DefiLlama API (LIVE)'
  },
  m2Supply: {
    title: '🏦 M2 Money Supply',
    emoji: '🏦',
    description: 'Globalna podaż pieniądza M2 (gotówka + depozyty + fundusze rynku pieniężnego).',
    interpretation: [
      { condition: 'M2 rośnie (ekspansja)', signal: 'bullish', text: '🟢 Więcej płynności = kapitał szuka zwrotu → BTC rośnie' },
      { condition: 'M2 spada (kontrakcja)', signal: 'bearish', text: '🔴 QT = odpływ z ryzykownych aktywów' }
    ],
    tip: 'BTC koreluje z M2 z opóźnieniem 3-6 miesięcy. Rosnące M2 = bullish dla BTC.',
    source: 'FRED API (Federal Reserve)'
  },
  dxy: {
    title: '💲 DXY (Dollar Index)',
    emoji: '💲',
    description: 'Indeks siły dolara względem koszyka walut.',
    interpretation: [
      { condition: 'DXY spada', signal: 'bullish', text: '🟢 Słabszy dolar = kapitał ucieka do BTC' },
      { condition: 'DXY rośnie', signal: 'bearish', text: '🔴 Silny dolar = risk-off' }
    ],
    tip: 'DXY i BTC są negatywnie skorelowane. Spadający DXY to sygnał bullish.',
    source: 'TradingView'
  },
  fundingRate: {
    title: '💸 Funding Rate',
    emoji: '💸',
    description: 'Opłata między long/short na rynku perpetual futures.',
    interpretation: [
      { condition: 'Funding > 0.05%', signal: 'bearish', text: '🔴 Nadmierny optymizm - longi płacą shortom' },
      { condition: 'Funding 0-0.03%', signal: 'neutral', text: '🟡 Neutralny rynek' },
      { condition: 'Funding < 0', signal: 'bullish', text: '🟢 Pesymizm - potencjalne odbicie' }
    ],
    tip: 'Ekstremalnie wysoki funding często poprzedza lokalne szczyty.',
    source: 'Binance API (LIVE)'
  },
  openInterest: {
    title: '📊 Open Interest',
    emoji: '📊',
    description: 'Łączna wartość otwartych pozycji futures.',
    interpretation: [
      { condition: 'OI rośnie + cena rośnie', signal: 'bullish', text: '🟢 Nowy kapitał wchodzi w longi' },
      { condition: 'OI rośnie + cena spada', signal: 'bearish', text: '🔴 Nowy kapitał wchodzi w shorty' },
      { condition: 'OI spada gwałtownie', signal: 'neutral', text: '🟡 Likwidacje / zamykanie pozycji' }
    ],
    tip: 'Rekordowe OI przy lokalnych szczytach = ryzyko kaskadowych likwidacji.',
    source: 'Binance API (LIVE)'
  },
  longShortRatio: {
    title: '⚖️ Long/Short Ratio',
    emoji: '⚖️',
    description: 'Stosunek pozycji long do short na Binance.',
    interpretation: [
      { condition: 'L/S > 2.0', signal: 'bearish', text: '🔴 Nadmiar longów - kontrariański sygnał sprzedaży' },
      { condition: 'L/S 1.0-2.0', signal: 'neutral', text: '🟡 Zrównoważony rynek' },
      { condition: 'L/S < 1.0', signal: 'bullish', text: '🟢 Nadmiar shortów - potencjalny squeeze' }
    ],
    tip: 'Ekstremalne wartości L/S często poprzedzają odwrócenie trendu.',
    source: 'Binance API (LIVE)'
  },
  technicalAnalysis: {
    title: '📊 Analiza Techniczna',
    emoji: '📊',
    description: 'Widget TradingView pokazujący sygnały Buy/Sell na podstawie oscylatorów i średnich kroczących.',
    interpretation: [
      { condition: 'Strong Buy', signal: 'bullish', text: '🟢 Większość wskaźników bullish' },
      { condition: 'Buy', signal: 'bullish', text: '🟢 Przewaga wskaźników bullish' },
      { condition: 'Neutral', signal: 'neutral', text: '🟡 Brak wyraźnego kierunku' },
      { condition: 'Sell', signal: 'bearish', text: '🔴 Przewaga wskaźników bearish' },
      { condition: 'Strong Sell', signal: 'bearish', text: '🔴 Większość wskaźników bearish' }
    ],
    tip: 'Używaj różnych interwałów czasowych - 1D dla trendu, 1H dla wejść.',
    source: 'TradingView (LIVE)'
  }
};

// ============== HELP MODAL COMPONENT ==============
const HelpModal = ({ helpKey, onClose, theme }) => {
  const content = helpContent[helpKey];
  if (!content) return null;

  const t = theme === 'dark' ? {
    bg: 'rgba(15, 23, 42, 0.98)', cardBg: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8',
    border: '#334155', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b'
  } : {
    bg: 'rgba(255, 255, 255, 0.98)', cardBg: '#f8fafc', text: '#1e293b', textSecondary: '#64748b',
    border: '#e2e8f0', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626', warning: '#d97706'
  };

  const signalColor = (signal) => {
    if (signal === 'bullish') return t.positive;
    if (signal === 'bearish') return t.negative;
    if (signal === 'warning') return t.warning;
    return t.warning;
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px', animation: 'fadeIn 0.2s ease'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: t.bg, borderRadius: '16px', maxWidth: '420px', width: '100%',
        maxHeight: '80vh', overflow: 'auto', border: `1px solid ${t.border}`,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', animation: 'slideUp 0.3s ease'
      }}>
        <div style={{
          padding: '16px', borderBottom: `1px solid ${t.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: t.bg, borderRadius: '16px 16px 0 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>{content.emoji}</span>
            <h3 style={{ margin: 0, color: t.text, fontSize: '16px', fontWeight: '600' }}>{content.title}</h3>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: t.textSecondary,
            fontSize: '24px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px'
          }}>×</button>
        </div>
        <div style={{ padding: '16px' }}>
          <p style={{
            color: t.text, fontSize: '13px', lineHeight: '1.5', margin: '0 0 16px',
            padding: '10px', background: t.cardBg, borderRadius: '8px', border: `1px solid ${t.border}`
          }}>{content.description}</p>
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ color: t.text, fontSize: '12px', fontWeight: '600', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📖 Interpretacja</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {content.interpretation.map((item, i) => {
                const color = signalColor(item.signal);
                return (
                  <div key={i} style={{
                    padding: '10px 12px',
                    background: `${color}15`,
                    borderRadius: '10px',
                    borderLeft: `6px solid ${color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ color: t.textSecondary, fontSize: '11px', fontFamily: 'monospace', fontWeight: '500' }}>{item.condition}</span>
                    <span style={{ color: color, fontSize: '13px', fontWeight: '600' }}>{item.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{
            padding: '12px', background: `${t.accent}15`, borderRadius: '8px',
            border: `1px solid ${t.accent}30`, marginBottom: '12px'
          }}>
            <div style={{ color: t.accent, fontSize: '10px', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💡 Pro Tip</div>
            <p style={{ color: t.text, fontSize: '12px', lineHeight: '1.4', margin: 0 }}>{content.tip}</p>
          </div>
          <div style={{ fontSize: '10px', color: t.textSecondary, textAlign: 'right' }}>Źródło: {content.source}</div>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

// ============== CARD COMPONENT ==============
const Card = ({ children, helpKey, onHelp, style, theme }) => {
  const t = theme === 'dark' ? { cardBg: '#0f172a', border: '#1e293b', helpBg: '#1e293b', helpColor: '#64748b' }
    : { cardBg: '#ffffff', border: '#e2e8f0', helpBg: '#f1f5f9', helpColor: '#64748b' };
  return (
    <div style={{ position: 'relative', padding: '14px', background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.border}`, ...style }}>
      {helpKey && (
        <button onClick={() => onHelp(helpKey)} style={{
          position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px',
          borderRadius: '50%', background: t.helpBg, border: 'none', color: t.helpColor,
          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', opacity: 0.7,
          zIndex: 10
        }}>?</button>
      )}
      {children}
    </div>
  );
};

// ============== LIVE TAG ==============
const LiveTag = ({ theme }) => (
  <span style={{
    fontSize: '9px', padding: '2px 5px', borderRadius: '4px',
    background: theme === 'dark' ? '#22c55e20' : '#16a34a20',
    color: theme === 'dark' ? '#22c55e' : '#16a34a',
    fontWeight: '600', marginLeft: '6px'
  }}>● LIVE</span>
);

// ============== MINI SCORE GAUGE (for 3 scores) ==============
// V2: Kolorowe segmenty + needle + bez artefaktów renderowania
const MiniScoreGauge = ({ score, label, icon, color, subtitle, onHelp, theme }) => {
  const isDark = theme === 'dark';
  const t = isDark ? { text: '#f1f5f9', textSecondary: '#64748b', bg: '#1e293b' }
    : { text: '#1e293b', textSecondary: '#64748b', bg: '#e2e8f0' };
  
  // Sygnał i kolor na podstawie score
  const getSignalInfo = (s) => {
    if (s >= 70) return { text: 'AKUMULUJ', color: '#22c55e' };
    if (s >= 55) return { text: 'HOLD+', color: '#84cc16' };
    if (s >= 45) return { text: 'HOLD', color: '#eab308' };
    if (s >= 30) return { text: 'OSTROŻNIE', color: '#f97316' };
    return { text: 'REDUKUJ', color: '#ef4444' };
  };
  
  const signal = getSignalInfo(score);
  const needleAngle = -90 + (score / 100) * 180;
  
  // 5 kolorów dla segmentów gauge'a (czerwony → zielony)
  const gaugeColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
  
  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '108px',
      padding: '6px',
      background: isDark ? 'rgba(30,41,59,0.4)' : 'rgba(241,245,249,0.6)',
      borderRadius: '10px'
    }}>
      {/* Header: Label + Help */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: '2px'
      }}>
        <span style={{ fontSize: '10px', fontWeight: '600', color: t.text }}>
          {icon} {label}
        </span>
        <button onClick={onHelp} style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          border: 'none', color: t.textSecondary, fontSize: '9px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>?</button>
      </div>
      
      {/* SVG Gauge z kolorowymi segmentami */}
      <svg viewBox="0 0 100 58" style={{ width: '100%', height: '50px' }}>
        {/* 5 kolorowych łuków */}
        {gaugeColors.map((c, i) => {
          const startAngle = 180 + (i * 36);
          const endAngle = 180 + ((i + 1) * 36);
          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;
          const cx = 50, cy = 50, r = 38;
          
          return (
            <path
              key={i}
              d={`M ${cx + r * Math.cos(startRad)} ${cy + r * Math.sin(startRad)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(endRad)} ${cy + r * Math.sin(endRad)}`}
              fill="none"
              stroke={c}
              strokeWidth="8"
              strokeLinecap="round"
              opacity={isDark ? 0.9 : 0.85}
            />
          );
        })}
        
        {/* Needle (wskazówka) */}
        <g transform={`rotate(${needleAngle}, 50, 50)`}>
          <line x1="50" y1="50" x2="50" y2="18" stroke={t.text} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="50" cy="50" r="4" fill={signal.color} />
        </g>
      </svg>
      
      {/* Score - wycentrowany, bez position absolute */}
      <div style={{
        fontSize: '20px',
        fontWeight: '700',
        color: signal.color,
        lineHeight: '1',
        marginTop: '-8px'
      }}>
        {score}
      </div>
      
      {/* Signal badge */}
      <div style={{
        marginTop: '3px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: `${signal.color}18`,
        border: `1px solid ${signal.color}40`,
        fontSize: '8px',
        fontWeight: '700',
        color: signal.color,
        letterSpacing: '0.3px'
      }}>
        {signal.text}
      </div>
      
      {/* Subtitle */}
      <div style={{ fontSize: '8px', color: t.textSecondary, marginTop: '2px' }}>{subtitle}</div>
    </div>
  );
};

// ============== MAIN APP ==============
function App() {
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('crypto');
  const [helpModal, setHelpModal] = useState(null);
  
  // Live data states
  const [cgData, setCgData] = useState(null);
  const [binanceData, setBinanceData] = useState(null);
  const [defiData, setDefiData] = useState(null);
  const [fredData, setFredData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Charts state
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  const [chartView, setChartView] = useState('both');
  const [taInterval, setTaInterval] = useState('1D');
  
  // Mock data for indicators not available via free API
  const mockData = {
    dxy: { value: 103.42, change: -1.8 },
    mvrv: { value: 1.8, zone: 'neutral' },
    sopr: { value: 0.98 },
    nupl: { value: 0.42, phase: 'Optimism' },
    exchangeReserves: { btc: 2.1, trend: 'outflow' },
    etfFlows: { daily: 245, weekly: 1820 },
    liquidations: { long: 45.2, short: 12.8, total: 58 }
  };

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const [cg, bn, defi, fred] = await Promise.all([
      fetchCoinGeckoData(),
      fetchBinanceData(),
      fetchDefiLlamaData(),
      fetchFredData()
    ]);
    if (cg) setCgData(cg);
    if (bn) setBinanceData(bn);
    if (defi) setDefiData(defi);
    if (fred) setFredData(fred);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const t = theme === 'dark' ? {
    bg: '#030712', cardBg: '#0f172a', text: '#f1f5f9', textSecondary: '#64748b',
    border: '#1e293b', accent: '#3b82f6', positive: '#22c55e', negative: '#ef4444', warning: '#f59e0b'
  } : {
    bg: '#f8fafc', cardBg: '#ffffff', text: '#1e293b', textSecondary: '#64748b',
    border: '#e2e8f0', accent: '#3b82f6', positive: '#16a34a', negative: '#dc2626', warning: '#d97706'
  };

  // ============== THREE SCORE CALCULATIONS ==============
  
  // DAY TRADING SCORE (hours-days)
  const calculateDayTradingScore = () => {
    let score = 50;
    
    // Fear & Greed (contrarian - extreme fear = buy opportunity)
    if (cgData?.fearGreed) {
      if (cgData.fearGreed.value < 20) score += 15;
      else if (cgData.fearGreed.value < 35) score += 10;
      else if (cgData.fearGreed.value > 80) score -= 15;
      else if (cgData.fearGreed.value > 65) score -= 5;
    }
    
    // Funding Rate
    if (binanceData?.fundingRate) {
      if (binanceData.fundingRate.value < -0.01) score += 10;
      else if (binanceData.fundingRate.value < 0) score += 5;
      else if (binanceData.fundingRate.value > 0.05) score -= 12;
      else if (binanceData.fundingRate.value > 0.03) score -= 5;
    }
    
    // BTC 24h momentum
    if (cgData?.btcPrice?.change > 5) score += 8;
    else if (cgData?.btcPrice?.change > 2) score += 4;
    else if (cgData?.btcPrice?.change < -5) score -= 8;
    else if (cgData?.btcPrice?.change < -2) score -= 4;
    
    // Long/Short ratio (contrarian)
    if (binanceData?.longShortRatio?.value < 0.9) score += 6;
    else if (binanceData?.longShortRatio?.value > 1.8) score -= 6;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };
  
  // SWING SCORE (weeks)
  const calculateSwingScore = () => {
    let score = 50;
    
    // Fear & Greed
    if (cgData?.fearGreed) {
      if (cgData.fearGreed.value < 25) score += 12;
      else if (cgData.fearGreed.value < 40) score += 6;
      else if (cgData.fearGreed.value > 75) score -= 10;
      else if (cgData.fearGreed.value > 60) score -= 4;
    }
    
    // TVL trend (7d)
    if (defiData?.tvl?.change > 5) score += 10;
    else if (defiData?.tvl?.change > 2) score += 5;
    else if (defiData?.tvl?.change < -5) score -= 10;
    else if (defiData?.tvl?.change < -2) score -= 5;
    
    // BTC Dominance
    if (cgData?.btcDominance?.value > 55) score -= 4;
    else if (cgData?.btcDominance?.value < 45) score += 4;
    
    // Stablecoin inflows
    if (defiData?.stablecoinSupply?.change > 3) score += 8;
    else if (defiData?.stablecoinSupply?.change > 1) score += 4;
    else if (defiData?.stablecoinSupply?.change < -3) score -= 8;
    else if (defiData?.stablecoinSupply?.change < -1) score -= 4;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };
  
  // HODL SCORE (months-years)
  const calculateHodlScore = () => {
    let score = 50;
    
    // M2 Supply trend (macro liquidity)
    if (fredData?.m2Supply?.trend === 'expanding') {
      if (fredData.m2Supply.change > 5) score += 15;
      else if (fredData.m2Supply.change > 2) score += 10;
      else score += 5;
    } else {
      if (fredData?.m2Supply?.change < -2) score -= 10;
      else score -= 5;
    }
    
    // Stablecoin supply (30d - long-term liquidity)
    if (defiData?.stablecoinSupply?.change > 5) score += 12;
    else if (defiData?.stablecoinSupply?.change > 2) score += 6;
    else if (defiData?.stablecoinSupply?.change < -5) score -= 12;
    else if (defiData?.stablecoinSupply?.change < -2) score -= 6;
    
    // TVL as adoption metric
    if (defiData?.tvl?.change > 8) score += 8;
    else if (defiData?.tvl?.change > 3) score += 4;
    else if (defiData?.tvl?.change < -8) score -= 8;
    else if (defiData?.tvl?.change < -3) score -= 4;
    
    // Fear & Greed (extremes for long-term accumulation)
    if (cgData?.fearGreed) {
      if (cgData.fearGreed.value < 20) score += 8;
      else if (cgData.fearGreed.value < 35) score += 4;
      else if (cgData.fearGreed.value > 85) score -= 8;
      else if (cgData.fearGreed.value > 70) score -= 4;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const dayTradingScore = calculateDayTradingScore();
  const swingScore = calculateSwingScore();
  const hodlScore = calculateHodlScore();

  const tabs = [
    { id: 'crypto', label: '₿ Crypto' },
    { id: 'macro', label: '🏦 Macro' },
    { id: 'defi', label: '🦙 DeFi' },
    { id: 'derivatives', label: '📊 Deriv' },
    { id: 'charts', label: '📈 Charts' }
  ];

  const formatChange = (val) => val >= 0 ? `+${val}%` : `${val}%`;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${t.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, background: t.bg, zIndex: 100
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🎯 Crypto Decision Hub
            {cgData && <LiveTag theme={theme} />}
          </h1>
          <span style={{ fontSize: '9px', color: t.textSecondary }}>
            {lastUpdate ? `${lastUpdate.toLocaleTimeString('pl-PL')}` : 'Ładowanie...'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={fetchAllData} disabled={loading} style={{
            background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px',
            padding: '5px 8px', cursor: 'pointer', fontSize: '12px', color: t.text
          }}>{loading ? '⏳' : '🔄'}</button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{
            background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: '8px',
            padding: '5px 8px', cursor: 'pointer', fontSize: '12px'
          }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>

      {/* THREE SCORES CARD */}
      <div style={{ padding: '12px' }}>
        <Card theme={theme} style={{ marginBottom: '12px', padding: '12px' }}>
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            overflowX: 'auto', 
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '8px',
            justifyContent: 'center'
          }}>
            <MiniScoreGauge
              score={dayTradingScore}
              label="Day Trading"
              icon="🎯"
              color={t.warning}
              subtitle="godziny-dni"
              theme={theme}
              onHelp={() => setHelpModal('dayTradingScore')}
            />
            <MiniScoreGauge
              score={swingScore}
              label="Swing"
              icon="📊"
              color={t.accent}
              subtitle="tygodnie"
              theme={theme}
              onHelp={() => setHelpModal('swingScore')}
            />
            <MiniScoreGauge
              score={hodlScore}
              label="HODL"
              icon="🏦"
              color={t.positive}
              subtitle="miesiące-lata"
              theme={theme}
              onHelp={() => setHelpModal('hodlScore')}
            />
          </div>
          
          {/* Score components summary */}
          <div style={{ 
            marginTop: '10px', padding: '10px', 
            background: theme === 'dark' ? '#1e293b' : '#f1f5f9', 
            borderRadius: '8px',
            fontSize: '10px'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div>
                <div style={{ color: t.textSecondary, marginBottom: '4px' }}>🎯 Day ({dayTradingScore})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  <span style={{ background: `${t.warning}20`, padding: '2px 4px', borderRadius: '4px' }}>
                    F&G:{cgData?.fearGreed?.value || '-'}
                  </span>
                  <span style={{ background: `${t.warning}20`, padding: '2px 4px', borderRadius: '4px' }}>
                    FR:{binanceData?.fundingRate?.value?.toFixed(3) || '-'}%
                  </span>
                </div>
              </div>
              <div>
                <div style={{ color: t.textSecondary, marginBottom: '4px' }}>📊 Swing ({swingScore})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  <span style={{ background: `${t.accent}20`, padding: '2px 4px', borderRadius: '4px' }}>
                    TVL:{defiData?.tvl?.change || '-'}%
                  </span>
                  <span style={{ background: `${t.accent}20`, padding: '2px 4px', borderRadius: '4px' }}>
                    BTC.D:{cgData?.btcDominance?.value || '-'}%
                  </span>
                </div>
              </div>
              <div>
                <div style={{ color: t.textSecondary, marginBottom: '4px' }}>🏦 HODL ({hodlScore})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  <span style={{ background: `${t.positive}20`, padding: '2px 4px', borderRadius: '4px' }}>
                    M2:{fredData?.m2Supply?.trend === 'expanding' ? '📈' : '📉'}
                  </span>
                  <span style={{ background: `${t.positive}20`, padding: '2px 4px', borderRadius: '4px' }}>
                    Stb:{defiData?.stablecoinSupply?.change || '-'}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* API Status */}
      <div style={{ padding: '0 12px 6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {[
          { name: 'CG', status: cgData },
          { name: 'BN', status: binanceData },
          { name: 'DL', status: defiData },
          { name: 'FR', status: fredData }
        ].map(api => (
          <span key={api.name} style={{
            fontSize: '8px', padding: '2px 5px', borderRadius: '4px',
            background: api.status ? `${t.positive}20` : `${t.negative}20`,
            color: api.status ? t.positive : t.negative
          }}>{api.status ? '●' : '○'} {api.name}</span>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '6px 12px', overflowX: 'auto', borderBottom: `1px solid ${t.border}` }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '5px 10px', borderRadius: '14px', border: 'none',
            background: activeTab === tab.id ? t.accent : t.cardBg,
            color: activeTab === tab.id ? '#fff' : t.textSecondary,
            fontSize: '11px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap'
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '12px', maxWidth: '900px', margin: '0 auto' }}>
        
        {/* CRYPTO TAB */}
        {activeTab === 'crypto' && (
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>₿ Bitcoin</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.btcPrice?.value?.toLocaleString() || '---'}</div>
              <span style={{ fontSize: '11px', color: (cgData?.btcPrice?.change || 0) >= 0 ? t.positive : t.negative }}>
                {cgData?.btcPrice?.change ? formatChange(cgData.btcPrice.change) : '---'}
              </span>
            </Card>

            <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>◆ Ethereum</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.ethPrice?.value?.toLocaleString() || '---'}</div>
              <span style={{ fontSize: '11px', color: (cgData?.ethPrice?.change || 0) >= 0 ? t.positive : t.negative }}>
                {cgData?.ethPrice?.change ? formatChange(cgData.ethPrice.change) : '---'}
              </span>
            </Card>

            <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>😱 Fear & Greed</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: cgData?.fearGreed?.value > 60 ? t.warning : cgData?.fearGreed?.value < 40 ? t.positive : t.text }}>
                {cgData?.fearGreed?.value || '---'}
              </div>
              <span style={{ fontSize: '10px', color: t.textSecondary }}>{cgData?.fearGreed?.label || '---'}</span>
            </Card>

            <Card helpKey="btcDominance" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>👑 BTC Dominance</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{cgData?.btcDominance?.value || '---'}%</div>
            </Card>

            <Card theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>◎ Solana</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.solPrice?.value || '---'}</div>
              <span style={{ fontSize: '11px', color: (cgData?.solPrice?.change || 0) >= 0 ? t.positive : t.negative }}>
                {cgData?.solPrice?.change ? formatChange(cgData.solPrice.change) : '---'}
              </span>
            </Card>

            <Card theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>📊 Volume 24h</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${cgData?.volume24h || '---'}B</div>
            </Card>
          </div>
        )}

        {/* MACRO TAB */}
        {activeTab === 'macro' && (
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Card helpKey="m2Supply" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>🏦 M2 Supply</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${fredData?.m2Supply?.value || '---'}T</div>
              <span style={{ fontSize: '11px', color: (fredData?.m2Supply?.change || 0) >= 0 ? t.positive : t.negative }}>
                {fredData?.m2Supply?.change ? `${formatChange(fredData.m2Supply.change)} YoY` : '---'}
              </span>
              {fredData?.m2Supply?.trend && (
                <div style={{ marginTop: '4px', padding: '3px 6px', background: `${t.positive}20`, borderRadius: '4px', fontSize: '9px', color: t.positive, fontWeight: '500' }}>
                  {fredData.m2Supply.trend === 'expanding' ? '📈 Ekspansja' : '📉 Kontrakcja'}
                </div>
              )}
            </Card>

            <Card helpKey="dxy" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💲 DXY Index</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{mockData.dxy.value}</div>
              <span style={{ fontSize: '11px', color: mockData.dxy.change < 0 ? t.positive : t.negative }}>
                {formatChange(mockData.dxy.change)}
              </span>
            </Card>

            <Card theme={theme} style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>📊 Korelacja M2 vs BTC</div>
              <p style={{ fontSize: '11px', color: t.textSecondary, lineHeight: '1.4', margin: 0 }}>
                Wzrost podaży M2 historycznie koreluje z wzrostami BTC z opóźnieniem ~3-6 miesięcy.
                Obecny trend: <strong style={{ color: fredData?.m2Supply?.trend === 'expanding' ? t.positive : t.negative }}>
                  {fredData?.m2Supply?.trend === 'expanding' ? '📈 Ekspansja' : '📉 Kontrakcja'}
                </strong>
              </p>
            </Card>
          </div>
        )}

        {/* DEFI TAB */}
        {activeTab === 'defi' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <Card helpKey="tvl" onHelp={setHelpModal} theme={theme}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>🔒 Total TVL</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>${defiData?.tvl?.value || '---'}B</div>
                <span style={{ fontSize: '11px', color: (defiData?.tvl?.change || 0) >= 0 ? t.positive : t.negative }}>
                  {defiData?.tvl?.change ? formatChange(defiData.tvl.change) : '---'} (7d)
                </span>
              </Card>

              <Card helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme}>
                <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💵 Stablecoin</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>${defiData?.stablecoinSupply?.value || '---'}B</div>
                <span style={{ fontSize: '11px', color: (defiData?.stablecoinSupply?.change || 0) >= 0 ? t.positive : t.negative }}>
                  {defiData?.stablecoinSupply?.change ? formatChange(defiData.stablecoinSupply.change) : '---'} (30d)
                </span>
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
                        <span style={{ fontSize: '9px', marginLeft: '4px', color: p.change >= 0 ? t.positive : t.negative }}>
                          {p.change >= 0 ? '+' : ''}{p.change?.toFixed(1)}%
                        </span>
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
            <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💸 Funding Rate</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: (binanceData?.fundingRate?.value || 0) > 0.03 ? t.warning : t.text }}>
                {binanceData?.fundingRate?.value?.toFixed(4) || '---'}%
              </div>
              <span style={{ fontSize: '9px', color: t.textSecondary }}>BTC Perpetual</span>
            </Card>

            <Card helpKey="openInterest" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>📊 Open Interest</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${binanceData?.openInterest?.value || '---'}B</div>
              <span style={{ fontSize: '9px', color: t.textSecondary }}>BTC Futures</span>
            </Card>

            <Card helpKey="longShortRatio" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>⚖️ Long/Short</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>{binanceData?.longShortRatio?.value || '---'}</div>
              <span style={{ fontSize: '9px', color: (binanceData?.longShortRatio?.value || 1) > 1.5 ? t.warning : t.textSecondary }}>
                {(binanceData?.longShortRatio?.value || 1) > 1.5 ? 'Więcej longów ⚠️' : 'Zrównoważony'}
              </span>
            </Card>

            <Card theme={theme}>
              <div style={{ fontSize: '10px', color: t.textSecondary, marginBottom: '4px' }}>💥 Liquidations 24h</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>${mockData.liquidations.total}M</div>
              <div style={{ fontSize: '9px', marginTop: '2px' }}>
                <span style={{ color: t.positive }}>L: ${mockData.liquidations.long}M</span>
                {' | '}
                <span style={{ color: t.negative }}>S: ${mockData.liquidations.short}M</span>
              </div>
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
                  <button key={s} onClick={() => setTvSymbol(s)} style={{
                    padding: '5px 10px', borderRadius: '6px', border: 'none',
                    background: tvSymbol === s ? t.accent : t.bg,
                    color: tvSymbol === s ? '#fff' : t.textSecondary,
                    fontSize: '10px', fontWeight: '500', cursor: 'pointer'
                  }}>{s.split(':')[1]}</button>
                ))}
              </div>
            </Card>

            <Card theme={theme}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>👁️ Widok</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {[
                  { id: 'analysis', label: '📊 Analiza' },
                  { id: 'chart', label: '📈 Wykres' },
                  { id: 'both', label: '🔀 Oba' }
                ].map(v => (
                  <button key={v.id} onClick={() => setChartView(v.id)} style={{
                    padding: '5px 10px', borderRadius: '6px', border: 'none',
                    background: chartView === v.id ? t.accent : t.bg,
                    color: chartView === v.id ? '#fff' : t.textSecondary,
                    fontSize: '10px', fontWeight: '500', cursor: 'pointer'
                  }}>{v.label}</button>
                ))}
              </div>
            </Card>

            {(chartView === 'analysis' || chartView === 'both') && (
              <Card helpKey="technicalAnalysis" onHelp={setHelpModal} theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                  📊 Analiza Techniczna - {tvSymbol.split(':')[1]}
                  <LiveTag theme={theme} />
                </div>
                <div style={{ fontSize: '9px', color: t.textSecondary, marginBottom: '8px' }}>
                  Oscylatory • Moving Averages • Buy/Sell
                </div>
                <TradingViewTechnicalAnalysis symbol={tvSymbol} theme={theme} interval={taInterval} />
              </Card>
            )}

            {(chartView === 'chart' || chartView === 'both') && (
              <Card theme={theme}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                  📈 Wykres - {tvSymbol.split(':')[1]}
                </div>
                <TradingViewChart symbol={tvSymbol} theme={theme} />
              </Card>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '14px', color: t.textSecondary, fontSize: '9px' }}>
          💡 Kliknij <strong>?</strong> aby zobaczyć opis wskaźnika | Auto-refresh: 60s
        </div>
      </div>

      {/* Help Modal */}
      {helpModal && <HelpModal helpKey={helpModal} onClose={() => setHelpModal(null)} theme={theme} />}
    </div>
  );
}

export default App;
