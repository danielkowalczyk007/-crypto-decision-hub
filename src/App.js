import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// ============ HELP CONTENT FOR ALL TILES ============
const helpContent = {
  // CRYPTO TAB
  btcPrice: {
    title: '₿ BTC Price',
    emoji: '₿',
    description: 'Aktualna cena Bitcoina w USD.',
    interpretation: [
      { condition: 'Wzrost > 5% dziennie', signal: 'bullish', text: 'Silny momentum wzrostowy' },
      { condition: 'Spadek > 5% dziennie', signal: 'bearish', text: 'Korekta lub panika' },
      { condition: 'Stabilność ±2%', signal: 'neutral', text: 'Konsolidacja' }
    ],
    tip: 'Porównuj z ATH - dystans od ATH pokazuje potencjał wzrostu lub ryzyko korekty.',
    source: 'CoinGecko API'
  },
  ethPrice: {
    title: '◆ ETH Price',
    emoji: '◆',
    description: 'Aktualna cena Ethereum w USD.',
    interpretation: [
      { condition: 'ETH/BTC rośnie', signal: 'bullish', text: 'Altseason możliwy' },
      { condition: 'ETH/BTC spada', signal: 'bearish', text: 'BTC dominacja rośnie' }
    ],
    tip: 'Obserwuj ratio ETH/BTC - pokazuje siłę altcoinów względem BTC.',
    source: 'CoinGecko API'
  },
  fearGreed: {
    title: '😱 Fear & Greed Index',
    emoji: '😱',
    description: 'Wskaźnik sentymentu rynku od 0 (ekstremalny strach) do 100 (ekstremalna chciwość).',
    interpretation: [
      { condition: '0-25: Extreme Fear', signal: 'bullish', text: '🟢 Okazja zakupowa - "kupuj gdy inni się boją"' },
      { condition: '26-45: Fear', signal: 'bullish', text: '🟢 Rozważ akumulację' },
      { condition: '46-55: Neutral', signal: 'neutral', text: '🟡 Brak wyraźnego sygnału' },
      { condition: '56-75: Greed', signal: 'bearish', text: '🟠 Ostrożność, możliwa korekta' },
      { condition: '76-100: Extreme Greed', signal: 'bearish', text: '🔴 Rozważ realizację zysków' }
    ],
    tip: 'Kontrariański wskaźnik - kupuj przy strachu, sprzedawaj przy chciwości.',
    source: 'Alternative.me'
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
    tip: 'Spadająca dominacja przy rosnącym BTC = altseason. Rosnąca dominacja przy spadającym rynku = ucieczka do BTC.',
    source: 'CoinGecko API'
  },
  stablecoinSupply: {
    title: '💵 Stablecoin Supply',
    emoji: '💵',
    description: 'Łączna podaż stablecoinów (USDT, USDC, DAI itp.) - "suchy proch" gotowy do inwestycji.',
    interpretation: [
      { condition: 'Wzrost supply', signal: 'bullish', text: '🟢 Nowy kapitał wchodzi na rynek' },
      { condition: 'Spadek supply', signal: 'bearish', text: '🔴 Kapitał ucieka z krypto' },
      { condition: 'Stały poziom', signal: 'neutral', text: '🟡 Stabilizacja' }
    ],
    tip: 'Rosnąca podaż stablecoinów to paliwo dla przyszłych wzrostów - kapitał czeka na okazję.',
    source: 'DefiLlama'
  },
  tvl: {
    title: '🔒 Total Value Locked',
    emoji: '🔒',
    description: 'Łączna wartość zablokowana w protokołach DeFi.',
    interpretation: [
      { condition: 'TVL rośnie', signal: 'bullish', text: '🟢 Rosnące zaufanie do DeFi' },
      { condition: 'TVL spada', signal: 'bearish', text: '🔴 Odpływ kapitału z DeFi' },
      { condition: 'TVL/MCap rośnie', signal: 'bullish', text: '🟢 Większe wykorzystanie protokołów' }
    ],
    tip: 'Porównuj TVL między chain\'ami - pokazuje gdzie płynie kapitał DeFi.',
    source: 'DefiLlama'
  },

  // MACRO TAB
  m2Supply: {
    title: '🏦 M2 Supply',
    emoji: '🏦',
    description: 'Globalna podaż pieniądza M2 (gotówka + depozyty + fundusze rynku pieniężnego).',
    interpretation: [
      { condition: 'M2 rośnie (ekspansja)', signal: 'bullish', text: '🟢 Więcej płynności = kapitał szuka zwrotu → aktywa ryzykowne rosną' },
      { condition: 'M2 spada (kontrakcja)', signal: 'bearish', text: '🔴 QT i zacieśnianie = odpływ z ryzykownych aktywów' }
    ],
    tip: 'BTC koreluje z M2 z opóźnieniem 3-6 miesięcy. Rosnące M2 = bullish dla BTC w średnim terminie.',
    source: 'FRED (Federal Reserve)'
  },
  dxy: {
    title: '💲 DXY (Dollar Index)',
    emoji: '💲',
    description: 'Indeks siły dolara względem koszyka walut (EUR, JPY, GBP, CAD, SEK, CHF).',
    interpretation: [
      { condition: 'DXY spada', signal: 'bullish', text: '🟢 Słabszy dolar = kapitał ucieka do alternatyw (BTC, złoto)' },
      { condition: 'DXY rośnie', signal: 'bearish', text: '🔴 Silny dolar = risk-off, odpływ z ryzykownych aktywów' },
      { condition: 'DXY > 105', signal: 'bearish', text: '🔴 Bardzo silny dolar - presja na krypto' }
    ],
    tip: 'DXY i BTC są negatywnie skorelowane. Spadający DXY to jeden z najsilniejszych sygnałów bullish.',
    source: 'TradingView'
  },
  fedWatch: {
    title: '🎯 CME FedWatch',
    emoji: '🎯',
    description: 'Prawdopodobieństwo decyzji Fed o stopach procentowych wycenione przez rynek.',
    interpretation: [
      { condition: 'Wysoka szansa na cięcie', signal: 'bullish', text: '🟢 Niższe stopy = tańszy kapitał = wzrosty' },
      { condition: 'Wysoka szansa na podwyżkę', signal: 'bearish', text: '🔴 Wyższe stopy = droższy kapitał = spadki' }
    ],
    tip: 'Rynek reaguje na oczekiwania, nie na samą decyzję. Zaskoczenia wywołują największe ruchy.',
    source: 'CME Group'
  },

  // ON-CHAIN TAB
  mvrvZScore: {
    title: '📊 MVRV Z-Score',
    emoji: '📊',
    description: 'Market Value to Realized Value - porównuje cenę rynkową z "ceną nabycia" wszystkich BTC.',
    interpretation: [
      { condition: 'Z-Score > 7', signal: 'bearish', text: '🔴 Ekstremalne przewartościowanie - szczyt cyklu' },
      { condition: 'Z-Score 3-7', signal: 'bearish', text: '🟠 Przewartościowanie - ostrożność' },
      { condition: 'Z-Score 0-3', signal: 'neutral', text: '🟡 Fair value' },
      { condition: 'Z-Score < 0', signal: 'bullish', text: '🟢 Niedowartościowanie - okazja zakupowa' }
    ],
    tip: 'Historycznie Z-Score > 7 oznaczał szczyty cyklu, a < 0 dna bessy.',
    source: 'Glassnode'
  },
  sopr: {
    title: '📈 SOPR',
    emoji: '📈',
    description: 'Spent Output Profit Ratio - czy sprzedający realizują zysk czy stratę.',
    interpretation: [
      { condition: 'SOPR > 1', signal: 'neutral', text: 'Sprzedający w zysku' },
      { condition: 'SOPR < 1', signal: 'bullish', text: '🟢 Kapitulacja - sprzedający w stracie = potencjalne dno' },
      { condition: 'SOPR = 1 (od dołu)', signal: 'bullish', text: '🟢 Reset - akumulacja' }
    ],
    tip: 'SOPR < 1 przez dłuższy czas to znak kapitulacji - historycznie dobry moment na zakupy.',
    source: 'Glassnode'
  },
  exchangeReserves: {
    title: '🏛️ Exchange Reserves',
    emoji: '🏛️',
    description: 'Ilość BTC/ETH trzymana na giełdach.',
    interpretation: [
      { condition: 'Rezerwy spadają (outflow)', signal: 'bullish', text: '🟢 Inwestorzy wypłacają do cold storage = HODL' },
      { condition: 'Rezerwy rosną (inflow)', signal: 'bearish', text: '🔴 Inwestorzy deponują na giełdy = presja sprzedażowa' }
    ],
    tip: 'Masowe outflow z giełd to silny sygnał bullish - mniej podaży do sprzedaży.',
    source: 'CryptoQuant / Glassnode'
  },
  nupl: {
    title: '💰 NUPL',
    emoji: '💰',
    description: 'Net Unrealized Profit/Loss - łączny niezrealizowany zysk/strata wszystkich holderów.',
    interpretation: [
      { condition: 'NUPL > 0.75 (Euphoria)', signal: 'bearish', text: '🔴 Euforia - rozważ sprzedaż' },
      { condition: 'NUPL 0.5-0.75 (Belief)', signal: 'neutral', text: '🟠 Wiara w rynek' },
      { condition: 'NUPL 0.25-0.5 (Optimism)', signal: 'neutral', text: '🟡 Optymizm' },
      { condition: 'NUPL 0-0.25 (Hope)', signal: 'bullish', text: '🟢 Nadzieja - akumulacja' },
      { condition: 'NUPL < 0 (Capitulation)', signal: 'bullish', text: '🟢 Kapitulacja - idealne dno' }
    ],
    tip: 'NUPL < 0 historycznie oznaczał dna bessy. To najlepszy moment na zakupy.',
    source: 'Glassnode'
  },

  // DERIVATIVES TAB
  fundingRate: {
    title: '💸 Funding Rate',
    emoji: '💸',
    description: 'Opłata między long/short na rynku perpetual futures.',
    interpretation: [
      { condition: 'Funding > 0.1%', signal: 'bearish', text: '🔴 Nadmierny optymizm - longi płacą shortom' },
      { condition: 'Funding 0-0.05%', signal: 'neutral', text: '🟡 Neutralny rynek' },
      { condition: 'Funding < 0', signal: 'bullish', text: '🟢 Pesymizm - shorty płacą longom = potencjalne odbicie' }
    ],
    tip: 'Ekstremalnie wysoki funding często poprzedza lokalne szczyty (nadmiar lewarowanych longów).',
    source: 'Binance / Coinglass'
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
    source: 'Coinglass'
  },
  liquidations: {
    title: '💥 Liquidations',
    emoji: '💥',
    description: 'Wartość zlikwidowanych pozycji w ciągu 24h.',
    interpretation: [
      { condition: 'Duże likwidacje longów', signal: 'bearish', text: '🔴 Kasowanie nadmiernego optymizmu' },
      { condition: 'Duże likwidacje shortów', signal: 'bullish', text: '🟢 Short squeeze - paliwo dla wzrostów' },
      { condition: 'Niskie likwidacje', signal: 'neutral', text: '🟡 Spokojny rynek' }
    ],
    tip: 'Kaskadowe likwidacje często tworzą lokalne ekstrema - szukaj odwrócenia.',
    source: 'Coinglass'
  },
  lsRatio: {
    title: '⚖️ Long/Short Ratio',
    emoji: '⚖️',
    description: 'Stosunek pozycji long do short na giełdach.',
    interpretation: [
      { condition: 'L/S > 2.0', signal: 'bearish', text: '🔴 Nadmiar longów - kontrariański sygnał sprzedaży' },
      { condition: 'L/S 1.0-2.0', signal: 'neutral', text: '🟡 Zrównoważony rynek' },
      { condition: 'L/S < 1.0', signal: 'bullish', text: '🟢 Nadmiar shortów - potencjalny squeeze' }
    ],
    tip: 'Ekstremalne wartości L/S często poprzedzają odwrócenie trendu.',
    source: 'Binance / Coinglass'
  },

  // INSTITUTIONAL TAB
  etfFlows: {
    title: '🏦 ETF Flows',
    emoji: '🏦',
    description: 'Dzienny napływ/odpływ kapitału z Bitcoin ETF.',
    interpretation: [
      { condition: 'Inflow > $200M', signal: 'bullish', text: '🟢 Silny popyt instytucjonalny' },
      { condition: 'Inflow $0-200M', signal: 'neutral', text: '🟡 Umiarkowany popyt' },
      { condition: 'Outflow', signal: 'bearish', text: '🔴 Instytucje wychodzą' }
    ],
    tip: 'ETF flows pokazują sentyment instytucji - "smart money" często prowadzi rynek.',
    source: 'Farside Investors'
  },
  grayscale: {
    title: '🏛️ Grayscale GBTC',
    emoji: '🏛️',
    description: 'Największy fundusz BTC - premium/discount do NAV.',
    interpretation: [
      { condition: 'Premium > 0%', signal: 'bullish', text: '🟢 Popyt przewyższa podaż' },
      { condition: 'Discount < -10%', signal: 'bearish', text: '🔴 Presja sprzedażowa lub arbitraż' }
    ],
    tip: 'Outflow z GBTC po konwersji na ETF to normalne - obserwuj net flow całego rynku ETF.',
    source: 'Grayscale'
  },
  microStrategy: {
    title: '🏢 MicroStrategy',
    emoji: '🏢',
    description: 'Największy korporacyjny holder BTC.',
    interpretation: [
      { condition: 'Nowe zakupy', signal: 'bullish', text: '🟢 Saylor kontynuuje akumulację' },
      { condition: 'Brak zakupów', signal: 'neutral', text: '🟡 Pauza w strategii' }
    ],
    tip: 'MSTR jako proxy dla BTC - ruchy Saylora często wpływają na sentyment.',
    source: 'SEC Filings'
  }
};

// ============ HELP MODAL COMPONENT ============
const HelpModal = ({ helpKey, onClose, theme }) => {
  const content = helpContent[helpKey];
  if (!content) return null;

  const t = theme === 'dark' ? {
    bg: 'rgba(15, 23, 42, 0.98)',
    cardBg: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    accent: '#3b82f6',
    positive: '#22c55e',
    negative: '#ef4444',
    warning: '#f59e0b'
  } : {
    bg: 'rgba(255, 255, 255, 0.98)',
    cardBg: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    accent: '#3b82f6',
    positive: '#16a34a',
    negative: '#dc2626',
    warning: '#d97706'
  };

  const signalColor = (signal) => {
    switch(signal) {
      case 'bullish': return t.positive;
      case 'bearish': return t.negative;
      default: return t.warning;
    }
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
        animation: 'fadeIn 0.2s ease'
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          background: t.bg,
          borderRadius: '16px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          border: `1px solid ${t.border}`,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          animation: 'slideUp 0.3s ease'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: t.bg,
          borderRadius: '16px 16px 0 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>{content.emoji}</span>
            <h3 style={{ margin: 0, color: t.text, fontSize: '18px', fontWeight: '600' }}>
              {content.title}
            </h3>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: t.textSecondary,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '8px',
              transition: 'all 0.2s'
            }}
          >×</button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Description */}
          <p style={{ 
            color: t.text, 
            fontSize: '14px', 
            lineHeight: '1.6', 
            margin: '0 0 20px',
            padding: '12px',
            background: t.cardBg,
            borderRadius: '8px',
            border: `1px solid ${t.border}`
          }}>
            {content.description}
          </p>

          {/* Interpretation */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ 
              color: t.text, 
              fontSize: '13px', 
              fontWeight: '600', 
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              📖 Interpretacja
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {content.interpretation.map((item, i) => (
                <div 
                  key={i}
                  style={{
                    padding: '10px 12px',
                    background: t.cardBg,
                    borderRadius: '8px',
                    borderLeft: `3px solid ${signalColor(item.signal)}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <span style={{ 
                    color: t.textSecondary, 
                    fontSize: '12px',
                    fontFamily: 'monospace'
                  }}>
                    {item.condition}
                  </span>
                  <span style={{ 
                    color: signalColor(item.signal), 
                    fontSize: '13px',
                    fontWeight: '500'
                  }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pro Tip */}
          <div style={{
            padding: '14px',
            background: `${t.accent}15`,
            borderRadius: '8px',
            border: `1px solid ${t.accent}30`,
            marginBottom: '16px'
          }}>
            <div style={{ 
              color: t.accent, 
              fontSize: '11px', 
              fontWeight: '600', 
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              💡 Pro Tip
            </div>
            <p style={{ 
              color: t.text, 
              fontSize: '13px', 
              lineHeight: '1.5',
              margin: 0
            }}>
              {content.tip}
            </p>
          </div>

          {/* Source */}
          <div style={{ 
            fontSize: '11px', 
            color: t.textSecondary,
            textAlign: 'right'
          }}>
            Źródło: {content.source}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// ============ CARD WITH HELP BUTTON ============
const Card = ({ children, helpKey, onHelp, style, theme }) => {
  const t = theme === 'dark' ? {
    cardBg: '#0f172a',
    border: '#1e293b',
    helpBg: '#1e293b',
    helpColor: '#64748b'
  } : {
    cardBg: '#ffffff',
    border: '#e2e8f0',
    helpBg: '#f1f5f9',
    helpColor: '#64748b'
  };

  return (
    <div style={{
      position: 'relative',
      padding: '16px',
      background: t.cardBg,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      ...style
    }}>
      {helpKey && (
        <button
          onClick={() => onHelp(helpKey)}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: t.helpBg,
            border: 'none',
            color: t.helpColor,
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            opacity: 0.7
          }}
          onMouseEnter={e => e.target.style.opacity = 1}
          onMouseLeave={e => e.target.style.opacity = 0.7}
        >
          ?
        </button>
      )}
      {children}
    </div>
  );
};

// ============ TRADINGVIEW WIDGET ============
const TradingViewWidget = ({ symbol, theme }) => {
  useEffect(() => {
    const container = document.getElementById('tv-widget');
    if (container) container.innerHTML = '';
    
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: 'D',
      timezone: 'Europe/Warsaw',
      theme: theme,
      style: '1',
      locale: 'pl',
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      height: '400'
    });
    document.getElementById('tv-widget')?.appendChild(script);
  }, [symbol, theme]);

  return <div id="tv-widget" style={{ height: '400px' }} />;
};

// ============ MOCK DATA ============
const mockData = {
  btc: { price: 94250, change: 3.2, ath: 109000 },
  eth: { price: 3420, change: 2.8 },
  fearGreed: { value: 72, label: 'Greed' },
  btcDominance: { value: 54.2, change: -0.8 },
  stablecoinSupply: { value: 178.5, change: 5.2 },
  tvl: { value: 89.4, change: 12.3 },
  m2Supply: { value: 21.5, change: 2.3, trend: 'expanding', lastUpdate: '2025-01' },
  dxy: { value: 103.42, change: -1.8 },
  fedWatch: { nextCut: '2025-03', probability: 68 },
  mvrv: { value: 1.8, zone: 'neutral' },
  sopr: { value: 0.98, signal: 'accumulation' },
  exchangeReserves: { btc: 2.1, eth: 17.8, trend: 'outflow' },
  nupl: { value: 0.42, phase: 'Optimism' },
  fundingRate: { value: 0.012, sentiment: 'bullish' },
  openInterest: { value: 18.2, change: 5.4 },
  liquidations: { long: 45.2, short: 12.8, total: 58 },
  lsRatio: { value: 1.45 },
  etfFlows: { daily: 245, weekly: 1820 },
  grayscale: { premium: -2.1 },
  microStrategy: { btc: 214400, avgPrice: 35180 }
};

// ============ MAIN APP ============
function App() {
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('crypto');
  const [tvSymbol, setTvSymbol] = useState('BINANCE:BTCUSDT');
  const [helpModal, setHelpModal] = useState(null);
  const [score, setScore] = useState(68);

  const t = theme === 'dark' ? {
    bg: '#030712',
    cardBg: '#0f172a',
    text: '#f1f5f9',
    textSecondary: '#64748b',
    border: '#1e293b',
    accent: '#3b82f6',
    positive: '#22c55e',
    negative: '#ef4444',
    warning: '#f59e0b'
  } : {
    bg: '#f8fafc',
    cardBg: '#ffffff',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    accent: '#3b82f6',
    positive: '#16a34a',
    negative: '#dc2626',
    warning: '#d97706'
  };

  const tabs = [
    { id: 'crypto', label: '₿ Crypto', icon: '₿' },
    { id: 'macro', label: '🌍 Macro', icon: '🌍' },
    { id: 'onchain', label: '⛓️ On-Chain', icon: '⛓️' },
    { id: 'derivatives', label: '📊 Derivatives', icon: '📊' },
    { id: 'institutional', label: '🏛️ Institutional', icon: '🏛️' },
    { id: 'charts', label: '📈 Charts', icon: '📈' }
  ];

  const getScoreColor = (s) => s >= 70 ? t.positive : s >= 40 ? t.warning : t.negative;
  const getScoreLabel = (s) => s >= 70 ? 'BULLISH' : s >= 40 ? 'NEUTRAL' : 'BEARISH';
  const formatChange = (val) => val >= 0 ? `+${val}%` : `${val}%`;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: t.bg, 
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        background: t.bg,
        zIndex: 100
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
            🎯 Crypto Decision Hub
          </h1>
          <span style={{ fontSize: '12px', color: t.textSecondary }}>
            Multi-indicator analysis
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            padding: '8px 16px',
            background: `${getScoreColor(score)}20`,
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px', fontWeight: '700', color: getScoreColor(score) }}>
              {score}
            </span>
            <span style={{ fontSize: '11px', color: getScoreColor(score), fontWeight: '600' }}>
              {getScoreLabel(score)}
            </span>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              background: t.cardBg,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        overflowX: 'auto',
        borderBottom: `1px solid ${t.border}`
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: activeTab === tab.id ? t.accent : t.cardBg,
              color: activeTab === tab.id ? '#fff' : t.textSecondary,
              fontSize: '13px',
              fontWeight: '500',
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
      <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* CRYPTO TAB */}
        {activeTab === 'crypto' && (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Card helpKey="btcPrice" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>₿ Bitcoin</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.btc.price.toLocaleString()}</div>
              <span style={{ fontSize: '13px', color: mockData.btc.change >= 0 ? t.positive : t.negative }}>
                {formatChange(mockData.btc.change)}
              </span>
              <div style={{ fontSize: '11px', color: t.textSecondary, marginTop: '4px' }}>
                ATH: ${mockData.btc.ath.toLocaleString()}
              </div>
            </Card>

            <Card helpKey="ethPrice" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>◆ Ethereum</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.eth.price.toLocaleString()}</div>
              <span style={{ fontSize: '13px', color: mockData.eth.change >= 0 ? t.positive : t.negative }}>
                {formatChange(mockData.eth.change)}
              </span>
            </Card>

            <Card helpKey="fearGreed" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>😱 Fear & Greed</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: t.warning }}>{mockData.fearGreed.value}</div>
              <span style={{ fontSize: '13px', color: t.warning }}>{mockData.fearGreed.label}</span>
            </Card>

            <Card helpKey="btcDominance" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>👑 BTC Dominance</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.btcDominance.value}%</div>
              <span style={{ fontSize: '13px', color: mockData.btcDominance.change >= 0 ? t.positive : t.negative }}>
                {formatChange(mockData.btcDominance.change)}
              </span>
            </Card>

            <Card helpKey="stablecoinSupply" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>💵 Stablecoin Supply</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.stablecoinSupply.value}B</div>
              <span style={{ fontSize: '13px', color: t.positive }}>
                {formatChange(mockData.stablecoinSupply.change)}
              </span>
            </Card>

            <Card helpKey="tvl" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🔒 Total TVL</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.tvl.value}B</div>
              <span style={{ fontSize: '13px', color: t.positive }}>
                {formatChange(mockData.tvl.change)}
              </span>
            </Card>
          </div>
        )}

        {/* MACRO TAB */}
        {activeTab === 'macro' && (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Card helpKey="m2Supply" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🏦 M2 Supply</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.m2Supply.value}T</div>
              <span style={{ fontSize: '13px', color: t.positive }}>
                {formatChange(mockData.m2Supply.change)} YoY
              </span>
              <div style={{ 
                marginTop: '8px', 
                padding: '6px 10px', 
                background: `${t.positive}20`, 
                borderRadius: '6px',
                fontSize: '11px',
                color: t.positive,
                fontWeight: '500'
              }}>
                📈 Ekspansja = BULLISH dla BTC
              </div>
            </Card>

            <Card helpKey="dxy" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>💲 DXY Index</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.dxy.value}</div>
              <span style={{ fontSize: '13px', color: mockData.dxy.change < 0 ? t.positive : t.negative }}>
                {formatChange(mockData.dxy.change)}
              </span>
              <div style={{ 
                marginTop: '8px', 
                padding: '6px 10px', 
                background: `${t.positive}20`, 
                borderRadius: '6px',
                fontSize: '11px',
                color: t.positive,
                fontWeight: '500'
              }}>
                📉 Słaby dolar = BULLISH dla krypto
              </div>
            </Card>

            <Card helpKey="fedWatch" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🎯 FedWatch</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.fedWatch.probability}%</div>
              <span style={{ fontSize: '13px', color: t.textSecondary }}>
                Szansa na cięcie {mockData.fedWatch.nextCut}
              </span>
            </Card>

            {/* Correlation Card */}
            <Card theme={theme} style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                📊 Korelacja M2 vs BTC
              </div>
              <p style={{ fontSize: '13px', color: t.textSecondary, lineHeight: '1.6', margin: 0 }}>
                Wzrost podaży M2 historycznie koreluje z wzrostami BTC z opóźnieniem ~3-6 miesięcy.
                Obecny trend: <strong style={{ color: t.positive }}>📈 Ekspansja</strong>
              </p>
            </Card>
          </div>
        )}

        {/* ON-CHAIN TAB */}
        {activeTab === 'onchain' && (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Card helpKey="mvrvZScore" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>📊 MVRV Z-Score</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.mvrv.value}</div>
              <span style={{ fontSize: '13px', color: t.warning }}>Fair Value</span>
            </Card>

            <Card helpKey="sopr" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>📈 SOPR</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.sopr.value}</div>
              <span style={{ fontSize: '13px', color: t.positive }}>Akumulacja</span>
            </Card>

            <Card helpKey="exchangeReserves" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🏛️ Exchange Reserves</div>
              <div style={{ fontSize: '18px', fontWeight: '700' }}>
                {mockData.exchangeReserves.btc}M BTC
              </div>
              <span style={{ fontSize: '13px', color: t.positive }}>
                📤 Outflow = Bullish
              </span>
            </Card>

            <Card helpKey="nupl" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>💰 NUPL</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.nupl.value}</div>
              <span style={{ fontSize: '13px', color: t.warning }}>{mockData.nupl.phase}</span>
            </Card>
          </div>
        )}

        {/* DERIVATIVES TAB */}
        {activeTab === 'derivatives' && (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Card helpKey="fundingRate" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>💸 Funding Rate</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.fundingRate.value}%</div>
              <span style={{ fontSize: '13px', color: t.positive }}>Neutral</span>
            </Card>

            <Card helpKey="openInterest" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>📊 Open Interest</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.openInterest.value}B</div>
              <span style={{ fontSize: '13px', color: t.positive }}>
                {formatChange(mockData.openInterest.change)}
              </span>
            </Card>

            <Card helpKey="liquidations" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>💥 Liquidations 24h</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>${mockData.liquidations.total}M</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                <span style={{ color: t.positive }}>Long: ${mockData.liquidations.long}M</span>
                {' | '}
                <span style={{ color: t.negative }}>Short: ${mockData.liquidations.short}M</span>
              </div>
            </Card>

            <Card helpKey="lsRatio" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>⚖️ Long/Short Ratio</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.lsRatio.value}</div>
              <span style={{ fontSize: '13px', color: t.warning }}>Więcej longów</span>
            </Card>
          </div>
        )}

        {/* INSTITUTIONAL TAB */}
        {activeTab === 'institutional' && (
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Card helpKey="etfFlows" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🏦 BTC ETF Flows</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: t.positive }}>
                +${mockData.etfFlows.daily}M
              </div>
              <span style={{ fontSize: '13px', color: t.textSecondary }}>
                Weekly: +${mockData.etfFlows.weekly}M
              </span>
            </Card>

            <Card helpKey="grayscale" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🏛️ GBTC Premium</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{mockData.grayscale.premium}%</div>
              <span style={{ fontSize: '13px', color: t.negative }}>Discount</span>
            </Card>

            <Card helpKey="microStrategy" onHelp={setHelpModal} theme={theme}>
              <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '8px' }}>🏢 MicroStrategy</div>
              <div style={{ fontSize: '20px', fontWeight: '700' }}>
                {mockData.microStrategy.btc.toLocaleString()} BTC
              </div>
              <span style={{ fontSize: '12px', color: t.textSecondary }}>
                Avg: ${mockData.microStrategy.avgPrice.toLocaleString()}
              </span>
            </Card>
          </div>
        )}

        {/* CHARTS TAB */}
        {activeTab === 'charts' && (
          <div>
            <Card theme={theme}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>📈 TradingView</div>
              <TradingViewWidget symbol={tvSymbol} theme={theme} />
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT', 'CRYPTOCAP:TOTAL'].map(s => (
                  <button
                    key={s}
                    onClick={() => setTvSymbol(s)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: tvSymbol === s ? t.accent : t.cardBg,
                      color: tvSymbol === s ? '#fff' : t.textSecondary,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {s.split(':')[1]}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div style={{ 
          textAlign: 'center', 
          padding: '20px', 
          color: t.textSecondary, 
          fontSize: '11px' 
        }}>
          💡 Kliknij <strong>?</strong> przy kafelku, aby zobaczyć szczegółowy opis wskaźnika
        </div>
      </div>

      {/* Help Modal */}
      {helpModal && (
        <HelpModal 
          helpKey={helpModal} 
          onClose={() => setHelpModal(null)} 
          theme={theme}
        />
      )}
    </div>
  );
}

export default App;
