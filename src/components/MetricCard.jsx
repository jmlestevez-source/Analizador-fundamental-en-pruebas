import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

const MetricCard = ({ metric }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, formatted, score, explanation } = metric;

  // Determine badge styling based on score
  let ratingClass = 'badge-rating-low';
  let barClass = 'metric-bar-low';
  if (score >= 70) {
    ratingClass = 'badge-rating-high';
    barClass = 'metric-bar-high';
  } else if (score >= 50) {
    ratingClass = 'badge-rating-mid';
    barClass = 'metric-bar-mid';
  }

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div 
        className="metric-card-header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="metric-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          {name}
        </span>
        <span className={`badge-rating ${ratingClass}`}>
          Score {score}
        </span>
      </div>

      <div className="metric-value-row">
        <span className="metric-raw-value">{formatted}</span>
      </div>

      {/* Mini indicator bar */}
      <div className="metric-bar-container">
        <div 
          className={`metric-bar-progress ${barClass}`}
          style={{ width: `${Math.max(5, score)}%` }}
        />
      </div>

      <div 
        className="metric-expand-trigger" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span style={{ fontSize: '0.75rem', marginRight: '4px', fontWeight: '500' }}>
          {isExpanded ? 'Ocultar detalles' : 'Ver explicación'}
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      <div className={`metric-details-drawer ${isExpanded ? 'expanded' : ''}`}>
        <div className="metric-explanation">
          {explanation}
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
