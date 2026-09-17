/**
 * High-Performance Retina Canvas Charting Engine
 * 
 * Supports:
 * - Monte Carlo Percentile Fan Chart (10th, 25th, 50th, 75th, 90th bands)
 * - Stacked Account Trajectory Chart (Liquid vs Tax-Deferred vs Roth)
 * - Annual Retirement Cash Flows & Shortfall Breakdown
 * - Historical Stress Test Comparison Bars
 * - Retina sharp scaling & interactive mouse hover tooltips
 */

export class RetirementCharts {
  constructor() {
    this.activeTooltip = null;
  }

  /**
   * Helper to set canvas dimensions respecting device pixel ratio (Retina displays)
   */
  static setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 420;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
    return { ctx, width, height, dpr };
  }

  /**
   * Format currency values compactly ($1.2M, $450k, etc.)
   */
  static formatCurrency(val) {
    if (Math.abs(val) >= 1_000_000) {
      return `$${(val / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(val) >= 1_000) {
      return `$${Math.round(val / 1_000)}k`;
    }
    return `$${Math.round(val)}`;
  }

  /**
   * Chart 1: Monte Carlo Fan Chart with Percentile Ribbons
   */
  static renderFanChart(canvas, data, options = {}) {
    const { ctx, width, height } = RetirementCharts.setupCanvas(canvas);
    if (!data || data.length === 0) return;

    const {
      retirementAge = 65,
      isDark = false,
      hoverAge = null
    } = options;

    const padding = { top: 30, right: 40, bottom: 45, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const ages = data.map(d => d.age);
    const minAge = ages[0];
    const maxAge = ages[ages.length - 1];

    // Find max value across p90 to scale y-axis (cap at reasonable upper bound to avoid extreme scale)
    const maxVal = Math.max(100000, ...data.map(d => Math.min(d.p90, d.p50 * 5)));
    const yTicks = 5;

    // Coordinate transforms
    const getX = age => padding.left + ((age - minAge) / (maxAge - minAge)) * chartW;
    const getY = val => padding.top + chartH - (Math.max(0, val) / maxVal) * chartH;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Styling colors
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const p10_90_Color = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(14, 165, 233, 0.15)';
    const p25_75_Color = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(14, 165, 233, 0.28)';
    const medianColor = isDark ? '#38bdf8' : '#0284c7';
    const baseLineColor = isDark ? '#a855f7' : '#7c3aed';

    // Draw horizontal grid lines & Y labels
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= yTicks; i++) {
      const val = (maxVal / yTicks) * i;
      const y = getY(val);

      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      ctx.fillText(RetirementCharts.formatCurrency(val), padding.left - 10, y);
    }

    // Draw X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ageStep = Math.max(5, Math.round((maxAge - minAge) / 8));
    for (let age = minAge; age <= maxAge; age += ageStep) {
      const x = getX(age);
      ctx.fillText(`Age ${age}`, x, padding.top + chartH + 10);
    }

    // 1. Shaded Ribbon: 10th to 90th percentile
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = getX(data[i].age);
      const y = getY(Math.min(maxVal, data[i].p90));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = data.length - 1; i >= 0; i--) {
      const x = getX(data[i].age);
      const y = getY(data[i].p10);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = p10_90_Color;
    ctx.fill();

    // 2. Shaded Ribbon: 25th to 75th percentile
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = getX(data[i].age);
      const y = getY(Math.min(maxVal, data[i].p75));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = data.length - 1; i >= 0; i--) {
      const x = getX(data[i].age);
      const y = getY(data[i].p25);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = p25_75_Color;
    ctx.fill();

    // 3. Median Curve (p50)
    ctx.beginPath();
    ctx.strokeStyle = medianColor;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < data.length; i++) {
      const x = getX(data[i].age);
      const y = getY(data[i].p50);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 4. Retirement Age vertical line marker
    if (retirementAge >= minAge && retirementAge <= maxAge) {
      const rx = getX(retirementAge);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, padding.top);
      ctx.lineTo(rx, padding.top + chartH);
      ctx.stroke();
      ctx.restore();

      // Tag label
      ctx.fillStyle = isDark ? '#f59e0b' : '#d97706';
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`Retirement (Age ${retirementAge})`, rx, padding.top - 12);
    }

    // 5. Zero Net Worth baseline
    const zeroY = getY(0);
    ctx.beginPath();
    ctx.strokeStyle = isDark ? '#ef4444' : '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(padding.left + chartW, zeroY);
    ctx.stroke();

    // 6. Interactive Hover Tooltip Guide Line
    if (hoverAge !== null && hoverAge >= minAge && hoverAge <= maxAge) {
      const hx = getX(hoverAge);
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, padding.top + chartH);
      ctx.stroke();
      ctx.restore();

      const point = data.find(d => d.age === hoverAge);
      if (point) {
        // Draw circles at key percentiles
        [point.p10, point.p50, point.p90].forEach(val => {
          ctx.beginPath();
          ctx.arc(hx, getY(val), 4, 0, Math.PI * 2);
          ctx.fillStyle = medianColor;
          ctx.fill();
          ctx.strokeStyle = isDark ? '#0f172a' : '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    }
  }

  /**
   * Chart 2: Net Worth Stacked Breakdown by Account Type (Liquid vs Tax-Deferred vs Roth)
   */
  static renderAccountStackChart(canvas, yearlyResults, options = {}) {
    const { ctx, width, height } = RetirementCharts.setupCanvas(canvas);
    if (!yearlyResults || yearlyResults.length === 0) return;

    const {
      retirementAge = 65,
      isDark = false
    } = options;

    const padding = { top: 30, right: 40, bottom: 45, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const minAge = yearlyResults[0].age;
    const maxAge = yearlyResults[yearlyResults.length - 1].age;
    const maxVal = Math.max(100000, ...yearlyResults.map(y => y.liquid + y.taxDeferred + y.roth)) * 1.05;

    const getX = age => padding.left + ((age - minAge) / (maxAge - minAge)) * chartW;
    const getY = val => padding.top + chartH - (Math.max(0, val) / maxVal) * chartH;

    ctx.clearRect(0, 0, width, height);

    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    // Account layer colors
    const colLiquid = isDark ? '#10b981' : '#059669';       // Emerald
    const colTaxDeferred = isDark ? '#6366f1' : '#4f46e5';  // Indigo
    const colRoth = isDark ? '#ec4899' : '#db2777';         // Pink/Purple

    // Grid lines & labels
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 5; i++) {
      const val = (maxVal / 5) * i;
      const y = getY(val);
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      ctx.fillText(RetirementCharts.formatCurrency(val), padding.left - 10, y);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = Math.max(5, Math.round((maxAge - minAge) / 8));
    for (let age = minAge; age <= maxAge; age += step) {
      ctx.fillText(`Age ${age}`, getX(age), padding.top + chartH + 10);
    }

    // 1. Stack 1: Liquid (from 0 to liquid)
    ctx.beginPath();
    ctx.moveTo(getX(yearlyResults[0].age), getY(yearlyResults[0].liquid));
    for (let i = 1; i < yearlyResults.length; i++) {
      ctx.lineTo(getX(yearlyResults[i].age), getY(yearlyResults[i].liquid));
    }
    ctx.lineTo(getX(yearlyResults[yearlyResults.length - 1].age), getY(0));
    ctx.lineTo(getX(yearlyResults[0].age), getY(0));
    ctx.closePath();
    ctx.fillStyle = colLiquid;
    ctx.globalAlpha = 0.85;
    ctx.fill();

    // 2. Stack 2: Tax-Deferred (from liquid to liquid + taxDeferred)
    ctx.beginPath();
    ctx.moveTo(getX(yearlyResults[0].age), getY(yearlyResults[0].liquid + yearlyResults[0].taxDeferred));
    for (let i = 1; i < yearlyResults.length; i++) {
      ctx.lineTo(getX(yearlyResults[i].age), getY(yearlyResults[i].liquid + yearlyResults[i].taxDeferred));
    }
    for (let i = yearlyResults.length - 1; i >= 0; i--) {
      ctx.lineTo(getX(yearlyResults[i].age), getY(yearlyResults[i].liquid));
    }
    ctx.closePath();
    ctx.fillStyle = colTaxDeferred;
    ctx.fill();

    // 3. Stack 3: Roth (from liquid + taxDeferred to total)
    ctx.beginPath();
    ctx.moveTo(getX(yearlyResults[0].age), getY(yearlyResults[0].totalNetWorth));
    for (let i = 1; i < yearlyResults.length; i++) {
      ctx.lineTo(getX(yearlyResults[i].age), getY(yearlyResults[i].totalNetWorth));
    }
    for (let i = yearlyResults.length - 1; i >= 0; i--) {
      ctx.lineTo(getX(yearlyResults[i].age), getY(yearlyResults[i].liquid + yearlyResults[i].taxDeferred));
    }
    ctx.closePath();
    ctx.fillStyle = colRoth;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Vertical line at retirement age
    if (retirementAge >= minAge && retirementAge <= maxAge) {
      const rx = getX(retirementAge);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, padding.top);
      ctx.lineTo(rx, padding.top + chartH);
      ctx.stroke();
      ctx.restore();
    }

    // Hover vertical guideline
    const hoverAge = options.hoverAge;
    if (hoverAge !== null && hoverAge !== undefined && hoverAge >= minAge && hoverAge <= maxAge) {
      const hx = getX(hoverAge);
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, padding.top + chartH);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Chart 3: Annual Retirement Cash Flows & Shortfall Breakdown
   */
  static renderCashFlowChart(canvas, yearlyResults, options = {}) {
    const { ctx, width, height } = RetirementCharts.setupCanvas(canvas);
    if (!yearlyResults) return;

    const retiredYears = yearlyResults.filter(y => y.isRetired);
    if (retiredYears.length === 0) return;

    const {
      isDark = false,
      hoverAge = null,
      includeExcessRmd = false
    } = options;

    const padding = { top: 30, right: 30, bottom: 45, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Scale Y-axis based on actual spending demand + living withdrawals
    const maxVal = Math.max(
      50000,
      ...retiredYears.map(y => {
        const spendDemand = y.spending + y.taxesPaid;
        const taxDef = (y.taxDeferredSpent ?? y.taxDeferredWithdrawn) + (includeExcessRmd ? (y.excessRmdSwept || 0) : 0);
        const totalInflows = y.guaranteedIncome + y.liquidWithdrawn + taxDef + y.rothWithdrawn;
        return Math.max(spendDemand, totalInflows);
      })
    ) * 1.15;

    const barWidth = Math.max(3, (chartW / retiredYears.length) * 0.72);

    const getX = index => padding.left + (index / (retiredYears.length - 1 || 1)) * (chartW - barWidth);
    const getY = val => padding.top + chartH - (Math.max(0, val) / maxVal) * chartH;

    ctx.clearRect(0, 0, width, height);

    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    // Grid lines & Y labels
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * i;
      const y = getY(val);
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      ctx.fillText(RetirementCharts.formatCurrency(val), padding.left - 10, y);
    }

    // Render bars for each retired year
    retiredYears.forEach((yr, idx) => {
      const x = getX(idx);
      const isHovered = (hoverAge !== null && yr.age === hoverAge);

      // Highlight background if hovered
      if (isHovered) {
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(x - 2, padding.top, barWidth + 4, chartH);
      }

      let currentBottom = getY(0);

      // Stack 1a: Spouse Working Salary (Warm Amber / Tangerine)
      const spouseSalary = yr.spouseWorkingIncome || 0;
      if (spouseSalary > 0) {
        const spouseHeight = (spouseSalary / maxVal) * chartH;
        ctx.fillStyle = isDark ? '#f59e0b' : '#d97706'; // Warm Amber/Gold
        ctx.fillRect(x, currentBottom - spouseHeight, barWidth, spouseHeight);
        currentBottom -= spouseHeight;
      }

      // Stack 1b: Other Guaranteed Income (Social Security + Pensions)
      const otherInc = Math.max(0, yr.guaranteedIncome - spouseSalary);
      if (otherInc > 0) {
        const incHeight = (otherInc / maxVal) * chartH;
        ctx.fillStyle = isDark ? '#3b82f6' : '#2563eb'; // Royal Blue
        ctx.fillRect(x, currentBottom - incHeight, barWidth, incHeight);
        currentBottom -= incHeight;
      }

      // Stack 2: Liquid Account Drawdown (Vibrant Emerald Green)
      const liqHeight = (yr.liquidWithdrawn / maxVal) * chartH;
      if (liqHeight > 0) {
        ctx.fillStyle = isDark ? '#10b981' : '#059669'; // Emerald Green
        ctx.fillRect(x, currentBottom - liqHeight, barWidth, liqHeight);
        currentBottom -= liqHeight;
      }

      // Stack 3: Tax-Deferred 401(k) used for spending & taxes (Royal Purple)
      const defSpent = yr.taxDeferredSpent ?? yr.taxDeferredWithdrawn;
      if (defSpent > 0) {
        const defHeight = (defSpent / maxVal) * chartH;
        ctx.fillStyle = isDark ? '#8b5cf6' : '#7c3aed'; // Purple
        ctx.fillRect(x, currentBottom - defHeight, barWidth, defHeight);
        currentBottom -= defHeight;
      }

      // Stack 3b: Excess RMD swept into liquid taxable savings (Optional top layer)
      if (includeExcessRmd && (yr.excessRmdSwept || 0) > 0) {
        const excessHeight = (yr.excessRmdSwept / maxVal) * chartH;
        ctx.fillStyle = isDark ? 'rgba(196, 181, 253, 0.4)' : 'rgba(124, 58, 237, 0.25)';
        ctx.fillRect(x, currentBottom - excessHeight, barWidth, excessHeight);
        currentBottom -= excessHeight;
      }

      // Stack 4: Roth withdrawal (Vivid Pink)
      if ((yr.rothWithdrawn || 0) > 0) {
        const rothHeight = (yr.rothWithdrawn / maxVal) * chartH;
        ctx.fillStyle = isDark ? '#ec4899' : '#db2777'; // Pink
        ctx.fillRect(x, currentBottom - rothHeight, barWidth, rothHeight);
        currentBottom -= rothHeight;
      }

      // Stack 5: Shortfall (if portfolio ran dry)
      if (yr.shortfall > 0) {
        const shortHeight = (yr.shortfall / maxVal) * chartH;
        ctx.fillStyle = isDark ? '#ef4444' : '#dc2626'; // Red
        ctx.fillRect(x, currentBottom - shortHeight, barWidth, shortHeight);
      }

      // Selection outline if hovered
      if (isHovered) {
        ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 1, currentBottom, barWidth + 2, getY(0) - currentBottom);
      }

      // X labels (every ~5 years)
      if (idx % 5 === 0 || idx === retiredYears.length - 1) {
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`Age ${yr.age}`, x + barWidth / 2, padding.top + chartH + 8);
      }
    });

    // Essential Spending Floor Baseline (Dashed Warm Amber Line)
    const hasEssential = retiredYears.some(yr => (yr.essentialSpending || 0) > 0);
    if (hasEssential) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = isDark ? '#fbbf24' : '#d97706';
      ctx.lineWidth = 2;
      retiredYears.forEach((yr, idx) => {
        const x = getX(idx) + barWidth / 2;
        const y = getY(yr.essentialSpending || yr.spending * 0.7);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      // Dot markers for essential line
      retiredYears.forEach((yr, idx) => {
        if (idx % 2 === 0 || yr.age === hoverAge) {
          const x = getX(idx) + barWidth / 2;
          const y = getY(yr.essentialSpending || yr.spending * 0.7);
          ctx.beginPath();
          ctx.arc(x, y, yr.age === hoverAge ? 3.5 : 2, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? '#fbbf24' : '#d97706';
          ctx.fill();
        }
      });
    }

    // Total Spending + Taxes Target Line (Crisp Rose Red with dots)
    ctx.beginPath();
    ctx.strokeStyle = isDark ? '#f43f5e' : '#e11d48';
    ctx.lineWidth = 2.5;
    retiredYears.forEach((yr, idx) => {
      const x = getX(idx) + barWidth / 2;
      const y = getY(yr.spending + yr.taxesPaid);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw circular dots on the target line
    retiredYears.forEach((yr, idx) => {
      if (idx % 2 === 0 || yr.age === hoverAge) {
        const x = getX(idx) + barWidth / 2;
        const y = getY(yr.spending + yr.taxesPaid);
        ctx.beginPath();
        ctx.arc(x, y, yr.age === hoverAge ? 4.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? '#f43f5e' : '#e11d48';
        ctx.fill();
        ctx.strokeStyle = isDark ? '#111827' : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }

  /**
   * Chart 4: Historical Crisis Stress Test Results
   */
  static renderStressTestChart(canvas, stressResults, options = {}) {
    const { ctx, width, height } = RetirementCharts.setupCanvas(canvas);
    if (!stressResults || stressResults.length === 0) return;

    const { isDark = false } = options;
    const padding = { top: 16, right: 25, bottom: 16, left: 205 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    const rowH = chartH / stressResults.length;
    const barH = Math.min(22, rowH * 0.62);

    stressResults.forEach((item, idx) => {
      const y = padding.top + idx * rowH + (rowH - barH) / 2;
      const label = item.scenarioName || `Era Starting ${item.startYear}`;

      // Row background zebra stripe
      if (idx % 2 === 0) {
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)';
        ctx.fillRect(0, padding.top + idx * rowH, width, rowH);
      }

      // Label
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, padding.left - 15, y + barH / 2);

      // Status bar
      const barX = padding.left;
      const fullBarW = chartW * 0.52;

      if (item.success) {
        // Full green bar
        ctx.fillStyle = isDark ? '#10b981' : '#059669';
        ctx.beginPath();
        ctx.roundRect?.(barX, y, fullBarW, barH, 4) || ctx.fillRect(barX, y, fullBarW, barH);
        ctx.fill();

        // Ending wealth badge
        ctx.fillStyle = isDark ? '#a7f3d0' : '#065f46';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
          `Survived! Ending Net Worth: ${RetirementCharts.formatCurrency(item.finalNetWorth)}`,
          barX + fullBarW + 12,
          y + barH / 2
        );
      } else {
        // Red shortfall bar
        const partialW = Math.max(30, fullBarW * 0.45);
        ctx.fillStyle = isDark ? '#ef4444' : '#dc2626';
        ctx.beginPath();
        ctx.roundRect?.(barX, y, partialW, barH, 4) || ctx.fillRect(barX, y, partialW, barH);
        ctx.fill();

        ctx.fillStyle = isDark ? '#fca5a5' : '#991b1b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
          `Depleted at Age ${item.failureAge} (Shortfall: ${RetirementCharts.formatCurrency(item.cumulativeShortfall)})`,
          barX + partialW + 12,
          y + barH / 2
        );
      }
    });
  }
}
