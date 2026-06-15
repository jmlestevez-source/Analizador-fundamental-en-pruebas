import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'yahoo-finance-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/stock/')) {
            const ticker = req.url.split('/').pop().toUpperCase();
            console.log(`[Proxy] Request received for: ${ticker}`);
            
            let yahooData = null;
            let finvizData = null;
            
            // 1. Fetch Yahoo Finance data using cookie-crumb handshake
            try {
              console.log(`[Proxy] Initiating Yahoo Finance handshake for ${ticker}...`);
              // Step 1: Handshake with fc.yahoo.com to set cookies
              const cookieResponse = await fetch('https://fc.yahoo.com', {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
              });
              
              const setCookieHeader = cookieResponse.headers.get('set-cookie');
              let cookies = '';
              if (setCookieHeader) {
                const match = setCookieHeader.match(/A3=[^;]+/);
                if (match) {
                  cookies = match[0];
                }
              }
              
              // Step 2: Request the secure crumb
              const crumbResponse = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Cookie': cookies
                }
              });
              
              if (!crumbResponse.ok) {
                throw new Error(`Failed to retrieve crumb (Status ${crumbResponse.status})`);
              }
              const crumb = await crumbResponse.text();
              
              // Step 3: Fetch Quote Summary
              const yahooUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile,financialData,defaultKeyStatistics,summaryDetail,price&crumb=${crumb}`;
              console.log(`[Proxy] Fetching quote summary from Yahoo...`);
              const summaryResponse = await fetch(yahooUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Cookie': cookies
                }
              });
              
              yahooData = await summaryResponse.json();
            } catch (err) {
              console.error(`[Proxy Yahoo Error] failed fetching ${ticker}:`, err.message);
              // Forward Yahoo Finance error if it failed completely
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                quoteSummary: { 
                  error: { 
                    code: 'YAHOO_ERROR', 
                    description: `Error al obtener datos de Yahoo Finance: ${err.message}` 
                  } 
                } 
              }));
              return;
            }

            // 2. Fetch and Scrape Finviz (only for US stocks, i.e., tickers without dots)
            if (!ticker.includes('.')) {
              try {
                const finvizUrl = `https://finviz.com/quote?t=${ticker}`;
                console.log(`[Proxy] Scraper fetching Finviz page for ${ticker}: ${finvizUrl}`);
                const finvizRes = await fetch(finvizUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                  }
                });
                
                if (finvizRes.ok) {
                  const html = await finvizRes.text();
                  const regex = /snapshot-td-label">([^<]+)<\/div><\/td>\s*<td[^>]*>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/g;
                  let match;
                  finvizData = {};
                  while ((match = regex.exec(html)) !== null) {
                    const label = match[1].trim();
                    let val = match[2].replace(/<[^>]*>/g, '').trim();
                    finvizData[label] = val;
                  }
                  console.log(`[Proxy] Finviz scraping success. Extracted ${Object.keys(finvizData).length} metrics.`);
                } else {
                  console.log(`[Proxy] Finviz returned status ${finvizRes.status} for ${ticker}`);
                }
              } catch (fvErr) {
                console.warn(`[Proxy] Finviz scraping failed for ${ticker}:`, fvErr.message);
              }
            }

            // 3. Respond with combined payload
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ...yahooData,
              finviz: finvizData
            }));
          } else {
            next();
          }
        });
      }
    }
  ],
})
