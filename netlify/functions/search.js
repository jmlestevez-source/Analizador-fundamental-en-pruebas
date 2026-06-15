// netlify/functions/search.js
// Serverless proxy for Yahoo Finance ticker search/autocomplete
// Replaces the vite.config.js /api/search proxy for production/Netlify deployments

export const handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const query = event.queryStringParameters?.q || '';

  if (!query) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ quotes: [] }),
    };
  }

  try {
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!searchRes.ok) {
      throw new Error(`Yahoo search returned status ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(searchData),
    };
  } catch (err) {
    console.error(`Search proxy error for query "${query}":`, err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message, quotes: [] }),
    };
  }
};
