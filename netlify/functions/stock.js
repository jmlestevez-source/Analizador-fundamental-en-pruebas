// netlify/functions/stock.js
// Serverless proxy for Yahoo Finance quoteSummary + Finviz scraping
// Replaces the vite.config.js proxy for production/Netlify deployments

export const handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Extract ticker from path: /.netlify/functions/stock/AAPL
  const pathParts = (event.path || '').split('/');
  const ticker = pathParts[pathParts.length - 1]?.toUpperCase();

  if (!ticker) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Ticker symbol is required' }),
    };
  }

  let yahooData = null;
  let finvizData = null;

  // ── Yahoo Finance: cookie-crumb handshake ──────────────────────────────────
  try {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Step 1: get A3 cookie
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
    const setCookie = cookieRes.headers.get('set-cookie') || '';
    const cookieMatch = setCookie.match(/A3=[^;]+/);
    const cookies = cookieMatch ? cookieMatch[0] : '';

    // Step 2: get crumb
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookies },
    });
    if (!crumbRes.ok) throw new Error(`Crumb fetch failed (${crumbRes.status})`);
    const crumb = await crumbRes.text();

    // Step 3: fetch quote summary
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile,financialData,defaultKeyStatistics,summaryDetail,price&crumb=${crumb}`;
    const summaryRes = await fetch(summaryUrl, {
      headers: { 'User-Agent': UA, Cookie: cookies },
    });
    yahooData = await summaryRes.json();
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({
        quoteSummary: {
          error: {
            code: 'YAHOO_ERROR',
            description: `Error al obtener datos de Yahoo Finance: ${err.message}`,
          },
        },
      }),
    };
  }

  // ── Finviz scraping (US tickers only) ─────────────────────────────────────
  if (!ticker.includes('.')) {
    try {
      const fvRes = await fetch(`https://finviz.com/quote?t=${ticker}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      if (fvRes.ok) {
        const html = await fvRes.text();
        const regex = /snapshot-td-label">([^<]+)<\/div><\/td>\s*<td[^>]*>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/g;
        let match;
        finvizData = {};
        while ((match = regex.exec(html)) !== null) {
          const label = match[1].trim();
          const val = match[2].replace(/<[^>]*>/g, '').trim();
          finvizData[label] = val;
        }
      }
    } catch (fvErr) {
      console.warn(`Finviz scraping failed for ${ticker}:`, fvErr.message);
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ...yahooData, finviz: finvizData }),
  };
};
