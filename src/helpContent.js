// ============ HELP CONTENT WITH INDIVIDUAL THRESHOLDS ============
// Different thresholds for different time horizons:
// - Day Trading: More aggressive (80/65/50/35 instead of 70/55/45/30)
// - Swing: Standard balanced thresholds (70/55/45/30)
// - HODL: More conservative (60/50/40/25)

const helpContent = {
  // ============ MAIN SCORES ============
  dayTradingScore: {
    title: '🎯 Day Trading Score',
    emoji: '🎯',
    description: 'Wskaźnik dla day traderów. Horyzont: godziny do dni. Bazuje na zmienności, momentum i sentymencie krótkoterminowym. AGRESYWNE PROGI - szybsze reakcje na zmiany rynkowe.',
    interpretation: [
      { condition: '80-100: AKUMULUJ', signal: 'bullish', text: '🟢 Silny sygnał kupna - momentum sprzyja.' },
      { condition: '65-79: HOLD+', signal: 'bullish', text: '🟢 Trend pozytywny, dokupuj na korektach.' },
      { condition: '50-64: HOLD', signal: 'neutral', text: '🟡 Neutralnie - czekaj na potwierdzenie.' },
      { condition: '35-49: OSTROŻNIE', signal: 'warning', text: '🟠 Słabnące momentum, rozważ redukcję.' },
      { condition: '0-34: REDUKUJ', signal: 'bearish', text: '🔴 Realizuj zyski, możliwy spadek.' }
    ],
    tip: 'Składowe: Fear & Greed (waga 30%), RSI momentum (25%), Volume anomalies (25%), Funding rates (20%). Agresywne progi (80/65/50/35) dla szybszych reakcji.',
    source: 'Alternative.me, Binance, CoinGecko',
    thresholds: { accumulate: 80, holdPlus: 65, hold: 50, caution: 35 }
  },

  swingScore: {
    title: '📊 Swing Score',
    emoji: '📊',
    description: 'Wskaźnik dla swing traderów. Horyzont: tygodnie. Łączy sentyment z on-chain i DeFi metrykami. STANDARDOWE PROGI - zbalansowane podejście między reakcjami a stabilnością.',
    interpretation: [
      { condition: '70-100: AKUMULUJ', signal: 'bullish', text: '🟢 Dobry moment na średnioterminowe pozycje.' },
      { condition: '55-69: HOLD+', signal: 'bullish', text: '🟢 Dokupuj na korektach.' },
      { condition: '45-54: HOLD', signal: 'neutral', text: '🟡 Czekaj na lepszy setup.' },
      { condition: '30-44: OSTROŻNIE', signal: 'warning', text: '🟠 Zmniejsz ekspozycję.' },
      { condition: '0-29: REDUKUJ', signal: 'bearish', text: '🔴 Realizuj zyski, rozważ hedging.' }
    ],
    tip: 'Składowe: TVL trend 7d (25%), BTC Dominance momentum (25%), Stablecoin inflows (25%), Fear & Greed MA(7) (25%). Standardowe progi (70/55/45/30).',
    source: 'DefiLlama, CoinGecko, Alternative.me',
    thresholds: { accumulate: 70, holdPlus: 55, hold: 45, caution: 30 }
  },

  hodlScore: {
    title: '🏦 HODL Score',
    emoji: '🏦',
    description: 'Wskaźnik dla długoterminowych inwestorów. Horyzont: miesiące do lat. Bazuje na makro i on-chain fundamentals. KONSERWATYWNE PROGI - mniej fałszywych sygnałów, skupienie na dużych trendach.',
    interpretation: [
      { condition: '60-100: AKUMULUJ', signal: 'bullish', text: '🟢 Fundamenty sprzyjają akumulacji długoterminowej.' },
      { condition: '50-59: HOLD+', signal: 'bullish', text: '🟢 Trzymaj, dokupuj oportunistycznie.' },
      { condition: '40-49: HOLD', signal: 'neutral', text: '🟡 Stabilnie - trzymaj obecne pozycje.' },
      { condition: '25-39: OSTROŻNIE', signal: 'warning', text: '🟠 Rozważ zmniejszenie ekspozycji długoterminowej.' },
      { condition: '0-24: REDUKUJ', signal: 'bearish', text: '🔴 Fundamenty niekorzystne - defensywna pozycja.' }
    ],
    tip: 'Składowe: M2 Money Supply trend (30%), MVRV Z-Score (25%), Stablecoin supply 30d (25%), TVL jako wskaźnik adopcji (20%). Konserwatywne progi (60/50/40/25) - M2 koreluje z BTC z opóźnieniem 3-6 miesięcy.',
    source: 'FRED, DefiLlama, Glassnode',
    thresholds: { accumulate: 60, holdPlus: 50, hold: 40, caution: 25 }
  },

  // ============ CRYPTO METRICS ============
  btcPrice: {
    title: '₿ BTC Price',
    emoji: '₿',
    description: 'Aktualna cena Bitcoina w USD.',
    interpretation: [
      { condition: 'Wzrost > 5% dziennie', signal: 'bullish', text: 'Silny momentum wzrostowy' },
      { condition: 'Spadek > 5% dziennie', signal: 'bearish', text: 'Korekta lub panika' },
      { condition: 'Stabilność ±2%', signal: 'neutral', text: 'Konsolidacja' }
    ],
    tip: 'Porównaj z ATH - dystans od ATH pokazuje potencjał wzrostu lub ryzyko korekty.',
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
      { condition: '46-54: Neutral', signal: 'neutral', text: '🟡 Rynek niezdecydowany' },
      { condition: '55-75: Greed', signal: 'warning', text: '🟠 Ostrożność - możliwa korekta' },
      { condition: '76-100: Extreme Greed', signal: 'bearish', text: '🔴 Rozważ realizację zysków' }
    ],
    tip: 'Kontrariański wskaźnik - ekstrema często oznaczają punkty zwrotne. Warren Buffett: "Bądź chciwy gdy inni się boją".',
    source: 'Alternative.me'
  },

  btcDominance: {
    title: '👑 BTC Dominance',
    emoji: '👑',
    description: 'Udział kapitalizacji BTC w całym rynku krypto.',
    interpretation: [
      { condition: '> 55%', signal: 'neutral', text: 'BTC season - focus na Bitcoin' },
      { condition: '45-55%', signal: 'neutral', text: 'Równowaga rynku' },
      { condition: '< 45%', signal: 'bullish', text: '🟢 Altseason - czas na altcoiny' }
    ],
    tip: 'Spadająca dominacja BTC przy rosnącym rynku = altseason. Rosnąca dominacja = flight to quality.',
    source: 'CoinGecko'
  },

  // ============ MACRO INDICATORS ============
  m2Supply: {
    title: '💵 M2 Money Supply',
    emoji: '💵',
    description: 'Globalna podaż pieniądza M2. Ekspansja M2 historycznie koreluje ze wzrostem BTC z opóźnieniem 3-6 miesięcy.',
    interpretation: [
      { condition: 'YoY > 5%', signal: 'bullish', text: '🟢 Ekspansja monetarna - pozytywne dla risk assets' },
      { condition: 'YoY 0-5%', signal: 'neutral', text: '🟡 Stabilna podaż' },
      { condition: 'YoY < 0%', signal: 'bearish', text: '🔴 Kontrakcja - negatywne dla aktywów ryzykownych' }
    ],
    tip: 'M2 jest leading indicator dla BTC. Obserwuj trend 3-6 miesięcy do przodu.',
    source: 'FRED (Federal Reserve)'
  },

  dxyIndex: {
    title: '💲 DXY Index',
    emoji: '💲',
    description: 'Indeks siły dolara amerykańskiego względem koszyka walut.',
    interpretation: [
      { condition: 'DXY < 100', signal: 'bullish', text: '🟢 Słaby dolar - pozytywne dla BTC' },
      { condition: 'DXY 100-105', signal: 'neutral', text: '🟡 Neutralna siła dolara' },
      { condition: 'DXY > 105', signal: 'bearish', text: '🔴 Silny dolar - presja na risk assets' }
    ],
    tip: 'BTC i DXY są często negatywnie skorelowane. Spadający DXY = rosnąca płynność globalna.',
    source: 'TradingView'
  },

  fedRates: {
    title: '🏛️ Fed Rates',
    emoji: '🏛️',
    description: 'Oczekiwania rynku na zmiany stóp procentowych Fed.',
    interpretation: [
      { condition: 'Oczekiwane cięcia', signal: 'bullish', text: '🟢 Pivot Fed - pozytywne dla risk assets' },
      { condition: 'Bez zmian', signal: 'neutral', text: '🟡 Stabilna polityka' },
      { condition: 'Oczekiwane podwyżki', signal: 'bearish', text: '🔴 Hawkish Fed - presja na aktywa ryzykowne' }
    ],
    tip: 'Obserwuj CME FedWatch Tool. Zmiany oczekiwań wpływają na rynki przed faktyczną decyzją.',
    source: 'CME FedWatch'
  },

  // ============ ON-CHAIN METRICS ============
  tvl: {
    title: '🔒 Total Value Locked (TVL)',
    emoji: '🔒',
    description: 'Całkowita wartość zablokowana w protokołach DeFi.',
    interpretation: [
      { condition: 'TVL rośnie > 5% tydzień', signal: 'bullish', text: '🟢 Kapitał napływa do DeFi' },
      { condition: 'TVL stabilny ±5%', signal: 'neutral', text: '🟡 Konsolidacja' },
      { condition: 'TVL spada > 5% tydzień', signal: 'bearish', text: '🔴 Odpływ kapitału z DeFi' }
    ],
    tip: 'Rosnący TVL = rosnąca adopcja i zaufanie do ekosystemu.',
    source: 'DefiLlama'
  },

  stablecoinSupply: {
    title: '💰 Stablecoin Supply',
    emoji: '💰',
    description: 'Całkowita podaż stablecoinów (USDT, USDC, DAI, etc.).',
    interpretation: [
      { condition: 'Supply rośnie', signal: 'bullish', text: '🟢 Napływ kapitału do krypto - "dry powder"' },
      { condition: 'Supply stabilny', signal: 'neutral', text: '🟡 Równowaga' },
      { condition: 'Supply spada', signal: 'bearish', text: '🔴 Odpływ kapitału z ekosystemu' }
    ],
    tip: 'Rosnąca podaż stablecoinów = gotówka czekająca na zakupy.',
    source: 'DefiLlama'
  },

  exchangeReserves: {
    title: '🏦 Exchange Reserves',
    emoji: '🏦',
    description: 'BTC trzymany na giełdach centralizowanych.',
    interpretation: [
      { condition: 'Rezerwy spadają', signal: 'bullish', text: '🟢 Akumulacja - BTC wychodzi z giełd' },
      { condition: 'Rezerwy stabilne', signal: 'neutral', text: '🟡 Równowaga' },
      { condition: 'Rezerwy rosną', signal: 'bearish', text: '🔴 Potencjalna presja sprzedażowa' }
    ],
    tip: 'Spadające rezerwy = long-term holders akumulują (bullish). Rosnące = przygotowanie do sprzedaży.',
    source: 'CryptoQuant, Glassnode'
  },

  mvrvZScore: {
    title: '📊 MVRV Z-Score',
    emoji: '📊',
    description: 'Market Value to Realized Value. Pokazuje czy BTC jest przewartościowany czy niedowartościowany.',
    interpretation: [
      { condition: 'Z-Score < 0', signal: 'bullish', text: '🟢 BTC niedowartościowany - historyczna okazja' },
      { condition: 'Z-Score 0-3', signal: 'neutral', text: '🟡 Fair value' },
      { condition: 'Z-Score 3-7', signal: 'warning', text: '🟠 Przewartościowanie - ostrożność' },
      { condition: 'Z-Score > 7', signal: 'bearish', text: '🔴 Ekstremalne przewartościowanie - cycle top?' }
    ],
    tip: 'Historycznie Z-Score < 0 oznaczał dno cyklu, > 7 szczyt. Najlepszy wskaźnik długoterminowy.',
    source: 'Glassnode, LookIntoBitcoin'
  },

  // ============ TECHNICAL ANALYSIS ============
  technicalAnalysis: {
    title: '📈 Technical Analysis',
    emoji: '📈',
    description: 'Zbiorcza analiza techniczna z TradingView: oscylatory, średnie kroczące, poziomy wsparcia/oporu.',
    interpretation: [
      { condition: 'Strong Buy', signal: 'bullish', text: '🟢 Większość wskaźników bullish' },
      { condition: 'Buy', signal: 'bullish', text: '🟢 Przewaga sygnałów kupna' },
      { condition: 'Neutral', signal: 'neutral', text: '🟡 Mieszane sygnały' },
      { condition: 'Sell', signal: 'warning', text: '🟠 Przewaga sygnałów sprzedaży' },
      { condition: 'Strong Sell', signal: 'bearish', text: '🔴 Większość wskaźników bearish' }
    ],
    tip: 'Łączy RSI, MACD, Stochastic, MA crossovers i inne. Używaj jako potwierdzenie, nie jako jedyny sygnał.',
    source: 'TradingView'
  }
};

export default helpContent;