/**
 * Genera un análisis cualitativo y cuantitativo simulado por experto financiero
 * utilizando las métricas reales del ticker.
 */
export const generateFallbackAnalysis = (stock) => {
  const { ticker, companyName, sector, industry, description, scores, metrics } = stock;
  
  // Determinar Moat Competitivo
  let moatLevel = 'Sin Ventaja Significativa (No Moat)';
  let moatText = 'La empresa opera en un entorno altamente competitivo con márgenes de beneficio normales o bajos. Sus barreras de entrada son débiles y carece de un fuerte poder de fijación de precios.';
  
  if (metrics.operatingMargin.raw >= 0.20 && metrics.roe.raw >= 0.18) {
    moatLevel = 'Ventaja Competitiva Amplia (Wide Moat)';
    moatText = `Excelente poder de fijación de precios y rentabilidad sobre el capital superior al promedio (${metrics.roe.formatted}). Su alta rentabilidad sugiere la existencia de barreras de entrada masivas, costes de cambio elevados para los clientes, o potentes efectos de red.`;
  } else if (metrics.operatingMargin.raw >= 0.08 || metrics.roe.raw >= 0.10) {
    moatLevel = 'Ventaja Competitiva Estrecha (Narrow Moat)';
    moatText = 'Posee ciertas ventajas defensivas como el reconocimiento de marca, propiedad intelectual o eficiencias de costes. Aunque ofrece retornos saludables, se enfrenta a una competencia moderada que limita su control absoluto del mercado.';
  }

  // Generar Fortalezas (Strengths) basadas en datos
  const strengths = [];
  if (metrics.netCash.raw > 0) {
    strengths.push(`**Excelente salud financiera**: Dispone de caja neta positiva de ${metrics.netCash.formatted}, lo que reduce enormemente el riesgo financiero y le permite financiar su crecimiento orgánico o adquisiciones sin depender del crédito.`);
  } else if (metrics.debtToEquity.score >= 70) {
    strengths.push(`**Nivel de apalancamiento conservador**: Su relación Deuda/Patrimonio de ${metrics.debtToEquity.formatted} indica un balance robusto y controlado.`);
  }
  
  if (metrics.operatingMargin.raw >= 0.18) {
    strengths.push(`**Elevado Margen de Operaciones**: Su margen operativo de ${metrics.operatingMargin.formatted} demuestra un control de costes sobresaliente y una ventaja competitiva de escala o marca.`);
  }
  
  if (metrics.roe.raw >= 0.18) {
    strengths.push(`**Eficiencia de capital sobresaliente**: El ROE de ${metrics.roe.formatted} denota una dirección excepcional, capaz de multiplicar con gran éxito el capital invertido de los socios.`);
  }
  
  if (metrics.revenueGrowth.raw >= 0.10) {
    strengths.push(`**Fuerte tracción comercial**: Crece en ingresos a una tasa interanual del ${metrics.revenueGrowth.formatted}, demostrando que sus productos/servicios siguen ganando cuota de mercado.`);
  }

  if (strengths.length < 2) {
    strengths.push(`**Presencia establecida**: Opera como un actor clave en el sector de ${sector}, con una base operativa sólida.`);
    strengths.push(`**Generación de flujo operativo**: Mantiene un flujo de caja operativo que sustenta su operativa diaria.`);
  }

  // Generar Debilidades (Weaknesses) basadas en datos
  const weaknesses = [];
  if (metrics.netCash.raw < 0) {
    weaknesses.push(`**Deuda neta de ${metrics.netCash.formatted}**: La empresa está apalancada. Aunque puede ser manejable, en periodos de tipos de interés altos, esto representa una carga financiera que restringe su flujo de caja libre.`);
  }
  if (metrics.currentRatio.raw < 1.1) {
    weaknesses.push(`**Liquidez ajustada**: Su Ratio Corriente de ${metrics.currentRatio.formatted} está por debajo de niveles óptimos, lo que indica tensiones potenciales de tesorería a corto plazo.`);
  }
  if (metrics.operatingMargin.raw < 0.08) {
    weaknesses.push(`**Márgenes operativos reducidos (${metrics.operatingMargin.formatted})**: Cualquier subida de costes en materias primas o salarios puede impactar drásticamente su rentabilidad final.`);
  }
  if (metrics.revenueGrowth.raw < 0) {
    weaknesses.push(`**Contracción de ingresos**: La caída en ventas del ${metrics.revenueGrowth.formatted} sugiere madurez de producto o pérdida de cuota frente a rivales directos.`);
  }

  if (weaknesses.length < 2) {
    weaknesses.push(`**Sensibilidad al ciclo económico**: Como parte de la industria de ${industry}, sus resultados anuales están fuertemente ligados a la confianza de los consumidores y condiciones macro.`);
    weaknesses.push(`**Costes de reinversión**: Requiere un flujo continuo de gasto en capital (CapEx) para mantener su posicionamiento en el mercado.`);
  }

  // Oportunidades sectoriales (Opportunities)
  const opportunities = [];
  if (sector.toLowerCase().includes('technology') || sector.toLowerCase().includes('tecnología')) {
    opportunities.push('**Integración de Inteligencia Artificial**: Automatización de procesos y optimización de productos SaaS que incrementarán el valor por usuario.');
    opportunities.push('**Expansión en la Nube e infraestructura híbrida**: Transición de antiguos clientes corporativos hacia modelos de suscripción escalables.');
  } else if (sector.toLowerCase().includes('financial') || sector.toLowerCase().includes('finanzas')) {
    opportunities.push('**Digitalización y Fintech**: Lanzamiento de microservicios financieros para capturar audiencias más jóvenes.');
    opportunities.push('**Gestión de activos alternativos**: Creciente interés en capital riesgo y fondos indexados privados.');
  } else if (sector.toLowerCase().includes('consumer') || sector.toLowerCase().includes('consumo')) {
    opportunities.push('**Venta directa al consumidor (D2C)**: Eliminación de intermediarios tradicionales que elevará los márgenes brutos.');
    opportunities.push('**Mercados emergentes**: Expansión internacional en regiones en desarrollo con clase media en crecimiento rápido.');
  } else if (sector.toLowerCase().includes('healthcare') || sector.toLowerCase().includes('salud')) {
    opportunities.push('**Medicina de precisión y biotecnología**: Avances científicos aplicados a nuevas patentes con exclusividad de comercialización.');
    opportunities.push('**Envejecimiento demográfico**: Incremento orgánico en la demanda de tratamientos crónicos a nivel global.');
  } else {
    opportunities.push('**Expansión geográfica**: Oportunidades de consolidar mercados fragmentados fuera de su geografía principal.');
    opportunities.push('**Optimización operativa**: Implementación de tecnologías digitales para recortar costes operativos indirectos.');
  }
  opportunities.push('**Fusiones y Adquisiciones (M&A)**: La solidez de su balance permite comprar competidores más pequeños en momentos de valoración atractiva.');

  // Amenazas sectoriales (Threats)
  const threats = [];
  threats.push('**Endurecimiento regulatorio y fiscal**: Escrutinio antimonopolio y nuevas normativas de protección de datos o sostenibilidad.');
  threats.push('**Presión inflacionaria**: Subida persistente de costes salariales y de cadena de suministro que devore los márgenes brutos.');
  if (sector.toLowerCase().includes('technology')) {
    threats.push('**Obsolescencia tecnológica rápida**: Emergencia de nuevos paradigmas de software que desplacen su oferta actual.');
  } else {
    threats.push('**Competencia intensa de disruptores digitales**: Modelos de negocio más ágiles que atacan directamente sus líneas de ingresos más rentables.');
  }

  // Tesis e hipótesis de valoración
  let valuationThesis = '';
  if (scores.valuation >= 70) {
    valuationThesis = `El punto de valoración actual es altamente atractivo (Puntuación de Valoración: ${scores.valuation}/100). Cotiza a múltiplos muy razonables en relación con su generación de caja y crecimiento esperado, ofreciendo un amplio margen de seguridad para el inversor a largo plazo.`;
  } else if (scores.valuation >= 50) {
    valuationThesis = `La valoración es justa (Puntuación de Valoración: ${scores.valuation}/100). El precio de la acción descuenta de forma equilibrada la calidad del negocio. No es una ganga, pero ofrece retornos razonables alineados con el crecimiento orgánico de la empresa.`;
  } else {
    valuationThesis = `La valoración actual exige precaución (Puntuación de Valoración: ${scores.valuation}/100). El mercado paga múltiplos muy exigentes por esta acción. No hay apenas margen de seguridad y cualquier pequeña decepción en los informes de beneficios futuros podría provocar correcciones severas de cotización.`;
  }

  // Calidad como inversión a largo plazo
  let qualityThesis = '';
  if (scores.financialHealth >= 70 && scores.profitability >= 70) {
    qualityThesis = `Esta acción encaja perfectamente en una estrategia de inversión *Core Growth* o *Quality Investing*. Cumple con las métricas típicas de un compuesto financiero ("compounder"): gran generación de caja, balance sin fisuras, un Piotroski F-Score de **${stock.piotroski.score}/9** (${stock.piotroski.status}) y una rentabilidad del capital excelente.`;
  } else if (scores.financialHealth >= 60 && scores.profitability >= 50) {
    qualityThesis = `Se trata de un negocio sólido y maduro, ideal para carteras de dividendos o inversión de valor estable. Su Piotroski F-Score es de **${stock.piotroski.score}/9** (${stock.piotroski.status}). Aunque sus tasas de crecimiento son moderadas, su resistencia operativa la convierte en un activo defensivo de primer orden.`;
  } else {
    qualityThesis = `El perfil del negocio exige una gestión de riesgo muy estrecha. Opera con debilidades estructurales (alto apalancamiento, rentabilidad inestable o crecimiento negativo). Su Piotroski F-Score de **${stock.piotroski.score}/9** (${stock.piotroski.status}) aconseja extremar precauciones. Es apta únicamente para inversores especulativos o para búsquedas de giros de negocio ("turnaround") puntuales.`;
  }

  // Intrinsic value text addition
  let ivText = '';
  if (stock.intrinsicValue.average) {
    const formattedIV = stock.intrinsicValue.average.toLocaleString('en-US', { style: 'currency', currency: stock.currency });
    const formattedPrice = stock.price.toLocaleString('en-US', { style: 'currency', currency: stock.currency });
    const mos = stock.intrinsicValue.marginOfSafety;
    const mosText = mos >= 0 
      ? `ofreciendo un **Margen de Seguridad del ${mos.toFixed(1)}%** (subvaluada)`
      : `lo que representa una **prima/sobreprecio del ${Math.abs(mos).toFixed(1)}%** sobre su valor de tasación (sobrevaluada)`;
    
    ivText = `El modelo de valoración híbrido (Graham + DCF) estima un **Valor Intrínseco de ${formattedIV}** por acción frente a un precio actual de **${formattedPrice}**, ${mosText}.`;
  }

  return `
### Resumen del Perfil de Inversión

**${companyName} (${ticker})** opera en el sector de **${sector}** (${industry}). Cuenta con una puntuación general de calidad y valoración de **${scores.overall}/100**, lo que la posiciona dentro del perfil: **${stock.profile}**. Presenta un Piotroski F-Score de **${stock.piotroski.score}/9** (${stock.piotroski.status}) y una política de dividendos calificada como **${stock.dividendSafety.status}** ${stock.dividendSafety.yield ? `(Rentabilidad: ${(stock.dividendSafety.yield * 100).toFixed(2)}%)` : ''}.

### Ventaja Competitiva (Moat)
- **Clasificación**: ${moatLevel}
- **Análisis**: ${moatText}

<div class="swot-grid">
  <div class="swot-card swot-strengths">
    <div class="swot-card-title">💪 Fortalezas</div>
    <div class="swot-card-content">
      <ul>
        ${strengths.map(s => `<li>${s}</li>`).join('')}
      </ul>
    </div>
  </div>
  <div class="swot-card swot-weaknesses">
    <div class="swot-card-title">⚠️ Debilidades</div>
    <div class="swot-card-content">
      <ul>
        ${weaknesses.map(w => `<li>${w}</li>`).join('')}
      </ul>
    </div>
  </div>
  <div class="swot-card swot-opportunities">
    <div class="swot-card-title">🚀 Oportunidades</div>
    <div class="swot-card-content">
      <ul>
        ${opportunities.map(o => `<li>${o}</li>`).join('')}
      </ul>
    </div>
  </div>
  <div class="swot-card swot-threats">
    <div class="swot-card-title">💣 Amenazas</div>
    <div class="swot-card-content">
      <ul>
        ${threats.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>
  </div>
</div>

### Tesis de Valoración & Margen de Seguridad
${valuationThesis}

${ivText}

### Veredicto de Inversión a Largo Plazo
${qualityThesis}
`;
};
