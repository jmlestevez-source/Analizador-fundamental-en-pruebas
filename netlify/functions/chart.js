// netlify/functions/chart.js
// Serverless proxy for Yahoo Finance chart/historical data
// Replaces the vite.config.js /api/chart proxy for production/Netlify deployments

export const handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Extract params from path: /.netlify/functions/chart/AAPL/2y/1wk
  const pathParts = (event.path || '').split('/');
  // pathParts will be like ['', '.netlify', 'functions', 'chart', 'AAPL', '2y', '1wk']
  const funcIndex = pathParts.indexOf('chart');
  const ticker = pathParts[funcIndex + 1]?.toUpperCase();
  const range = pathParts[funcIndex + 2] || '2y';
  const interval = pathParts[funcIndex + 3] || '1wk';

  if (!ticker) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Ticker symbol is required' }),
    };
  }

  try {
    const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;
    const chartRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!chartRes.ok) {
      throw new Error(`Yahoo chart returned status ${chartRes.status}`);
    }

    const chartData = await chartRes.json();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(chartData),
    };
  } catch (err) {
    console.error(`Chart proxy error for ${ticker}:`, err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
