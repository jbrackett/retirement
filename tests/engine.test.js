import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORICAL_DATA,
  getHistoricalSummary,
  getRollingSequences,
  computeSeriesStats
} from '../js/historical_data.js';

import {
  calculateFederalIncomeTax,
  calculateRMD,
  runSinglePathSimulation,
  runMonteCarloSimulation,
  solveSafeSpendingCapacity,
  solveSafeSpendingCapacities,
  runHistoricalStressTests
} from '../js/simulation_engine.js';

test('Historical Dataset Integrity', () => {
  assert.equal(HISTORICAL_DATA.length, 97, 'Should cover 97 years from 1928 through 2024');
  assert.equal(HISTORICAL_DATA[0].year, 1928);
  assert.equal(HISTORICAL_DATA[HISTORICAL_DATA.length - 1].year, 2024);

  const summary = getHistoricalSummary();
  assert.ok(summary.stocks.mean > 0.10, 'Stock arithmetic mean should be > 10%');
  assert.ok(summary.stocks.cagr > 0.08, 'Stock CAGR should be > 8%');
  assert.ok(summary.bonds.mean > 0.04, 'Bond mean should be > 4%');
  assert.ok(summary.inflation.mean > 0.02 && summary.inflation.mean < 0.04, 'Historical inflation should be ~3%');

  const sequences = getRollingSequences(30);
  assert.equal(sequences.length, 97, 'Should generate 97 rolling sequences');
  assert.equal(sequences[0].years.length, 30, 'Each sequence should have 30 years');
});

test('Federal Income Tax Calculations', () => {
  // Test Married Filing Jointly in 2024: standard deduction $29,200
  // Income $29,200 => Taxable $0 => Tax $0
  const taxZero = calculateFederalIncomeTax(29200, 'married', 1.0);
  assert.equal(taxZero, 0);

  // Income $52,400 => Taxable $23,200 (10% bracket) => Tax $2,320
  const tax10 = calculateFederalIncomeTax(52400, 'married', 1.0);
  assert.equal(tax10, 2320);

  // Single standard deduction $14,600
  const taxSingleZero = calculateFederalIncomeTax(14600, 'single', 1.0);
  assert.equal(taxSingleZero, 0);

  const taxSingle10 = calculateFederalIncomeTax(26200, 'single', 1.0);
  assert.equal(taxSingle10, 1160);
});

test('IRS RMD Calculation', () => {
  // Age < 73 => 0 RMD
  assert.equal(calculateRMD(500000, 70), 0);
  assert.equal(calculateRMD(500000, 72), 0);

  // Age 73: Divisor 26.5
  const rmd73 = calculateRMD(530000, 73);
  assert.equal(rmd73, 20000);

  // Age 80: Divisor 20.2
  const rmd80 = calculateRMD(202000, 80);
  assert.equal(rmd80, 10000);

  // Empty balance => 0
  assert.equal(calculateRMD(0, 75), 0);
});

test('Single Path Simulation - Accumulation and Drawdown', () => {
  const inputs = {
    demographics: {
      currentAge: 55,
      retirementAge: 65,
      endAge: 85,
      includeSpouse: false
    },
    accounts: {
      liquid: 100000,
      taxDeferred: 400000,
      roth: 50000,
      annualSavingsLiquid: 10000,
      annualSavingsTaxDeferred: 20000,
      annualSavingsRoth: 5000,
      employerMatch: 5000,
      savingsGrowthRate: 0.02
    },
    spending: {
      baseAnnualSpend: 60000,
      spendingModel: 'flat',
      oneTimeEvents: []
    },
    incomeSources: {
      socialSecurity: 30000,
      socialSecurityStartAge: 67,
      pension: 0,
      pensionStartAge: 65,
      pensionInflationAdjusted: true,
      otherIncome: 0,
      otherIncomeStartAge: 65,
      otherIncomeEndAge: 70
    },
    portfolio: {
      stockPct: 60,
      bondPct: 35,
      cashPct: 5,
      glidePath: false
    },
    assumptions: {
      stockReturn: 0.08,
      stockStdDev: 0.16,
      bondReturn: 0.04,
      bondStdDev: 0.06,
      inflationRate: 0.025,
      taxFilingStatus: 'single'
    },
    simulationConfig: {
      mode: 'monteCarloParametric',
      iterations: 200
    }
  };

  const constantPath = Array.from({ length: 31 }, () => ({
    stock: 0.08,
    bond: 0.04,
    cash: 0.03,
    inflation: 0.025
  }));

  const result = runSinglePathSimulation(inputs, constantPath);
  assert.ok(result.yearlyResults.length === 31, 'Should simulate 31 years (age 55 to 85)');
  assert.equal(result.yearlyResults[0].isRetired, false);
  assert.equal(result.yearlyResults[10].isRetired, true, 'At year 10 (age 65), should be retired');
  assert.ok(result.finalNetWorth > 0, 'Portfolio should finish with positive balance under constant positive growth');
  assert.equal(result.success, true);
});

test('Monte Carlo Simulation Suite & Diagnostics', () => {
  const inputs = {
    demographics: {
      currentAge: 50,
      retirementAge: 65,
      endAge: 90,
      includeSpouse: true,
      spouseCurrentAge: 48
    },
    accounts: {
      liquid: 150000,
      taxDeferred: 600000,
      roth: 100000,
      annualSavingsLiquid: 10000,
      annualSavingsTaxDeferred: 25000,
      annualSavingsRoth: 10000,
      employerMatch: 5000,
      savingsGrowthRate: 0.02
    },
    spending: {
      baseAnnualSpend: 75000,
      spendingModel: 'flat',
      oneTimeEvents: []
    },
    incomeSources: {
      socialSecurity: 35000,
      socialSecurityStartAge: 67,
      spouseSocialSecurity: 20000,
      spouseSocialSecurityStartAge: 67,
      pension: 0,
      pensionStartAge: 65,
      pensionInflationAdjusted: true,
      otherIncome: 0,
      otherIncomeStartAge: 65,
      otherIncomeEndAge: 70
    },
    portfolio: {
      stockPct: 70,
      bondPct: 25,
      cashPct: 5,
      glidePath: false
    },
    assumptions: {
      stockReturn: 0.095,
      stockStdDev: 0.18,
      bondReturn: 0.045,
      bondStdDev: 0.075,
      inflationRate: 0.028,
      taxFilingStatus: 'married'
    },
    simulationConfig: {
      mode: 'monteCarloParametric',
      iterations: 300
    }
  };

  const mc = runMonteCarloSimulation(inputs);
  assert.ok(mc.successRate >= 80, `Success rate should be healthy (>80%), got: ${mc.successRate}`);
  assert.ok(mc.percentilesByYear.length > 0);
  assert.ok(mc.diagnostics.length > 0, 'Diagnostics should generate actionable alerts');
  assert.ok(mc.safeSpendCapacity > 40000, `Safe spending capacity should be computed, got: ${mc.safeSpendCapacity}`);

  // Historical stress tests
  const stress = runHistoricalStressTests(inputs);
  assert.equal(stress.length, 10, 'Should evaluate all 10 key historical crash periods');
  assert.ok(stress.some(s => s.startYear === 1929), 'Must include 1929 Great Crash');
  assert.ok(stress.some(s => s.startYear === 1937), 'Must include 1937 Double-Dip');
  assert.ok(stress.some(s => s.startYear === 1946), 'Must include 1946 Post-WWII Inflation');
  assert.ok(stress.some(s => s.startYear === 1977), 'Must include 1977 Volcker Squeeze');
  assert.ok(stress.some(s => s.startYear === 2008), 'Must include 2008 GFC');
  assert.ok(stress.some(s => s.startYear === 2022), 'Must include 2022 Dual Bear Market');
});

test('Historical Sequences Mode & Bootstrap Mode', () => {
  const inputs = {
    demographics: { currentAge: 60, retirementAge: 65, endAge: 85, includeSpouse: false },
    accounts: { liquid: 200000, taxDeferred: 500000, roth: 100000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0 },
    spending: { baseAnnualSpend: 40000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 28000, socialSecurityStartAge: 67, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 60, bondPct: 40, cashPct: 0, glidePath: true },
    assumptions: { stockReturn: 0.09, stockStdDev: 0.17, bondReturn: 0.04, bondStdDev: 0.07, inflationRate: 0.027 },
    simulationConfig: { mode: 'historicalSequences' }
  };

  const histRes = runMonteCarloSimulation(inputs);
  assert.ok(histRes.historicalRuns && histRes.historicalRuns.length > 0, 'Historical runs should be populated');
  assert.ok(histRes.successRate > 70, `Historical success rate should be high for conservative spending, got ${histRes.successRate}`);

  // Test Bootstrap Mode
  inputs.simulationConfig.mode = 'monteCarloBootstrap';
  inputs.simulationConfig.iterations = 150;
  const bootRes = runMonteCarloSimulation(inputs);
  assert.ok(bootRes.successRate > 70, `Bootstrap success rate should be healthy, got ${bootRes.successRate}`);
});

test('One-Time Milestone Events (Tuition & Downsizing)', () => {
  const inputs = {
    demographics: { currentAge: 50, retirementAge: 60, endAge: 80, includeSpouse: false },
    accounts: { liquid: 100000, taxDeferred: 300000, roth: 50000 },
    spending: {
      baseAnnualSpend: 50000,
      spendingModel: 'flat',
      oneTimeEvents: [
        { name: 'College Tuition', age: 52, amount: 60000, type: 'expense' },
        { name: 'Inheritance Windfall', age: 55, amount: 120000, type: 'income' }
      ]
    },
    incomeSources: { socialSecurity: 24000, socialSecurityStartAge: 67, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 70, bondPct: 30, cashPct: 0 },
    assumptions: { stockReturn: 0.08, stockStdDev: 0.16, bondReturn: 0.04, bondStdDev: 0.06, inflationRate: 0.025 }
  };

  const path = Array.from({ length: 31 }, () => ({ stock: 0.07, bond: 0.04, cash: 0.02, inflation: 0.02 }));
  const res = runSinglePathSimulation(inputs, path);
  
  // Year 2 (age 52): College expense
  const y52 = res.yearlyResults.find(y => y.age === 52);
  assert.ok(y52, 'Age 52 result should exist');

  // Year 5 (age 55): Inheritance windfall
  const y55 = res.yearlyResults.find(y => y.age === 55);
  assert.ok(y55, 'Age 55 result should exist');
  assert.ok(res.finalNetWorth > 0);
});

test('Spouse Staggered Retirement & Working Income Buffer', () => {
  // Primary retires at 60, spouse works until 65
  const inputsWithSpouseWork = {
    demographics: {
      currentAge: 58,
      retirementAge: 60,
      endAge: 85,
      includeSpouse: true,
      spouseCurrentAge: 56,
      spouseRetirementAge: 65,
      spouseAnnualIncome: 60000
    },
    accounts: {
      liquid: 100000,
      taxDeferred: 400000,
      roth: 50000,
      annualSavingsLiquid: 5000,
      annualSavingsTaxDeferred: 15000,
      annualSavingsRoth: 5000,
      employerMatch: 3000,
      savingsGrowthRate: 0.02
    },
    spending: { baseAnnualSpend: 70000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: {
      socialSecurity: 30000,
      socialSecurityStartAge: 67,
      spouseSocialSecurity: 20000,
      spouseSocialSecurityStartAge: 67,
      spouseAnnualIncome: 60000
    },
    portfolio: { stockPct: 70, bondPct: 25, cashPct: 5, glidePath: false },
    assumptions: {
      stockReturn: 0.08, stockStdDev: 0.16,
      bondReturn: 0.04, bondStdDev: 0.06,
      inflationRate: 0.025, taxFilingStatus: 'married'
    }
  };

  const path = Array.from({ length: 28 }, () => ({ stock: 0.06, bond: 0.035, cash: 0.02, inflation: 0.025 }));
  
  // Simulation with spouse working
  const resWithWork = runSinglePathSimulation(inputsWithSpouseWork, path);
  
  // Check age 61 (primary retired, spouse age 59, spouse working)
  const yr61 = resWithWork.yearlyResults.find(y => y.age === 61);
  assert.ok(yr61.isRetired, 'Primary should be retired at age 61');
  assert.ok(yr61.spouseWorkingIncome > 50000, 'Spouse working income should be active');
  // Portfolio withdrawal should be small because spouse covers most of $70k spend
  assert.ok(yr61.portfolioWithdrawal < 30000, `Portfolio withdrawal should be minimized, got ${yr61.portfolioWithdrawal}`);

  // Compare with identical scenario where spouse does NOT work
  const inputsWithoutSpouseWork = JSON.parse(JSON.stringify(inputsWithSpouseWork));
  inputsWithoutSpouseWork.demographics.spouseRetirementAge = 58; // retired immediately
  inputsWithoutSpouseWork.incomeSources.spouseAnnualIncome = 0;
  inputsWithoutSpouseWork.demographics.spouseAnnualIncome = 0;

  const resWithoutWork = runSinglePathSimulation(inputsWithoutSpouseWork, path);
  assert.ok(
    resWithWork.finalNetWorth > resWithoutWork.finalNetWorth,
    `Plan with spouse working should end with higher wealth ($${resWithWork.finalNetWorth} vs $${resWithoutWork.finalNetWorth})`
  );
});

test('95% Safe Spending Capacity is independent of baseAnnualSpend input slider', () => {
  const basePlan = {
    demographics: { currentAge: 55, retirementAge: 65, endAge: 85, includeSpouse: false },
    accounts: {
      liquid: 150000,
      taxDeferred: 500000,
      roth: 100000,
      annualSavingsLiquid: 5000,
      annualSavingsTaxDeferred: 15000,
      annualSavingsRoth: 5000,
      employerMatch: 3000,
      savingsGrowthRate: 0.02
    },
    spending: { baseAnnualSpend: 45000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: {
      socialSecurity: 28000,
      socialSecurityStartAge: 67,
      pension: 0,
      otherIncome: 0
    },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: {
      stockReturn: 0.08, stockStdDev: 0.16,
      bondReturn: 0.04, bondStdDev: 0.06,
      inflationRate: 0.025, taxFilingStatus: 'single'
    }
  };

  // Scenario 1: Spending slider set to $45,000
  const capacityAt45k = solveSafeSpendingCapacity(basePlan, 95);

  // Scenario 2: Spending slider moved to $140,000
  const highSpendPlan = JSON.parse(JSON.stringify(basePlan));
  highSpendPlan.spending.baseAnnualSpend = 140000;
  const capacityAt140k = solveSafeSpendingCapacity(highSpendPlan, 95);

  // Scenario 3: Spending slider moved to $25,000
  const lowSpendPlan = JSON.parse(JSON.stringify(basePlan));
  lowSpendPlan.spending.baseAnnualSpend = 25000;
  const capacityAt25k = solveSafeSpendingCapacity(lowSpendPlan, 95);

  assert.equal(
    capacityAt45k,
    capacityAt140k,
    `Safe spending capacity ($${capacityAt45k}) should not change when spending slider is set to $140k ($${capacityAt140k})`
  );
  assert.equal(
    capacityAt45k,
    capacityAt25k,
    `Safe spending capacity ($${capacityAt45k}) should not change when spending slider is set to $25k ($${capacityAt25k})`
  );
  assert.ok(capacityAt45k > 30000, `Calculated capacity ($${capacityAt45k}) should be a realistic positive amount`);
});

test('100% Zero-Failure Safe Spending Capacity is computed and strictly <= 95% Benchmark', () => {
  const plan = {
    demographics: { currentAge: 55, retirementAge: 65, endAge: 85, includeSpouse: false },
    accounts: {
      liquid: 150000,
      taxDeferred: 500000,
      roth: 100000,
      annualSavingsLiquid: 5000,
      annualSavingsTaxDeferred: 15000,
      annualSavingsRoth: 5000,
      employerMatch: 3000,
      savingsGrowthRate: 0.02
    },
    spending: { baseAnnualSpend: 45000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: {
      socialSecurity: 28000,
      socialSecurityStartAge: 67,
      pension: 0,
      otherIncome: 0
    },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: {
      stockReturn: 0.08, stockStdDev: 0.16,
      bondReturn: 0.04, bondStdDev: 0.06,
      inflationRate: 0.025, taxFilingStatus: 'single'
    }
  };

  const { safeSpend95, safeSpend100 } = solveSafeSpendingCapacities(plan);

  assert.ok(safeSpend100 > 0, `100% safe spending capacity should be positive, got: ${safeSpend100}`);
  assert.ok(safeSpend95 > 0, `95% safe spending capacity should be positive, got: ${safeSpend95}`);
  assert.ok(
    safeSpend100 <= safeSpend95,
    `100% zero-failure spending ($${safeSpend100}) must be less than or equal to 95% spending ($${safeSpend95})`
  );

  // Verify through Monte Carlo run results
  const mc = runMonteCarloSimulation(plan);
  assert.equal(mc.safeSpendCapacity100, safeSpend100);
  assert.equal(mc.safeSpendCapacity95, safeSpend95);
  assert.equal(mc.safeSpendCapacity, safeSpend95, 'safeSpendCapacity should equal 95% for backward compatibility');
});


