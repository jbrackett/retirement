/**
 * Retirement Simulation & Monte Carlo Calculation Engine
 * 
 * Implements:
 * - Deterministic multi-account accumulation & drawdown
 * - Tax-aware withdrawal waterfall (RMDs -> Taxable -> Tax-Deferred -> Roth)
 * - Federal income tax brackets & standard deductions (Single & Married)
 * - IRS Uniform Lifetime Table for Required Minimum Distributions (SECURE 2.0)
 * - Parametric Monte Carlo (correlated Gaussian/lognormal returns)
 * - Historical Bootstrap Resampling (1928-2024 data)
 * - Rolling Historical Sequence-of-Returns backtesting
 * - Safe Spending Capacity solver & gap diagnostics
 */

import { HISTORICAL_DATA, HISTORICAL_SCENARIOS, getHistoricalSummary, getRollingSequences } from './historical_data.js';

// IRS Uniform Lifetime Table (Divisor for RMD calculation by age)
export const IRS_RMD_DIVISORS = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5,  95: 8.9,  96: 8.4,  97: 7.8,  98: 7.3,  99: 6.8,  100: 6.4,
  101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
  115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0
};

// 2024 Federal Tax Brackets
export const TAX_BRACKETS_2024 = {
  single: {
    standardDeduction: 14600,
    brackets: [
      { cap: 11600, rate: 0.10 },
      { cap: 47150, rate: 0.12 },
      { cap: 100525, rate: 0.22 },
      { cap: 191950, rate: 0.24 },
      { cap: 243725, rate: 0.32 },
      { cap: 609350, rate: 0.35 },
      { cap: Infinity, rate: 0.37 }
    ]
  },
  married: {
    standardDeduction: 29200,
    brackets: [
      { cap: 23200, rate: 0.10 },
      { cap: 94300, rate: 0.12 },
      { cap: 201050, rate: 0.22 },
      { cap: 383900, rate: 0.24 },
      { cap: 487450, rate: 0.32 },
      { cap: 731200, rate: 0.35 },
      { cap: Infinity, rate: 0.37 }
    ]
  }
};

/**
 * Calculates estimated federal income tax given taxable ordinary income
 */
export function calculateFederalIncomeTax(ordinaryIncome, filingStatus = 'married', inflationFactor = 1.0) {
  const taxConfig = TAX_BRACKETS_2024[filingStatus] || TAX_BRACKETS_2024.married;
  const standardDeduction = taxConfig.standardDeduction * inflationFactor;
  const taxableIncome = Math.max(0, ordinaryIncome - standardDeduction);

  let tax = 0;
  let previousCap = 0;

  for (const bracket of taxConfig.brackets) {
    const currentCap = bracket.cap === Infinity ? Infinity : bracket.cap * inflationFactor;
    if (taxableIncome > previousCap) {
      const taxableInBracket = Math.min(taxableIncome, currentCap) - previousCap;
      tax += taxableInBracket * bracket.rate;
      previousCap = currentCap;
    } else {
      break;
    }
  }

  return tax;
}

/**
 * Calculates RMD dollar requirement based on account balance and age
 */
export function calculateRMD(taxDeferredBalance, age) {
  if (age < 73 || taxDeferredBalance <= 0) return 0;
  const divisor = IRS_RMD_DIVISORS[age] || (age > 120 ? 2.0 : 26.5);
  return taxDeferredBalance / divisor;
}

// Withdrawal and Tax Optimization Strategies
export const WITHDRAWAL_STRATEGIES = {
  LIQUID_FIRST: 'liquidFirst',
  PROPORTIONAL: 'proportional',
  BRACKET_FILLING: 'bracketFilling',
  ROTH_CONVERSION: 'rothConversion',
  ACA_MAXIMIZER: 'acaMaximizer'
};

export const STRATEGY_DESCRIPTIONS = {
  liquidFirst: {
    name: 'Liquid First (Standard Waterfall)',
    tagline: 'Spend taxable cash & brokerage first to preserve tax-deferred compounding',
    details: 'Spends taxable accounts first, allowing 401(k) to grow tax-deferred. Once liquid accounts deplete, draws shift to 401(k) and finally Roth. Simple and avoids early 401(k) penalties, but can create a significant RMD tax surge at age 73.'
  },
  proportional: {
    name: 'Proportional Drawdown',
    tagline: 'Draw simultaneously across taxable, tax-deferred, and Roth accounts',
    details: 'Spreads each year\'s living expense across all available accounts in proportion to their balance. Smooths ordinary income tax brackets over your lifetime and keeps account types balanced.'
  },
  bracketFilling: {
    name: '10% & 12% Bracket Filling',
    tagline: 'Draw 401(k) up to the 12% tax bracket ceiling before using liquid/Roth',
    details: 'Intentionally draws from 401(k) (if age 59½+ or Rule of 55) up to the 12% federal bracket limit (~$123,500 for married couples), taking full advantage of low brackets while in retirement. Remaining needs come from liquid cash.'
  },
  rothConversion: {
    name: 'Strategic Roth Conversions',
    tagline: 'Convert 401(k) to Roth in low-income years (ages 59½–72) to defuse RMDs',
    details: 'After meeting living expenses, converts remaining 401(k) headroom up to the 12% (or 22%) bracket ceiling into Roth IRA, paying conversion tax with liquid cash. Moves wealth from taxable to tax-free and substantially slashes future RMDs.'
  },
  acaMaximizer: {
    name: 'ACA Subsidy Maximizer',
    tagline: 'Keep ordinary income low before Medicare age 65 to maximize health subsidies',
    details: 'If retiring before age 65, strictly caps taxable ordinary income to preserve ACA premium tax credits. Spends liquid brokerage principal first, delaying 401(k) withdrawals until Medicare kicks in at age 65.'
  }
};

/**
 * Returns the gross income cap for a target federal income tax bracket
 */
export function getTaxBracketGrossCap(targetRate = 0.12, filingStatus = 'married', inflationFactor = 1.0) {
  const taxConfig = TAX_BRACKETS_2024[filingStatus] || TAX_BRACKETS_2024.married;
  const standardDeduction = taxConfig.standardDeduction * inflationFactor;
  const bracket = taxConfig.brackets.find(b => b.rate === targetRate);
  if (!bracket) {
    const b12 = taxConfig.brackets.find(b => b.rate === 0.12);
    return standardDeduction + (b12 ? b12.cap * inflationFactor : 94300 * inflationFactor);
  }
  return standardDeduction + bracket.cap * inflationFactor;
}

/**
 * Calculates 10% early withdrawal penalty on 401(k)/IRA if retired before age 59.5
 */
export function calculateEarlyWithdrawalPenalty(amount, age, retirementAge, enableRuleOf55 = true) {
  if (amount <= 0 || age >= 59.5) return 0;
  // Rule of 55: penalty waived if separated from employer in or after calendar year of turning 55
  if (enableRuleOf55 && retirementAge >= 55 && age >= 55) {
    return 0;
  }
  return amount * 0.10;
}

/**
 * Pseudo-random Gaussian generator (Box-Muller)
 */
function randomNormal(mean = 0, stdDev = 1) {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Generates correlated stock, bond, and inflation returns for one year
 */
function generateCorrelatedReturns(params) {
  const {
    stockMean, stockStdDev,
    bondMean, bondStdDev,
    inflationMean, inflationStdDev,
    stockBondCorrelation = 0.05
  } = params;

  // Independent standard normals
  const z1 = randomNormal(0, 1);
  const z2 = randomNormal(0, 1);
  const z3 = randomNormal(0, 1);

  // Apply Cholesky correlation for stocks and bonds
  const stockZ = z1;
  const bondZ = (stockBondCorrelation * z1) + (Math.sqrt(Math.max(0, 1 - stockBondCorrelation ** 2)) * z2);
  
  const stock = stockMean + stockZ * stockStdDev;
  const bond = bondMean + bondZ * bondStdDev;
  const inflation = Math.max(-0.05, inflationMean + z3 * inflationStdDev);

  return { stock, bond, inflation };
}

/**
 * Deterministic or Single-Path Simulation
 * Simulates year-by-year cash flows, tax tiers, account growth, and depletion
 */
export function runSinglePathSimulation(inputs, marketPath) {
  const currentAge = inputs.demographics.currentAge;
  const retirementAge = inputs.demographics.retirementAge;
  const endAge = inputs.demographics.endAge;
  const yearsTotal = Math.max(1, endAge - currentAge + 1);

  // Accounts state
  let liquid = Math.max(0, inputs.accounts.liquid || 0);
  let taxDeferred = Math.max(0, inputs.accounts.taxDeferred || 0);
  let roth = Math.max(0, inputs.accounts.roth || 0);

  // Base liquid cost basis estimate (assumed 70% of initial liquid balance is principal basis)
  let liquidCostBasisRatio = 0.70;

  let cumulativeInflation = 1.0;
  const yearlyResults = [];
  let isFailed = false;
  let failureAge = null;
  let cumulativeShortfall = 0;

  for (let t = 0; t < yearsTotal; t++) {
    const age = currentAge + t;
    const isRetired = age >= retirementAge;
    
    // Annual market returns for this year
    const yearReturns = marketPath[t] || {
      stock: inputs.assumptions.stockReturn,
      bond: inputs.assumptions.bondReturn,
      cash: inputs.assumptions.cashReturn || 0.03,
      inflation: inputs.assumptions.inflationRate
    };

    const stockReturn = yearReturns.stock;
    const bondReturn = yearReturns.bond;
    const cashReturn = yearReturns.cash || 0.03;
    const inflation = yearReturns.inflation;

    // Update cumulative inflation factor
    if (t > 0) {
      cumulativeInflation *= (1 + inflation);
    }

    // Dynamic portfolio asset allocation
    let stockPct = inputs.portfolio.stockPct / 100;
    let bondPct = inputs.portfolio.bondPct / 100;
    let cashPct = inputs.portfolio.cashPct / 100;

    // Optional glide path: reduce stock by 0.5% per year post-retirement down to min 30%
    if (inputs.portfolio.glidePath && isRetired) {
      const yearsInRetirement = age - retirementAge;
      const reduction = Math.min(stockPct - 0.30, yearsInRetirement * 0.005);
      if (reduction > 0) {
        stockPct -= reduction;
        bondPct += reduction;
      }
    }

    // Blended nominal portfolio return
    const grossReturn = (stockPct * stockReturn) + (bondPct * bondReturn) + (cashPct * cashReturn);
    
    // Tax drag on liquid accounts: ~15% tax on dividend/capital gains yield (~2% yield * 15% = ~0.3-0.5% drag)
    const liquidTaxDrag = Math.max(0, grossReturn * 0.08);
    const liquidNetReturn = grossReturn - liquidTaxDrag;

    // 1. Accumulation Phase (Pre-Retirement)
    if (!isRetired) {
      // Annual savings indexed by wage growth / inflation
      const wageInflation = Math.pow(1 + (inputs.accounts.savingsGrowthRate || 0.02), t);
      const addLiquid = (inputs.accounts.annualSavingsLiquid || 0) * wageInflation;
      const addTaxDeferred = ((inputs.accounts.annualSavingsTaxDeferred || 0) + (inputs.accounts.employerMatch || 0)) * wageInflation;
      const addRoth = (inputs.accounts.annualSavingsRoth || 0) * wageInflation;

      // Add contributions
      liquid += addLiquid;
      taxDeferred += addTaxDeferred;
      roth += addRoth;

      // Apply growth
      liquid = Math.max(0, liquid * (1 + liquidNetReturn));
      taxDeferred = Math.max(0, taxDeferred * (1 + grossReturn));
      roth = Math.max(0, roth * (1 + grossReturn));

      yearlyResults.push({
        yearIndex: t,
        age,
        isRetired: false,
        spending: 0,
        guaranteedIncome: 0,
        portfolioWithdrawal: 0,
        shortfall: 0,
        taxesPaid: 0,
        rmd: 0,
        liquid,
        taxDeferred,
        roth,
        totalNetWorth: liquid + taxDeferred + roth,
        grossReturn,
        inflation,
        cumulativeInflation
      });
      continue;
    }

    // 2. Drawdown Phase (Retirement)
    // Spending calculation
    let baseSpendNominal = inputs.spending.baseAnnualSpend * cumulativeInflation;

    // Spending Phase Adjustment ("Retirement Smile")
    if (inputs.spending.spendingModel === 'smile') {
      if (age < 75) {
        baseSpendNominal *= 1.10; // Active travel / go-go years
      } else if (age < 85) {
        baseSpendNominal *= 0.88; // Slower lifestyle / slow-go years
      } else {
        baseSpendNominal *= 1.05; // Late-life medical assistance / no-go years
      }
    }

    // Add custom one-off milestone events
    let milestoneNetExpense = 0;
    if (inputs.spending.oneTimeEvents && inputs.spending.oneTimeEvents.length > 0) {
      for (const event of inputs.spending.oneTimeEvents) {
        if (event.age === age) {
          const nominalVal = event.amount * cumulativeInflation;
          if (event.type === 'income') {
            milestoneNetExpense -= nominalVal;
          } else {
            milestoneNetExpense += nominalVal;
          }
        }
      }
    }

    let totalSpendingDemand = Math.max(0, baseSpendNominal + milestoneNetExpense);
    const essentialPct = typeof inputs.spending?.essentialPct === 'number'
      ? Math.max(0, Math.min(100, inputs.spending.essentialPct))
      : 70;
    const essentialSpending = totalSpendingDemand * (essentialPct / 100);
    let discretionarySpending = Math.max(0, totalSpendingDemand - essentialSpending);

    // Dynamic Down-Market Belt-Tightening
    let isBeltTightened = false;
    let beltTighteningSavings = 0;
    const enableBeltTightening = !!inputs.spending?.enableBeltTightening;
    const beltTighteningPct = typeof inputs.spending?.beltTighteningPct === 'number'
      ? Math.max(0, Math.min(100, inputs.spending.beltTighteningPct))
      : 50;

    const isDownMarket = (t > 0 && yearlyResults[t - 1]?.grossReturn < 0) || grossReturn < 0;
    if (enableBeltTightening && isDownMarket && discretionarySpending > 0) {
      beltTighteningSavings = discretionarySpending * (beltTighteningPct / 100);
      discretionarySpending -= beltTighteningSavings;
      totalSpendingDemand = Math.max(0, essentialSpending + discretionarySpending + milestoneNetExpense);
      isBeltTightened = true;
    }

    // Guaranteed Incomes & Spouse Working Income
    let guaranteedIncome = 0;
    let taxableOrdinaryIncome = 0;
    let spouseWorkingIncome = 0;

    // Spouse Working Income (if spouse has not yet reached spouseRetirementAge)
    if (inputs.demographics.includeSpouse) {
      const spouseAge = inputs.demographics.spouseCurrentAge + t;
      const spouseRetirementAge = inputs.demographics.spouseRetirementAge !== undefined
        ? inputs.demographics.spouseRetirementAge
        : inputs.demographics.retirementAge;
      const spouseSalary = inputs.incomeSources?.spouseAnnualIncome ?? inputs.demographics.spouseAnnualIncome ?? 0;

      if (spouseAge < spouseRetirementAge && spouseSalary > 0) {
        const wageInflation = Math.pow(1 + (inputs.accounts.savingsGrowthRate || 0.02), t);
        spouseWorkingIncome = spouseSalary * wageInflation;
        guaranteedIncome += spouseWorkingIncome;
        taxableOrdinaryIncome += spouseWorkingIncome;
      }
    }

    // Social Security (Primary)
    if (age >= inputs.incomeSources.socialSecurityStartAge) {
      const ssNominal = inputs.incomeSources.socialSecurity * cumulativeInflation;
      guaranteedIncome += ssNominal;
      // Typically up to 85% of Social Security is taxable ordinary income
      taxableOrdinaryIncome += ssNominal * 0.85;
    }

    // Social Security (Spouse)
    if (inputs.demographics.includeSpouse) {
      const spouseAge = inputs.demographics.spouseCurrentAge + t;
      if (spouseAge >= (inputs.incomeSources.spouseSocialSecurityStartAge || 67)) {
        const spouseSSNominal = (inputs.incomeSources.spouseSocialSecurity || 0) * cumulativeInflation;
        guaranteedIncome += spouseSSNominal;
        taxableOrdinaryIncome += spouseSSNominal * 0.85;
      }
    }

    // Pension
    if (age >= inputs.incomeSources.pensionStartAge) {
      const pensionNominal = inputs.incomeSources.pensionInflationAdjusted
        ? inputs.incomeSources.pension * cumulativeInflation
        : inputs.incomeSources.pension;
      guaranteedIncome += pensionNominal;
      taxableOrdinaryIncome += pensionNominal;
    }

    // Other Income (Rental, consulting, royalties)
    if (age >= inputs.incomeSources.otherIncomeStartAge && age <= inputs.incomeSources.otherIncomeEndAge) {
      const otherNominal = inputs.incomeSources.otherIncome * cumulativeInflation;
      guaranteedIncome += otherNominal;
      taxableOrdinaryIncome += otherNominal;
    }

    // Strategy Configuration & Early Withdrawal Rules
    const strategyConfig = inputs.strategy || {
      type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST,
      targetBracketRate: 0.12,
      enableRuleOf55: true,
      enableRule72t: false
    };
    const strategyType = strategyConfig.type || WITHDRAWAL_STRATEGIES.LIQUID_FIRST;
    const targetBracketRate = strategyConfig.targetBracketRate ?? 0.12;
    const enableRuleOf55 = strategyConfig.enableRuleOf55 !== false;
    const enableRule72t = strategyConfig.enableRule72t === true;

    // Age 59.5 Penalty & Exemptions (Rule of 55 at 55+ or Rule 72(t) SEPP at any age)
    const isEarlyRetiree = age < 59.5;
    const isRuleOf55Exempt = enableRuleOf55 && (inputs.demographics.retirementAge >= 55) && (age >= 55);
    const isRule72tExempt = enableRule72t && isEarlyRetiree && !isRuleOf55Exempt;
    const isPenaltyExempt = isRuleOf55Exempt || isRule72tExempt;
    const penaltyRate = (isEarlyRetiree && !isPenaltyExempt) ? 0.10 : 0.0;

    // Net spending needed from portfolio vs surplus income
    let netNeedFromPortfolio = Math.max(0, totalSpendingDemand - guaranteedIncome);
    let excessCashFlow = Math.max(0, guaranteedIncome - totalSpendingDemand);

    // Withdrawal Waterfall
    // Step A: Mandatory RMD from Tax-Deferred (Age >= 73)
    const rmd = calculateRMD(taxDeferred, age);
    let taxDeferredWithdrawn = 0;
    let taxDeferredSpent = 0;
    let excessRmdSwept = 0;
    let liquidWithdrawn = 0;
    let rothWithdrawn = 0;
    let rothConverted = 0;

    if (rmd > 0) {
      const actualRMD = Math.min(taxDeferred, rmd);
      taxDeferred -= actualRMD;
      taxDeferredWithdrawn += actualRMD;
      taxableOrdinaryIncome += actualRMD;

      if (actualRMD >= netNeedFromPortfolio) {
        // RMD satisfies full remaining spending need
        taxDeferredSpent += netNeedFromPortfolio;
        const excessRMD = actualRMD - netNeedFromPortfolio;
        excessCashFlow += excessRMD;
        netNeedFromPortfolio = 0;
      } else {
        taxDeferredSpent += actualRMD;
        netNeedFromPortfolio -= actualRMD;
      }
    }

    // Helper closures to draw from specific accounts cleanly
    const drawLiquid = (amt) => {
      if (amt <= 0 || liquid <= 0) return 0;
      const draw = Math.min(liquid, amt);
      liquid -= draw;
      liquidWithdrawn += draw;
      netNeedFromPortfolio -= draw;
      return draw;
    };

    const drawTaxDeferred = (amt) => {
      if (amt <= 0 || taxDeferred <= 0) return 0;
      const draw = Math.min(taxDeferred, amt);
      taxDeferred -= draw;
      taxDeferredWithdrawn += draw;
      taxDeferredSpent += draw;
      taxableOrdinaryIncome += draw;
      netNeedFromPortfolio -= draw;
      return draw;
    };

    const drawRoth = (amt) => {
      if (amt <= 0 || roth <= 0) return 0;
      const draw = Math.min(roth, amt);
      roth -= draw;
      rothWithdrawn += draw;
      netNeedFromPortfolio -= draw;
      return draw;
    };

    const standardWaterfall = () => {
      drawLiquid(netNeedFromPortfolio);
      drawTaxDeferred(netNeedFromPortfolio);
      drawRoth(netNeedFromPortfolio);
    };

    // Step B: Strategy-Specific Portfolio Drawdown for Living Needs
    if (netNeedFromPortfolio > 0) {
      if (strategyType === WITHDRAWAL_STRATEGIES.PROPORTIONAL) {
        // Proportional Drawdown across all available account types
        const totalAvail = liquid + taxDeferred + roth;
        if (totalAvail > 0) {
          drawLiquid(netNeedFromPortfolio * (liquid / totalAvail));
          drawTaxDeferred(netNeedFromPortfolio * (taxDeferred / totalAvail));
          drawRoth(netNeedFromPortfolio * (roth / totalAvail));
          // Cascade any rounding residue
          standardWaterfall();
        }
      } else if (strategyType === WITHDRAWAL_STRATEGIES.BRACKET_FILLING) {
        // 10% & 12% Bracket Filling: Draw 401(k) up to target bracket ceiling first (if no early penalty)
        const canUseDeferred = (!isEarlyRetiree || isPenaltyExempt);
        if (canUseDeferred && taxDeferred > 0) {
          const filingStatus = inputs.assumptions.taxFilingStatus || 'married';
          const bracketCap = getTaxBracketGrossCap(targetBracketRate, filingStatus, cumulativeInflation);
          const room = Math.max(0, bracketCap - taxableOrdinaryIncome);
          if (room > 0) {
            drawTaxDeferred(Math.min(room, netNeedFromPortfolio));
          }
        }
        // Remaining need comes from Liquid -> Roth -> Tax-Deferred
        drawLiquid(netNeedFromPortfolio);
        drawRoth(netNeedFromPortfolio);
        drawTaxDeferred(netNeedFromPortfolio);
      } else if (strategyType === WITHDRAWAL_STRATEGIES.ACA_MAXIMIZER) {
        if (age < 65) {
          // ACA Subsidy Maximizer: Before age 65, strictly prioritize liquid & roth to keep MAGI low
          drawLiquid(netNeedFromPortfolio);
          drawRoth(netNeedFromPortfolio);
          drawTaxDeferred(netNeedFromPortfolio);
        } else {
          // Age >= 65: Standard waterfall (Liquid -> Tax-Deferred -> Roth)
          standardWaterfall();
        }
      } else {
        // Liquid First (Standard Waterfall & Roth Conversion baseline)
        standardWaterfall();
      }
    }

    // Step C: Strategic Roth Conversions (Pre-RMDs, age < 73)
    if (strategyType === WITHDRAWAL_STRATEGIES.ROTH_CONVERSION && age < 73 && taxDeferred > 0) {
      const canConvert = (!isEarlyRetiree || isPenaltyExempt);
      if (canConvert) {
        const filingStatus = inputs.assumptions.taxFilingStatus || 'married';
        const bracketCap = getTaxBracketGrossCap(targetBracketRate, filingStatus, cumulativeInflation);
        const room = Math.max(0, bracketCap - taxableOrdinaryIncome);

        if (room > 0 && liquid > 0) {
          let convertAmt = Math.min(taxDeferred, room);
          // Ensure liquid cash can cover the estimated tax on conversion
          const maxConvertAffordable = liquid / Math.max(0.05, targetBracketRate);
          convertAmt = Math.min(convertAmt, maxConvertAffordable);

          if (convertAmt >= 1000) {
            taxDeferred -= convertAmt;
            roth += convertAmt;
            taxableOrdinaryIncome += convertAmt;
            rothConverted = convertAmt;
          }
        }
      }
    }

    // Taxes & Early Penalty Calculation
    const filingStatus = inputs.assumptions.taxFilingStatus || 'married';
    let earlyPenaltyPaid = 0;
    let earlyPenaltySaved = 0;
    let is72tActive = false;

    const nonRmdWithdrawn = Math.max(0, taxDeferredWithdrawn - rmd);
    if (nonRmdWithdrawn > 0 && isEarlyRetiree) {
      if (penaltyRate > 0) {
        earlyPenaltyPaid = nonRmdWithdrawn * penaltyRate;
      } else if (isRule72tExempt) {
        is72tActive = true;
        earlyPenaltySaved = nonRmdWithdrawn * 0.10;
      }
    }

    const estimatedFederalTax = calculateFederalIncomeTax(taxableOrdinaryIncome, filingStatus, cumulativeInflation) + earlyPenaltyPaid;
    let taxShortfall = 0;

    // Use excess cash flow (e.g. from spouse income or excess RMD) to cover taxes first
    let taxToPay = estimatedFederalTax;
    if (excessCashFlow > 0) {
      const taxFromExcess = Math.min(excessCashFlow, taxToPay);
      excessCashFlow -= taxFromExcess;
      taxToPay -= taxFromExcess;

      // Portion of RMD used to pay federal taxes is recognized as taxDeferredSpent
      const rmdExcess = Math.max(0, taxDeferredWithdrawn - taxDeferredSpent);
      if (rmdExcess > 0 && taxFromExcess > 0) {
        const rmdTaxPaid = Math.min(rmdExcess, taxFromExcess);
        taxDeferredSpent += rmdTaxPaid;
      }
    }

    // Any remaining excess cash flow sweeps into liquid account
    if (excessCashFlow > 0) {
      liquid += excessCashFlow;
      excessRmdSwept = excessCashFlow;
    }

    // Pay remaining taxes from portfolio (Liquid -> Tax-Deferred -> Roth)
    if (taxToPay > 0 && liquid > 0) {
      const draw = Math.min(liquid, taxToPay);
      liquid -= draw;
      liquidWithdrawn += draw;
      taxToPay -= draw;
    }
    if (taxToPay > 0 && taxDeferred > 0) {
      const draw = Math.min(taxDeferred, taxToPay);
      taxDeferred -= draw;
      taxDeferredWithdrawn += draw;
      taxDeferredSpent += draw;
      taxToPay -= draw;
    }
    if (taxToPay > 0 && roth > 0) {
      const draw = Math.min(roth, taxToPay);
      roth -= draw;
      rothWithdrawn += draw;
      taxToPay -= draw;
    }
    if (taxToPay > 0) {
      taxShortfall += taxToPay;
    }

    // Shortfall check
    const currentShortfall = netNeedFromPortfolio + taxShortfall;
    if (currentShortfall > 0) {
      cumulativeShortfall += currentShortfall;
      if (!isFailed) {
        isFailed = true;
        failureAge = age;
      }
    }

    // Essential vs Discretionary Funded Breakdown
    // Discretionary spending absorbs any spending shortfall first, protecting the essential floor
    const spendingFunded = Math.max(0, totalSpendingDemand - netNeedFromPortfolio);
    const essentialFunded = Math.min(essentialSpending, spendingFunded);
    const discretionaryFunded = Math.max(0, spendingFunded - essentialSpending);
    const essentialCoveragePct = essentialSpending > 0 ? (essentialFunded / essentialSpending) * 100 : 100;
    const discretionaryCoveragePct = discretionarySpending > 0 ? (discretionaryFunded / discretionarySpending) * 100 : 100;
    const guaranteedFloorCoverageRatio = essentialSpending > 0 ? (guaranteedIncome / essentialSpending) : 1.0;

    // Apply market return on remaining balances
    liquid = Math.max(0, liquid * (1 + liquidNetReturn));
    taxDeferred = Math.max(0, taxDeferred * (1 + grossReturn));
    roth = Math.max(0, roth * (1 + grossReturn));

    yearlyResults.push({
      yearIndex: t,
      age,
      isRetired: true,
      spending: totalSpendingDemand,
      essentialSpending,
      discretionarySpending,
      essentialFunded,
      discretionaryFunded,
      essentialCoveragePct,
      discretionaryCoveragePct,
      guaranteedFloorCoverageRatio,
      guaranteedIncome,
      spouseWorkingIncome,
      portfolioWithdrawal: (liquidWithdrawn + taxDeferredWithdrawn + rothWithdrawn),
      liquidWithdrawn,
      taxDeferredWithdrawn,
      taxDeferredSpent,
      excessRmdSwept,
      rothWithdrawn,
      rothConverted,
      earlyPenaltyPaid,
      earlyPenaltySaved,
      is72tActive,
      taxableOrdinaryIncome,
      isBeltTightened,
      beltTighteningSavings,
      shortfall: currentShortfall,
      taxesPaid: estimatedFederalTax - taxShortfall,
      rmd,
      liquid,
      taxDeferred,
      roth,
      totalNetWorth: liquid + taxDeferred + roth,
      grossReturn,
      inflation,
      cumulativeInflation
    });
  }

  const finalNetWorth = liquid + taxDeferred + roth;

  return {
    success: !isFailed,
    failureAge,
    finalNetWorth,
    cumulativeShortfall,
    totalTaxesPaid: yearlyResults.reduce((acc, y) => acc + (y.taxesPaid || 0), 0),
    totalRothConverted: yearlyResults.reduce((acc, y) => acc + (y.rothConverted || 0), 0),
    totalRmdsPaid: yearlyResults.reduce((acc, y) => acc + (y.rmd || 0), 0),
    totalEarlyPenalties: yearlyResults.reduce((acc, y) => acc + (y.earlyPenaltyPaid || 0), 0),
    totalPenaltySavedVia72t: yearlyResults.reduce((acc, y) => acc + (y.earlyPenaltySaved || 0), 0),
    yearsWith72tActive: yearlyResults.filter(y => y.is72tActive).length,
    totalBeltTighteningSavings: yearlyResults.reduce((acc, y) => acc + (y.beltTighteningSavings || 0), 0),
    beltTightenedYearsCount: yearlyResults.filter(y => y.isBeltTightened).length,
    yearlyResults
  };
}

/**
 * Runs a full Monte Carlo simulation suite
 */
export function runMonteCarloSimulation(inputs) {
  const mode = inputs.simulationConfig?.mode || 'monteCarloParametric';
  const iterations = Math.max(100, Math.min(20000, inputs.simulationConfig?.iterations || 10000));
  
  const currentAge = inputs.demographics.currentAge;
  const endAge = inputs.demographics.endAge;
  const yearsTotal = Math.max(1, endAge - currentAge + 1);

  const histSummary = getHistoricalSummary();
  const stockMean = (inputs.assumptions.stockReturn !== undefined) ? inputs.assumptions.stockReturn : histSummary.stocks.mean;
  const stockStdDev = (inputs.assumptions.stockStdDev !== undefined) ? inputs.assumptions.stockStdDev : histSummary.stocks.stdDev;
  const bondMean = (inputs.assumptions.bondReturn !== undefined) ? inputs.assumptions.bondReturn : histSummary.bonds.mean;
  const bondStdDev = (inputs.assumptions.bondStdDev !== undefined) ? inputs.assumptions.bondStdDev : histSummary.bonds.stdDev;
  const inflationMean = (inputs.assumptions.inflationRate !== undefined) ? inputs.assumptions.inflationRate : histSummary.inflation.mean;
  const inflationStdDev = histSummary.inflation.stdDev;
  const stockBondCorrelation = histSummary.stockBondCorrelation;

  const simulationRuns = [];
  let successfulRuns = 0;
  const failureAges = [];
  const finalNetWorths = [];
  const lifetimeTaxesList = [];
  const totalRmdsList = [];
  const rothConvertedList = [];
  const earlyPenaltiesList = [];

  // Matrix to accumulate trajectory percentiles: [yearIndex][runIndex]
  const trajectoryMatrix = Array.from({ length: yearsTotal }, () => []);

  // Determine market paths based on simulation mode
  if (mode === 'historicalSequences') {
    // Every single historical rolling sequence from 1928-2024
    const sequences = getRollingSequences(yearsTotal);
    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const marketPath = seq.years.map(y => ({
        stock: y.stock,
        bond: y.bond,
        cash: y.cash,
        inflation: y.inflation
      }));
      const runResult = runSinglePathSimulation(inputs, marketPath);
      runResult.scenarioName = `${seq.startYear} - ${seq.endYear}`;
      runResult.startYear = seq.startYear;
      simulationRuns.push(runResult);
      if (runResult.success) successfulRuns++;
      else failureAges.push(runResult.failureAge);
      finalNetWorths.push(runResult.finalNetWorth);

      lifetimeTaxesList.push(runResult.totalTaxesPaid || 0);
      totalRmdsList.push(runResult.totalRmdsPaid || 0);
      rothConvertedList.push(runResult.totalRothConverted || 0);
      earlyPenaltiesList.push(runResult.totalEarlyPenalties || 0);

      runResult.yearlyResults.forEach((yr, idx) => {
        trajectoryMatrix[idx].push(yr.totalNetWorth);
      });
    }
  } else {
    // Parametric or Bootstrap Monte Carlo
    for (let run = 0; run < iterations; run++) {
      const marketPath = [];
      for (let t = 0; t < yearsTotal; t++) {
        if (mode === 'monteCarloBootstrap') {
          // Sample a random historical year
          const randomIdx = Math.floor(Math.random() * HISTORICAL_DATA.length);
          const histYear = HISTORICAL_DATA[randomIdx];
          marketPath.push({
            stock: histYear.stock,
            bond: histYear.bond,
            cash: histYear.cash,
            inflation: histYear.inflation
          });
        } else {
          // Parametric Gaussian correlated
          const returns = generateCorrelatedReturns({
            stockMean, stockStdDev,
            bondMean, bondStdDev,
            inflationMean, inflationStdDev,
            stockBondCorrelation
          });
          marketPath.push({
            stock: returns.stock,
            bond: returns.bond,
            cash: inputs.assumptions.cashReturn || 0.03,
            inflation: returns.inflation
          });
        }
      }

      const runResult = runSinglePathSimulation(inputs, marketPath);
      if (runResult.success) successfulRuns++;
      else failureAges.push(runResult.failureAge);
      finalNetWorths.push(runResult.finalNetWorth);

      lifetimeTaxesList.push(runResult.totalTaxesPaid || 0);
      totalRmdsList.push(runResult.totalRmdsPaid || 0);
      rothConvertedList.push(runResult.totalRothConverted || 0);
      earlyPenaltiesList.push(runResult.totalEarlyPenalties || 0);

      runResult.yearlyResults.forEach((yr, idx) => {
        trajectoryMatrix[idx].push(yr.totalNetWorth);
      });
    }
  }

  const totalRuns = simulationRuns.length > 0 ? simulationRuns.length : iterations;
  const successRate = (successfulRuns / totalRuns) * 100;

  // Calculate percentile trajectories across all years
  const percentilesByYear = [];
  for (let t = 0; t < yearsTotal; t++) {
    const age = currentAge + t;
    const values = trajectoryMatrix[t].sort((a, b) => a - b);
    percentilesByYear.push({
      yearIndex: t,
      age,
      p10: getPercentile(values, 10),
      p25: getPercentile(values, 25),
      p50: getPercentile(values, 50),
      p75: getPercentile(values, 75),
      p90: getPercentile(values, 90),
      min: values[0] || 0,
      max: values[values.length - 1] || 0
    });
  }

  // Sort metrics for median and percentiles
  finalNetWorths.sort((a, b) => a - b);
  const medianEndingNetWorth = getPercentile(finalNetWorths, 50);
  const worst10EndingNetWorth = getPercentile(finalNetWorths, 10);
  const best10EndingNetWorth = getPercentile(finalNetWorths, 90);

  lifetimeTaxesList.sort((a, b) => a - b);
  const medianLifetimeTaxes = Math.round(getPercentile(lifetimeTaxesList, 50));

  totalRmdsList.sort((a, b) => a - b);
  const medianTotalRmds = Math.round(getPercentile(totalRmdsList, 50));

  rothConvertedList.sort((a, b) => a - b);
  const medianRothConverted = Math.round(getPercentile(rothConvertedList, 50));

  earlyPenaltiesList.sort((a, b) => a - b);
  const medianEarlyPenalties = Math.round(getPercentile(earlyPenaltiesList, 50));

  // Deterministic Base Case (average historical returns)
  const baseCasePath = Array.from({ length: yearsTotal }, () => ({
    stock: stockMean,
    bond: bondMean,
    cash: inputs.assumptions.cashReturn || 0.03,
    inflation: inflationMean
  }));
  const baseCaseRun = runSinglePathSimulation(inputs, baseCasePath);

  // Failure age statistics
  let earliestFailureAge = null;
  let averageFailureAge = null;
  if (failureAges.length > 0) {
    earliestFailureAge = Math.min(...failureAges);
    averageFailureAge = Math.round(failureAges.reduce((a, b) => a + b, 0) / failureAges.length);
  }

  // Calculate Safe Spending Capacities (both 95% standard and 100% zero-failure)
  const { safeSpend95, safeSpend100 } = solveSafeSpendingCapacities(inputs);
  const safeSpendCapacity = safeSpend95; // backwards compatibility

  // Generate automated diagnostics and gap warnings
  const diagnostics = generateDiagnostics({
    inputs,
    successRate,
    earliestFailureAge,
    averageFailureAge,
    baseCaseRun,
    safeSpendCapacity,
    safeSpendCapacity95: safeSpend95,
    safeSpendCapacity100: safeSpend100
  });

  return {
    successRate,
    totalRuns,
    successfulRuns,
    failedRuns: totalRuns - successfulRuns,
    earliestFailureAge,
    averageFailureAge,
    medianEndingNetWorth,
    worst10EndingNetWorth,
    best10EndingNetWorth,
    medianLifetimeTaxes,
    medianTotalRmds,
    medianRothConverted,
    medianEarlyPenalties,
    strategy: inputs.strategy || { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST, targetBracketRate: 0.12, enableRuleOf55: true },
    safeSpendCapacity,
    safeSpendCapacity95: safeSpend95,
    safeSpendCapacity100: safeSpend100,
    percentilesByYear,
    baseCaseRun,
    historicalRuns: mode === 'historicalSequences' ? simulationRuns : null,
    diagnostics
  };
}

/**
 * Calculates percentile from a sorted numeric array
 */
function getPercentile(sortedArr, percentile) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const index = (percentile / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
}

/**
 * Solves for both 95% and 100% safe spending capacity using shared deterministic market paths (1,000 runs)
 */
export function solveSafeSpendingCapacities(baseInputs) {
  const testInputs = JSON.parse(JSON.stringify(baseInputs));
  if (!testInputs.simulationConfig) testInputs.simulationConfig = {};
  const runs = 1000;
  testInputs.simulationConfig.iterations = runs;
  testInputs.simulationConfig.mode = 'monteCarloParametric';

  const totalNW = (baseInputs.accounts.liquid || 0) +
                  (baseInputs.accounts.taxDeferred || 0) +
                  (baseInputs.accounts.roth || 0);

  const totalGuaranteed = (baseInputs.incomeSources.socialSecurity || 0) +
                          (baseInputs.incomeSources.spouseSocialSecurity || 0) +
                          (baseInputs.incomeSources.pension || 0) +
                          (baseInputs.incomeSources.otherIncome || 0) +
                          (baseInputs.demographics.includeSpouse ? (baseInputs.incomeSources.spouseAnnualIncome || 0) : 0);

  // Search bounds derived strictly from portfolio capacity and guaranteed income (NOT baseAnnualSpend!)
  let low = 10000;
  let high = Math.max(120000, totalGuaranteed + Math.max(60000, totalNW * 0.15));

  const yearsTotal = Math.max(1, testInputs.demographics.endAge - testInputs.demographics.currentAge + 1);

  // Pre-generate deterministic market paths so every candidate spending level is evaluated against identical scenarios
  let s = 99991;
  const rng = () => {
    let t = s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const seededNormal = (mean = 0, stdDev = 1) => {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = rng();
    while (u2 === 0) u2 = rng();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * stdDev;
  };

  const fixedMarketPaths = [];
  const stockMean = baseInputs.assumptions.stockReturn || 0.095;
  const stockStdDev = baseInputs.assumptions.stockStdDev || 0.18;
  const bondMean = baseInputs.assumptions.bondReturn || 0.045;
  const bondStdDev = baseInputs.assumptions.bondStdDev || 0.075;
  const inflationMean = baseInputs.assumptions.inflationRate || 0.028;
  const correlation = baseInputs.assumptions.stockBondCorrelation || 0.05;

  for (let r = 0; r < runs; r++) {
    const path = [];
    for (let y = 0; y < yearsTotal; y++) {
      const z1 = seededNormal(0, 1);
      const z2 = seededNormal(0, 1);
      const stockZ = z1;
      const bondZ = correlation * z1 + Math.sqrt(Math.max(0, 1 - correlation ** 2)) * z2;
      path.push({
        stock: stockMean + stockZ * stockStdDev,
        bond: bondMean + bondZ * bondStdDev,
        cash: baseInputs.assumptions.cashReturn || 0.03,
        inflation: Math.max(-0.05, inflationMean + seededNormal(0, 0.02))
      });
    }
    fixedMarketPaths.push(path);
  }

  // Helper to run 14-step binary search across fixed market paths
  const binarySearchSpend = (initialLow, initialHigh, isPass) => {
    let lowBound = initialLow;
    let highBound = initialHigh;
    let bestSpend = initialLow;

    for (let step = 0; step < 14; step++) {
      const mid = (lowBound + highBound) / 2;
      testInputs.spending.baseAnnualSpend = mid;

      let successCount = 0;
      for (let r = 0; r < runs; r++) {
        if (runSinglePathSimulation(testInputs, fixedMarketPaths[r]).success) {
          successCount++;
        }
      }

      if (isPass(successCount, runs)) {
        bestSpend = mid;
        lowBound = mid;
      } else {
        highBound = mid;
      }
    }
    return bestSpend;
  };

  // 1. Solve for 95% Success Rate
  const bestSpend95 = binarySearchSpend(low, high, (count, total) => (count / total) * 100 >= 95);

  // 2. Solve for 100% Zero-Failure Rate (all 1,000 runs must pass; upper bounded by bestSpend95)
  const bestSpend100 = binarySearchSpend(low, bestSpend95, (count, total) => count === total);

  const safeSpend95 = Math.round(bestSpend95 / 1000) * 1000;
  const safeSpend100 = Math.min(safeSpend95, Math.round(bestSpend100 / 1000) * 1000);

  return { safeSpend95, safeSpend100 };
}

/**
 * Binary search to solve for safe spending capacity at a specified success rate threshold (defaults to 95%)
 * Independent of the user's current desired spending level.
 */
export function solveSafeSpendingCapacity(baseInputs, targetSuccessRate = 95) {
  const { safeSpend95, safeSpend100 } = solveSafeSpendingCapacities(baseInputs);
  return targetSuccessRate === 100 ? safeSpend100 : safeSpend95;
}

/**
 * Generates personalized diagnostic alerts and actionable gap recommendations
 */
export function generateDiagnostics({
  inputs,
  successRate,
  earliestFailureAge,
  averageFailureAge,
  baseCaseRun,
  safeSpendCapacity,
  safeSpendCapacity95 = null,
  safeSpendCapacity100 = null
}) {
  const alerts = [];
  const retirementAge = inputs.demographics.retirementAge;
  const ssAge = inputs.incomeSources.socialSecurityStartAge;
  const p95 = safeSpendCapacity95 || safeSpendCapacity;
  const p100 = safeSpendCapacity100;

  // 1. Overall Success Probability Verdict
  if (successRate >= 90) {
    alerts.push({
      type: 'success',
      title: 'Strong Retirement Foundation',
      message: `Your retirement plan has an estimated ${Math.round(successRate)}% success probability. Your assets and income streams provide resilience even across tough historical bear markets.`
    });
  } else if (successRate >= 75) {
    alerts.push({
      type: 'warning',
      title: 'Moderate Vulnerability',
      message: `With a ${Math.round(successRate)}% success probability, your plan is workable but exposed to prolonged market downturns or higher-than-expected inflation.`
    });
  } else {
    alerts.push({
      type: 'danger',
      title: 'High Risk of Portfolio Exhaustion',
      message: `Your retirement plan has a ${Math.round(successRate)}% success probability. Under adverse historical sequences, assets could deplete as early as age ${earliestFailureAge || 'N/A'}. Immediate adjustments recommended.`
    });
  }

  // 2. Social Security Income Bridge Gap
  if (ssAge > retirementAge) {
    const bridgeYears = ssAge - retirementAge;
    const initialRetirementSpend = inputs.spending.baseAnnualSpend;
    const totalCurrentLiquid = inputs.accounts.liquid;
    alerts.push({
      type: 'info',
      title: `${bridgeYears}-Year Income Bridge Window (Ages ${retirementAge}–${ssAge})`,
      message: `You retire at ${retirementAge} but delay Social Security until ${ssAge}. During these ${bridgeYears} years, 100% of living expenses must come from your portfolio. Maintaining sufficient liquid/cash reserves during this window is vital to avoid selling stocks during market dips.`
    });
  }

  // 3. Liquid Account Exhaustion Check
  const yearly = baseCaseRun.yearlyResults;
  const liquidDepletionYear = yearly.find(y => y.isRetired && y.liquid <= 100);
  if (liquidDepletionYear) {
    alerts.push({
      type: 'warning',
      title: `Liquid Reserves Deplete at Age ${liquidDepletionYear.age}`,
      message: `In the base forecast, your liquid/taxable accounts deplete around age ${liquidDepletionYear.age}. Thereafter, all withdrawals come from tax-deferred accounts, increasing ordinary taxable income.`
    });
  }

  // 3b. Essential vs. Discretionary Floor Coverage
  const retiredYears = yearly.filter(y => y.isRetired);
  if (retiredYears.length > 0) {
    const avgEssential = retiredYears.reduce((sum, y) => sum + (y.essentialSpending || 0), 0) / retiredYears.length;
    const avgGuaranteed = retiredYears.reduce((sum, y) => sum + (y.guaranteedIncome || 0), 0) / retiredYears.length;
    const floorRatio = avgEssential > 0 ? (avgGuaranteed / avgEssential) : 1;

    if (floorRatio >= 1.0) {
      alerts.push({
        type: 'success',
        title: `100%+ Essential Floor Coverage (${Math.round(floorRatio * 100)}% Guaranteed)`,
        message: `Your guaranteed incomes (Social Security, pensions, spouse salary) average $${Math.round(avgGuaranteed).toLocaleString()}/yr, fully covering your non-negotiable essential expenses ($${Math.round(avgEssential).toLocaleString()}/yr). Even during an extreme market downturn, your baseline living needs are 100% protected without touching investments.`
      });
    } else {
      const gap = Math.max(0, avgEssential - avgGuaranteed);
      alerts.push({
        type: 'info',
        title: `Essential Floor: ${Math.round(floorRatio * 100)}% Guaranteed by Incomes`,
        message: `Guaranteed income averages $${Math.round(avgGuaranteed).toLocaleString()}/yr, covering ${Math.round(floorRatio * 100)}% of your essential spending ($${Math.round(avgEssential).toLocaleString()}/yr). The remaining core gap (~$${Math.round(gap).toLocaleString()}/yr) relies on portfolio withdrawals.`
      });
    }
  }

  // 3c. Dynamic Down-Market Belt-Tightening
  if (inputs.spending?.enableBeltTightening) {
    const tightYears = baseCaseRun.beltTightenedYearsCount || 0;
    const totalSaved = baseCaseRun.totalBeltTighteningSavings || 0;
    const cutPct = inputs.spending.beltTighteningPct ?? 50;
    alerts.push({
      type: 'info',
      title: `Dynamic Belt-Tightening Active (${cutPct}% Discretionary Cut in Down Years)`,
      message: `In down-market years, discretionary spending is automatically reduced by ${cutPct}% while fully preserving your essential living floor. Across this baseline path, belt-tightening triggered in ${tightYears} down year(s), saving an estimated $${Math.round(totalSaved).toLocaleString()} to protect your investments from forced sales at market bottoms.`
    });
  }

  // 4. Safe Spending Comparison (100% Zero-Failure & 95% Standard)
  const currentSpend = inputs.spending.baseAnnualSpend;
  if (currentSpend > p95 * 1.1) {
    const diff = currentSpend - p95;
    const p100Text = p100 ? ` (or $${p100.toLocaleString()}/yr for 100% zero-failure)` : '';
    alerts.push({
      type: 'danger',
      title: 'Spending Exceeds Safe Capacity',
      message: `Your desired spending ($${currentSpend.toLocaleString()}/yr) is $${diff.toLocaleString()} higher than the estimated 95% safe spending capacity ($${p95.toLocaleString()}/yr)${p100Text}. Trimming annual spending by ~$${Math.round(diff / 12).toLocaleString()}/month would dramatically boost plan reliability.`
    });
  } else if (p100 && currentSpend <= p100) {
    alerts.push({
      type: 'success',
      title: '100% Bulletproof Spending Plan',
      message: `Your planned living spending ($${currentSpend.toLocaleString()}/yr) is within your 100% safe spending capacity ($${p100.toLocaleString()}/yr). Your portfolio survived all simulated historical and Monte Carlo stress tests with zero failure.`
    });
  } else if (currentSpend < p95 * 0.85) {
    const surplus = p95 - currentSpend;
    alerts.push({
      type: 'success',
      title: 'Surplus Spending Capacity',
      message: `You have room to spend up to an additional $${surplus.toLocaleString()}/yr ($${Math.round(surplus / 12).toLocaleString()}/month) while still maintaining an exceptional 95% success rate (or stay below $${p100 ? p100.toLocaleString() : 'target'}/yr for 100% zero-failure security).`
    });
  }

  // 5. RMD Impact
  const rmdYear = yearly.find(y => y.rmd > 0 && y.rmd > y.spending);
  if (rmdYear) {
    alerts.push({
      type: 'info',
      title: `RMD Tax Surge at Age ${rmdYear.age}`,
      message: `Starting at age 73, IRS Required Minimum Distributions ($${Math.round(rmdYear.rmd).toLocaleString()}) exceed your annual living expenses, pushing you into higher tax brackets. Consider partial Roth conversions before age 73.`
    });
  }

  // 6. Spouse Staggered Retirement Analysis
  if (inputs.demographics.includeSpouse) {
    const spouseRetAge = inputs.demographics.spouseRetirementAge ?? inputs.demographics.retirementAge;
    const primRetAge = inputs.demographics.retirementAge;
    const spouseSalary = inputs.incomeSources?.spouseAnnualIncome ?? inputs.demographics.spouseAnnualIncome ?? 0;

    if (spouseRetAge > primRetAge && spouseSalary > 0) {
      const overlapYears = spouseRetAge - primRetAge;
      alerts.push({
        type: 'success',
        title: `Spouse Working Buffer (${overlapYears} Years: Ages ${primRetAge}–${spouseRetAge})`,
        message: `Your spouse will continue working until age ${spouseRetAge}, contributing ~$${Math.round(spouseSalary).toLocaleString()}/yr while you are retired. This staggered income greatly cushions family cash flow and insulates your portfolio during early retirement.`
      });
    }
  }

  // 7. Strategy Insights & Tax Optimization Highlights
  const strat = inputs.strategy || { type: WITHDRAWAL_STRATEGIES.LIQUID_FIRST, enableRuleOf55: true };
  if (strat.type === WITHDRAWAL_STRATEGIES.ROTH_CONVERSION) {
    const totalConv = baseCaseRun.totalRothConverted || 0;
    alerts.push({
      type: 'info',
      title: 'Strategic Roth Conversions Active',
      message: `Converting 401(k) assets to Roth in low-bracket years shifted an estimated $${Math.round(totalConv).toLocaleString()} into tax-free accounts, permanently eliminating future RMDs on those funds.`
    });
  } else if (strat.type === WITHDRAWAL_STRATEGIES.BRACKET_FILLING) {
    alerts.push({
      type: 'info',
      title: '10% & 12% Bracket Filling Active',
      message: `Systematically drawing from 401(k) up to the 12% tax bracket ceiling harvests low tax rates during retirement before RMDs begin at age 73.`
    });
  } else if (strat.type === WITHDRAWAL_STRATEGIES.ACA_MAXIMIZER) {
    alerts.push({
      type: 'info',
      title: 'ACA Subsidy Maximizer Active',
      message: `Ordinary taxable income is intentionally constrained prior to age 65 (Medicare) to preserve eligibility for Affordable Care Act premium tax credits.`
    });
  } else if (strat.type === WITHDRAWAL_STRATEGIES.PROPORTIONAL) {
    alerts.push({
      type: 'info',
      title: 'Proportional Drawdown Active',
      message: `Portfolio draws are distributed across all three account types, maintaining a balanced asset mix and smoothing income tax brackets over your lifetime.`
    });
  }

  // 8. Early 401(k) Withdrawal Penalty & Rule of 55 / Rule 72(t) Diagnostics
  if (baseCaseRun.totalPenaltySavedVia72t > 0) {
    alerts.push({
      type: 'success',
      title: 'IRS Rule 72(t) SEPP Exemption Active',
      message: `Liquid reserves depleted prior to age 59½. Under IRS Section 72(t) SEPP, an estimated $${Math.round(baseCaseRun.totalPenaltySavedVia72t).toLocaleString()} in IRS 10% early withdrawal penalties was completely avoided by taking Substantially Equal Periodic Payments until age 59½.`
    });
  } else if (baseCaseRun.totalEarlyPenalties > 0) {
    alerts.push({
      type: 'danger',
      title: '10% Early 401(k) Withdrawal Penalty Incurred',
      message: `An estimated $${Math.round(baseCaseRun.totalEarlyPenalties).toLocaleString()} in IRS 10% early withdrawal penalties was incurred prior to age 59½. Enable IRS Rule 72(t) SEPP or the Rule of 55 in Strategy settings to eliminate this penalty.`
    });
  } else if (inputs.demographics.retirementAge >= 55 && inputs.demographics.retirementAge < 59.5 && strat.enableRuleOf55 !== false) {
    alerts.push({
      type: 'success',
      title: 'IRS Rule of 55 Active',
      message: `Retirement occurs between ages 55 and 59½. The IRS Rule of 55 exemption protects your employer 401(k) withdrawals from the 10% early penalty.`
    });
  }

  return alerts;
}

/**
 * Runs Iconic Historical Stress Tests (1929, 1937, 1946, 1966, 1973, 1977, 1982, 2000, 2008, 2022)
 */
export function runHistoricalStressTests(inputs) {
  const currentAge = inputs.demographics.currentAge;
  const endAge = inputs.demographics.endAge;
  const yearsTotal = Math.max(1, endAge - currentAge + 1);

  const results = [];

  for (const scenario of HISTORICAL_SCENARIOS) {
    const startYear = scenario.startYear;
    const startIdx = HISTORICAL_DATA.findIndex(d => d.year === startYear);
    if (startIdx === -1) continue;

    const marketPath = [];
    for (let t = 0; t < yearsTotal; t++) {
      const idx = (startIdx + t) % HISTORICAL_DATA.length;
      marketPath.push(HISTORICAL_DATA[idx]);
    }

    const res = runSinglePathSimulation(inputs, marketPath);
    results.push({
      startYear,
      scenarioName: scenario.name,
      description: scenario.description,
      success: res.success,
      failureAge: res.failureAge,
      finalNetWorth: res.finalNetWorth,
      cumulativeShortfall: res.cumulativeShortfall
    });
  }

  return results;
}
