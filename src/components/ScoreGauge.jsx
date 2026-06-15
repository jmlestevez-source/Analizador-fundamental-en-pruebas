import React from 'react';

const ScoreGauge = ({ score, label, size = 160, strokeWidth = 12 }) => {
  const normalizedScore = Math.max(0, Math.min(100, score || 0));
  const radius = (size - strokeWidth - 12) / 2; // Increased padding to avoid clipping the glow filter
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  // Determine colors and IDs for gradients
  let gradientId = 'gauge-low';
  let ratingText = 'Bajo';
  let textClass = 'text-low';

  if (normalizedScore >= 70) {
    gradientId = 'gauge-high';
    ratingText = 'Excelente';
    textClass = 'text-high';
  } else if (normalizedScore >= 50) {
    gradientId = 'gauge-mid';
    ratingText = 'Aceptable';
    textClass = 'text-mid';
  }

  return (
    <div className="sub-score-item" style={{ width: size }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} className="gauge-svg">
          <defs>
            <linearGradient id="gauge-high" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="gauge-mid" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id="gauge-low" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
            
            {/* Glow Filter */}
            <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          {/* Background circle */}
          <circle
            className="gauge-bg"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          
          {/* Progress circle */}
          <circle
            className="gauge-progress"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={`url(#${gradientId})`}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            filter={`url(#glow-${gradientId})`}
          />
          
          {/* Central text */}
          <text
            x={size / 2}
            y={size / 2 - (size * 0.02)}
            className="gauge-center-text"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size > 100 ? size * 0.22 : size * 0.28}
          >
            {normalizedScore}
          </text>
          <text
            x={size / 2}
            y={size / 2 + (size * 0.12)}
            className="gauge-center-subtext"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size > 100 ? size * 0.08 : size * 0.12}
            letterSpacing="0.5px"
          >
            / 100
          </text>
        </svg>
      </div>
      
      {label && (
        <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
          <span className="sub-score-label" style={{ fontSize: size > 100 ? size * 0.08 : '10px' }}>{label}</span>
          <div style={{ fontSize: size > 100 ? '0.75rem' : '9px', fontWeight: '700', marginTop: '2px' }} className={textClass}>
            {ratingText}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreGauge;
