<div align="center">

# 📈 Antigravity

### Análisis Fundamental Profesional al estilo Warren Buffett & Peter Lynch

Analiza acciones con puntuación de calidad, moat, crecimiento, valoración, análisis técnico, Piotroski F-Score, margen de seguridad, método Geraldine Weiss para dividendos y tesis de inversión con IA.

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)]()
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)]()
[![Netlify](https://img.shields.io/badge/Deployed_on-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)]()

</div>

---

## 🚀 Demo

https://stockanalyzervalue.netlify.app/

---

## ✨ Características principales

| | |
|---|---|
| 🎯 **Score global 0-100** | Media equiponderada de Salud Financiera, Rentabilidad/Moat, Crecimiento, Valoración y Técnico cuando el técnico está disponible. |
| 📈 **Análisis técnico serverless** | Netlify Function que calcula SMA50, SMA200, RSC Mansfield 52 semanas frente a `^GSPC` y CAGR vs. S&P 500 sin usar `yfinance` en el navegador. |
| 💰 **Geraldine Weiss** | Para empresas con dividendos, compara yield actual vs. yield histórico aproximado y muestra veredicto de infravaloración/sobrevaloración por dividendo. |
| 🔎 **Autocomplete mejorado** | Sugerencias por ticker y por nombre completo usando Yahoo Search mediante Netlify Functions. |
| 🧮 **Screener semanal Top 50** | Ranking cacheado de las 50 mejores acciones entre S&P 500, Nasdaq 100 y Russell 1000, actualizado cada sábado por GitHub Actions. |
| 🧠 **Tesis IA con Gemini** | Genera un informe completo en español con tu API Key gratuita. Si no hay clave, usa un motor experto local. |
| 🛡️ **Piotroski F-Score** | Análisis automático de solidez financiera. |
| 💎 **Margen de seguridad** | Cálculo aproximado de valor intrínseco con Graham y DCF. |
| 📊 **Matriz 2D Valor-Calidad** | Visualización de la acción frente a competidores o búsquedas recientes. |

---

## 🛠️ Stack tecnológico

- **Frontend:** React + Vite
- **Backend serverless:** Netlify Functions en Node.js
- **Datos:** Yahoo Finance + Finviz
- **Screener cacheado:** GitHub Actions + JSON estático en `public/data/screener-top-50.json`
- **IA:** Google Gemini 2.5 Flash opcional
- **Estilo:** CSS puro con glassmorphism

---

## ⚙️ Cómo funciona

Cuando buscas un ticker:

1. El frontend llama a `/api/stock/AAPL`.
2. Una Netlify Function obtiene datos fundamentales de Yahoo Finance y Finviz.
3. En paralelo, el frontend llama a `/api/technical/AAPL`.
4. La función técnica descarga históricos de Yahoo Finance y calcula:
   - Precio por encima de SMA50: 25 puntos.
   - Precio por encima de SMA200: 25 puntos.
   - RSC Mansfield semanal de 52 semanas > 0 frente a `^GSPC`: 25 puntos.
   - CAGR de la acción superior al CAGR de `^GSPC` a 10 años o, si no hay datos, a 5 años: 25 puntos.
5. El score global se calcula como media de los bloques disponibles.

No se ejecuta `yfinance` en el navegador. Todo el trabajo que requiere backend se realiza con Netlify Functions o con GitHub Actions.

---

## 🧮 Screener semanal

El screener no se calcula en tiempo real para evitar límites de Netlify Free. Se genera un JSON estático cada sábado mediante GitHub Actions:

```bash
npm run screener:weekly
```

El workflow está en:

```txt
.github/workflows/weekly-screener.yml
```

El archivo cacheado queda en:

```txt
public/data/screener-top-50.json
```

Fuentes del universo:

- S&P 500: https://en.wikipedia.org/wiki/List_of_S%26P_500_companies
- Nasdaq 100: https://en.wikipedia.org/wiki/Nasdaq-100
- Russell 1000: https://en.wikipedia.org/wiki/Russell_1000_Index

---

## 💻 Instalación local

```bash
# 1. Clona el repo
git clone https://github.com/jmlestevez-source/Analizador-Fundamental-Acciones.git

# 2. Entra en la carpeta
cd Analizador-Fundamental-Acciones

# 3. Instala dependencias
npm install

# 4. Inicia en modo desarrollo
npm run dev
```

---

## 🏗️ Build

```bash
npm run build
```

---

## 🌐 Netlify

`netlify.toml` ya contiene los redirects necesarios:

- `/api/stock/:ticker` → `/.netlify/functions/stock/:ticker`
- `/api/chart/:ticker/:range/:interval` → `/.netlify/functions/chart/:ticker/:range/:interval`
- `/api/search` → `/.netlify/functions/search`
- `/api/technical/:ticker` → `/.netlify/functions/technical/:ticker`

---

## Nota importante sobre datos

Yahoo Finance y Finviz son fuentes no oficiales para algunos endpoints/scraping. Si una fuente limita temporalmente peticiones, la app intenta degradar de forma controlada, pero puede haber tickers con datos incompletos.
