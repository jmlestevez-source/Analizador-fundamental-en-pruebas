#!/usr/bin/env node
// Weekly static screener generator.
// It fetches S&P 500, Nasdaq 100 and Russell 1000 constituents from Wikipedia,
// scores them with the same five equally weighted blocks used by the frontend,
// and writes public/data/screener-top-50.json.

const SOURCES = {
  sp500: 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
  nasdaq100: 'https://en.wikipedia.org/wiki/Nasdaq-100',
  russell1000: 'https://en.wikipedia.org/wiki/Russell_1000_Index',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const MAX_CONCURRENCY = Number(process.env.SCREENER_CONCURRENCY || 3);
const LIMIT = Number(process.env.SCREENER_LIMIT || 0); // 0 = all
let yahooAuthPromise = null;

main().catch(err => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const constituents = await getUniverse();
  const universe = LIMIT > 0 ? constituents.slice(0, LIMIT) : constituents;
  console.log(`Universe: ${universe.length} unique tickers`);

  const sp500Series = await getChartSeries('^GSPC', '10y', '1d');
  const rows = [];
  let done = 0;

  await mapLimit(universe, MAX_CONCURRENCY, async (item) => {
    try {
      const row = await scoreTicker(item, sp500Series);
      if (row) rows.push(row);
    } catch (err) {
      console.warn(`[skip] ${item.symbol}: ${err.message}`);
    } finally {
      done += 1;
      if (done % 25 === 0) console.log(`Processed ${done}/${universe.length}`);
      await sleep(200);
    }
  });

  rows.sort((a, b) => b.globalScore - a.globalScore || b.qualityScore - a.qualityScore || b.technicalScore - a.technicalScore);
  const top50 = rows.slice(0, 50).map((row, i) => ({ rank: i + 1, ...row }));

  const output = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    universeCount: universe.length,
    scoredCount: rows.length,
    methodology: 'Average of financial health, profitability/moat, growth, valuation and technical scores. Technical score uses SMA50, SMA200, 52-week Mansfield RSC vs ^GSPC and 5y/10y CAGR vs ^GSPC.',
    top50,
  };

  await import('node:fs/promises').then(fs => fs.writeFile('public/data/screener-top-50.json', JSON.stringify(output, null, 2) + '\n'));
  console.log(`Wrote public/data/screener-top-50.json with ${top50.length} rows`);
}

async function getUniverse() {
  const all = [];
  for (const [source, url] of Object.entries(SOURCES)) {
    const html = await fetchText(url);
    const parsed = parseConstituents(html, source);
    console.log(`${source}: ${parsed.length}`);
    all.push(...parsed);
  }
  const bySymbol = new Map();
  for (const item of all) {
    const symbol = normalizeYahooSymbol(item.symbol);
    if (!symbol || symbol.includes('^')) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, { ...item, symbol, sources: [item.source] });
    else bySymbol.get(symbol).sources.push(item.source);
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function parseConstituents(html, source) {
  const tableMatch = html.match(/<table[^>]+id="constituents"[\s\S]*?<\/table>/i) || html.match(/<table[^>]+class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const table = tableMatch[0];
  const headerRow = table.match(/<tr[\s\S]*?<\/tr>/i)?.[0] || '';
  const headers = [...headerRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => cleanHtml(m[1]));
  const symbolIndex = findHeaderIndex(headers, ['ticker', 'symbol']);
  const nameIndex = findHeaderIndex(headers, ['security', 'company', 'company name', 'name']);
  if (symbolIndex < 0) return [];
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1).map(row => {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => cleanHtml(m[1]));
    return { symbol: cells[symbolIndex], name: cells[nameIndex] || cells[symbolIndex], source };
  }).filter(x => x.symbol);
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex(h => candidates.some(c => h.toLowerCase().includes(c)));
}

async function scoreTicker(item, sp500Series) {
  const [summary, chart] = await Promise.all([
    getQuoteSummary(item.symbol),
    getChartSeries(item.symbol, '10y', '1d').catch(() => null),
  ]);
  const data = summary?.quoteSummary?.result?.[0];
  if (!data) return null;

  const financialData = data.financialData || {};
  const keyStats = data.defaultKeyStatistics || {};
  const summaryDetail = data.summaryDetail || {};
  const price = data.price || {};

  const totalCash = raw(financialData.totalCash, 0);
  const totalDebt = raw(financialData.totalDebt, 0);
  const ocf = raw(financialData.operatingCashflow, 0);
  const netCash = totalCash - totalDebt;
  let netCashScore = netCash > 0 ? 100 : ocf > 0 ? scoreThreshold(Math.abs(netCash) / ocf, [[1.5,80],[3,60],[5,40]], 20, true) : 15;

  const de = raw(financialData.debtToEquity, null);
  let debtToEquityScore = de == null ? (totalDebt === 0 ? 100 : 50) : scoreDebtToEquity(de > 5 ? de : de * 100);
  const currentRatio = raw(financialData.currentRatio, null);
  const currentRatioScore = currentRatio == null ? 50 : scoreThreshold(currentRatio, [[2,100],[1.5,85],[1.1,65],[0.8,40]], 15, false);
  const quickRatio = raw(financialData.quickRatio, null);
  const quickRatioScore = quickRatio == null ? null : scoreThreshold(quickRatio, [[1.5,100],[1,85],[0.7,60],[0.5,35]], 15, false);
  const healthScores = [netCashScore, debtToEquityScore, currentRatioScore, quickRatioScore].filter(Number.isFinite);
  const financialHealthScore = avg(healthScores);

  const operatingMargin = raw(financialData.operatingMargins, null);
  const grossMargin = raw(financialData.grossMargins, null);
  const roe = raw(financialData.returnOnEquity, null);
  const roa = raw(financialData.returnOnAssets, null);
  const fcf = raw(financialData.freeCashflow, 0);
  const revenue = raw(financialData.totalRevenue, 0);
  const fcfMargin = revenue > 0 ? fcf / revenue : null;
  const profitabilityScore = avg([
    scoreMargin(operatingMargin, [[0.25,100],[0.15,85],[0.08,60],[0.03,35]], 10),
    scoreMargin(grossMargin, [[0.60,100],[0.40,85],[0.20,60],[0.10,35]], 10),
    scoreMargin(roe, [[0.25,100],[0.15,85],[0.08,60],[0,30]], 5),
    scoreMargin(roa, [[0.12,100],[0.07,85],[0.04,60],[0,30]], 5),
    scoreMargin(fcfMargin, [[0.20,100],[0.12,85],[0.05,60],[0,35]], 10),
  ]);

  const revenueGrowth = raw(financialData.revenueGrowth, null);
  const earningsGrowth = raw(financialData.earningsGrowth, null);
  const growthScore = avg([
    scoreMargin(revenueGrowth, [[0.20,100],[0.10,85],[0.05,70],[0,50]], 25),
    scoreMargin(earningsGrowth, [[0.25,100],[0.12,85],[0.05,70],[0,50]], 20),
  ]);

  const trailingPE = raw(summaryDetail.trailingPE, raw(keyStats.trailingPE, null));
  const forwardPE = raw(summaryDetail.forwardPE, raw(keyStats.forwardPE, null));
  const pegRatio = raw(keyStats.pegRatio, null);
  const evEbitda = raw(keyStats.enterpriseToEbitda, null);
  const valuationParts = [];
  if (trailingPE) valuationParts.push(scoreValuationRatio(trailingPE, [[12,95],[18,85],[25,65],[35,40]], 15));
  if (forwardPE) valuationParts.push(scoreValuationRatio(forwardPE, [[10,95],[15,85],[22,65],[30,40]], 15));
  if (pegRatio != null) valuationParts.push(scoreValuationRatio(pegRatio, [[1,100],[1.5,85],[2.2,60],[3,35]], 15));
  if (evEbitda) valuationParts.push(scoreValuationRatio(evEbitda, [[8,95],[12,80],[18,60],[25,35]], 15));
  const valuationScore = valuationParts.length ? avg(valuationParts) : 50;

  const technicalScore = chart ? calculateTechnicalScore(chart, sp500Series) : 50;
  const qualityScore = Math.round(financialHealthScore * 0.3 + profitabilityScore * 0.4 + growthScore * 0.3);
  const globalScore = avg([financialHealthScore, profitabilityScore, growthScore, valuationScore, technicalScore]);

  return {
    symbol: item.symbol,
    name: price.longName || price.shortName || item.name,
    sources: item.sources,
    globalScore,
    qualityScore,
    financialHealthScore,
    profitabilityScore,
    growthScore,
    valuationScore,
    technicalScore,
    price: raw(price.regularMarketPrice, null),
    currency: price.currency || 'USD',
  };
}

async function getQuoteSummary(symbol) {
  const modules = 'assetProfile,financialData,defaultKeyStatistics,summaryDetail,price';
  const auth = await getYahooAuth();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: auth.cookie } });
  if (!res.ok) throw new Error(`quoteSummary ${res.status}`);
  return res.json();
}

async function getYahooAuth() {
  if (yahooAuthPromise) return yahooAuthPromise;
  yahooAuthPromise = (async () => {
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
    const setCookie = cookieRes.headers.get('set-cookie') || '';
    const cookie = (setCookie.match(/A3=[^;]+/) || [''])[0];
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
    });
    if (!crumbRes.ok) throw new Error(`crumb ${crumbRes.status}`);
    const crumb = (await crumbRes.text()).trim();
    return { cookie, crumb };
  })();
  return yahooAuthPromise;
}

async function getChartSeries(symbol, range, interval) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`chart ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('no chart');
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  return timestamps.map((t, i) => ({ date: new Date(t * 1000), close: closes[i] })).filter(x => Number.isFinite(x.close) && x.close > 0);
}

function calculateTechnicalScore(stockSeries, sp500Series) {
  if (!stockSeries || stockSeries.length < 220) return 50;
  const closes = stockSeries.map(x => x.close);
  const price = closes.at(-1);
  let score = 0;
  if (price > sma(closes, 50)) score += 25;
  if (price > sma(closes, 200)) score += 25;
  const rsc = mansfield(toWeekly(stockSeries), toWeekly(sp500Series), 52);
  if (Number.isFinite(rsc) && rsc > 0) score += 25;
  const cagr = cagrComparison(stockSeries, sp500Series, 10) || cagrComparison(stockSeries, sp500Series, 5);
  if (cagr && cagr.stock > cagr.sp500) score += 25;
  return score;
}

function mansfield(stockW, spW, period) {
  const sp = new Map(spW.map(x => [x.date.toISOString().slice(0,10), x.close]));
  const rs = stockW.map(x => x.close / sp.get(x.date.toISOString().slice(0,10))).filter(Number.isFinite);
  if (rs.length < period + 1) return null;
  return 10 * ((rs.at(-1) / sma(rs, period)) - 1);
}

function cagrComparison(stock, sp, years) {
  const end = stock.at(-1);
  const startDate = new Date(end.date); startDate.setUTCFullYear(startDate.getUTCFullYear() - years);
  const s0 = stock.find(x => x.date >= startDate);
  const p0 = sp.find(x => x.date >= startDate);
  if (!s0 || !p0) return null;
  return { stock: Math.pow(end.close / s0.close, 1 / years) - 1, sp500: Math.pow(sp.at(-1).close / p0.close, 1 / years) - 1 };
}

function toWeekly(series) {
  const m = new Map();
  for (const x of series) m.set(`${x.date.getUTCFullYear()}-${isoWeek(x.date)}`, x);
  return [...m.values()];
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - start) / 86400000) + 1) / 7);
}

function scoreDebtToEquity(v) { if (v <= 25) return 100; if (v <= 50) return 85; if (v <= 100) return 65; if (v <= 150) return 45; if (v <= 200) return 25; return 10; }
function scoreMargin(v, thresholds, fallback) { if (v == null || Number.isNaN(v)) return 50; for (const [t, score] of thresholds) if (v >= t) return score; return fallback; }
function scoreThreshold(v, thresholds, fallback, lowerIsBetter) { for (const [t, score] of thresholds) if (lowerIsBetter ? v <= t : v >= t) return score; return fallback; }
function scoreValuationRatio(v, thresholds, fallback) { if (v <= 0) return 5; for (const [t, score] of thresholds) if (v <= t) return score; return fallback; }
function sma(values, period) { if (!values || values.length < period) return null; return values.slice(-period).reduce((a,b)=>a+b,0)/period; }
function avg(values) { const xs = values.filter(Number.isFinite); return xs.length ? Math.round(xs.reduce((a,b)=>a+b,0)/xs.length) : 50; }
function raw(obj, fallback) { return obj?.raw ?? fallback; }
function normalizeYahooSymbol(symbol) { return String(symbol || '').trim().toUpperCase(); }
function cleanHtml(value) { return String(value).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\[[^\]]*\]/g, '').trim(); }
async function fetchText(url) { const res = await fetch(url, { headers: { 'User-Agent': UA } }); if (!res.ok) throw new Error(`${url} ${res.status}`); return res.text(); }
async function mapLimit(items, limit, mapper) { const executing = new Set(); for (const item of items) { const p = Promise.resolve().then(() => mapper(item)); executing.add(p); p.finally(() => executing.delete(p)); if (executing.size >= limit) await Promise.race(executing); } await Promise.all(executing); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
