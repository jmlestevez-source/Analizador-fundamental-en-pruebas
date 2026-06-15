import React, { useState } from 'react';

const MatrixChart = ({ currentStock, comparisonStocks = [] }) => {
  const [hoveredStock, setHoveredStock] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Canvas size and padding inside SVG
  const width = 500;
  const height = 400;
  const paddingLeft = 50;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 50;

  // Chart coordinates converters
  // X = Valuation Score (0 - 100) -> 100 is "cheap/good value", plotted on right
  const getX = (valScore) => {
    const range = width - paddingLeft - paddingRight;
    return paddingLeft + (valScore / 100) * range;
  };

  // Y = Quality Score (0 - 100) -> 100 is "high quality", plotted on top
  const getY = (qualScore) => {
    const range = height - paddingTop - paddingBottom;
    return height - paddingBottom - (qualScore / 100) * range;
  };

  // Compile all stocks to show (current + historical comparison list)
  const allStocks = [];
  if (currentStock) {
    allStocks.push({
      ...currentStock,
      isCurrent: true,
    });
  }

  comparisonStocks.forEach(stock => {
    // Avoid duplicating the current stock
    if (!currentStock || stock.ticker !== currentStock.ticker) {
      allStocks.push({
        ...stock,
        isCurrent: false,
      });
    }
  });

  const handleMouseEnter = (e, stock) => {
    const rect = e.target.getBoundingClientRect();
    const containerRect = e.target.parentNode.parentNode.getBoundingClientRect();
    
    // Position tooltip relative to container
    setTooltipPos({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top
    });
    setHoveredStock(stock);
  };

  const handleMouseLeave = () => {
    setHoveredStock(null);
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3 className="section-title">📊 Matriz de Calidad vs. Valoración</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Las empresas excelentes a buen precio se ubican en el cuadrante superior derecho. Las caras en el superior izquierdo.
      </p>

      <div className="matrix-container">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
          {/* Quadrant backgrounds */}
          {/* Top Left: Expensive Quality (Watchlist) */}
          <rect
            x={getX(0)}
            y={getY(100)}
            width={getX(50) - getX(0)}
            height={getY(50) - getY(100)}
            fill="rgba(168, 85, 247, 0.015)"
          />
          {/* Top Right: Superstar (Buy Zone) */}
          <rect
            x={getX(50)}
            y={getY(100)}
            width={getX(100) - getX(50)}
            height={getY(50) - getY(100)}
            fill="rgba(16, 185, 129, 0.02)"
          />
          {/* Bottom Left: Avoid */}
          <rect
            x={getX(0)}
            y={getY(50)}
            width={getX(50) - getX(0)}
            height={getY(0) - getY(50)}
            fill="rgba(244, 63, 94, 0.015)"
          />
          {/* Bottom Right: Value Trap */}
          <rect
            x={getX(50)}
            y={getY(50)}
            width={getX(100) - getX(50)}
            height={getY(0) - getY(50)}
            fill="rgba(245, 158, 11, 0.015)"
          />

          {/* Grid lines */}
          <line className="matrix-grid-line" x1={getX(0)} y1={getY(50)} x2={getX(100)} y2={getY(50)} />
          <line className="matrix-grid-line" x1={getX(50)} y1={getY(0)} x2={getX(50)} y2={getY(100)} />

          {/* Border axis */}
          <line className="matrix-axis-line" x1={getX(0)} y1={getY(0)} x2={getX(100)} y2={getY(0)} />
          <line className="matrix-axis-line" x1={getX(0)} y1={getY(0)} x2={getX(0)} y2={getY(100)} />

          {/* Quadrant labels */}
          <text x={getX(25)} y={getY(94)} textAnchor="middle" className="matrix-quadrant-label">
            Caro / Calidad (Watchlist)
          </text>
          <text x={getX(75)} y={getY(94)} textAnchor="middle" className="matrix-quadrant-label" fill="var(--rating-high)">
            Superestrella (Compra)
          </text>
          <text x={getX(25)} y={getY(6)} textAnchor="middle" className="matrix-quadrant-label" fill="var(--rating-low)">
            Evitar (Alto Riesgo)
          </text>
          <text x={getX(75)} y={getY(6)} textAnchor="middle" className="matrix-quadrant-label" fill="var(--rating-mid)">
            Trampa de Valor / Especulativa
          </text>

          {/* Axes Titles */}
          <text
            x={paddingLeft + (width - paddingLeft - paddingRight) / 2}
            y={height - 12}
            textAnchor="middle"
            className="matrix-axis-title"
          >
            Puntuación de Valoración → (100 = Barata / Infravalorada)
          </text>

          <text
            transform={`rotate(-90, 15, ${paddingTop + (height - paddingTop - paddingBottom) / 2})`}
            x={15}
            y={paddingTop + (height - paddingTop - paddingBottom) / 2}
            textAnchor="middle"
            className="matrix-axis-title"
          >
            Puntuación de Calidad → (100 = Alta Calidad)
          </text>

          {/* Axis numeric markings */}
          <text x={getX(0)} y={getY(0) + 18} textAnchor="middle" fill="var(--text-muted)" fontSize="9">0</text>
          <text x={getX(50)} y={getY(0) + 18} textAnchor="middle" fill="var(--text-muted)" fontSize="9">50</text>
          <text x={getX(100)} y={getY(0) + 18} textAnchor="middle" fill="var(--text-muted)" fontSize="9">100</text>

          <text x={getX(0) - 8} y={getY(0) + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9">0</text>
          <text x={getX(0) - 8} y={getY(50) + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9">50</text>
          <text x={getX(0) - 8} y={getY(100) + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9">100</text>

          {/* Dots plotting */}
          {allStocks.map((stock, i) => {
            const x = getX(stock.scores.valuation);
            const y = getY(stock.scores.financialHealth ? stock.scores.qualityScore ?? stock.scores.overall : stock.scores.overall);
            // Wait, we can use quality score or calculate it.
            // Let's make sure we plot:
            // X-axis: valuation score
            // Y-axis: quality score
            // Quality score is computed in processStockData. Let's make sure we extract stock.scores.overall or stock.scores.financialHealth etc.
            // Let's use:
            // Y-axis = stock.scores.overall - wait, no, the user wants "calidad de la acción" (Quality) vs "buen punto de valoración" (Valuation).
            // Quality is in stock.scores.financialHealth/profitability/growth.
            // Let's calculate: Quality = (Health + Profitability + Growth) / 3 or let's use the actual calculated QualityScore if we add it to the scores.
            // In financeCalculators we returned scores: { financialHealth, profitability, growth, valuation, overall }.
            // Let's calculate Quality = Math.round((Health*0.3 + Profitability*0.4 + Growth*0.3)). Wait, yes, in financeCalculators we have:
            // const qualityScore = Math.round((financialHealthScore * 0.3) + (profitabilityScore * 0.4) + (growthScore * 0.3));
            // Let's make sure we expose qualityScore in the scores object!
            // Yes! In processStockData, let's look:
            // we had: scores: { financialHealth, profitability, growth, valuation, overall }.
            // Wait! Let's modify the scores in processStockData or handle it here by doing the math:
            const health = stock.scores.financialHealth;
            const prof = stock.scores.profitability;
            const gro = stock.scores.growth;
            const qual = Math.round((health * 0.3) + (prof * 0.4) + (gro * 0.3));
            
            const dotX = getX(stock.scores.valuation);
            const dotY = getY(qual);

            const isCurrent = stock.isCurrent;
            const color = isCurrent 
              ? 'var(--color-primary)' 
              : 'rgba(255, 255, 255, 0.4)';

            return (
              <g key={stock.ticker}>
                {isCurrent && (
                  <circle
                    cx={dotX}
                    cy={dotY}
                    r={12}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="1.5"
                    strokeDasharray="2"
                    style={{ animation: 'loadingSkeleton 2s infinite linear' }}
                  />
                )}
                <circle
                  className="matrix-dot"
                  cx={dotX}
                  cy={dotY}
                  r={isCurrent ? 7 : 5}
                  fill={color}
                  stroke={isCurrent ? '#ffffff' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={isCurrent ? 2 : 1}
                  onMouseEnter={(e) => handleMouseEnter(e, { ...stock, qual })}
                  onMouseLeave={handleMouseLeave}
                />
                <text
                  x={dotX}
                  y={dotY - (isCurrent ? 12 : 9)}
                  textAnchor="middle"
                  fill={isCurrent ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'}
                  fontSize={isCurrent ? '10' : '8'}
                  fontWeight={isCurrent ? '700' : '400'}
                  style={{ pointerEvents: 'none' }}
                >
                  {stock.ticker}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredStock && (
          <div
            className="matrix-tooltip"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
            }}
          >
            <div>
              <span className="matrix-tooltip-ticker">{hoveredStock.ticker}</span>
              <span style={{ color: 'var(--text-secondary)', marginLeft: '4px', fontSize: '0.75rem' }}>
                - {hoveredStock.companyName}
              </span>
            </div>
            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div>Calidad: <span style={{ fontWeight: '700' }} className={hoveredStock.qual >= 70 ? 'text-high' : hoveredStock.qual >= 50 ? 'text-mid' : 'text-low'}>{hoveredStock.qual}</span></div>
              <div>Valoración: <span style={{ fontWeight: '700' }} className={hoveredStock.scores.valuation >= 70 ? 'text-high' : hoveredStock.scores.valuation >= 50 ? 'text-mid' : 'text-low'}>{hoveredStock.scores.valuation}</span></div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2px', marginTop: '2px' }}>
                Punt. Global: <span style={{ fontWeight: '700', color: '#fff' }}>{hoveredStock.scores.overall}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatrixChart;
