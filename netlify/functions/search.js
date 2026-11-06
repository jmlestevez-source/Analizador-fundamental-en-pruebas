// netlify/functions/search.js
// Serverless proxy for Yahoo Finance ticker search/autocomplete
// Replaces the vite.config.js /api/search proxy for production/Netlify deployments

export const handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  // Ticker search results are essentially static: cache 24h at the CDN
  // (durable = one shared copy across edge nodes) so an autocomplete is
  // not one function invocation per keystroke-pause.
  const cacheHeaders = {
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=3600',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
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
      headers: { ...corsHeaders, ...cacheHeaders },
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
