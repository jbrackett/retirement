/**
 * Application Controller & Reactive UI Coordinator
 */

import {
  runMonteCarloSimulation,
  runHistoricalStressTests,
  WITHDRAWAL_STRATEGIES,
  STRATEGY_DESCRIPTIONS
} from './simulation_engine.js';
import { RetirementCharts } from './charts.js';
import {
  parseSheetText,
  aggregateBalances,
  CATEGORIES,
  CATEGORY_LABELS,
  SAMPLE_SHEET_DATA
} from './sheet_importer.js';

// Baseline Default Plan Template (used when no saved plan exists or upon explicit reset)
const DEFAULT_PLAN = {
  demographics: { currentAge: 45, retirementAge: 65, endAge: 95, includeSpouse: true, spouseCurrentAge: 43, spouseRetirementAge: 67, spouseAnnualIncome: 65000 },
  accounts: {
    liquid: 150000,
    taxDeferred: 600000,
    roth: 100000,
    annualSavingsLiquid: 10000,
    annualSavingsTaxDeferred: 23000,
    annualSavingsRoth: 8000,
    employerMatch: 7000,
    savingsGrowthRate: 0.025
  },
  spending: { baseAnnualSpend: 80000, essentialPct: 70, enableBeltTightening: true, beltTighteningPct: 50, spendingModel: 'smile', oneTimeEvents: [] },
  incomeSources: {
    socialSecurity: 36000, socialSecurityStartAge: 67,
    spouseSocialSecurity: 22000, spouseSocialSecurityStartAge: 67,
    spouseAnnualIncome: 65000,
    pension: 0, pensionStartAge: 65, pensionInflationAdjusted: true,
    otherIncome: 0, otherIncomeStartAge: 65, otherIncomeEndAge: 70
  },
  portfolio: { stockPct: 70, bondPct: 25, cashPct: 5, glidePath: true },
  assumptions: {
    stockReturn: 0.095, stockStdDev: 0.18,
    bondReturn: 0.045, bondStdDev: 0.075,
    cashReturn: 0.03, inflationRate: 0.028,
    taxFilingStatus: 'married'
  },
  strategy: { type: 'liquidFirst', targetBracketRate: 0.12, enableRuleOf55: true, enableRule72t: true },
  simulationConfig: { mode: 'monteCarloParametric', iterations: 10000 }
};

class RetirementApp {
  constructor() {
    this.currentInputs = JSON.parse(JSON.stringify(DEFAULT_PLAN));
    this.currentSimulationResult = null;
    this.activeTab = 'fan';
    this.hoverAge = null;
    this.includeExcessRmd = false;
    this.debounceTimer = null;
    this.isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.parsedAccounts = [];

    this.init();
  }

  init() {
    // Set initial theme
    if (this.isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.getElementById('btn-theme').textContent = '☀️ Theme';
    }

    // Try restoring state from localStorage
    const saved = localStorage.getItem('retirement_plan_inputs');
    if (saved) {
      try {
        this.currentInputs = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load saved state, using default:', e);
      }
    }

    this.syncFormFromState();
    this.bindEvents();
    this.runSimulation();
    this.updateStatusBadge();
  }

  /**
   * Sync form UI controls with state
   */
  syncFormFromState() {
    const inputs = this.currentInputs;

    // Timeline
    this.setVal('input-current-age', inputs.demographics.currentAge);
    this.setVal('input-retirement-age', inputs.demographics.retirementAge);
    this.setVal('input-end-age', inputs.demographics.endAge);
    document.getElementById('input-include-spouse').checked = !!inputs.demographics.includeSpouse;
    this.setVal('input-spouse-age', inputs.demographics.spouseCurrentAge);
    this.setVal('input-spouse-retirement-age', inputs.demographics.spouseRetirementAge ?? inputs.demographics.retirementAge);
    this.setVal('input-spouse-salary', inputs.incomeSources?.spouseAnnualIncome ?? inputs.demographics.spouseAnnualIncome ?? 0);
    this.setVal('input-tax-filing', inputs.assumptions.taxFilingStatus || 'married');

    // Balances
    this.setVal('input-liquid', inputs.accounts.liquid);
    this.setVal('input-tax-deferred', inputs.accounts.taxDeferred);
    this.setVal('input-roth', inputs.accounts.roth);

    // Savings
    this.setVal('input-save-liquid', inputs.accounts.annualSavingsLiquid);
    this.setVal('input-save-deferred', inputs.accounts.annualSavingsTaxDeferred);
    this.setVal('input-employer-match', inputs.accounts.employerMatch);
    this.setVal('input-save-roth', inputs.accounts.annualSavingsRoth);
    this.setVal('input-wage-growth', (inputs.accounts.savingsGrowthRate || 0.02) * 100);

    // Spending
    this.setVal('input-base-spend', inputs.spending.baseAnnualSpend);
    this.setVal('input-essential-pct', inputs.spending.essentialPct ?? 70);
    this.setVal('input-spend-model', inputs.spending.spendingModel || 'smile');
    const beltEl = document.getElementById('input-belt-tightening');
    if (beltEl) beltEl.checked = inputs.spending.enableBeltTightening !== false;
    this.setVal('input-belt-tighten-pct', inputs.spending.beltTighteningPct ?? 50);
    this.updateBeltTighteningVisibility();
    this.updateEssentialSplitDisplay();

    // Incomes
    this.setVal('input-ss-benefit', inputs.incomeSources.socialSecurity);
    this.setVal('input-ss-age', inputs.incomeSources.socialSecurityStartAge);
    this.setVal('input-spouse-ss', inputs.incomeSources.spouseSocialSecurity);
    this.setVal('input-spouse-ss-age', inputs.incomeSources.spouseSocialSecurityStartAge);
    this.setVal('input-pension', inputs.incomeSources.pension);
    this.setVal('input-pension-age', inputs.incomeSources.pensionStartAge);

    // Portfolio
    this.setVal('input-stocks', inputs.portfolio.stockPct);
    this.setVal('input-bonds', inputs.portfolio.bondPct);
    this.setVal('input-cash', inputs.portfolio.cashPct);
    document.getElementById('input-glidepath').checked = !!inputs.portfolio.glidePath;
    this.setVal('input-sim-mode', inputs.simulationConfig.mode);
    this.setVal('input-sim-iterations', String(inputs.simulationConfig.iterations || 10000));

    // Strategy
    const strat = inputs.strategy || { type: 'liquidFirst', targetBracketRate: 0.12, enableRuleOf55: true };
    this.setVal('input-withdrawal-strategy', strat.type || 'liquidFirst');
    this.setVal('input-target-bracket', String(strat.targetBracketRate ?? 0.12));
    const rule55El = document.getElementById('input-rule-55');
    if (rule55El) rule55El.checked = strat.enableRuleOf55 !== false;
    const rule72tEl = document.getElementById('input-rule-72t');
    if (rule72tEl) rule72tEl.checked = strat.enableRule72t !== false;

    this.updateSpouseVisibility();
    this.updateStrategyUI();
  }

  updateStrategyUI() {
    const stratType = document.getElementById('input-withdrawal-strategy')?.value || 'liquidFirst';
    const targetBracketContainer = document.getElementById('strategy-target-bracket-container');
    if (targetBracketContainer) {
      targetBracketContainer.style.display = (stratType === 'bracketFilling' || stratType === 'rothConversion') ? 'block' : 'none';
    }

    const descObj = STRATEGY_DESCRIPTIONS[stratType] || STRATEGY_DESCRIPTIONS.liquidFirst;
    const titleEl = document.getElementById('strategy-card-title');
    const tagEl = document.getElementById('strategy-card-tagline');
    const descEl = document.getElementById('strategy-card-desc');

    if (titleEl) titleEl.textContent = descObj.name;
    if (tagEl) tagEl.textContent = descObj.tagline;
    if (descEl) descEl.textContent = descObj.details;
  }

  setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? val : '';
    if (id.startsWith('input-')) {
      const rangeEl = document.getElementById('range-' + id.slice(6));
      if (rangeEl) rangeEl.value = val !== undefined ? val : '';
    }
  }

  updateSpouseVisibility() {
    const isSpouse = document.getElementById('input-include-spouse').checked;
    const spouseContainer = document.getElementById('spouse-fields-container');
    const spouseSSRow = document.getElementById('spouse-ss-row');
    if (spouseContainer) spouseContainer.style.display = isSpouse ? 'block' : 'none';
    if (spouseSSRow) spouseSSRow.style.display = isSpouse ? 'grid' : 'none';
  }

  updateEssentialSplitDisplay() {
    const baseSpend = parseFloat(document.getElementById('input-base-spend')?.value || 80000);
    const essentialPct = parseFloat(document.getElementById('input-essential-pct')?.value || 70);
    const essentialDollars = Math.round(baseSpend * (essentialPct / 100));
    const discDollars = Math.max(0, baseSpend - essentialDollars);
    const discPct = Math.max(0, 100 - essentialPct);

    const displayEl = document.getElementById('essential-split-display');
    if (displayEl) {
      displayEl.innerHTML = `
        <span>🛡️ <strong>Essential:</strong> $${essentialDollars.toLocaleString()}/yr (${essentialPct}%)</span>
        <span>🎉 <strong>Discretionary:</strong> $${discDollars.toLocaleString()}/yr (${discPct}%)</span>
      `;
    }

    const badgeEl = document.getElementById('guaranteed-floor-badge');
    if (badgeEl) {
      const ss1 = parseFloat(document.getElementById('input-ss-benefit')?.value || 0);
      const isSpouse = document.getElementById('input-include-spouse')?.checked;
      const ssSpouse = isSpouse ? parseFloat(document.getElementById('input-spouse-ss')?.value || 0) : 0;
      const pension = parseFloat(document.getElementById('input-pension')?.value || 0);
      const totalGuaranteed = ss1 + ssSpouse + pension;
      const ratio = essentialDollars > 0 ? (totalGuaranteed / essentialDollars) : 1;
      const pct = Math.round(ratio * 100);

      if (pct >= 100) {
        badgeEl.style.background = 'rgba(16, 185, 129, 0.1)';
        badgeEl.style.color = '#10b981';
        badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        badgeEl.innerHTML = `🛡️ <strong>Guaranteed Floor:</strong> ${pct}% of Essentials covered by SS & Pensions`;
      } else {
        const gap = Math.max(0, essentialDollars - totalGuaranteed);
        badgeEl.style.background = 'rgba(245, 158, 11, 0.1)';
        badgeEl.style.color = '#f59e0b';
        badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.2)';
        badgeEl.innerHTML = `🛡️ <strong>Guaranteed Floor:</strong> ${pct}% covered ($${gap.toLocaleString()}/yr gap relies on portfolio)`;
      }
    }
  }

  updateBeltTighteningVisibility() {
    const isEnabled = document.getElementById('input-belt-tightening')?.checked;
    const container = document.getElementById('belt-tightening-options');
    if (container) container.style.display = isEnabled ? 'block' : 'none';
    this.updateBeltTighteningDisplay();
  }

  updateBeltTighteningDisplay() {
    const baseSpend = parseFloat(document.getElementById('input-base-spend')?.value || 80000);
    const essentialPct = parseFloat(document.getElementById('input-essential-pct')?.value || 70);
    const cutPct = parseFloat(document.getElementById('input-belt-tighten-pct')?.value || 50);

    const essentialDollars = Math.round(baseSpend * (essentialPct / 100));
    const discDollars = Math.max(0, baseSpend - essentialDollars);
    const cutDollars = Math.round(discDollars * (cutPct / 100));

    const descEl = document.getElementById('belt-tightening-desc');
    if (descEl) {
      descEl.textContent = `📉 In down years: trims discretionary spend by ${cutPct}% ($${cutDollars.toLocaleString()}/yr savings) to protect the portfolio.`;
    }
  }

  /**
   * Pull values from form into current state
   */
  readStateFromForm() {
    const num = (id, fallback = 0) => {
      const v = parseFloat(document.getElementById(id)?.value);
      return isNaN(v) ? fallback : v;
    };

    const includeSpouse = document.getElementById('input-include-spouse').checked;

    this.currentInputs = {
      demographics: {
        currentAge: num('input-current-age', 45),
        retirementAge: num('input-retirement-age', 65),
        endAge: num('input-end-age', 95),
        includeSpouse,
        spouseCurrentAge: num('input-spouse-age', 43),
        spouseRetirementAge: num('input-spouse-retirement-age', 67),
        spouseAnnualIncome: num('input-spouse-salary', 0)
      },
      accounts: {
        liquid: num('input-liquid', 0),
        taxDeferred: num('input-tax-deferred', 0),
        roth: num('input-roth', 0),
        annualSavingsLiquid: num('input-save-liquid', 0),
        annualSavingsTaxDeferred: num('input-save-deferred', 0),
        annualSavingsRoth: num('input-save-roth', 0),
        employerMatch: num('input-employer-match', 0),
        savingsGrowthRate: num('input-wage-growth', 2.5) / 100
      },
      spending: {
        baseAnnualSpend: num('input-base-spend', 80000),
        essentialPct: num('input-essential-pct', 70),
        enableBeltTightening: document.getElementById('input-belt-tightening')?.checked ?? true,
        beltTighteningPct: num('input-belt-tighten-pct', 50),
        spendingModel: document.getElementById('input-spend-model').value,
        oneTimeEvents: this.currentInputs.spending.oneTimeEvents || []
      },
      incomeSources: {
        socialSecurity: num('input-ss-benefit', 0),
        socialSecurityStartAge: num('input-ss-age', 67),
        spouseSocialSecurity: includeSpouse ? num('input-spouse-ss', 0) : 0,
        spouseSocialSecurityStartAge: num('input-spouse-ss-age', 67),
        pension: num('input-pension', 0),
        pensionStartAge: num('input-pension-age', 65),
        pensionInflationAdjusted: true,
        otherIncome: 0,
        otherIncomeStartAge: 65,
        otherIncomeEndAge: 70
      },
      portfolio: {
        stockPct: num('input-stocks', 70),
        bondPct: num('input-bonds', 25),
        cashPct: num('input-cash', 5),
        glidePath: document.getElementById('input-glidepath').checked
      },
      assumptions: {
        stockReturn: 0.095,
        stockStdDev: 0.18,
        bondReturn: 0.045,
        bondStdDev: 0.075,
        cashReturn: 0.03,
        inflationRate: 0.028,
        taxFilingStatus: document.getElementById('input-tax-filing').value
      },
      strategy: {
        type: document.getElementById('input-withdrawal-strategy')?.value || 'liquidFirst',
        targetBracketRate: parseFloat(document.getElementById('input-target-bracket')?.value || '0.12'),
        enableRuleOf55: document.getElementById('input-rule-55')?.checked !== false,
        enableRule72t: document.getElementById('input-rule-72t')?.checked !== false
      },
      simulationConfig: {
        mode: document.getElementById('input-sim-mode').value,
        iterations: parseInt(document.getElementById('input-sim-iterations')?.value || '10000', 10)
      }
    };

    // Auto-save to localStorage
    localStorage.setItem('retirement_plan_inputs', JSON.stringify(this.currentInputs));
  }

  /**
   * Bind event listeners for sliders, inputs, tabs, export/import
   */
  bindEvents() {
    // Slider - Number sync pairs
    const pairs = [
      ['range-liquid', 'input-liquid'],
      ['range-tax-deferred', 'input-tax-deferred'],
      ['range-roth', 'input-roth'],
      ['range-base-spend', 'input-base-spend'],
      ['range-essential-pct', 'input-essential-pct'],
      ['range-belt-tighten-pct', 'input-belt-tighten-pct'],
      ['range-stocks', 'input-stocks'],
      ['range-bonds', 'input-bonds'],
      ['range-cash', 'input-cash']
    ];

    pairs.forEach(([rangeId, numId]) => {
      const r = document.getElementById(rangeId);
      const n = document.getElementById(numId);
      if (r && n) {
        r.addEventListener('input', () => {
          n.value = r.value;
          this.updateEssentialSplitDisplay();
          this.updateBeltTighteningDisplay();
        });
        n.addEventListener('input', () => {
          r.value = n.value;
          this.updateEssentialSplitDisplay();
          this.updateBeltTighteningDisplay();
        });
      }
    });

    // All form inputs
    document.querySelectorAll('.controls-panel input, .controls-panel select').forEach(el => {
      ['change', 'input'].forEach(evt => {
        el.addEventListener(evt, () => {
          this.updateSpouseVisibility();
          this.updateStrategyUI();
          this.updateEssentialSplitDisplay();
          this.updateBeltTighteningVisibility();
          this.queueRecalculation();
        });
      });
    });

    // Single Re-run button in sidebar panel header
    document.getElementById('btn-rerun')?.addEventListener('click', () => {
      this.triggerManualRerun();
    });

    // Direct immediate triggers for simulation mode and iterations
    const simIterSelect = document.getElementById('input-sim-iterations');
    const simModeSelect = document.getElementById('input-sim-mode');
    [simIterSelect, simModeSelect].forEach(sel => {
      if (!sel) return;
      ['change', 'input'].forEach(evt => {
        sel.addEventListener(evt, () => {
          this.triggerManualRerun();
        });
      });
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.renderActiveChart();
      });
    });

    // Reset button (with confirmation to avoid accidental data loss)
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      const confirmed = window.confirm('Reset all planning assumptions to baseline defaults? Your current inputs will be replaced.');
      if (confirmed) {
        this.currentInputs = JSON.parse(JSON.stringify(DEFAULT_PLAN));
        this.syncFormFromState();
        this.triggerManualRerun();
      }
    });

    // Theme toggle
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      this.isDark = !this.isDark;
      document.documentElement.setAttribute('data-theme', this.isDark ? 'dark' : 'light');
      document.getElementById('btn-theme').textContent = this.isDark ? '☀️ Theme' : '🌙 Theme';
      this.renderActiveChart();
    });

    // Export JSON
    document.getElementById('btn-export')?.addEventListener('click', () => {
      this.readStateFromForm();
      const blob = new Blob([JSON.stringify(this.currentInputs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retirement_plan_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import JSON
    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-import')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const loaded = JSON.parse(evt.target.result);
          this.currentInputs = loaded;
          this.syncFormFromState();
          this.runSimulation();
        } catch (err) {
          alert('Invalid JSON file format: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    // Print
    document.getElementById('btn-print')?.addEventListener('click', () => {
      window.print();
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.renderActiveChart();
    });

    // Canvas hover tracking
    const canvas = document.getElementById('main-chart-canvas');
    canvas?.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
    canvas?.addEventListener('mouseleave', () => this.clearCanvasHover());

    // Initialize Google Sheets / CSV Importer
    this.initSheetImporter();
  }

  /**
   * Set up event bindings for the Google Sheets / CSV Import Modal
   */
  initSheetImporter() {
    const modal = document.getElementById('sheet-import-modal');
    const openBtn = document.getElementById('btn-open-sheet-import');
    const closeBtn = document.getElementById('btn-close-import-modal');
    const cancelBtn = document.getElementById('btn-cancel-import');
    const applyBtn = document.getElementById('btn-apply-import');
    const pasteInput = document.getElementById('sheet-paste-input');
    const sampleBtn = document.getElementById('btn-load-sample-sheet');
    const clearBtn = document.getElementById('btn-clear-sheet-input');
    const uploadBtn = document.getElementById('btn-upload-sheet-file');
    const fileInput = document.getElementById('sheet-file-input');
    const tableBody = document.getElementById('import-table-body');

    if (!modal) return;

    const handleParse = (text) => {
      this.parsedAccounts = parseSheetText(text);
      this.renderImportTable();
    };

    const closeModal = () => {
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.removeAttribute('open');
      }
    };

    // Open Modal
    openBtn?.addEventListener('click', () => {
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
      if (pasteInput && pasteInput.value && this.parsedAccounts.length === 0) {
        handleParse(pasteInput.value);
      } else {
        this.renderImportTable();
      }
    });

    // Close & Cancel buttons
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Textarea input & paste listener
    pasteInput?.addEventListener('input', (e) => {
      handleParse(e.target.value);
    });

    // Load sample sheet
    sampleBtn?.addEventListener('click', () => {
      if (pasteInput) pasteInput.value = SAMPLE_SHEET_DATA;
      handleParse(SAMPLE_SHEET_DATA);
    });

    // Clear input
    clearBtn?.addEventListener('click', () => {
      if (pasteInput) pasteInput.value = '';
      this.parsedAccounts = [];
      this.renderImportTable();
    });

    // File upload
    uploadBtn?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        if (pasteInput) pasteInput.value = text;
        handleParse(text);
      };
      reader.readAsText(file);
    });

    // Table row changes (checkbox or category select)
    tableBody?.addEventListener('change', (e) => {
      const target = e.target;
      const id = parseInt(target.dataset.id, 10);
      const item = this.parsedAccounts.find(a => a.id === id);
      if (!item) return;

      if (target.classList.contains('import-inc-check')) {
        item.enabled = target.checked;
        if (item.enabled && item.category === CATEGORIES.IGNORE) {
          item.category = CATEGORIES.LIQUID;
        }
        this.renderImportTable();
      } else if (target.classList.contains('import-cat-select')) {
        item.category = target.value;
        item.enabled = target.value !== CATEGORIES.IGNORE;
        this.renderImportTable();
      }
    });

    // Apply to plan
    applyBtn?.addEventListener('click', () => {
      const agg = aggregateBalances(this.parsedAccounts);
      this.currentInputs.accounts.liquid = agg.liquid;
      this.currentInputs.accounts.taxDeferred = agg.taxDeferred;
      this.currentInputs.accounts.roth = agg.roth;
      this.syncFormFromState();
      this.runSimulation();
      closeModal();
    });
  }

  /**
   * Render detected accounts table and real-time subtotal chips
   */
  renderImportTable() {
    const tableBody = document.getElementById('import-table-body');
    const countEl = document.getElementById('detected-account-count');
    const applyBtn = document.getElementById('btn-apply-import');
    const chipLiquid = document.getElementById('chip-val-liquid');
    const chipDeferred = document.getElementById('chip-val-deferred');
    const chipRoth = document.getElementById('chip-val-roth');
    const chipTotal = document.getElementById('chip-val-total');

    if (!tableBody) return;

    const agg = aggregateBalances(this.parsedAccounts);

    if (chipLiquid) chipLiquid.textContent = `$${agg.liquid.toLocaleString()}`;
    if (chipDeferred) chipDeferred.textContent = `$${agg.taxDeferred.toLocaleString()}`;
    if (chipRoth) chipRoth.textContent = `$${agg.roth.toLocaleString()}`;
    if (chipTotal) chipTotal.textContent = `$${agg.totalIncluded.toLocaleString()}`;

    if (countEl) countEl.textContent = this.parsedAccounts.length;

    if (applyBtn) {
      applyBtn.disabled = (this.parsedAccounts.length === 0 || agg.totalIncluded === 0);
    }

    if (this.parsedAccounts.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            No accounts parsed yet. Paste cells from your Google Sheet above!
          </td>
        </tr>
      `;
      return;
    }

    const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    tableBody.innerHTML = this.parsedAccounts.map(account => {
      const isIgnored = !account.enabled || account.category === CATEGORIES.IGNORE;
      return `
        <tr class="${isIgnored ? 'row-ignored' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="import-inc-check" data-id="${account.id}" ${account.enabled ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
          </td>
          <td style="font-weight: 500;">
            ${escapeHtml(account.name)}
          </td>
          <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">
            $${account.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
          <td>
            <select class="import-cat-select" data-id="${account.id}">
              <option value="${CATEGORIES.LIQUID}" ${account.category === CATEGORIES.LIQUID ? 'selected' : ''}>${CATEGORY_LABELS.liquid}</option>
              <option value="${CATEGORIES.TAX_DEFERRED}" ${account.category === CATEGORIES.TAX_DEFERRED ? 'selected' : ''}>${CATEGORY_LABELS.taxDeferred}</option>
              <option value="${CATEGORIES.ROTH}" ${account.category === CATEGORIES.ROTH ? 'selected' : ''}>${CATEGORY_LABELS.roth}</option>
              <option value="${CATEGORIES.IGNORE}" ${account.category === CATEGORIES.IGNORE ? 'selected' : ''}>${CATEGORY_LABELS.ignore}</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  }

  queueRecalculation() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.readStateFromForm();
      const t0 = performance.now();
      this.runSimulation();
      const duration = Math.round(performance.now() - t0);
      this.updateStatusBadge(duration);
    }, 120);
  }

  /**
   * Triggers an immediate, responsive re-run with UI feedback
   */
  triggerManualRerun() {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.rerunTimer);
    this.rerunTimer = setTimeout(() => {
      this.executeRerun();
    }, 10);
  }

  /**
   * Executes simulation re-run, displaying a busy state before blocking calculation
   */
  executeRerun() {
    this.readStateFromForm();
    const iters = this.currentInputs.simulationConfig?.iterations || 10000;
    const mode = this.currentInputs.simulationConfig?.mode || 'monteCarloParametric';

    const rerunBtn = document.getElementById('btn-rerun');
    if (rerunBtn) {
      rerunBtn.disabled = true;
      if (!rerunBtn.dataset.originalText) {
        rerunBtn.dataset.originalText = rerunBtn.innerHTML;
      }
      rerunBtn.innerHTML = '⏳ Running...';
    }

    const statusBadge = document.getElementById('sim-status-badge');
    if (statusBadge) {
      statusBadge.textContent = `⏳ Simulating ${iters.toLocaleString()} runs...`;
      statusBadge.style.color = 'var(--primary)';
    }

    // Yield to the browser so the "Running..." spinner paints before synchronous simulation blocks
    requestAnimationFrame(() => {
      setTimeout(() => {
        const t0 = performance.now();
        this.runSimulation();
        const duration = Math.round(performance.now() - t0);

        if (rerunBtn) {
          rerunBtn.disabled = false;
          rerunBtn.innerHTML = rerunBtn.dataset.originalText || '⚡ Re-run';
        }

        this.updateStatusBadge(duration);

        // Highlight KPI cards to confirm simulation completed
        ['kpi-card-success', 'kpi-card-safe-spend'].forEach(cardId => {
          const card = document.getElementById(cardId);
          if (card) {
            card.classList.remove('kpi-flash');
            void card.offsetWidth; // force DOM reflow
            card.classList.add('kpi-flash');
          }
        });
      }, 16);
    });
  }

  /**
   * Updates the status badge under the iterations selector
   */
  updateStatusBadge(durationMs = null) {
    const statusBadge = document.getElementById('sim-status-badge');
    if (!statusBadge || !this.currentSimulationResult) return;
    const res = this.currentSimulationResult;
    const mode = this.currentInputs?.simulationConfig?.mode || 'monteCarloParametric';
    const iters = this.currentInputs?.simulationConfig?.iterations || 10000;
    const timeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const runLabel = mode === 'historicalSequences' ? `${res.totalRuns} historical eras` : `${iters.toLocaleString()} runs`;
    const durStr = durationMs !== null ? ` in ${durationMs}ms` : '';
    statusBadge.textContent = `✓ ${runLabel} active${durStr} (${timeStr})`;
    statusBadge.style.color = durationMs !== null ? 'var(--success)' : 'var(--text-muted)';
  }

  /**
   * Runs the simulation suite and updates UI
   */
  runSimulation() {
    this.currentSimulationResult = runMonteCarloSimulation(this.currentInputs);
    this.updateKPIs();
    this.updateDiagnostics();
    this.renderActiveChart();
  }

  /**
   * Update top KPI scorecards
   */
  updateKPIs() {
    const res = this.currentSimulationResult;
    if (!res) return;

    // 1. Success Rate
    const successCard = document.getElementById('kpi-card-success');
    const successVal = document.getElementById('kpi-success-rate');
    const successSub = document.getElementById('kpi-success-subtext');
    const rate = Math.round(res.successRate);

    successVal.textContent = `${rate}%`;
    successSub.textContent = `${res.successfulRuns.toLocaleString()} of ${res.totalRuns.toLocaleString()} runs successful`;

    successCard.className = 'kpi-card ' + (rate >= 90 ? 'kpi-status-success' : rate >= 75 ? 'kpi-status-warning' : 'kpi-status-danger');

    // 2. Median Ending Wealth
    const wealthVal = document.getElementById('kpi-median-wealth');
    wealthVal.textContent = RetirementCharts.formatCurrency(res.medianEndingNetWorth);

    // 3. Safe Spending Capacities (100% Zero-Failure & 95% Benchmark)
    const spend100 = res.safeSpendCapacity100;
    const spend95 = res.safeSpendCapacity95 ?? res.safeSpendCapacity;
    const currentSpend = this.currentInputs?.spending?.baseAnnualSpend || 0;

    const val100 = document.getElementById('kpi-safe-spend-100');
    if (val100 && spend100 !== undefined) {
      val100.textContent = `$${spend100.toLocaleString()}/yr`;
    }

    const val95 = document.getElementById('kpi-safe-spend');
    if (val95 && spend95 !== undefined) {
      val95.textContent = `$${spend95.toLocaleString()}/yr`;
    }

    const safeSpendCard = document.getElementById('kpi-card-safe-spend');
    const safeSub = document.getElementById('kpi-spend-subtext');
    if (safeSub) {
      if (res.failedRuns === 0) {
        safeSub.textContent = `Your spend ($${currentSpend.toLocaleString()}) survived all ${res.totalRuns.toLocaleString()} runs (100% safe)`;
        safeSpendCard?.classList.add('kpi-status-success');
        safeSpendCard?.classList.remove('kpi-status-warning');
      } else if (res.successRate >= 95) {
        safeSub.textContent = `Your spend ($${currentSpend.toLocaleString()}) achieved ${Math.round(res.successRate)}% success (${res.failedRuns} failures)`;
        safeSpendCard?.classList.remove('kpi-status-warning');
        safeSpendCard?.classList.add('kpi-status-success');
      } else {
        const excess = currentSpend - spend95;
        const excessText = excess > 0 ? `Spend exceeds 95% capacity by $${excess.toLocaleString()}/yr` : `Plan under stress`;
        safeSub.textContent = `${excessText} (${Math.round(res.successRate)}% success, ${res.failedRuns} failures)`;
        safeSpendCard?.classList.add('kpi-status-warning');
        safeSpendCard?.classList.remove('kpi-status-success');
      }
    }

    // 4. Earliest Depletion Age
    const failCard = document.getElementById('kpi-card-failure');
    const failVal = document.getElementById('kpi-failure-age');
    const failSub = document.getElementById('kpi-failure-subtext');

    if (res.earliestFailureAge) {
      failVal.textContent = `Age ${res.earliestFailureAge}`;
      failSub.textContent = `Average failure age: ${res.averageFailureAge || res.earliestFailureAge}`;
      failCard.className = 'kpi-card kpi-status-danger';
    } else {
      failVal.textContent = 'None (100% Safe)';
      failSub.textContent = 'Portfolio survived all simulation paths';
      failCard.className = 'kpi-card kpi-status-success';
    }

    // 5. Lifetime Taxes
    const taxVal = document.getElementById('kpi-lifetime-tax');
    const taxSub = document.getElementById('kpi-tax-subtext');
    if (taxVal && res.medianLifetimeTaxes !== undefined) {
      taxVal.textContent = RetirementCharts.formatCurrency(res.medianLifetimeTaxes);
      if (res.medianRothConverted > 0) {
        taxSub.textContent = `Includes $${Math.round(res.medianRothConverted).toLocaleString()} converted to Roth`;
      } else if (res.medianEarlyPenalties > 0) {
        taxSub.textContent = `Includes $${Math.round(res.medianEarlyPenalties).toLocaleString()} early penalties`;
      } else {
        taxSub.textContent = `Median total across retirement`;
      }
    }
  }

  /**
   * Render diagnostic gap alerts
   */
  updateDiagnostics() {
    const container = document.getElementById('diagnostic-alerts-container');
    if (!container || !this.currentSimulationResult) return;

    const alerts = this.currentSimulationResult.diagnostics || [];
    container.innerHTML = alerts.map(alert => `
      <div class="alert-item alert-${alert.type}">
        <div class="alert-content">
          <strong>${alert.title}</strong>
          <div>${alert.message}</div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render the active chart tab
   */
  renderActiveChart() {
    const canvas = document.getElementById('main-chart-canvas');
    const titleEl = document.getElementById('active-chart-title');
    const legendEl = document.getElementById('chart-legend');
    if (!canvas || !this.currentSimulationResult) return;

    const res = this.currentSimulationResult;
    const retirementAge = this.currentInputs.demographics.retirementAge;

    switch (this.activeTab) {
      case 'fan':
        titleEl.textContent = 'Monte Carlo Net Worth Trajectories (Percentiles)';
        RetirementCharts.renderFanChart(canvas, res.percentilesByYear, {
          retirementAge,
          isDark: this.isDark,
          hoverAge: this.hoverAge
        });
        legendEl.innerHTML = `
          <div class="legend-item"><div class="legend-swatch" style="background:#0284c7;"></div> 50th Percentile (Median Path)</div>
          <div class="legend-item"><div class="legend-swatch" style="background:rgba(14, 165, 233, 0.35);"></div> 25th–75th Percentile Corridor</div>
          <div class="legend-item"><div class="legend-swatch" style="background:rgba(14, 165, 233, 0.15);"></div> 10th–90th Percentile Corridor</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#d97706;"></div> Retirement Transition Age</div>
        `;
        break;

      case 'accounts':
        titleEl.textContent = 'Net Worth Progression by Account Type (Liquid vs Tax-Deferred vs Roth)';
        RetirementCharts.renderAccountStackChart(canvas, res.baseCaseRun.yearlyResults, {
          retirementAge,
          isDark: this.isDark,
          hoverAge: this.hoverAge
        });
        legendEl.innerHTML = `
          <div class="legend-item"><div class="legend-swatch" style="background:#10b981;"></div> Liquid / Taxable (Cash & Brokerage)</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#6366f1;"></div> Tax-Deferred (401k & Traditional IRA)</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#ec4899;"></div> Tax-Free (Roth IRA / HSA)</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#d97706;"></div> Retirement Line</div>
        `;
        break;

      case 'cashflow':
        titleEl.innerHTML = `
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <span>Annual Retirement Cash Inflows & Outflow Demands</span>
            <button id="btn-toggle-rmd" class="btn" style="font-size:0.75rem; padding:0.25rem 0.6rem; cursor:pointer;" title="Toggle between living expenses coverage and total mandatory RMD transfers">
              ${this.includeExcessRmd ? '🔄 Showing: All RMDs Included' : '🔍 Scale: Living Spend Coverage'}
            </button>
          </div>
        `;
        document.getElementById('btn-toggle-rmd')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.includeExcessRmd = !this.includeExcessRmd;
          this.renderActiveChart();
        });

        RetirementCharts.renderCashFlowChart(canvas, res.baseCaseRun.yearlyResults, {
          isDark: this.isDark,
          hoverAge: this.hoverAge,
          includeExcessRmd: this.includeExcessRmd
        });

        legendEl.innerHTML = `
          <div class="legend-item"><div class="legend-swatch" style="background:#f59e0b;"></div> <strong>Spouse Working Salary</strong></div>
          <div class="legend-item"><div class="legend-swatch" style="background:#2563eb;"></div> Guaranteed Income (Social Security & Pensions)</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#10b981;"></div> <strong>Liquid Account Drawdown</strong></div>
          <div class="legend-item"><div class="legend-swatch" style="background:#7c3aed;"></div> Tax-Deferred 401(k) / IRA</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#db2777;"></div> Roth (Tax-Free)</div>
          ${this.includeExcessRmd ? '<div class="legend-item"><div class="legend-swatch" style="background:rgba(124, 58, 237, 0.25); border:1px dashed #7c3aed;"></div> Excess RMD Swept to Savings</div>' : ''}
          <div class="legend-item"><div class="legend-swatch" style="background:#dc2626;"></div> Cash Flow Shortfall</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#f59e0b; height:2px; border-top:2px dashed #f59e0b;"></div> Essential Spending Floor</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#e11d48; height:3px;"></div> Total Spending + Taxes (Lifestyle Ceiling)</div>
        `;
        break;

      case 'stress':
        titleEl.textContent = 'Historical Crisis Stress Tests (Actual Recessions)';
        const stressResults = runHistoricalStressTests(this.currentInputs);
        RetirementCharts.renderStressTestChart(canvas, stressResults, {
          isDark: this.isDark
        });
        legendEl.innerHTML = `
          <div class="legend-item"><div class="legend-swatch" style="background:#10b981;"></div> Survived Horizon</div>
          <div class="legend-item"><div class="legend-swatch" style="background:#ef4444;"></div> Portfolio Depleted Before Horizon</div>
        `;
        break;
    }
  }

  /**
   * Handle mouse hover on canvas
   */
  handleCanvasHover(e) {
    if (!this.currentSimulationResult) return;
    const canvas = document.getElementById('main-chart-canvas');
    const tooltip = document.getElementById('chart-tooltip');
    if (!canvas || !tooltip) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const paddingLeft = 75;
    const paddingRight = 40;
    const chartW = rect.width - paddingLeft - paddingRight;

    if (x < paddingLeft || x > rect.width - paddingRight) {
      this.clearCanvasHover();
      return;
    }

    const res = this.currentSimulationResult;

    // 1. Fan Chart Tooltip
    if (this.activeTab === 'fan') {
      const minAge = this.currentInputs.demographics.currentAge;
      const maxAge = this.currentInputs.demographics.endAge;
      const ratio = (x - paddingLeft) / chartW;
      const age = Math.round(minAge + ratio * (maxAge - minAge));

      this.hoverAge = age;
      this.renderActiveChart();

      const point = res.percentilesByYear.find(p => p.age === age);
      if (point) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.min(rect.width - 200, Math.max(10, x + 15))}px`;
        tooltip.style.top = `${Math.min(rect.height - 120, Math.max(10, e.clientY - rect.top - 50))}px`;
        tooltip.innerHTML = `
          <div style="font-weight:bold; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:2px;">Age ${point.age}</div>
          <div>90th Percentile: <strong>${RetirementCharts.formatCurrency(point.p90)}</strong></div>
          <div>50th (Median): <strong>${RetirementCharts.formatCurrency(point.p50)}</strong></div>
          <div>10th Percentile: <strong>${RetirementCharts.formatCurrency(point.p10)}</strong></div>
        `;
      }
      return;
    }

    // 2. Account Stack Chart Tooltip
    if (this.activeTab === 'accounts') {
      const minAge = this.currentInputs.demographics.currentAge;
      const maxAge = this.currentInputs.demographics.endAge;
      const ratio = (x - paddingLeft) / chartW;
      const age = Math.round(minAge + ratio * (maxAge - minAge));

      this.hoverAge = age;
      this.renderActiveChart();

      const yr = res.baseCaseRun.yearlyResults.find(y => y.age === age);
      if (yr) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.min(rect.width - 230, Math.max(10, x + 15))}px`;
        tooltip.style.top = `${Math.min(rect.height - 160, Math.max(10, e.clientY - rect.top - 50))}px`;
        tooltip.innerHTML = `
          <div style="font-weight:bold; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:2px;">Age ${yr.age}</div>
          <div style="color:#34d399;">Liquid / Taxable: <strong>${RetirementCharts.formatCurrency(yr.liquid)}</strong></div>
          <div style="color:#818cf8;">Tax-Deferred (401k): <strong>${RetirementCharts.formatCurrency(yr.taxDeferred)}</strong></div>
          <div style="color:#f472b6;">Tax-Free (Roth): <strong>${RetirementCharts.formatCurrency(yr.roth)}</strong></div>
          ${(yr.rothConverted || 0) > 0 ? `<div style="color:#c084fc; font-size:0.75rem; margin-top:2px;">🔄 Converted to Roth: <strong>+${RetirementCharts.formatCurrency(yr.rothConverted)}</strong></div>` : ''}
          <div style="margin-top:4px; padding-top:3px; border-top:1px dashed rgba(255,255,255,0.2); font-weight:bold;">
            Total Net Worth: ${RetirementCharts.formatCurrency(yr.totalNetWorth)}
          </div>
        `;
      }
      return;
    }

    // 3. Cash Flow Chart Tooltip
    if (this.activeTab === 'cashflow') {
      const retiredYears = res.baseCaseRun.yearlyResults.filter(y => y.isRetired);
      if (retiredYears.length === 0) return;

      const ratio = Math.min(0.999, Math.max(0, (x - paddingLeft) / chartW));
      const idx = Math.floor(ratio * retiredYears.length);
      const yr = retiredYears[idx];
      if (yr) {
        this.hoverAge = yr.age;
        this.renderActiveChart();

        const spouseSalary = yr.spouseWorkingIncome || 0;
        const otherInc = Math.max(0, yr.guaranteedIncome - spouseSalary);
        const taxDefSpent = yr.taxDeferredSpent ?? yr.taxDeferredWithdrawn;

        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.min(rect.width - 270, Math.max(10, x + 15))}px`;
        tooltip.style.top = `${Math.min(rect.height - 210, Math.max(10, e.clientY - rect.top - 70))}px`;
        tooltip.innerHTML = `
          <div style="font-weight:bold; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:3px; display:flex; justify-content:space-between;">
            <span>Age ${yr.age}</span>
            <span style="color:#94a3b8; font-size:0.75rem;">Year ${yr.yearIndex + 1}</span>
          </div>
          ${spouseSalary > 0 ? `<div style="color:#fbbf24; font-weight:600;">💼 Spouse Salary: <strong>${RetirementCharts.formatCurrency(spouseSalary)}</strong></div>` : ''}
          ${otherInc > 0 ? `<div style="color:#60a5fa;">🛡️ SS & Pensions: <strong>${RetirementCharts.formatCurrency(otherInc)}</strong></div>` : ''}
          ${yr.liquidWithdrawn > 0 ? `<div style="color:#34d399; font-weight:600;">🏦 Liquid Drawdown: <strong>${RetirementCharts.formatCurrency(yr.liquidWithdrawn)}</strong></div>` : ''}
          ${taxDefSpent > 0 ? `<div style="color:#c084fc;">🏛️ 401(k) / IRA: <strong>${RetirementCharts.formatCurrency(taxDefSpent)}</strong></div>` : ''}
          ${(yr.excessRmdSwept || 0) > 0 ? `<div style="color:#e9d5ff; font-size:0.75rem;">🔄 Excess RMD Swept: <strong>${RetirementCharts.formatCurrency(yr.excessRmdSwept)}</strong></div>` : ''}
          ${(yr.rothWithdrawn || 0) > 0 ? `<div style="color:#f472b6;">🌸 Roth Drawdown: <strong>${RetirementCharts.formatCurrency(yr.rothWithdrawn)}</strong></div>` : ''}
          ${(yr.rothConverted || 0) > 0 ? `<div style="color:#c084fc; font-size:0.75rem; font-weight:600;">🔄 Roth Conversion: <strong>${RetirementCharts.formatCurrency(yr.rothConverted)}</strong></div>` : ''}
          ${(yr.earlyPenaltyPaid || 0) > 0 ? `<div style="color:#ef4444; font-size:0.75rem; font-weight:600;">⚠️ 10% Early Penalty: <strong>${RetirementCharts.formatCurrency(yr.earlyPenaltyPaid)}</strong></div>` : ''}
          ${yr.is72tActive ? `<div style="color:#10b981; font-size:0.75rem; font-weight:600;">🛡️ Rule 72(t) SEPP: <strong>10% Penalty Waived</strong> (saved ${RetirementCharts.formatCurrency(yr.earlyPenaltySaved)})</div>` : ''}
          ${yr.shortfall > 0 ? `<div style="color:#f87171; font-weight:bold;">⚠️ Shortfall: ${RetirementCharts.formatCurrency(yr.shortfall)}</div>` : ''}
          <div style="margin-top:5px; padding-top:4px; border-top:1px dashed rgba(255,255,255,0.2); color:#fb7185;">
            Spending + Taxes: <strong>${RetirementCharts.formatCurrency(yr.spending + yr.taxesPaid)}</strong>
            ${yr.taxesPaid > 0 ? `<span style="display:block; font-size:0.75rem; color:#94a3b8; font-weight:normal;">(${RetirementCharts.formatCurrency(yr.spending)} living + ${RetirementCharts.formatCurrency(yr.taxesPaid)} taxes)</span>` : ''}
          </div>
          ${yr.essentialSpending !== undefined ? `
            <div style="margin-top:5px; padding-top:3px; border-top:1px dotted rgba(255,255,255,0.15); font-size:0.75rem; display:flex; flex-direction:column; gap:2px;">
              <div style="color:#fbbf24;">🛡️ Essential (${Math.round(yr.essentialCoveragePct || 100)}% funded): <strong>${RetirementCharts.formatCurrency(yr.essentialSpending)}</strong></div>
              <div style="color:#a78bfa;">🎉 Discretionary (${Math.round(yr.discretionaryCoveragePct || 100)}% funded): <strong>${RetirementCharts.formatCurrency(yr.discretionarySpending)}</strong></div>
              ${yr.isBeltTightened ? `<div style="color:#f59e0b; font-weight:600; font-size:0.72rem;">📉 Belt-Tightened: -${RetirementCharts.formatCurrency(yr.beltTighteningSavings)} discretionary saved in down market</div>` : ''}
              ${yr.guaranteedFloorCoverageRatio !== undefined ? `<div style="color:#34d399; font-size:0.7rem;">🛡️ Guaranteed Floor Ratio: <strong>${Math.round(yr.guaranteedFloorCoverageRatio * 100)}%</strong></div>` : ''}
            </div>
          ` : ''}
        `;
      }
    }
  }

  clearCanvasHover() {
    this.hoverAge = null;
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    if (this.activeTab === 'fan' || this.activeTab === 'accounts' || this.activeTab === 'cashflow') {
      this.renderActiveChart();
    }
  }
}

// Bootstrap Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RetirementApp();
});
