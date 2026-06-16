// netlify/functions/technical.js
// Serverless technical analysis and dividend-yield valuation built from Yahoo Finance chart data.
// This replaces any yfinance-in-browser approach for Netlify production.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const handler = async (event) => {
  const symbol = extractSymbol(event);

  if (!symbol) {
    return response(400, { error: 'Ticker symbol is required' });
  }

  try {
    const [stockChart, sp500Chart, stockWeeklyChart, sp500WeeklyChart] = await Promise.all([
      fetchChart(symbol, '10y', '1d', true),
      fetchChart('^GSPC', '10y', '1d', false),
      fetchChart(symbol, '10y', '1wk', false),
      fetchChart('^GSPC', '10y', '1wk', false),
    ]);

    const stockSeries = extractCloseSeries(stockChart);
    const sp500Series = extractCloseSeries(sp500Chart);
    const stockWeeklySeries = extractCloseSeries(stockWeeklyChart);
    const sp500WeeklySeries = extractCloseSeries(sp500WeeklyChart);

    if (stockSeries.length < 220 || sp500Series.length < 220) {
      return response(422, {
        symbol,
        error: 'No hay suficientes datos históricos para calcular el análisis técnico.',
      });
    }

    const technical = calculateTechnicalScore(symbol, stockSeries, sp500Series, stockWeeklySeries, sp500WeeklySeries, stockChart);
    const geraldineWeiss = calculateGeraldineWeiss(stockChart, stockSeries);

    return response(200, {
      ...technical,
      geraldineWeiss,
      generatedAt: new Date().toISOString(),
    }, 60 * 60 * 6);
  } catch (err) {
    console.error(`Technical analysis failed for ${symbol}:`, err);
    return response(500, {
      symbol,
      error: err.message || 'Error calculando análisis técnico.',
    });
  }
};

function extractSymbol(event) {
  const qs = event.queryStringParameters?.symbol || event.queryStringParameters?.ticker;
  if (qs) return normalizeYahooSymbol(qs);

  const pathParts = (event.path || '').split('/').filter(Boolean);
  const idx = pathParts.findIndex(p => p === 'technical');
  const fromPath = idx >= 0 ? pathParts[idx + 1] : pathParts[pathParts.length - 1];
  return fromPath ? normalizeYahooSymbol(fromPath) : '';
}

async function fetchChart(symbol, range = '10y', interval = '1d', includeEvents = true) {
  const events = includeEvents ? '&events=div%2Csplits' : '';
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}${events}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Yahoo chart returned status ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo no devolvió histórico para ${symbol}`);
  return result;
}

function extractCloseSeries(chartResult) {
  const timestamps = chartResult.timestamp || [];
  const quote = chartResult.indicators?.quote?.[0] || {};
  const closes = quote.close || [];

  return timestamps
    .map((timestamp, index) => ({ date: new Date(timestamp * 1000), close: closes[index] }))
    .filter(x => Number.isFinite(x.close) && x.close > 0)
    .sort((a, b) => a.date - b.date);
}

function calculateTechnicalScore(symbol, stockSeries, sp500Series, stockWeeklySeries, sp500WeeklySeries, stockChart) {
  const closes = stockSeries.map(x => x.close);
  const chartMarketPrice = stockChart?.meta?.regularMarketPrice;
  const latestPrice = Number.isFinite(chartMarketPrice) && chartMarketPrice > 0 ? chartMarketPrice : last(stockSeries).close;
  const latestDailyClose = last(stockSeries).close;
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  // Criteria compare the current quoted price (regularMarketPrice when Yahoo provides it)
  // against the daily moving averages. This avoids false negatives during the session
  // where the latest completed daily close is below the SMA but the live quote is above it.
  const aboveSMA50 = Number.isFinite(sma50) && latestPrice > sma50;
  const aboveSMA200 = Number.isFinite(sma200) && latestPrice > sma200;

  // AFL reference formula supplied by the user:
  // rs = Close / Foreign("^GSPC", "Close"); RSCMansfield = 10 * ((rs / MA(rs, 52)) - 1)
  // Use Yahoo weekly bars directly (1wk), not daily bars resampled in JS, and align by ISO week.
  const rscMansfield = calculateMansfieldRSC(stockWeeklySeries, sp500WeeklySeries, 52);
  const mansfieldPositive = Number.isFinite(rscMansfield) && rscMansfield > 0;

  const cagr = calculateBestAvailableCagrComparison(stockSeries, sp500Series);
  const cagrBeatsSP500 = cagr && cagr.stockCagr > cagr.sp500Cagr;

  const score =
    (aboveSMA50 ? 25 : 0) +
    (aboveSMA200 ? 25 : 0) +
    (mansfieldPositive ? 25 : 0) +
    (cagrBeatsSP500 ? 25 : 0);

  return {
    symbol,
    score,
    status: score >= 75 ? 'Fuerte' : score >= 50 ? 'Neutral / Constructiva' : 'Débil',
    criteria: {
      aboveSMA50,
      aboveSMA200,
      mansfieldPositive,
      cagrBeatsSP500,
    },
    data: {
      price: latestPrice,
      latestDailyClose,
      sma50,
      sma200,
      rscMansfield,
      stockCagr: cagr?.stockCagr ?? null,
      sp500Cagr: cagr?.sp500Cagr ?? null,
      periodUsed: cagr?.periodUsed ?? null,
    },
  };
}

function calculateGeraldineWeiss(chartResult, stockSeries) {
  const dividends = Object.values(chartResult.events?.dividends || {})
    .map(d => ({ date: new Date(d.date * 1000), amount: Number(d.amount) }))
    .filter(d => Number.isFinite(d.amount) && d.amount > 0)
    .sort((a, b) => a.date - b.date);

  if (dividends.length < 8 || stockSeries.length < 500) {
    return {
      available: false,
      score: null,
      status: 'No aplicable',
      explanation: 'No hay historial de dividendos suficiente para aplicar el método clásico de Geraldine Weiss.',
    };
  }

  const yearlyDividends = new Map();
  for (const div of dividends) {
    const year = div.date.getUTCFullYear();
    yearlyDividends.set(year, (yearlyDividends.get(year) || 0) + div.amount);
  }

  const latestPrice = last(stockSeries).close;
  const lastFourDividends = dividends.slice(-4).reduce((sum, d) => sum + d.amount, 0);
  const currentYield = latestPrice > 0 ? lastFourDividends / latestPrice : null;

  const currentYear = new Date().getUTCFullYear();
  const historicalYields = [];
  for (const [year, annualDividend] of yearlyDividends.entries()) {
    if (year >= currentYear) continue; // avoid incomplete current year
    const yearEndPrice = findLastCloseOnOrBefore(stockSeries, new Date(Date.UTC(year, 11, 31)));
    if (yearEndPrice?.close > 0 && annualDividend > 0) historicalYields.push(annualDividend / yearEndPrice.close);
  }

  const usableYields = historicalYields.slice(-10);
  if (!currentYield || usableYields.length < 5) {
    return {
      available: false,
      score: null,
      status: 'No aplicable',
      currentYield,
      explanation: 'La acción reparte dividendos, pero no hay datos históricos suficientes para comparar su rentabilidad actual con la media histórica.',
    };
  }

  const historicalAverageYield = usableYields.reduce((a, b) => a + b, 0) / usableYields.length;
  const ratio = currentYield / historicalAverageYield;

  let score;
  let status;
  if (ratio >= 1.25) { score = 100; status = 'Potencialmente infravalorada por dividendo'; }
  else if (ratio >= 1.05) { score = 75; status = 'Ligeramente infravalorada por dividendo'; }
  else if (ratio >= 0.95) { score = 50; status = 'Valoración razonable por dividendo'; }
  else if (ratio >= 0.75) { score = 25; status = 'Algo sobrevalorada por dividendo'; }
  else { score = 0; status = 'Sobrevalorada por dividendo'; }

  return {
    available: true,
    score,
    status,
    currentYield,
    historicalAverageYield,
    ratio,
    years: usableYields.length,
    explanation: `Método Geraldine Weiss: compara la rentabilidad por dividendo actual (${formatPercent(currentYield)}) con su media histórica aproximada de ${usableYields.length} años (${formatPercent(historicalAverageYield)}).`,
  };
}

function calculateMansfieldRSC(stockWeekly, sp500Weekly, period = 52) {
  const aligned = alignByIsoWeek(stockWeekly, sp500Weekly);
  const rs = aligned
    .map(x => x.stockClose / x.sp500Close)
    .filter(v => Number.isFinite(v) && v > 0);
  if (rs.length < period + 1) return null;

  // Mansfield uses the current RS divided by the moving average of RS over the period.
  // The MA includes the current weekly bar, matching the usual AFL MA(rs, period) behaviour.
  const currentRS = last(rs);
  const rsMA = sma(rs, period);
  if (!Number.isFinite(rsMA) || rsMA === 0) return null;
  return 10 * ((currentRS / rsMA) - 1);
}

function alignByIsoWeek(stockSeries, sp500Series) {
  const sp500ByWeek = new Map(sp500Series.map(x => [toWeekKey(x.date), x.close]));
  return stockSeries
    .map(stock => {
      const sp500Close = sp500ByWeek.get(toWeekKey(stock.date));
      return sp500Close ? { date: stock.date, stockClose: stock.close, sp500Close } : null;
    })
    .filter(Boolean);
}

function calculateBestAvailableCagrComparison(stockSeries, sp500Series) {
  return calculateCagrComparison(stockSeries, sp500Series, 10) || calculateCagrComparison(stockSeries, sp500Series, 5);
}

function calculateCagrComparison(stockSeries, sp500Series, years) {
  const endStock = last(stockSeries);
  const endSP500 = last(sp500Series);
  const startDate = new Date(endStock.date);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - years);
  const startStock = findClosestAfter(stockSeries, startDate);
  const startSP500 = findClosestAfter(sp500Series, startDate);
  if (!startStock || !startSP500 || startStock.close <= 0 || startSP500.close <= 0) return null;
  return {
    stockCagr: Math.pow(endStock.close / startStock.close, 1 / years) - 1,
    sp500Cagr: Math.pow(endSP500.close / startSP500.close, 1 / years) - 1,
    periodUsed: `${years}y`,
  };
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((acc, value) => acc + value, 0) / period;
}

function findClosestAfter(series, targetDate) {
  return series.find(x => x.date >= targetDate);
}

function findLastCloseOnOrBefore(series, targetDate) {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].date <= targetDate) return series[i];
  }
  return null;
}

function getISOWeek(date) {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}

function normalizeYahooSymbol(symbol) {
  return String(symbol).trim().toUpperCase();
}

function toWeekKey(date) {
  return `${date.getUTCFullYear()}-${getISOWeek(date)}`;
}


function last(array) {
  return array[array.length - 1];
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'N/D';
  return `${(value * 100).toFixed(2)}%`;
}

function response(statusCode, body, maxAgeSeconds = 60 * 60) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
    },
    body: JSON.stringify(body),
  };
}
