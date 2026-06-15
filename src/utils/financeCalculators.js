/**
 * Helper to safely format numbers as currencies, percentages, or raw numbers
 */
export const formatNumber = (value, type = 'number', currency = 'USD') => {
  if (value === undefined || value === null || isNaN(value)) return 'N/D';
  
  switch (type) {
    case 'currency': {
      const absVal = Math.abs(value);
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        notation: absVal >= 1e6 ? 'compact' : 'standard',
        maximumFractionDigits: absVal >= 1e6 ? 2 : 0
      }).format(value);
    }
    case 'currency_short':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        notation: 'compact',
        maximumFractionDigits: 2
      }).format(value);
    case 'percent':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    case 'percent_raw': // When value is already e.g. 15.5 for 15.5%
      return `${value.toFixed(2)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'compact':
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 2
      }).format(value);
    default:
      return value.toLocaleString('en-US');
  }
};

/**
 * Get evaluation status and style class based on score
 */
export const getRatingStatus = (score) => {
  if (score >= 70) return { label: 'Excelente', class: 'high', textClass: 'text-high' };
  if (score >= 50) return { label: 'Aceptable', class: 'mid', textClass: 'text-mid' };
  return { label: 'Riesgo / Pobre', class: 'low', textClass: 'text-low' };
};

// Finviz string parsing helper functions
const parsePercent = (val) => {
  if (!val || val === '-' || val === 'N/A') return null;
  return parseFloat(val.replace('%', '')) / 100;
};

const parseFloatVal = (val) => {
  if (!val || val === '-' || val === 'N/A') return null;
  return parseFloat(val);
};

/**
 * Process Yahoo Finance + Finviz raw data and calculate scores (0 - 100)
 */
export const processStockData = (rawData, finvizData = null, technicalData = null) => {
  if (!rawData || !rawData.quoteSummary || !rawData.quoteSummary.result || !rawData.quoteSummary.result[0]) {
    throw new Error('Formato de datos financiero no válido.');
  }

  const data = rawData.quoteSummary.result[0];
  const financialData = data.financialData || {};
  const keyStats = data.defaultKeyStatistics || {};
  const summaryDetail = data.summaryDetail || {};
  const assetProfile = data.assetProfile || {};
  const priceData = data.price || {};

  const currency = financialData.financialCurrency || 'USD';

  // 1. FINANCIAL HEALTH & DEBT
  const totalCash = financialData.totalCash?.raw ?? 0;
  const totalDebt = financialData.totalDebt?.raw ?? 0;
  const netCash = totalCash - totalDebt;
  
  // Debt to Equity (fall back to Finviz if Yahoo is missing)
  let rawDebtToEquity = financialData.debtToEquity?.raw;
  if ((rawDebtToEquity === undefined || rawDebtToEquity === null) && finvizData) {
    const fvDE = parseFloatVal(finvizData['Debt/Eq']);
    if (fvDE !== null) {
      rawDebtToEquity = fvDE; // Finviz returns DE as a ratio (e.g. 0.80)
    }
  }

  let debtToEquityScore = 100;
  if (rawDebtToEquity !== undefined && rawDebtToEquity !== null) {
    // If it's a decimal like 0.80, convert to percentage scale (80)
    const deRatio = rawDebtToEquity > 5 ? rawDebtToEquity : rawDebtToEquity * 100;
    if (deRatio <= 25) debtToEquityScore = 100;
    else if (deRatio <= 50) debtToEquityScore = 85;
    else if (deRatio <= 100) debtToEquityScore = 65;
    else if (deRatio <= 150) debtToEquityScore = 45;
    else if (deRatio <= 200) debtToEquityScore = 25;
    else debtToEquityScore = 10;
  } else if (totalDebt === 0) {
    debtToEquityScore = 100; // No debt
  }

  // Net Cash Score
  let netCashScore = 50;
  if (netCash > 0) {
    netCashScore = 100; // Cash > Debt
  } else {
    // If net cash is negative, check how many years of operating cashflow it represents
    const ocf = financialData.operatingCashflow?.raw ?? 0;
    if (ocf > 0) {
      const yearsToPayDebt = Math.abs(netCash) / ocf;
      if (yearsToPayDebt <= 1.5) netCashScore = 80;
      else if (yearsToPayDebt <= 3) netCashScore = 60;
      else if (yearsToPayDebt <= 5) netCashScore = 40;
      else netCashScore = 20;
    } else {
      netCashScore = 15;
    }
  }

  // Liquidity (Current & Quick Ratio)
  let currentRatio = financialData.currentRatio?.raw;
  if ((currentRatio === undefined || currentRatio === null) && finvizData) {
    currentRatio = parseFloatVal(finvizData['Current Ratio']);
  }
  let currentRatioScore = 50;
  if (currentRatio !== undefined && currentRatio !== null) {
    if (currentRatio >= 2.0) currentRatioScore = 100;
    else if (currentRatio >= 1.5) currentRatioScore = 85;
    else if (currentRatio >= 1.1) currentRatioScore = 65;
    else if (currentRatio >= 0.8) currentRatioScore = 40;
    else currentRatioScore = 15;
  }

  let quickRatio = financialData.quickRatio?.raw;
  if ((quickRatio === undefined || quickRatio === null) && finvizData) {
    quickRatio = parseFloatVal(finvizData['Quick Ratio']);
  }
  let quickRatioScore = 50;
  if (quickRatio !== undefined && quickRatio !== null) {
    if (quickRatio >= 1.5) quickRatioScore = 100;
    else if (quickRatio >= 1.0) quickRatioScore = 85;
    else if (quickRatio >= 0.7) quickRatioScore = 60;
    else if (quickRatio >= 0.5) quickRatioScore = 35;
    else quickRatioScore = 15;
  }

  // Average Financial Health Score
  const healthScoresList = [netCashScore, debtToEquityScore, currentRatioScore];
  if (quickRatio !== undefined && quickRatio !== null) healthScoresList.push(quickRatioScore);
  const financialHealthScore = Math.round(healthScoresList.reduce((a, b) => a + b, 0) / healthScoresList.length);

  // 2. PROFITABILITY & COMPETITIVE ADVANTAGES (MOAT)
  let operatingMargin = financialData.operatingMargins?.raw;
  if ((operatingMargin === undefined || operatingMargin === null) && finvizData) {
    operatingMargin = parsePercent(finvizData['Oper. Margin']);
  }
  let operatingMarginScore = 50;
  if (operatingMargin !== undefined && operatingMargin !== null) {
    if (operatingMargin >= 0.25) operatingMarginScore = 100;
    else if (operatingMargin >= 0.15) operatingMarginScore = 85;
    else if (operatingMargin >= 0.08) operatingMarginScore = 60;
    else if (operatingMargin >= 0.03) operatingMarginScore = 35;
    else operatingMarginScore = 10;
  }

  let grossMargin = financialData.grossMargins?.raw;
  if ((grossMargin === undefined || grossMargin === null) && finvizData) {
    grossMargin = parsePercent(finvizData['Gross Margin']);
  }
  let grossMarginScore = 50;
  if (grossMargin !== undefined && grossMargin !== null) {
    if (grossMargin >= 0.60) grossMarginScore = 100;
    else if (grossMargin >= 0.40) grossMarginScore = 85;
    else if (grossMargin >= 0.20) grossMarginScore = 60;
    else if (grossMargin >= 0.10) grossMarginScore = 35;
    else grossMarginScore = 10;
  }

  let roe = financialData.returnOnEquity?.raw;
  if ((roe === undefined || roe === null) && finvizData) {
    roe = parsePercent(finvizData['ROE']);
  }
  let roeScore = 50;
  if (roe !== undefined && roe !== null) {
    if (roe >= 0.25) roeScore = 100;
    else if (roe >= 0.15) roeScore = 85;
    else if (roe >= 0.08) roeScore = 60;
    else if (roe >= 0.0) roeScore = 30;
    else roeScore = 5;
  }

  let roa = financialData.returnOnAssets?.raw;
  if ((roa === undefined || roa === null) && finvizData) {
    roa = parsePercent(finvizData['ROA']);
  }
  let roaScore = 50;
  if (roa !== undefined && roa !== null) {
    if (roa >= 0.12) roaScore = 100;
    else if (roa >= 0.07) roaScore = 85;
    else if (roa >= 0.04) roaScore = 60;
    else if (roa >= 0.0) roaScore = 30;
    else roaScore = 5;
  }

  // ROIC (Exclusive from Finviz)
  let roic = null;
  let roicScore = null;
  if (finvizData) {
    roic = parsePercent(finvizData['ROIC']);
    if (roic !== null) {
      if (roic >= 0.20) roicScore = 100;
      else if (roic >= 0.14) roicScore = 85;
      else if (roic >= 0.08) roicScore = 60;
      else if (roic >= 0.0) roicScore = 30;
      else roicScore = 5;
    }
  }

  // FCF Margin
  const freeCashFlow = financialData.freeCashflow?.raw ?? 0;
  const revenue = financialData.totalRevenue?.raw ?? 1;
  let fcfMargin = freeCashFlow / revenue;
  
  // Fall back to Finviz P/FCF for margin calculation if Yahoo FCF/Revenue are zero
  if ((freeCashFlow === 0 || revenue === 1) && finvizData) {
    const pfcf = parseFloatVal(finvizData['P/FCF']);
    const pe = parseFloatVal(finvizData['P/E']);
    const pm = parsePercent(finvizData['Profit Margin']);
    if (pfcf && pe && pm) {
      // P/FCF = Price / FCF_per_share
      // P/E = Price / EPS
      // FCFMargin = ProfitMargin * (PE / PFCF)
      fcfMargin = pm * (pe / pfcf);
    }
  }

  let fcfMarginScore = 50;
  if (fcfMargin !== undefined && fcfMargin !== null && !isNaN(fcfMargin)) {
    if (fcfMargin >= 0.20) fcfMarginScore = 100;
    else if (fcfMargin >= 0.12) fcfMarginScore = 85;
    else if (fcfMargin >= 0.05) fcfMarginScore = 60;
    else if (fcfMargin >= 0.0) fcfMarginScore = 35;
    else fcfMarginScore = 10;
  }

  // Average Profitability Score (include ROIC if available)
  const profitabilityScoresList = [operatingMarginScore, grossMarginScore, roeScore, roaScore, fcfMarginScore];
  if (roicScore !== null) profitabilityScoresList.push(roicScore);
  const profitabilityScore = Math.round(profitabilityScoresList.reduce((a, b) => a + b, 0) / profitabilityScoresList.length);

  // 3. GROWTH PERFORMANCE
  let revenueGrowth = financialData.revenueGrowth?.raw;
  if ((revenueGrowth === undefined || revenueGrowth === null) && finvizData) {
    revenueGrowth = parsePercent(finvizData['Sales Q/Q']); // Fallback to Sales Q/Q
  }
  let revenueGrowthScore = 50;
  if (revenueGrowth !== undefined && revenueGrowth !== null) {
    if (revenueGrowth >= 0.20) revenueGrowthScore = 100;
    else if (revenueGrowth >= 0.10) revenueGrowthScore = 85;
    else if (revenueGrowth >= 0.05) revenueGrowthScore = 70;
    else if (revenueGrowth >= 0.0) revenueGrowthScore = 50;
    else revenueGrowthScore = 25;
  }

  let earningsGrowth = financialData.earningsGrowth?.raw;
  if ((earningsGrowth === undefined || earningsGrowth === null) && finvizData) {
    earningsGrowth = parsePercent(finvizData['EPS Q/Q']); // Fallback to EPS Q/Q
  }
  let earningsGrowthScore = 50;
  if (earningsGrowth !== undefined && earningsGrowth !== null) {
    if (earningsGrowth >= 0.25) earningsGrowthScore = 100;
    else if (earningsGrowth >= 0.12) earningsGrowthScore = 85;
    else if (earningsGrowth >= 0.05) earningsGrowthScore = 70;
    else if (earningsGrowth >= 0.0) earningsGrowthScore = 50;
    else earningsGrowthScore = 20;
  }

  // Growth Average
  const growthScoresList = [revenueGrowthScore, earningsGrowthScore];
  const growthScore = Math.round(growthScoresList.reduce((a, b) => a + b, 0) / growthScoresList.length);

  // 4. VALUATION METRICS
  let trailingPE = summaryDetail.trailingPE?.raw ?? keyStats.trailingPE?.raw;
  if ((trailingPE === undefined || trailingPE === null) && finvizData) {
    trailingPE = parseFloatVal(finvizData['P/E']);
  }
  let peScore = 50;
  if (trailingPE !== undefined && trailingPE !== null) {
    if (trailingPE <= 0) peScore = 5;
    else if (trailingPE <= 12) peScore = 95;
    else if (trailingPE <= 18) peScore = 85;
    else if (trailingPE <= 25) peScore = 65;
    else if (trailingPE <= 35) peScore = 40;
    else peScore = 15;
  }

  let forwardPE = summaryDetail.forwardPE?.raw ?? keyStats.forwardPE?.raw;
  if ((forwardPE === undefined || forwardPE === null) && finvizData) {
    forwardPE = parseFloatVal(finvizData['Forward P/E']);
  }
  let forwardPEScore = 50;
  if (forwardPE !== undefined && forwardPE !== null) {
    if (forwardPE <= 0) forwardPEScore = 5;
    else if (forwardPE <= 10) forwardPEScore = 95;
    else if (forwardPE <= 15) forwardPEScore = 85;
    else if (forwardPE <= 22) forwardPEScore = 65;
    else if (forwardPE <= 30) forwardPEScore = 40;
    else forwardPEScore = 15;
  }

  let pegRatio = keyStats.pegRatio?.raw;
  if ((pegRatio === undefined || pegRatio === null) && finvizData) {
    pegRatio = parseFloatVal(finvizData['PEG']);
  }
  let pegScore = 50;
  if (pegRatio !== undefined && pegRatio !== null) {
    if (pegRatio <= 0) pegScore = 20;
    else if (pegRatio <= 1.0) pegScore = 100;
    else if (pegRatio <= 1.5) pegScore = 85;
    else if (pegRatio <= 2.2) pegScore = 60;
    else if (pegRatio <= 3.0) pegScore = 35;
    else pegScore = 15;
  } else {
    if (trailingPE && earningsGrowth && earningsGrowth > 0) {
      const estimatedPEG = trailingPE / (earningsGrowth * 100);
      if (estimatedPEG <= 1.0) pegScore = 95;
      else if (estimatedPEG <= 1.5) pegScore = 80;
      else if (estimatedPEG <= 2.2) pegScore = 55;
      else if (estimatedPEG <= 3.0) pegScore = 30;
      else pegScore = 15;
    }
  }

  let enterpriseToEbitda = keyStats.enterpriseToEbitda?.raw;
  if ((enterpriseToEbitda === undefined || enterpriseToEbitda === null) && finvizData) {
    enterpriseToEbitda = parseFloatVal(finvizData['EV/EBITDA']);
  }
  let ebitdaValuationScore = 50;
  if (enterpriseToEbitda !== undefined && enterpriseToEbitda !== null) {
    if (enterpriseToEbitda <= 0) ebitdaValuationScore = 5;
    else if (enterpriseToEbitda <= 8) ebitdaValuationScore = 95;
    else if (enterpriseToEbitda <= 12) ebitdaValuationScore = 80;
    else if (enterpriseToEbitda <= 18) ebitdaValuationScore = 60;
    else if (enterpriseToEbitda <= 25) ebitdaValuationScore = 35;
    else ebitdaValuationScore = 15;
  }

  // Average Valuation Score
  const valuationScoresList = [];
  if (trailingPE) valuationScoresList.push(peScore);
  if (forwardPE) valuationScoresList.push(forwardPEScore);
  if (pegRatio !== undefined && pegRatio !== null) valuationScoresList.push(pegScore);
  if (enterpriseToEbitda) valuationScoresList.push(ebitdaValuationScore);
  
  const valuationScore = valuationScoresList.length > 0 
    ? Math.round(valuationScoresList.reduce((a, b) => a + b, 0) / valuationScoresList.length) 
    : 50;

  // 5. AGGREGATES
  // Quality Score: 30% Financial Health, 40% Profitability, 30% Growth
  const qualityScore = Math.round((financialHealthScore * 0.3) + (profitabilityScore * 0.4) + (growthScore * 0.3));
  const technicalScore = Number.isFinite(technicalData?.score) ? Math.round(technicalData.score) : null;
  
  // Overall Investment Score: all visible blocks with the same weight.
  // If technical data is unavailable, keep the previous four-block average to avoid penalising API outages.
  const overallScoreComponents = [financialHealthScore, profitabilityScore, growthScore, valuationScore];
  if (technicalScore !== null) overallScoreComponents.push(technicalScore);
  const overallScore = Math.round(overallScoreComponents.reduce((a, b) => a + b, 0) / overallScoreComponents.length);

  // Determine Category / Profile
  let investmentProfile = 'Especulativa';
  if (qualityScore >= 70) {
    if (valuationScore >= 70) investmentProfile = 'Superestrella (Gran Calidad & Valor)';
    else if (valuationScore >= 45) investmentProfile = 'Calidad a Precio Justo';
    else investmentProfile = 'Excelente Negocio (Sobrevalorada)';
  } else if (qualityScore >= 50) {
    if (valuationScore >= 60) investmentProfile = 'Valor Moderado / Estable';
    else investmentProfile = 'Rendimiento Promedio';
  } else {
    if (valuationScore >= 70) investmentProfile = 'Trampa de Valor / Especulativa';
    else investmentProfile = 'Evitar / Alto Riesgo';
  }

  // Build the metrics dictionary
  const processedMetrics = {
    // Health
    netCash: {
      name: 'Caja Neta',
      raw: netCash,
      formatted: formatNumber(netCash, 'currency', currency),
      score: netCashScore,
      category: 'Salud Financiera',
      explanation: 'Mide la cantidad de efectivo que queda después de restar toda la deuda. Una caja neta positiva (efectivo mayor que la deuda) ofrece una protección enorme contra crisis y flexibilidad para invertir.'
    },
    debtToEquity: {
      name: 'Deuda / Patrimonio',
      raw: rawDebtToEquity,
      formatted: rawDebtToEquity !== undefined && rawDebtToEquity !== null ? formatNumber(rawDebtToEquity * (rawDebtToEquity > 5 ? 1 : 100), 'percent_raw') : 'N/D',
      score: debtToEquityScore,
      category: 'Salud Financiera',
      explanation: 'Mide la proporción de financiación mediante deuda frente a recursos propios. Un ratio bajo (<50% o <0.50) indica una estructura de capital muy conservadora y bajo riesgo de quiebra.'
    },
    currentRatio: {
      name: 'Ratio Corriente',
      raw: currentRatio,
      formatted: formatNumber(currentRatio, 'ratio'),
      score: currentRatioScore,
      category: 'Salud Financiera',
      explanation: 'Mide la capacidad para pagar obligaciones de corto plazo (< 1 año) con activos de corto plazo. Lo ideal es que sea superior a 1.5, garantizando solvencia inmediata.'
    },
    quickRatio: {
      name: 'Ratio Ácido (Quick)',
      raw: quickRatio,
      formatted: formatNumber(quickRatio, 'ratio'),
      score: quickRatioScore,
      category: 'Salud Financiera',
      explanation: 'Similar al Ratio Corriente, pero excluye inventarios (los activos menos líquidos de corto plazo). Mide la capacidad de liquidez instantánea. Lo ideal es > 1.0.'
    },

    // Profitability
    operatingMargin: {
      name: 'Margen Operativo',
      raw: operatingMargin,
      formatted: formatNumber(operatingMargin, 'percent'),
      score: operatingMarginScore,
      category: 'Rentabilidad & Moat',
      explanation: 'Indica qué porcentaje de las ventas se convierte en beneficio operativo. Margenes consistentemente altos (>15% o >25%) son el mejor indicador de ventajas competitivas o "moat" de precios.'
    },
    grossMargin: {
      name: 'Margen Bruto',
      raw: grossMargin,
      formatted: formatNumber(grossMargin, 'percent'),
      score: grossMarginScore,
      category: 'Rentabilidad & Moat',
      explanation: 'Mide las ventas menos el costo directo de los bienes vendidos. Muestra el poder de marca y la eficiencia de producción. Un margen bruto elevado da espacio para marketing e I+D.'
    },
    roe: {
      name: 'Retorno sobre Patrimonio (ROE)',
      raw: roe,
      formatted: formatNumber(roe, 'percent'),
      score: roeScore,
      category: 'Rentabilidad & Moat',
      explanation: 'Mide la rentabilidad que la empresa genera sobre el capital aportado por los accionistas. Las empresas extraordinarias suelen tener un ROE superior al 15% o 20% sin apalancarse en exceso.'
    },
    roa: {
      name: 'Retorno sobre Activos (ROA)',
      raw: roa,
      formatted: formatNumber(roa, 'percent'),
      score: roaScore,
      category: 'Rentabilidad & Moat',
      explanation: 'Mide la rentabilidad generada en relación con todos los activos de la empresa. Útil para ver la eficiencia de gestión de capital. Un ROA superior al 7% es excelente.'
    },
    fcfMargin: {
      name: 'Margen de Free Cash Flow',
      raw: fcfMargin,
      formatted: formatNumber(fcfMargin, 'percent'),
      score: fcfMarginScore,
      category: 'Rentabilidad & Moat',
      explanation: 'Mide la proporción de cada dólar de ingresos que se convierte en Flujo de Caja Libre real disponible para los accionistas. Un margen > 12% indica un negocio altamente generador de caja.'
    },

    // Growth
    revenueGrowth: {
      name: 'Crecimiento de Ingresos (YoY)',
      raw: revenueGrowth,
      formatted: formatNumber(revenueGrowth, 'percent'),
      score: revenueGrowthScore,
      category: 'Crecimiento',
      explanation: 'Muestra el crecimiento interanual de las ventas. Indica si los productos del negocio siguen ganando mercado o subiendo precios. Crecimientos sostenidos >10% son muy saludables.'
    },
    earningsGrowth: {
      name: 'Crecimiento de Beneficios (YoY)',
      raw: earningsGrowth,
      formatted: formatNumber(earningsGrowth, 'percent'),
      score: earningsGrowthScore,
      category: 'Crecimiento',
      explanation: 'Mide el crecimiento de los beneficios netos interanuales. Debe ir de la mano con el crecimiento de ventas. Un crecimiento rápido de beneficios (>15%) impulsa la cotización a largo plazo.'
    },

    // Valuation
    trailingPE: {
      name: 'PER Histórico (P/E)',
      raw: trailingPE,
      formatted: formatNumber(trailingPE, 'ratio'),
      score: peScore,
      category: 'Valoración',
      explanation: 'Relación entre el precio actual de la acción y sus beneficios del último año. Un PER bajo indica valoración barata, mientras que un PER alto requiere alta tasa de crecimiento para justificarse.'
    },
    forwardPE: {
      name: 'PER Futuro (Forward P/E)',
      raw: forwardPE,
      formatted: formatNumber(forwardPE, 'ratio'),
      score: forwardPEScore,
      category: 'Valoración',
      explanation: 'Relación entre el precio actual y la proyección de beneficios para el próximo año de los analistas. Si es notablemente más bajo que el PER Histórico, indica estimaciones de crecimiento.'
    },
    pegRatio: {
      name: 'Ratio PEG',
      raw: pegRatio,
      formatted: formatNumber(pegRatio, 'ratio'),
      score: pegScore,
      category: 'Valoración',
      explanation: 'Relación entre el PER y la tasa de crecimiento de beneficios estimada de la empresa. Un PEG <= 1.0 es el santo grial de la valoración: estás pagando poco por mucho crecimiento.'
    },
    enterpriseToEbitda: {
      name: 'EV / EBITDA',
      raw: enterpriseToEbitda,
      formatted: formatNumber(enterpriseToEbitda, 'ratio'),
      score: ebitdaValuationScore,
      category: 'Valoración',
      explanation: 'Compara el Valor de la Empresa (EV = Capitalización + Deuda - Caja) con su beneficio antes de intereses, impuestos, depreciación y amortización. Un ratio menor a 10 suele ser muy atractivo.'
    }
  };

  // Add ROIC to metrics if available
  if (roicScore !== null) {
    processedMetrics.roic = {
      name: 'Retorno sobre Cap. Invertido (ROIC)',
      raw: roic,
      formatted: formatNumber(roic, 'percent'),
      score: roicScore,
      category: 'Rentabilidad & Moat',
      explanation: 'Mide la rentabilidad que genera la empresa sobre todo el capital que tiene invertido (tanto deuda como patrimonio). Es la métrica favorita de Warren Buffett y la más precisa para detectar ventajas competitivas sólidas ("Moat"). Un ROIC superior a 15% de forma consistente es extraordinario.'
    };
  }

  // Check if we have employees from Finviz
  let employeesCount = keyStats.fullTimeEmployees?.raw || assetProfile.fullTimeEmployees;
  if (!employeesCount && finvizData && finvizData['Employees']) {
    employeesCount = parseInt(finvizData['Employees'].replace(/,/g, ''));
  }

  // --- NEW VALUATION & QUALITY IMPROVEMENTS ---

  // 1. Adapted Piotroski F-Score (0-9)
  let piotroskiScore = 0;
  const piotroskiDetails = [];

  // P1: Positive ROA
  const hasPositiveRoa = roa !== null && roa > 0;
  if (hasPositiveRoa) {
    piotroskiScore++;
    piotroskiDetails.push("Rentabilidad: ROA es positivo (+1)");
  } else {
    piotroskiDetails.push("Rentabilidad: ROA es negativo o cero (+0)");
  }

  // P2: Positive CFO
  const ocfRaw = financialData.operatingCashflow?.raw ?? 0;
  const hasPositiveCfo = ocfRaw > 0;
  if (hasPositiveCfo) {
    piotroskiScore++;
    piotroskiDetails.push("Rentabilidad: Flujo de caja operativo (CFO) es positivo (+1)");
  } else {
    piotroskiDetails.push("Rentabilidad: CFO es negativo o cero (+0)");
  }

  // P3: CFO > Net Income (Quality of earnings)
  const netIncome = keyStats.netIncomeToCommon?.raw ?? financialData.netIncome?.raw ?? 0;
  const isCfoHigherThanNetIncome = ocfRaw > netIncome;
  if (isCfoHigherThanNetIncome) {
    piotroskiScore++;
    piotroskiDetails.push("Rentabilidad: CFO supera al Beneficio Neto (Ganancias de alta calidad) (+1)");
  } else {
    piotroskiDetails.push("Rentabilidad: CFO es inferior al Beneficio Neto (+0)");
  }

  // P4: Healthy ROA (>5%)
  const isRoaHealthy = roa !== null && roa > 0.05;
  if (isRoaHealthy) {
    piotroskiScore++;
    piotroskiDetails.push("Rentabilidad: ROA es saludable (>5%) (+1)");
  } else {
    piotroskiDetails.push("Rentabilidad: ROA es bajo (<5%) (+0)");
  }

  // P5: Conservative Debt-to-Equity (<= 80%)
  const deRatioVal = rawDebtToEquity !== undefined && rawDebtToEquity !== null ? rawDebtToEquity * (rawDebtToEquity > 5 ? 1 : 100) : null;
  const isDebtConservative = deRatioVal === null || deRatioVal <= 80;
  if (isDebtConservative) {
    piotroskiScore++;
    piotroskiDetails.push("Apalancamiento: Estructura de capital conservadora (Deuda/Patrimonio ≤ 80%) (+1)");
  } else {
    piotroskiDetails.push("Apalancamiento: Nivel de deuda elevado (>80%) (+0)");
  }

  // P6: Current Ratio Adequado (>= 1.2)
  const isCurrentRatioGood = currentRatio !== undefined && currentRatio !== null && currentRatio >= 1.2;
  if (isCurrentRatioGood) {
    piotroskiScore++;
    piotroskiDetails.push("Liquidez: Ratio Corriente adecuado (≥1.2) (+1)");
  } else {
    piotroskiDetails.push("Liquidez: Ratio Corriente ajustado (<1.2) (+0)");
  }

  // P7: Healthy Operating Margin (>12%)
  const isOpMarginGood = operatingMargin !== undefined && operatingMargin !== null && operatingMargin >= 0.12;
  if (isOpMarginGood) {
    piotroskiScore++;
    piotroskiDetails.push("Eficiencia: Margen operativo saludable (≥12%) (+1)");
  } else {
    piotroskiDetails.push("Eficiencia: Margen operativo ajustado (<12%) (+0)");
  }

  // P8: Healthy Gross Margin (>35%)
  const isGrossMarginGood = grossMargin !== undefined && grossMargin !== null && grossMargin >= 0.35;
  if (isGrossMarginGood) {
    piotroskiScore++;
    piotroskiDetails.push("Eficiencia: Margen bruto fuerte (≥35%) (+1)");
  } else {
    piotroskiDetails.push("Eficiencia: Margen bruto bajo (<35%) (+0)");
  }

  // P9: Healthy Asset Turnover (>0.4)
  let profitMargin = financialData.profitMargins?.raw;
  if ((profitMargin === undefined || profitMargin === null) && finvizData) {
    profitMargin = parsePercent(finvizData['Profit Margin']);
  }
  const assetTurnover = roa && profitMargin ? (roa / profitMargin) : null;
  const isAssetTurnoverGood = assetTurnover !== null && assetTurnover > 0.4;
  if (isAssetTurnoverGood) {
    piotroskiScore++;
    piotroskiDetails.push("Eficiencia: Rotación de activos eficiente (>0.4) (+1)");
  } else {
    piotroskiDetails.push("Eficiencia: Rotación de activos baja (≤0.4) (+0)");
  }

  let piotroskiStatus = "Riesgo / Pobre";
  if (piotroskiScore >= 7) piotroskiStatus = "Excelente";
  else if (piotroskiScore >= 4) piotroskiStatus = "Aceptable";

  // 2. Intrinsic Value & Margin of Safety (Graham & DCF)
  const currentPrice = priceData.regularMarketPrice?.raw ?? (finvizData ? parseFloatVal(finvizData['Price']) : null) ?? 0;
  const epsTtm = parseFloatVal(finvizData?.['EPS (ttm)']) ?? keyStats.trailingEps?.raw ?? null;
  let estGrowth = parsePercent(finvizData?.['EPS next 5Y']) ?? 0.08;
  
  // Cap growth rates to prevent unrealistic valuations
  const gGraham = Math.min(Math.max(estGrowth * 100, 2), 25);
  const gDcf = Math.min(Math.max(estGrowth, 0.02), 0.20);

  // Graham Model
  let grahamValue = null;
  if (epsTtm && epsTtm > 0) {
    grahamValue = (epsTtm * (8.5 + 2 * gGraham) * 4.4) / 4.7; // 4.7% as target AAA bond yield
  }

  // DCF Model
  let fcf0 = financialData.freeCashflow?.raw ?? 0;
  if (fcf0 <= 0) {
    const rev = financialData.totalRevenue?.raw ?? 0;
    const pm = profitMargin ?? 0.05;
    fcf0 = rev * pm * 0.85; // Proxy FCF as 85% of Net Income proxy
  }

  let shares = keyStats.sharesOutstanding?.raw;
  if ((shares === undefined || shares === null) && finvizData && finvizData['Shs Outstand']) {
    const shsVal = finvizData['Shs Outstand'];
    if (shsVal.endsWith('B')) shares = parseFloat(shsVal) * 1e9;
    else if (shsVal.endsWith('M')) shares = parseFloat(shsVal) * 1e6;
  }

  let dcfValue = null;
  if (fcf0 > 0 && shares > 0) {
    const r = 0.09; // 9% discount rate (WACC)
    const gt = 0.025; // 2.5% terminal growth rate
    let sumPvFcf = 0;
    let tempFcf = fcf0;
    for (let t = 1; t <= 5; t++) {
      tempFcf = tempFcf * (1 + gDcf);
      const pv = tempFcf / Math.pow(1 + r, t);
      sumPvFcf += pv;
    }
    const terminalValue = (tempFcf * (1 + gt)) / (r - gt);
    const pvTerminalValue = terminalValue / Math.pow(1 + r, 5);
    const totalEnterpriseValue = sumPvFcf + pvTerminalValue;
    
    // Net cash adjustment
    const netCashVal = (financialData.totalCash?.raw ?? 0) - (financialData.totalDebt?.raw ?? 0);
    const equityValue = totalEnterpriseValue + netCashVal;
    
    dcfValue = equityValue / shares;
    if (dcfValue < 0) dcfValue = 0;
  }

  // Average Valuation & Margin of Safety
  let averageIntrinsic = null;
  if (grahamValue && dcfValue) {
    averageIntrinsic = (grahamValue + dcfValue) / 2;
  } else if (grahamValue) {
    averageIntrinsic = grahamValue;
  } else if (dcfValue) {
    averageIntrinsic = dcfValue;
  }

  let marginOfSafety = null;
  let safetyStatus = 'Sobrevalorada';
  if (averageIntrinsic && currentPrice > 0) {
    marginOfSafety = ((averageIntrinsic - currentPrice) / averageIntrinsic) * 100;
    if (marginOfSafety >= 25) safetyStatus = 'Excelente Descuento';
    else if (marginOfSafety >= 0) safetyStatus = 'Precio Razonable';
    else if (marginOfSafety >= -15) safetyStatus = 'Ligero Sobreprecio';
    else safetyStatus = 'Sobrevalorada';
  }

  // 3. Dividend Safety & Yield Analysis
  let divYield = summaryDetail.dividendYield?.raw;
  if ((divYield === undefined || divYield === null) && finvizData) {
    divYield = parsePercent(finvizData['Dividend %']);
  }
  
  let payout = summaryDetail.payoutRatio?.raw;
  if ((payout === undefined || payout === null) && finvizData) {
    payout = parsePercent(finvizData['Payout']);
  }
  
  let divSafetyScore = 100;
  let divSafetyStatus = 'No Distribuye';
  let divExplanation = 'La empresa no reparte dividendos, prefiriendo reinvertir sus ganancias para financiar su crecimiento futuro o recomprar acciones.';
  
  if (divYield && divYield > 0) {
    if (payout !== null && payout !== undefined) {
      if (payout <= 0.50) {
        divSafetyScore = 95;
        divSafetyStatus = 'Altamente Sostenible';
        divExplanation = `Con un payout de ${formatNumber(payout, 'percent')}, la empresa utiliza menos de la mitad de sus ganancias para pagar dividendos, dejando abundante caja para reinvertir y proteger el dividendo en épocas difíciles.`;
      } else if (payout <= 0.75) {
        divSafetyScore = 75;
        divSafetyStatus = 'Aceptable';
        divExplanation = `El payout de ${formatNumber(payout, 'percent')} es moderado. El dividendo es sostenible bajo condiciones normales, pero hay menos margen frente a caídas temporales de beneficios.`;
      } else if (payout <= 1.0) {
        divSafetyScore = 40;
        divSafetyStatus = 'Riesgo de Recorte';
        divExplanation = `El payout de ${formatNumber(payout, 'percent')} es elevado. La mayor parte de las ganancias se destina al dividendo, dejando muy poco margen de maniobra. Existe riesgo de recorte si bajan las ganancias.`;
      } else {
        divSafetyScore = 15;
        divSafetyStatus = 'Poco Sostenible';
        divExplanation = `El payout supera el 100% (${formatNumber(payout, 'percent')}), lo que significa que el dividendo se paga consumiendo reservas o emitiendo deuda. Situación insostenible a largo plazo.`;
      }
    } else {
      divSafetyScore = 60;
      divSafetyStatus = 'Moderado';
      divExplanation = 'La empresa reparte dividendos, pero no disponemos de un ratio de payout claro para verificar su cobertura actual.';
    }
  }

  return {
    ticker: priceData.symbol || 'TICKER',
    companyName: priceData.longName || (finvizData ? finvizData['Company'] || 'Compañía' : 'Compañía Desconocida'),
    sector: assetProfile.sector || (finvizData ? finvizData['Sector'] || 'N/D' : 'N/D'),
    industry: assetProfile.industry || (finvizData ? finvizData['Industry'] || 'N/D' : 'N/D'),
    description: assetProfile.longBusinessSummary || 'Sin descripción disponible.',
    website: assetProfile.website,
    price: currentPrice,
    currency,
    employees: employeesCount,
    qualityScore,

    scores: {
      financialHealth: financialHealthScore,
      profitability: profitabilityScore,
      growth: growthScore,
      valuation: valuationScore,
      technical: technicalScore,
      overall: overallScore
    },
    profile: investmentProfile,
    metrics: processedMetrics,
    finvizRaw: finvizData,
    
    // Exposed enhancement metrics
    piotroski: {
      score: piotroskiScore,
      status: piotroskiStatus,
      details: piotroskiDetails
    },
    intrinsicValue: {
      graham: grahamValue,
      dcf: dcfValue,
      average: averageIntrinsic,
      marginOfSafety: marginOfSafety,
      status: safetyStatus
    },
    dividendSafety: {
      yield: divYield,
      payout: payout,
      score: divSafetyScore,
      status: divSafetyStatus,
      explanation: divExplanation
    },
    technical: technicalData ? {
      score: technicalScore,
      status: technicalData.status || (technicalScore >= 75 ? 'Fuerte' : technicalScore >= 50 ? 'Neutral / Constructiva' : 'Débil'),
      criteria: technicalData.criteria || {},
      data: technicalData.data || {},
      generatedAt: technicalData.generatedAt || null
    } : null,
    geraldineWeiss: technicalData?.geraldineWeiss || {
      available: false,
      score: null,
      status: 'No aplicable',
      explanation: 'No hay datos históricos de dividendos disponibles para aplicar el método Geraldine Weiss.'
    }
  };
};
