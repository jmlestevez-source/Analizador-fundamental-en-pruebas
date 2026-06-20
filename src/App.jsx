import { useState, useEffect } from 'react';
import { Search, Settings, AlertTriangle, Cpu, TrendingUp, DollarSign, Activity, BarChart3, RefreshCw } from 'lucide-react';
import { processStockData } from './utils/financeCalculators';
import { generateFallbackAnalysis } from './utils/aiFallbackGenerator';
import ScoreGauge from './components/ScoreGauge';
import MetricCard from './components/MetricCard';
import MatrixChart from './components/MatrixChart';
import { MOCK_STOCKS } from './utils/mockStocks';

// Popular stocks for quick select and autocomplete suggestions
const POPULAR_STOCKS = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corporation' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.' },
  { ticker: 'AMZN', name: 'Amazon.com, Inc.' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation' },
  { ticker: 'TSLA', name: 'Tesla, Inc.' },
  { ticker: 'META', name: 'Meta Platforms, Inc.' },
  { ticker: 'KO', name: 'The Coca-Cola Company' },
  { ticker: 'PEP', name: 'PepsiCo, Inc.' },
  { ticker: 'MA', name: 'Mastercard Incorporated' },
  { ticker: 'V', name: 'Visa Inc.' },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.' },
  { ticker: 'LLY', name: 'Eli Lilly and Company' },
  { ticker: 'COST', name: 'Costco Wholesale Corp.' },
  { ticker: 'ASML', name: 'ASML Holding N.V.' },
  { ticker: 'NKE', name: 'NIKE, Inc.' },
  { ticker: 'WMT', name: 'Walmart Inc.' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.' }
];

// Quick-select list shown below search bar
const QUICK_SELECTS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'KO', 'MA'];

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comparisonStocks, setComparisonStocks] = useState([]);
  const [screenerData, setScreenerData] = useState(null);
  const [loadingScreener, setLoadingScreener] = useState(false);
  const [screenerError, setScreenerError] = useState(null);
  
  // Settings & AI State
  const [geminiKey, setGeminiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [aiReport, setAiReport] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  
  // Active Tab: 'metrics' | 'valuation' | 'technical' | 'matrix' | 'screener' | 'ai'
  const [activeTab, setActiveTab] = useState('metrics');

  const getPeers = (currentStock) => {
    if (!currentStock) return [];
    const allStocksMap = {};
    
    Object.keys(MOCK_STOCKS).forEach(ticker => {
      try {
        const processed = processStockData(MOCK_STOCKS[ticker], MOCK_STOCKS[ticker].finviz);
        allStocksMap[ticker] = processed;
      } catch (e) {
        console.error(e);
      }
    });
    
    comparisonStocks.forEach(stock => {
      allStocksMap[stock.ticker] = stock;
    });
    
    delete allStocksMap[currentStock.ticker];
    const candidates = Object.values(allStocksMap);
    
    let peers = candidates.filter(
      s => s.sector === currentStock.sector || s.industry === currentStock.industry
    );
    
    if (peers.length < 2) {
      const remaining = candidates.filter(c => !peers.find(p => p.ticker === c.ticker));
      remaining.sort((a, b) => b.scores.overall - a.scores.overall);
      peers = [...peers, ...remaining].slice(0, 3);
    } else {
      peers = peers.slice(0, 3);
    }
    
    return peers;
  };

  // Load API Key and initial stock on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setGeminiKey(savedKey);

    // Fetch Apple by default to show an instantly populated dashboard
    fetchStockData('AAPL');
  }, []);

  // Filter suggestions as search query changes. It searches both symbol and full company name,
  // first locally for instant feedback and then through Yahoo Finance via the Netlify search function.
  useEffect(() => {
    const rawQuery = searchQuery.trim();
    if (suppressSuggestions) {
      setSuggestions([]);
      return;
    }
    if (!rawQuery) {
      setSuggestions([]);
      return;
    }

    const normalize = (value) => value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    const q = normalize(rawQuery);
    const localSuggestions = POPULAR_STOCKS
      .filter(stock => normalize(stock.ticker).includes(q) || normalize(stock.name).includes(q))
      .map(stock => ({ ticker: stock.ticker, name: stock.name }));

    setSuggestions(localSuggestions.slice(0, 10));

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(rawQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search error ${response.status}`);
        const data = await response.json();
        const remoteSuggestions = (data.quotes || [])
          .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.typeDisp === 'Equity' || q.exchange))
          .map(q => ({
            ticker: String(q.symbol),
            name: q.longname || q.shortname || q.name || q.symbol,
          }));

        const merged = [...localSuggestions, ...remoteSuggestions]
          .filter((item, index, arr) => arr.findIndex(other => other.ticker === item.ticker) === index)
          .slice(0, 10);
        setSuggestions(merged);
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Autocomplete remoto no disponible:', err.message);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, suppressSuggestions]);

  const saveApiKey = (key) => {
    localStorage.setItem('gemini_api_key', key);
    setGeminiKey(key);
    setShowSettings(false);
    
    // Re-generate AI analysis if we have a stock loaded
    if (stockData) {
      generateAIAnalysis(stockData, key);
    }
  };

  const fetchStockData = async (tickerSymbol) => {
    const symbol = tickerSymbol.trim().toUpperCase();
    if (!symbol) return;

    setLoading(true);
    setError(null);
    setAiReport(null);
    setSuggestions([]);
    setSearchQuery(symbol);
    
    try {
      let parsedData = null;
      let isStaticDemo = false;

      try {
        const [response, technicalResponse] = await Promise.allSettled([
          fetch(`/api/stock/${symbol}`),
          fetch(`/api/technical?symbol=${encodeURIComponent(symbol)}`),
        ]);

        if (response.status !== 'fulfilled' || !response.value.ok) {
          throw new Error(`HTTP error ${response.status === 'fulfilled' ? response.value.status : 'network'}`);
        }
        parsedData = await response.value.json();

        if (technicalResponse.status === 'fulfilled' && technicalResponse.value.ok) {
          parsedData.technicalData = await technicalResponse.value.json();
        } else {
          console.warn('Análisis técnico no disponible temporalmente:', technicalResponse.reason || technicalResponse.value?.status);
        }
        
        if (parsedData.quoteSummary?.error) {
          throw new Error(parsedData.quoteSummary.error.description);
        }
      } catch (proxyErr) {
        console.warn('Proxy failed. Trying static pre-seeded database...', proxyErr);
        if (MOCK_STOCKS && MOCK_STOCKS[symbol]) {
          parsedData = MOCK_STOCKS[symbol];
          isStaticDemo = true;
        } else {
          throw new Error(
            `El proxy local no está activo y "${symbol}" no está pre-sembrado en la base de datos estática.\n` +
            `Por favor, ejecuta la aplicación en local con 'npm run dev' o busca un ticker pre-sembrado (AAPL, MSFT, NVDA, TSLA, KO, MA).`
          );
        }
      }
      
      const processed = processStockData(parsedData, parsedData.finviz, parsedData.technicalData);
      processed.isStaticDemo = isStaticDemo;
      setStockData(processed);
      
      // Update comparison list (max 10, prevent duplicates)
      setComparisonStocks(prev => {
        const filtered = prev.filter(s => s.ticker !== processed.ticker);
        return [processed, ...filtered].slice(0, 10);
      });

      // Generate AI analysis
      generateAIAnalysis(processed, geminiKey);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al conectar con el servidor de datos.');
      setStockData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadScreener = async () => {
    setActiveTab('screener');
    if (screenerData || loadingScreener) return;

    setLoadingScreener(true);
    setScreenerError(null);

    const cacheBust = Date.now();
    const urls = [
      // Repositorio actual de pruebas. Se lee desde GitHub Raw para no necesitar
      // un redeploy de Netlify cada vez que el workflow actualiza el JSON semanal.
      `https://raw.githubusercontent.com/jmlestevez-source/Analizador-fundamental-en-pruebas/main/public/data/screener-top-50.json?ts=${cacheBust}`,
      `https://raw.githubusercontent.com/jmlestevez-source/Analizador-fundamental-en-pruebas/master/public/data/screener-top-50.json?ts=${cacheBust}`,
      // Fallback local incluido en el último deploy de Netlify.
      `/data/screener-top-50.json?ts=${cacheBust}`,
    ];

    try {
      let lastError = null;

      for (const url of urls) {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) throw new Error(`${url} devolvió ${response.status}`);

          const data = await response.json();
          if (!Array.isArray(data.top50)) {
            throw new Error(`${url} no contiene un array top50 válido`);
          }

          setScreenerData(data);
          return;
        } catch (err) {
          lastError = err;
          console.warn('Fuente de screener no disponible:', err.message);
        }
      }

      throw lastError || new Error('No se pudo cargar ninguna fuente del screener.');
    } catch (err) {
      setScreenerError(err.message || 'No se pudo cargar el ranking semanal.');
    } finally {
      setLoadingScreener(false);
    }
  };

  const generateAIAnalysis = async (stock, keyToUse) => {
    setLoadingAI(true);
    const key = keyToUse || geminiKey;
    
    if (!key) {
      // Use fallback rules-based generator
      const fallbackText = generateFallbackAnalysis(stock);
      setAiReport(fallbackText);
      setLoadingAI(false);
      return;
    }

    try {
      const prompt = `Actúa como un Analista Financiero Senior de Wall Street e Inversor de Valor (estilo Warren Buffett / Peter Lynch).
Analiza la siguiente empresa para inversión a largo plazo basándote en sus métricas fundamentales.

DATOS GENERALES:
- Ticker: ${stock.ticker}
- Nombre: ${stock.companyName}
- Sector: ${stock.sector}
- Industria: ${stock.industry}
- Descripción: ${stock.description}

MÉTRICAS FUNDAMENTALES (puntuadas de 0 a 100):
- Salud Financiera y Deuda: ${stock.scores.financialHealth}/100 (Caja neta: ${stock.metrics.netCash.formatted}, Deuda/Patrimonio: ${stock.metrics.debtToEquity.formatted}, Ratio Corriente: ${stock.metrics.currentRatio.formatted})
- Rentabilidad & Moat: ${stock.scores.profitability}/100 (Margen Operativo: ${stock.metrics.operatingMargin.formatted}, Margen Bruto: ${stock.metrics.grossMargin.formatted}, ROE: ${stock.metrics.roe.formatted}, Margen FCF: ${stock.metrics.fcfMargin.formatted})
- Crecimiento: ${stock.scores.growth}/100 (Crecimiento Ventas YoY: ${stock.metrics.revenueGrowth.formatted}, Crecimiento Beneficios YoY: ${stock.metrics.earningsGrowth.formatted})
- Valoración: ${stock.scores.valuation}/100 (PER: ${stock.metrics.trailingPE.formatted}, PEG: ${stock.metrics.pegRatio.formatted}, EV/EBITDA: ${stock.metrics.enterpriseToEbitda.formatted})
- Puntuación Global: ${stock.scores.overall}/100
- Clasificación de Perfil: ${stock.profile}

Escribe un reporte interactivo en Markdown. Tradúcelo al español de forma natural.
Cumple exactamente con este formato de secciones:

### Resumen del Perfil de Inversión
(Escribe una descripción corta del negocio y sector)

### Ventaja Competitiva (Moat)
- **Clasificación**: [Elige una: Ventaja Competitiva Amplia (Wide Moat) / Ventaja Competitiva Estrecha (Narrow Moat) / Sin Ventaja Significativa (No Moat)]
- **Análisis**: (Explica tu veredicto de moat según sus métricas)

### Análisis DAFO (SWOT)
Utiliza la estructura HTML de la cuadrícula DAFO para que se renderice con el diseño CSS del dashboard:
<div class="swot-grid">
  <div class="swot-card swot-strengths">
    <div class="swot-card-title">💪 Fortalezas</div>
    <div class="swot-card-content">
      <ul>
        <li>(Fortaleza 1 basada en sus métricas reales)</li>
        <li>(Fortaleza 2)</li>
      </ul>
    </div>
  </div>
  <div class="swot-card swot-weaknesses">
    <div class="swot-card-title">⚠️ Debilidades</div>
    <div class="swot-card-content">
      <ul>
        <li>(Debilidad 1 basada en deuda, liquidez o caídas)</li>
        <li>(Debilidad 2)</li>
      </ul>
    </div>
  </div>
  <div class="swot-card swot-opportunities">
    <div class="swot-card-title">🚀 Oportunidades</div>
    <div class="swot-card-content">
      <ul>
        <li>(Oportunidad en su sector o catalizador de negocio)</li>
        <li>(Oportunidad 2)</li>
      </ul>
    </div>
  </div>
  <div class="swot-card swot-threats">
    <div class="swot-card-title">💣 Amenazas</div>
    <div class="swot-card-content">
      <ul>
        <li>(Amenazas macro o competencia tecnológica/disrupción)</li>
        <li>(Amenaza 2)</li>
      </ul>
    </div>
  </div>
</div>

### Tesis de Valoración & Margen de Seguridad
(Analiza si cotiza cara o barata en relación a su PEG y PE, y si hay margen de seguridad)

### Veredicto de Inversión a Largo Plazo
(Conclusión analítica sobre si comprar, mantener o evitar y por qué)`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const resJson = await response.json();
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No se recibió respuesta válida del modelo.');

      setAiReport(text);
    } catch (err) {
      console.error('Error generando AI report:', err);
      // Fallback
      setAiReport(generateFallbackAnalysis(stock) + `\n\n*(Nota: Cargado motor experto de contingencia por error de clave API: ${err.message})*`);
    } finally {
      setLoadingAI(false);
    }
  };

  // Simple Markdown Parser to render Markdown content securely
  const parseMarkdownToHtml = (md) => {
    if (!md) return '';
    let html = md;
    // Headings
    html = html.replace(/### (.*?)\n/g, '<h3>$1</h3>');
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Bullet points (convert lines beginning with '-' or '*' outside of html blocks)
    // Note: This is simplified. Let's keep it safe. We will replace lines with lists.
    const lines = html.split('\n');
    let inList = false;
    const processedLines = lines.map(line => {
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const content = line.trim().substring(2);
        return `<li>${content}</li>`;
      }
      return line;
    });
    return processedLines.join('\n');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchStockData(searchQuery);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <TrendingUp size={24} />
          </div>
          <div>
            <h1 className="brand-title">Antigravity</h1>
            <div className="brand-subtitle">Análisis Fundamental Profesional</div>
          </div>
        </div>

        <button 
          className="settings-btn" 
          onClick={() => setShowSettings(!showSettings)}
          title="Configuración de la API Key"
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel glass-panel">
          <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            ⚙️ Configuración de IA (Google Gemini)
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Introduce tu API Key gratuita de Google AI Studio para activar informes financieros 100% dinámicos y personalizados en tiempo real. Si no tienes una, la aplicación utilizará un motor experto local.
          </p>
          <div className="input-group">
            <label className="input-label">Gemini API Key</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="password"
                className="input-field"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button 
                className="search-btn" 
                onClick={() => saveApiKey(geminiKey)}
                style={{ padding: '0 1.5rem', borderRadius: '12px' }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar & Auto-suggestions */}
      <div className="search-container">
        <form onSubmit={handleSearchSubmit} className="search-bar">
          <div className="search-input-wrapper">
            <Search className="search-icon-inside" size={20} />
            <input
              type="text"
              className="search-input"
              placeholder="Buscar ticker en Yahoo Finance (ej: AAPL, MSFT, KO, TSLA...)"
              value={searchQuery}
              onChange={(e) => {
                setSuppressSuggestions(false);
                setSearchQuery(e.target.value);
              }}
            />
            {/* Auto-suggestions dropdown */}
            {suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map(s => (
                  <div 
                    key={s.ticker} 
                    className="suggestion-item"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSuppressSuggestions(true);
                      setSuggestions([]);
                      fetchStockData(s.ticker);
                    }}
                  >
                    <span className="suggestion-ticker">{s.ticker}</span>
                    <span className="suggestion-name">{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Analizar'}
          </button>
        </form>

        {/* Quick select tags */}
        <div className="quick-select-container">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            Populares:
          </span>
          {QUICK_SELECTS.map(ticker => (
            <button 
              key={ticker} 
              className="quick-select-badge"
              onClick={() => {
                setSuppressSuggestions(true);
                fetchStockData(ticker);
              }}
            >
              {ticker}
            </button>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="error-panel">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Dashboard Loading State */}
      {loading && (
        <div className="dashboard-grid">
          {/* Sidebar Skeleton */}
          <div className="ratings-sidebar glass-panel skeleton">
            <div className="skeleton-title" style={{ margin: '0 auto 1.5rem auto' }}></div>
            <div className="skeleton-gauge"></div>
            <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
              <div className="skeleton-text" style={{ width: '40px', height: '40px', borderRadius: '50%' }}></div>
              <div className="skeleton-text" style={{ width: '40px', height: '40px', borderRadius: '50%' }}></div>
              <div className="skeleton-text" style={{ width: '40px', height: '40px', borderRadius: '50%' }}></div>
            </div>
          </div>
          {/* Details Skeleton */}
          <div className="glass-panel skeleton" style={{ minHeight: '400px' }}>
            <div className="skeleton-title"></div>
            <div className="skeleton-text" style={{ height: '100px' }}></div>
            <div className="skeleton-text" style={{ height: '100px' }}></div>
          </div>
        </div>
      )}

      {/* Dashboard Main View */}
      {!loading && stockData && (
        <div className="dashboard-grid">
          {/* Left Column: Summary and Gauges */}
          <div className="ratings-sidebar">
            <div className="glass-panel overall-score-panel">
              <div className="stock-info">
                <div className="stock-title-row">
                  <h2 className="stock-name">{stockData.companyName}</h2>
                  <span className="stock-symbol-badge">{stockData.ticker}</span>
                </div>
                <div className="stock-meta">{stockData.sector} • {stockData.industry}</div>
                 <div style={{ marginTop: '0.5rem', fontWeight: '700', fontSize: '1.25rem' }}>
                  {stockData.price.toLocaleString('en-US', { style: 'currency', currency: stockData.currency })}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-secondary)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    Piotroski: {stockData.piotroski.score}/9
                  </span>
                  {stockData.intrinsicValue.marginOfSafety !== null && (
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      background: stockData.intrinsicValue.marginOfSafety >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                      border: stockData.intrinsicValue.marginOfSafety >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                      color: stockData.intrinsicValue.marginOfSafety >= 0 ? '#34d399' : '#fca5a5',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      MoS: {stockData.intrinsicValue.marginOfSafety >= 0 ? '+' : ''}{stockData.intrinsicValue.marginOfSafety.toFixed(0)}%
                    </span>
                  )}
                </div>
                {stockData.isStaticDemo && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: 'var(--rating-mid)',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.25rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    display: 'inline-block'
                  }}>
                    Base de Datos Estática (Demo Web)
                  </div>
                )}
              </div>

              <div className="rating-rings-container">
                {/* Main Overall Score Ring */}
                <ScoreGauge 
                  score={stockData.scores.overall} 
                  label="Puntuación Global" 
                  size={190} 
                  strokeWidth={14}
                />
              </div>

              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
                Perfil: <span style={{ fontWeight: '700', color: '#fff' }}>{stockData.profile}</span>
              </div>

              {/* Sub-scores Row */}
              <div className="sub-scores-row">
                <ScoreGauge score={stockData.scores.financialHealth} label="Salud Fin." size={75} strokeWidth={6} />
                <ScoreGauge score={stockData.scores.profitability} label="Moat/Rent." size={75} strokeWidth={6} />
                <ScoreGauge score={stockData.scores.growth} label="Crecer" size={75} strokeWidth={6} />
                <ScoreGauge score={stockData.scores.valuation} label="Valora" size={75} strokeWidth={6} />
                {stockData.scores.technical !== null && <ScoreGauge score={stockData.scores.technical} label="Técnico" size={75} strokeWidth={6} />}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Tabs and Panels */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Tabs Headers */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '1.5rem', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'metrics' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === 'metrics' ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => setActiveTab('metrics')}
              >
                <BarChart3 size={16} /> Métricas Clave
              </button>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'valuation' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === 'valuation' ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => setActiveTab('valuation')}
              >
                <DollarSign size={16} /> Valoración & Dividendos
              </button>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'technical' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === 'technical' ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => setActiveTab('technical')}
              >
                <TrendingUp size={16} /> Técnico
              </button>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'screener' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === 'screener' ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap'
                }}
                onClick={loadScreener}
              >
                <BarChart3 size={16} /> Screener Top 50
              </button>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'matrix' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === 'matrix' ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => setActiveTab('matrix')}
              >
                <Activity size={16} /> Matriz 2D
              </button>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'ai' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === 'ai' ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => setActiveTab('ai')}
              >
                <Cpu size={16} /> Tesis IA
              </button>
            </div>

            {/* Tab: Metrics Breakdown */}
            {activeTab === 'metrics' && (
              <div className="detail-section animate-fade-in">
                {/* 1. Salud Financiera */}
                <div>
                  <h3 className="section-title"><DollarSign size={18} /> Balance & Salud Financiera</h3>
                  <div className="metrics-category-grid">
                    <MetricCard metric={stockData.metrics.netCash} />
                    <MetricCard metric={stockData.metrics.debtToEquity} />
                    <MetricCard metric={stockData.metrics.currentRatio} />
                    <MetricCard metric={stockData.metrics.quickRatio} />
                  </div>
                </div>

                {/* 2. Rentabilidad & Ventajas */}
                <div style={{ marginTop: '1rem' }}>
                  <h3 className="section-title"><Activity size={18} /> Rentabilidad & Ventaja Competitiva</h3>
                  <div className="metrics-category-grid">
                    {stockData.metrics.roic && <MetricCard metric={stockData.metrics.roic} />}
                    <MetricCard metric={stockData.metrics.operatingMargin} />
                    <MetricCard metric={stockData.metrics.grossMargin} />
                    <MetricCard metric={stockData.metrics.roe} />
                    <MetricCard metric={stockData.metrics.fcfMargin} />
                  </div>
                </div>

                {/* 3. Crecimiento */}
                <div style={{ marginTop: '1rem' }}>
                  <h3 className="section-title"><TrendingUp size={18} /> Crecimiento</h3>
                  <div className="metrics-category-grid">
                    <MetricCard metric={stockData.metrics.revenueGrowth} />
                    <MetricCard metric={stockData.metrics.earningsGrowth} />
                  </div>
                </div>

                {/* 4. Valoración */}
                <div style={{ marginTop: '1rem' }}>
                  <h3 className="section-title"><BarChart3 size={18} /> Ratios de Valoración</h3>
                  <div className="metrics-category-grid">
                    <MetricCard metric={stockData.metrics.trailingPE} />
                    <MetricCard metric={stockData.metrics.forwardPE} />
                    <MetricCard metric={stockData.metrics.pegRatio} />
                    <MetricCard metric={stockData.metrics.enterpriseToEbitda} />
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Advanced Valuation */}
            {activeTab === 'valuation' && (
              <div className="detail-section animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                {/* Margin of Safety & Intrinsic Value */}
                <div>
                  <h3 className="section-title"><DollarSign size={18} /> Valor Intrínseco & Margen de Seguridad</h3>
                  {stockData.intrinsicValue.average ? (
                    <div>
                      <div className={`mos-banner ${stockData.intrinsicValue.marginOfSafety >= 0 ? 'discount' : 'premium'}`}>
                        <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                          {stockData.intrinsicValue.marginOfSafety >= 0 ? 'Margen de Seguridad Estimado' : 'Sobreprecio Estimado'}
                        </div>
                        <div className={`mos-value ${stockData.intrinsicValue.marginOfSafety >= 0 ? 'positive' : 'negative'}`}>
                          {stockData.intrinsicValue.marginOfSafety >= 0 ? '+' : ''}{stockData.intrinsicValue.marginOfSafety.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', fontWeight: 600 }}>
                          Veredicto: {stockData.intrinsicValue.status}
                        </div>
                      </div>
                      
                      <div className="valuation-comparison-grid">
                        <div className="valuation-compare-card">
                          <div className="valuation-compare-label">Precio Actual</div>
                          <div className="valuation-compare-price">
                            {stockData.price.toLocaleString('en-US', { style: 'currency', currency: stockData.currency })}
                          </div>
                        </div>
                        <div className="valuation-compare-card" style={{ border: '1px solid var(--color-primary-glow)' }}>
                          <div className="valuation-compare-label" style={{ color: 'var(--text-accent)' }}>Valor Intrínseco Medio</div>
                          <div className="valuation-compare-price" style={{ color: 'var(--text-accent)' }}>
                            {stockData.intrinsicValue.average.toLocaleString('en-US', { style: 'currency', currency: stockData.currency })}
                          </div>
                        </div>
                        <div className="valuation-compare-card">
                          <div className="valuation-compare-label">Fórmula Graham / DCF</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Graham: {stockData.intrinsicValue.graham ? stockData.intrinsicValue.graham.toLocaleString('en-US', { style: 'currency', currency: stockData.currency }) : 'N/D'}<br />
                            DCF: {stockData.intrinsicValue.dcf ? stockData.intrinsicValue.dcf.toLocaleString('en-US', { style: 'currency', currency: stockData.currency }) : 'N/D'}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: '1.4' }}>
                        * La Fórmula de Graham se basa en los beneficios actuales (EPS ttm) y el crecimiento futuro estimado a 5 años. El modelo DCF (Descuento de Flujos de Caja) proyecta los flujos de caja libre futuros descontándolos a una tasa del 9% con crecimiento terminal del 2.5%, ajustándolos por la caja neta de la empresa.
                      </p>
                    </div>
                  ) : (
                    <div className="valuation-compare-card">
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        No se ha podido calcular el valor intrínseco de esta empresa debido a datos de ganancias (EPS) negativos o insuficientes.
                      </p>
                    </div>
                  )}
                </div>

                {/* Piotroski F-Score */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 className="section-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                      📋 Piotroski F-Score (Solidez Financiera)
                    </h3>
                    <span className={`piotroski-badge ${stockData.piotroski.score >= 7 ? 'excelente' : stockData.piotroski.score >= 4 ? 'aceptable' : 'riesgo'}`}>
                      Puntuación: {stockData.piotroski.score} / 9 ({stockData.piotroski.status})
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    El F-Score evalúa 9 criterios clave divididos en Rentabilidad, Estructura de Deuda/Apalancamiento y Eficiencia de Operaciones para calificar la solidez financiera.
                  </p>
                  
                  <div className="piotroski-layout">
                    <div className="piotroski-checklist-card">
                      {stockData.piotroski.details.slice(0, 5).map((detail, idx) => {
                        const isMet = detail.includes('+1');
                        return (
                          <div key={idx} className={`piotroski-check-item ${isMet ? 'met' : 'unmet'}`}>
                            {isMet ? (
                              <span className="piotroski-icon-check" style={{ marginRight: '0.35rem', fontWeight: 'bold' }}>✓</span>
                            ) : (
                              <span className="piotroski-icon-uncheck" style={{ marginRight: '0.35rem', fontWeight: 'bold' }}>✗</span>
                            )}
                            <span>{detail.replace(/Rentabilidad: |Apalancamiento: |Liquidez: |Eficiencia: /, "").replace(" (+1)", "").replace(" (+0)", "")}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="piotroski-checklist-card">
                      {stockData.piotroski.details.slice(5).map((detail, idx) => {
                        const isMet = detail.includes('+1');
                        return (
                          <div key={idx} className={`piotroski-check-item ${isMet ? 'met' : 'unmet'}`}>
                            {isMet ? (
                              <span className="piotroski-icon-check" style={{ marginRight: '0.35rem', fontWeight: 'bold' }}>✓</span>
                            ) : (
                              <span className="piotroski-icon-uncheck" style={{ marginRight: '0.35rem', fontWeight: 'bold' }}>✗</span>
                            )}
                            <span>{detail.replace(/Rentabilidad: |Apalancamiento: |Liquidez: |Eficiencia: /, "").replace(" (+1)", "").replace(" (+0)", "")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sostenibilidad de Dividendos */}
                <div>
                  <h3 className="section-title"><TrendingUp size={18} /> Sostenibilidad de Dividendos</h3>
                  <div className="valuation-compare-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>RENTABILIDAD (YIELD)</span>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {stockData.dividendSafety.yield ? `${(stockData.dividendSafety.yield * 100).toFixed(2)}%` : '0.00%'}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PAYOUT RATIO</span>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {stockData.dividendSafety.payout ? `${(stockData.dividendSafety.payout * 100).toFixed(1)}%` : 'N/D'}
                          </div>
                        </div>
                      </div>
                      <span className={`dividend-status-badge ${
                        stockData.dividendSafety.score >= 80 ? 'sostenible' : 
                        stockData.dividendSafety.score >= 60 ? 'moderado' : 'riesgo'
                      }`}>
                        {stockData.dividendSafety.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                      {stockData.dividendSafety.explanation}
                    </p>
                  </div>
                </div>

                {/* Geraldine Weiss Dividend Yield Valuation */}
                <div>
                  <h3 className="section-title"><DollarSign size={18} /> Valoración por Dividendos: Geraldine Weiss</h3>
                  <div className="valuation-compare-card" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <div className="valuation-compare-label">Veredicto</div>
                        <div className="valuation-compare-price">{stockData.geraldineWeiss?.status || 'No aplicable'}</div>
                      </div>
                      {stockData.geraldineWeiss?.available && (
                        <span className={`dividend-status-badge ${stockData.geraldineWeiss.score >= 75 ? 'sostenible' : stockData.geraldineWeiss.score >= 50 ? 'moderado' : 'riesgo'}`}>
                          Score: {stockData.geraldineWeiss.score}/100
                        </span>
                      )}
                    </div>
                    {stockData.geraldineWeiss?.available ? (
                      <div className="valuation-comparison-grid" style={{ marginTop: '0.5rem' }}>
                        <div className="valuation-compare-card">
                          <div className="valuation-compare-label">Yield actual</div>
                          <div className="valuation-compare-price">{(stockData.geraldineWeiss.currentYield * 100).toFixed(2)}%</div>
                        </div>
                        <div className="valuation-compare-card">
                          <div className="valuation-compare-label">Yield histórico medio</div>
                          <div className="valuation-compare-price">{(stockData.geraldineWeiss.historicalAverageYield * 100).toFixed(2)}%</div>
                        </div>
                        <div className="valuation-compare-card">
                          <div className="valuation-compare-label">Ratio actual/media</div>
                          <div className="valuation-compare-price">{stockData.geraldineWeiss.ratio.toFixed(2)}x</div>
                        </div>
                      </div>
                    ) : null}
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                      {stockData.geraldineWeiss?.explanation || 'No hay historial de dividendos suficiente para aplicar el método.'}
                    </p>
                  </div>
                </div>

                {/* Peer Comparison Section */}
                <div className="peers-section">
                  <h3 className="section-title"><Activity size={18} /> Comparativa con Competidores del Sector</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Enfrentamiento de métricas clave con empresas similares de la base de datos o búsquedas recientes.
                  </p>
                  
                  {getPeers(stockData).length > 0 ? (
                    <div className="peers-table-wrapper">
                      <table className="peers-table">
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            <th>Empresa</th>
                            <th>Precio</th>
                            <th>Calidad</th>
                            <th>Valoración</th>
                            <th>PER</th>
                            <th>Margen Op.</th>
                            <th>Deuda/Patr.</th>
                            <th>Piotroski</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="active-peer">
                            <td className="highlight">{stockData.ticker}</td>
                            <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{stockData.companyName} (Actual)</td>
                            <td className="highlight">{stockData.price.toLocaleString('en-US', { style: 'currency', currency: stockData.currency })}</td>
                            <td className="highlight" style={{ color: 'var(--rating-high)' }}>{stockData.scores.overall}/100</td>
                            <td className="highlight">{stockData.scores.valuation}/100</td>
                            <td>{stockData.metrics.trailingPE?.formatted || 'N/D'}</td>
                            <td>{stockData.metrics.operatingMargin?.formatted || 'N/D'}</td>
                            <td>{stockData.metrics.debtToEquity?.formatted || 'N/D'}</td>
                            <td className="highlight" style={{ color: '#34d399' }}>{stockData.piotroski.score}/9</td>
                          </tr>
                          {getPeers(stockData).map(peer => (
                            <tr key={peer.ticker}>
                              <td className="highlight">
                                <span className="peers-ticker-link" onClick={() => fetchStockData(peer.ticker)}>
                                  {peer.ticker}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>{peer.companyName}</td>
                              <td>{peer.price.toLocaleString('en-US', { style: 'currency', currency: peer.currency })}</td>
                              <td className="highlight" style={{ color: peer.scores.overall >= 70 ? 'var(--rating-high)' : peer.scores.overall >= 50 ? 'var(--rating-mid)' : 'var(--rating-low)' }}>
                                {peer.scores.overall}/100
                              </td>
                              <td>{peer.scores.valuation}/100</td>
                              <td>{peer.metrics.trailingPE?.formatted || 'N/D'}</td>
                              <td>{peer.metrics.operatingMargin?.formatted || 'N/D'}</td>
                              <td>{peer.metrics.debtToEquity?.formatted || 'N/D'}</td>
                              <td className="highlight">{peer.piotroski?.score || 'N/D'}/9</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="valuation-compare-card">
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Busca otros tickers en la barra de búsqueda para habilitar la comparación directa side-by-side.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Technical Analysis */}
            {activeTab === 'technical' && (
              <div className="detail-section animate-fade-in">
                <div>
                  <h3 className="section-title"><TrendingUp size={18} /> Análisis Técnico</h3>
                  {stockData.technical ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="valuation-compare-card" style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <div>
                            <div className="valuation-compare-label">Puntuación técnica</div>
                            <div className="valuation-compare-price">{stockData.technical.score}/100</div>
                          </div>
                          <span className={`dividend-status-badge ${stockData.technical.score >= 75 ? 'sostenible' : stockData.technical.score >= 50 ? 'moderado' : 'riesgo'}`}>
                            {stockData.technical.status}
                          </span>
                        </div>
                        <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          Cuatro criterios de 25 puntos: precio sobre SMA50, precio sobre SMA200, RSC Mansfield semanal de 52 semanas positivo frente al S&P 500 (^GSPC) y CAGR a 10 años —o 5 años si no hay datos— superior al S&P 500.
                        </p>
                        <p style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          Precio usado para medias: {Number.isFinite(stockData.technical.data.price) ? stockData.technical.data.price.toFixed(2) : 'N/D'}
                          {Number.isFinite(stockData.technical.data.latestDailyClose) ? ` · Último cierre diario: ${stockData.technical.data.latestDailyClose.toFixed(2)}` : ''}
                        </p>
                      </div>

                      <div className="metrics-category-grid">
                        {[
                          ['Precio > SMA 50', stockData.technical.criteria.aboveSMA50, stockData.technical.data.sma50 ? `SMA50: ${stockData.technical.data.sma50.toFixed(2)}` : 'N/D'],
                          ['Precio > SMA 200', stockData.technical.criteria.aboveSMA200, stockData.technical.data.sma200 ? `SMA200: ${stockData.technical.data.sma200.toFixed(2)}` : 'N/D'],
                          ['RSC Mansfield > 0', stockData.technical.criteria.mansfieldPositive, Number.isFinite(stockData.technical.data.rscMansfield) ? `RSC: ${stockData.technical.data.rscMansfield.toFixed(3)}` : 'N/D'],
                          ['CAGR > S&P 500', stockData.technical.criteria.cagrBeatsSP500, stockData.technical.data.periodUsed ? `${stockData.technical.data.periodUsed}: ${(stockData.technical.data.stockCagr * 100).toFixed(2)}% vs ${(stockData.technical.data.sp500Cagr * 100).toFixed(2)}%` : 'N/D'],
                        ].map(([label, ok, value]) => (
                          <div key={label} className={`piotroski-check-item ${ok ? 'met' : 'unmet'}`}>
                            <span className={ok ? 'piotroski-icon-check' : 'piotroski-icon-uncheck'}>{ok ? '✓' : '✗'}</span>
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{label}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="valuation-compare-card">
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        El análisis técnico no está disponible temporalmente para este ticker.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: 2D Value/Quality Matrix */}
            {activeTab === 'matrix' && (
              <div style={{ height: '100%' }}>
                <MatrixChart currentStock={stockData} comparisonStocks={comparisonStocks} />
              </div>
            )}

            {/* Tab: Weekly Screener */}
            {activeTab === 'screener' && (
              <div className="detail-section animate-fade-in">
                <div>
                  <h3 className="section-title"><BarChart3 size={18} /> Screener Semanal Top 50</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Ranking cacheado y recalculado automáticamente cada sábado a primera hora mediante GitHub Actions. Así se evita consumir límites de Netlify Free con cientos de cálculos en tiempo real.
                  </p>
                  {loadingScreener && (
                    <div className="skeleton" style={{ height: '180px', borderRadius: '12px' }} />
                  )}
                  {screenerError && (
                    <div className="error-panel"><AlertTriangle size={18} /><span>{screenerError}</span></div>
                  )}
                  {screenerData && !loadingScreener && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <span>Última actualización: <strong style={{ color: 'var(--text-primary)' }}>{screenerData.generatedAt ? new Date(screenerData.generatedAt).toLocaleString('es-ES') : 'N/D'}</strong></span>
                        <span>Universo: <strong style={{ color: 'var(--text-primary)' }}>{screenerData.universeCount || 'N/D'} tickers</strong></span>
                      </div>
                      <div className="peers-table-wrapper">
                        <table className="peers-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Ticker</th>
                              <th>Empresa</th>
                              <th>Global</th>
                              <th>Salud</th>
                              <th>Moat</th>
                              <th>Crec.</th>
                              <th>Val.</th>
                              <th>Técnico</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(screenerData.top50 || []).map(row => (
                              <tr key={row.symbol}>
                                <td className="highlight">{row.rank}</td>
                                <td className="highlight"><span className="peers-ticker-link" onClick={() => fetchStockData(row.symbol)}>{row.symbol}</span></td>
                                <td style={{ color: 'var(--text-secondary)' }}>{row.name || 'N/D'}</td>
                                <td className="highlight" style={{ color: row.globalScore >= 70 ? 'var(--rating-high)' : row.globalScore >= 50 ? 'var(--rating-mid)' : 'var(--rating-low)' }}>{row.globalScore}</td>
                                <td>{row.financialHealthScore ?? 'N/D'}</td>
                                <td>{row.profitabilityScore ?? 'N/D'}</td>
                                <td>{row.growthScore ?? 'N/D'}</td>
                                <td>{row.valuationScore ?? 'N/D'}</td>
                                <td>{row.technicalScore ?? 'N/D'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: AI Reports Panel */}
            {activeTab === 'ai' && (
              <div className="ai-report-panel">
                <div className="ai-report-header">
                  <h3 className="section-title" style={{ border: 'none', padding: 0, margin: 0 }}>
                    🔮 Tesis de Inversión de IA
                  </h3>
                  <div className="ai-badge-row">
                    <span className="ai-status-badge">
                      <Cpu size={12} /> {geminiKey ? 'Gemini 2.5 Flash' : 'Motor Experto Local'}
                    </span>
                  </div>
                </div>

                {loadingAI ? (
                  <div className="skeleton" style={{ padding: '2rem', borderRadius: '12px' }}>
                    <div className="skeleton-title" style={{ width: '40%' }}></div>
                    <div className="skeleton-text"></div>
                    <div className="skeleton-text"></div>
                    <div className="skeleton-text" style={{ width: '90%' }}></div>
                    <div className="skeleton-text" style={{ width: '60%' }}></div>
                  </div>
                ) : (
                  <div 
                    className="ai-markdown-content"
                    dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(aiReport) }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !stockData && (
        <div className="empty-state">
          <TrendingUp className="empty-state-icon" size={60} />
          <h2 className="empty-state-title">Introduce un Ticker para comenzar</h2>
          <p>
            Obtén un informe financiero profesional e instantáneo puntuando la calidad del balance, márgenes, crecimiento y valoración de cualquier acción cotizada.
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
