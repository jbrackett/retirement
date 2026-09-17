import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WITHDRAWAL_STRATEGIES,
  STRATEGY_DESCRIPTIONS,
  getTaxBracketGrossCap,
  calculateEarlyWithdrawalPenalty,
  runSinglePathSimulation,
  runMonteCarloSimulation
} from '../js/simulation_engine.js';

test('Tax Bracket Gross Cap Helper', () => {
  // Married filing jointly in 2024: standard deduction $29,200 + 12% bracket cap $94,300 = $123,500
  const married12 = getTaxBracketGrossCap(0.12, 'married', 1.0);
  assert.equal(married12, 123500);

  // Single in 2024: standard deduction $14,600 + 12% bracket cap $47,150 = $61,750
  const single12 = getTaxBracketGrossCap(0.12, 'single', 1.0);
  assert.equal(single12, 61750);
});

test('Rule of 55 vs 10% Early Withdrawal Penalty', () => {
  // Age 56, retiring at 56, without Rule of 55 -> 10% penalty
  const penalty = calculateEarlyWithdrawalPenalty(50000, 56, 56, false);
  assert.equal(penalty, 5000);

  // Age 56, retiring at 56, with Rule of 55 -> penalty waived ($0)
  const waived = calculateEarlyWithdrawalPenalty(50000, 56, 56, true);
  assert.equal(waived, 0);

  // Age 52 (under 55), Rule of 55 cannot apply -> 10% penalty
  const under55 = calculateEarlyWithdrawalPenalty(50000, 52, 52, true);
  assert.equal(under55, 5000);

  // Age 60 (over 59.5) -> penalty waived ($0)
  const over60 = calculateEarlyWithdrawalPenalty(50000, 60, 50, false);
  assert.equal(over60, 0);
});

test('Early Retirement Simulation with Rule of 55 Enabled vs Disabled', () => {
  const baseInput = {
    demographics: { currentAge: 55, retirementAge: 56, endAge: 85, includeSpouse: false },
    accounts: { liquid: 0, taxDeferred: 800000, roth: 0, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 60000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 0, socialSecurityStartAge: 67, pension: 0, pensionStartAge: 67 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.08, bondReturn: 0.04, cashReturn: 0.03, inflationRate: 0.02, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST, enableRuleOf55: false }
  };

  const marketPath = Array.from({ length: 31 }, () => ({ stock: 0.07, bond: 0.04, cash: 0.03, inflation: 0.02 }));

  // Run with Rule of 55 disabled
  const runWithPenalty = runSinglePathSimulation(baseInput, marketPath);
  assert.ok(runWithPenalty.totalEarlyPenalties > 0, 'Should incur early penalties between ages 56 and 59');

  // Run with Rule of 55 enabled
  baseInput.strategy.enableRuleOf55 = true;
  const runWithoutPenalty = runSinglePathSimulation(baseInput, marketPath);
  assert.equal(runWithoutPenalty.totalEarlyPenalties, 0, 'Rule of 55 should waive all early penalties');
  assert.ok(runWithoutPenalty.totalTaxesPaid < runWithPenalty.totalTaxesPaid, 'Taxes should be lower with Rule of 55');
});

test('Strategic Roth Conversions Lowers Future RMDs', () => {
  const inputs = {
    demographics: { currentAge: 60, retirementAge: 60, endAge: 90, includeSpouse: true, spouseCurrentAge: 60, spouseRetirementAge: 60, spouseAnnualIncome: 0 },
    accounts: { liquid: 400000, taxDeferred: 1000000, roth: 50000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 70000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 35000, socialSecurityStartAge: 70, spouseSocialSecurity: 20000, spouseSocialSecurityStartAge: 70, pension: 0, pensionStartAge: 70 },
    portfolio: { stockPct: 70, bondPct: 25, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.08, bondReturn: 0.04, cashReturn: 0.03, inflationRate: 0.025, taxFilingStatus: 'married' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST }
  };

  const marketPath = Array.from({ length: 31 }, () => ({ stock: 0.07, bond: 0.04, cash: 0.03, inflation: 0.025 }));

  // Run 1: Liquid First
  const runLiquidFirst = runSinglePathSimulation(inputs, marketPath);

  // Run 2: Strategic Roth Conversion
  inputs.strategy = { type: WITHDRAWAL_STRATEGIES.ROTH_CONVERSION, targetBracketRate: 0.12, enableRuleOf55: true };
  const runRothConv = runSinglePathSimulation(inputs, marketPath);

  assert.ok(runRothConv.totalRothConverted > 0, 'Should have converted 401(k) to Roth');
  const finalRothConv = runRothConv.yearlyResults[runRothConv.yearlyResults.length - 1].roth;
  const finalRothLiquid = runLiquidFirst.yearlyResults[runLiquidFirst.yearlyResults.length - 1].roth;
  assert.ok(finalRothConv > finalRothLiquid, 'Ending Roth balance should be much higher with Roth conversion strategy');

  // Total RMDs paid at age 73+ should be significantly lower because tax-deferred was converted
  assert.ok(runRothConv.totalRmdsPaid < runLiquidFirst.totalRmdsPaid, 'Future RMDs should be reduced due to pre-73 Roth conversions');
});

test('Proportional Drawdown Strategy Distributes Withdrawals Across Accounts', () => {
  const inputs = {
    demographics: { currentAge: 65, retirementAge: 65, endAge: 85, includeSpouse: false },
    accounts: { liquid: 200000, taxDeferred: 400000, roth: 200000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 80000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 0, socialSecurityStartAge: 70, pension: 0, pensionStartAge: 70 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.07, bondReturn: 0.04, cashReturn: 0.03, inflationRate: 0.02, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.PROPORTIONAL }
  };

  const marketPath = Array.from({ length: 21 }, () => ({ stock: 0.06, bond: 0.04, cash: 0.03, inflation: 0.02 }));
  const run = runSinglePathSimulation(inputs, marketPath);

  const firstYear = run.yearlyResults[0];
  assert.ok(firstYear.liquidWithdrawn > 0, 'Should draw from liquid in year 1');
  assert.ok(firstYear.taxDeferredWithdrawn > 0, 'Should draw from tax-deferred in year 1');
  assert.ok(firstYear.rothWithdrawn > 0, 'Should draw from roth in year 1');
});

test('ACA Subsidy Maximizer Delays 401(k) Access Pre-65', () => {
  const inputs = {
    demographics: { currentAge: 58, retirementAge: 58, endAge: 85, includeSpouse: true, spouseCurrentAge: 58, spouseRetirementAge: 58, spouseAnnualIncome: 0 },
    accounts: { liquid: 500000, taxDeferred: 1000000, roth: 100000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 70000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 0, socialSecurityStartAge: 67, pension: 0, pensionStartAge: 67 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.07, bondReturn: 0.04, cashReturn: 0.03, inflationRate: 0.02, taxFilingStatus: 'married' },
    strategy: { type: WITHDRAWAL_STRATEGIES.ACA_MAXIMIZER }
  };

  const marketPath = Array.from({ length: 28 }, () => ({ stock: 0.06, bond: 0.04, cash: 0.03, inflation: 0.02 }));
  const run = runSinglePathSimulation(inputs, marketPath);

  // For ages 58-64 (pre-Medicare), 401(k) should NOT be drawn because liquid is sufficient
  const pre65Years = run.yearlyResults.filter(y => y.age < 65);
  for (const yr of pre65Years) {
    assert.equal(yr.taxDeferredWithdrawn, 0, `Tax-deferred should remain untouched at age ${yr.age} to preserve ACA subsidies`);
    assert.ok(yr.liquidWithdrawn > 0, `Liquid should cover spending at age ${yr.age}`);
  }
});

test('Cash Flow Accounting: Inflows accurately fund spending and taxes with zero gap', () => {
  const inputs = {
    demographics: { currentAge: 65, retirementAge: 65, endAge: 85, includeSpouse: false },
    accounts: { liquid: 100000, taxDeferred: 2000000, roth: 500000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 80000, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 30000, socialSecurityStartAge: 70, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.05, bondReturn: 0.03, cashReturn: 0.02, inflationRate: 0.02, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST }
  };

  const marketPath = Array.from({ length: 21 }, () => ({ stock: 0.05, bond: 0.03, cash: 0.02, inflation: 0.02 }));
  const run = runSinglePathSimulation(inputs, marketPath);

  for (const yr of run.yearlyResults) {
    const totalOutflow = yr.spending + yr.taxesPaid;
    const fundedInflow = yr.guaranteedIncome + yr.liquidWithdrawn + yr.taxDeferredSpent + yr.rothWithdrawn + yr.shortfall;
    assert.ok(
      Math.abs(totalOutflow - fundedInflow) < 1.0,
      `Year at age ${yr.age}: Outflows ($${totalOutflow.toFixed(2)}) must equal funded inflows ($${fundedInflow.toFixed(2)})`
    );
  }

  // Verify Roth was preserved because 401(k) / RMDs were ample
  const totalRothWithdrawn = run.yearlyResults.reduce((acc, y) => acc + y.rothWithdrawn, 0);
  assert.equal(totalRothWithdrawn, 0, 'Roth IRA should remain untouched ($0 withdrawn) when 401(k) has surplus');
  assert.ok(run.yearlyResults[run.yearlyResults.length - 1].roth > inputs.accounts.roth, 'Roth should grow unencumbered');
});

test('Essential vs. Discretionary Spending Split and Coverage Hierarchy', () => {
  // Scenario 1: Fully funded retirement with 60% essential / 40% discretionary
  const inputs = {
    demographics: { currentAge: 65, retirementAge: 65, endAge: 75, includeSpouse: false },
    accounts: { liquid: 500000, taxDeferred: 500000, roth: 100000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 100000, essentialPct: 60, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 40000, socialSecurityStartAge: 65, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.05, bondReturn: 0.03, cashReturn: 0.02, inflationRate: 0.02, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST }
  };

  const marketPath = Array.from({ length: 11 }, () => ({ stock: 0.05, bond: 0.03, cash: 0.02, inflation: 0.02 }));
  const run = runSinglePathSimulation(inputs, marketPath);

  const yr1 = run.yearlyResults[0];
  assert.equal(yr1.spending, 100000);
  assert.equal(yr1.essentialSpending, 60000, 'Essential spending should be 60% of base spend');
  assert.equal(yr1.discretionarySpending, 40000, 'Discretionary spending should be 40% of base spend');
  assert.equal(yr1.essentialCoveragePct, 100, 'Essential should be 100% covered');
  assert.equal(yr1.discretionaryCoveragePct, 100, 'Discretionary should be 100% covered');
  assert.ok(Math.abs(yr1.guaranteedFloorCoverageRatio - (40000 / 60000)) < 0.01, 'Guaranteed floor ratio should be SS / Essential');

  // Scenario 2: Underfunded scenario where spending shortfall cuts discretionary spending first
  const brokeInputs = {
    demographics: { currentAge: 65, retirementAge: 65, endAge: 66, includeSpouse: false },
    accounts: { liquid: 0, taxDeferred: 0, roth: 0, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 100000, essentialPct: 70, spendingModel: 'flat', oneTimeEvents: [] },
    // Only 80,000 guaranteed income (shortfall of 20,000)
    incomeSources: { socialSecurity: 80000, socialSecurityStartAge: 65, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.05, bondReturn: 0.03, cashReturn: 0.02, inflationRate: 0, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST }
  };

  const brokeRun = runSinglePathSimulation(brokeInputs, [{ stock: 0, bond: 0, cash: 0, inflation: 0 }]);
  const brokeYr = brokeRun.yearlyResults[0];

  assert.equal(brokeYr.essentialSpending, 70000);
  assert.equal(brokeYr.discretionarySpending, 30000);
  // Total spending funded is 80,000:
  // 70,000 essential is 100% funded!
  // Remaining 10,000 goes to discretionary (out of 30,000 = 33.3% funded)
  assert.equal(brokeYr.essentialFunded, 70000, 'Essential expenses are 100% protected before discretionary');
  assert.equal(brokeYr.essentialCoveragePct, 100, 'Essential coverage is 100%');
  assert.equal(brokeYr.discretionaryFunded, 10000, 'Discretionary absorbs the shortfall');
  assert.ok(Math.abs(brokeYr.discretionaryCoveragePct - 33.33) < 0.1, 'Discretionary is partially cut');
});

test('Dynamic Down-Market Belt-Tightening: Trims discretionary spend during market downturns', () => {
  const inputs = {
    demographics: { currentAge: 65, retirementAge: 65, endAge: 68, includeSpouse: false },
    accounts: { liquid: 100000, taxDeferred: 500000, roth: 100000, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: {
      baseAnnualSpend: 100000,
      essentialPct: 70, // $70k essential, $30k discretionary
      enableBeltTightening: true,
      beltTighteningPct: 50, // 50% cut in down years = $15k cut, $85k total spend
      spendingModel: 'flat',
      oneTimeEvents: []
    },
    incomeSources: { socialSecurity: 20000, socialSecurityStartAge: 65, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 100, bondPct: 0, cashPct: 0, glidePath: false },
    assumptions: { stockReturn: 0.08, bondReturn: 0.03, cashReturn: 0.02, inflationRate: 0, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST }
  };

  const marketPath = [
    { stock: 0.10, bond: 0, cash: 0, inflation: 0 },
    { stock: -0.20, bond: 0, cash: 0, inflation: 0 },
    { stock: 0.15, bond: 0, cash: 0, inflation: 0 },
    { stock: 0.12, bond: 0, cash: 0, inflation: 0 }
  ];

  const run = runSinglePathSimulation(inputs, marketPath);

  // Year 0: No belt tightening
  assert.equal(run.yearlyResults[0].isBeltTightened, false);
  assert.equal(run.yearlyResults[0].spending, 100000);
  assert.equal(run.yearlyResults[0].discretionarySpending, 30000);

  // Year 1: Negative return triggers belt tightening
  assert.equal(run.yearlyResults[1].isBeltTightened, true);
  assert.equal(run.yearlyResults[1].beltTighteningSavings, 15000, 'Saves 50% of $30k discretionary');
  assert.equal(run.yearlyResults[1].essentialSpending, 70000, 'Essential spend remains 100% intact');
  assert.equal(run.yearlyResults[1].discretionarySpending, 15000, 'Discretionary spend cut by 50%');
  assert.equal(run.yearlyResults[1].spending, 85000, 'Total spending reduced to $85,000');

  // Year 2: Prior year was down, so belt tightening remains active
  assert.equal(run.yearlyResults[2].isBeltTightened, true);
  assert.equal(run.yearlyResults[2].spending, 85000);

  // Year 3: Prior year was positive and current year is positive -> full spending restored!
  assert.equal(run.yearlyResults[3].isBeltTightened, false);
  assert.equal(run.yearlyResults[3].spending, 100000);
  assert.equal(run.yearlyResults[3].discretionarySpending, 30000);

  // Compare ending net worth with belt tightening disabled vs enabled
  const disabledInputs = JSON.parse(JSON.stringify(inputs));
  disabledInputs.spending.enableBeltTightening = false;
  const disabledRun = runSinglePathSimulation(disabledInputs, marketPath);

  assert.ok(
    run.finalNetWorth > disabledRun.finalNetWorth,
    `Belt tightening ending net worth ($${run.finalNetWorth.toFixed(0)}) must exceed disabled ($${disabledRun.finalNetWorth.toFixed(0)})`
  );
  assert.ok(run.totalBeltTighteningSavings > 0, 'Total belt tightening savings must be positive');
});

test('IRS Rule 72(t) SEPP Exemption: Waives 10% penalty on pre-59.5 401(k) withdrawals when liquid depletes', () => {
  // Retiring at age 45 with only $50,000 liquid, so liquid depletes in year 1!
  const baseInputs = {
    demographics: { currentAge: 45, retirementAge: 45, endAge: 52, includeSpouse: false },
    accounts: { liquid: 50000, taxDeferred: 600000, roth: 0, annualSavingsLiquid: 0, annualSavingsTaxDeferred: 0, annualSavingsRoth: 0, employerMatch: 0 },
    spending: { baseAnnualSpend: 50000, essentialPct: 70, spendingModel: 'flat', oneTimeEvents: [] },
    incomeSources: { socialSecurity: 0, socialSecurityStartAge: 67, pension: 0, pensionStartAge: 65 },
    portfolio: { stockPct: 60, bondPct: 35, cashPct: 5, glidePath: false },
    assumptions: { stockReturn: 0.05, bondReturn: 0.03, cashReturn: 0.02, inflationRate: 0, taxFilingStatus: 'single' },
    strategy: { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST, enableRuleOf55: false, enableRule72t: true }
  };

  const marketPath = Array.from({ length: 8 }, () => ({ stock: 0.05, bond: 0.03, cash: 0.02, inflation: 0 }));

  // Run with Rule 72(t) enabled
  const runWith72t = runSinglePathSimulation(baseInputs, marketPath);

  // Year 0 (Age 45): Liquid covers spending ($50,000)
  assert.equal(runWith72t.yearlyResults[0].earlyPenaltyPaid, 0);

  // Year 1 (Age 46): Liquid is dry, 401(k) is tapped before 59.5!
  assert.ok(runWith72t.yearlyResults[1].taxDeferredWithdrawn > 0, 'Must draw from 401(k)');
  assert.equal(runWith72t.yearlyResults[1].is72tActive, true, '72(t) must be active');
  assert.equal(runWith72t.yearlyResults[1].earlyPenaltyPaid, 0, '10% penalty must be waived ($0)');
  assert.ok(runWith72t.yearlyResults[1].earlyPenaltySaved > 0, 'Penalty saved must be positive');
  assert.equal(runWith72t.totalEarlyPenalties, 0, 'Total early penalties must be 0 with 72(t)');
  assert.ok(runWith72t.totalPenaltySavedVia72t > 0, 'Total penalty saved must be tracked');

  // Run with Rule 72(t) disabled (strict 10% penalty applied)
  const inputsWithout72t = JSON.parse(JSON.stringify(baseInputs));
  inputsWithout72t.strategy.enableRule72t = false;
  const runWithout72t = runSinglePathSimulation(inputsWithout72t, marketPath);

  assert.ok(runWithout72t.totalEarlyPenalties > 0, 'Penalties must be incurred when 72(t) is disabled');
  assert.ok(
    runWith72t.finalNetWorth > runWithout72t.finalNetWorth,
    `Ending wealth with 72(t) ($${runWith72t.finalNetWorth.toFixed(0)}) must exceed penalty scenario ($${runWithout72t.finalNetWorth.toFixed(0)})`
  );
});




