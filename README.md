# Retirement Success & Monte Carlo Simulator

A privacy-focused, zero-dependency, interactive retirement planning dashboard that runs locally in your web browser. 

It models real family finances—distinguishing **liquid/taxable accounts** from **tax-deferred 401(k)/IRAs** and **tax-free Roth/HSA accounts**—and evaluates plan resilience using **97 years of historical market data (1928–2024)**, IRS RMD rules, progressive federal tax brackets, and Monte Carlo simulations.

---

## Quick Start

You can run the dashboard in any modern browser on macOS in one of two ways:

### Option 1: Native Node Server (Recommended)
From this directory, start the local server:
```bash
npm start
```
Then visit: [http://localhost:3000](http://localhost:3000)

### Option 2: Direct File Open (Offline, Zero Server)
Double-click `index.html` in Finder, or run:
```bash
open index.html
```

### Running Automated Tests
Run unit tests across the tax engine, IRS RMD schedules, historical dataset, and Monte Carlo simulations using Node's built-in test runner:
```bash
npm test
```

---

## Key Features

### 1. Multi-Account Structure & Tax-Aware Withdrawal Waterfall
- **Liquid / Taxable Accounts**: Cash, High-Yield Savings, and Brokerage accounts. Modeled with annual dividend/capital gains tax drag and standard liquidity access.
- **Tax-Deferred Accounts**: Traditional 401(k), 403(b), and Traditional IRAs. Modeled with pre-tax growth, ordinary income taxation on withdrawal, and **IRS Required Minimum Distributions (RMDs)** starting at age 73 using the IRS Uniform Lifetime Table.
- **Tax-Free Accounts**: Roth IRA, Roth 401(k), and Health Savings Accounts (HSA) with 100% tax-free growth and qualified withdrawals.
- **Intelligent Drawdown Order**: Automatically prioritizes mandatory RMDs, then liquid accounts (lowering ordinary tax brackets), followed by tax-deferred accounts and tax-free Roth accounts.

### 2. Dual Simulation Modes with Historical Data (1928–2024)
- **Parametric Monte Carlo**: Runs 1,000 to 5,000 randomized lifetimes using correlated Gaussian/lognormal distributions parameterized with audited long-term asset volatility and stock-bond correlations.
- **Historical Bootstrap Resampling**: Resamples actual historical annual market returns (S&P 500, 10-Yr US Treasuries, CPI Inflation, Cash) from 1928 to 2024.
- **Rolling Historical Sequences**: Tests your plan against **every single rolling multi-decade window in modern history** (all 97 starting years from 1928 through 2024).

### 3. Actionable Gap Diagnostics & Recommendations
Automatically detects and flags vulnerabilities in your retirement plan:
- **Income Bridge Gap**: Highlights exposure during early retirement before Social Security or pensions begin.
- **Liquid Buffer Depletion**: Alerts you to the exact age when cash/brokerage funds run dry, forcing all future income to come from taxable retirement accounts.
- **Safe Spending Capacity**: Calculates the maximum annual spending budget that achieves a **95% probability of success**.
- **RMD Tax Surge**: Warns when mandatory IRS distributions will push you into higher tax brackets later in life.

### 4. Interactive Visual Analytics Tabs
- **Monte Carlo Fan Chart**: Shaded percentile corridors (10th, 25th, 50th median, 75th, 90th percentiles) with interactive hover tooltips and retirement transition lines.
- **Account Drawdown Breakdown**: Stacked area chart showing the evolution and depletion of Liquid vs. Tax-Deferred vs. Roth balances.
- **Retirement Cash Flows & Shortfalls**: Annual breakdown of guaranteed incomes (Social Security, pensions) vs. portfolio withdrawals vs. spending demand and taxes.
- **Historical Crisis Stress Tests**: Directly evaluates how your plan would have survived iconic market crashes:
  - **1929 Great Crash**
  - **1966 Stagflation Horizon** (the classic 30-year worst-case sequence)
  - **1973 Oil Shock & Stagflation**
  - **1982 Golden Bull Run**
  - **2000 Dot-Com Bubble**
  - **2008 Global Financial Crisis**

### 5. Google Sheets / CSV Net Worth Importer
- **Copy & Paste Net Worth**: Click `📊 Import Sheet` in the top bar, copy your account rows directly from your Google Sheet (`Cmd+C`), and paste (`Cmd+V`) into the dialog.
- **Smart Parsing**: Understands tab-delimited text, side-by-side tables (Retirement in columns A-B, Brokerage in columns C-D), colon separators, and `.csv`/`.tsv` files.
- **Auto-Categorization**: Automatically sorts accounts into **Liquid/Taxable**, **Tax-Deferred (401k/IRA)**, **Tax-Free (Roth/HSA)**, and automatically filters out non-retirement assets like **Home Equity** and **529 College Savings**.
- **Interactive Review**: Review live subtotals, tweak account categories, or toggle items before applying them to your retirement plan with one click.

### 6. Configurable Withdrawal & Tax Strategies
- **5 Distinct Drawdown Strategies**:
  1. **Liquid First (Standard Waterfall)**: Spends taxable accounts first, preserving tax-sheltered growth longest.
  2. **Proportional Drawdown**: Draws simultaneously across liquid, 401(k), and Roth accounts each year to smooth lifetime tax brackets.
  3. **10% & 12% Bracket Filling**: Intentionally draws 401(k) funds up to the 12% federal bracket ceiling in low-income retirement years before tapping liquid/Roth.
  4. **Strategic Roth Conversions**: Proactively converts 401(k) to Roth IRA up to the 12% or 22% bracket before age 73, paying conversion tax with liquid cash to permanently defuse future RMD tax surges.
  5. **ACA Subsidy Maximizer**: Caps taxable ordinary income before age 65 (Medicare) to maximize health insurance premium tax credits.
- **Rule of 55 Exemption**: Penalty-free 401(k) withdrawals for retirements at age 55+, avoiding the 10% IRS early withdrawal penalty.
- **Lifetime Tax Tracking**: Real-time KPI scorecard tracking median lifetime federal income taxes paid.

### 7. Scenario Presets, Persistence & PDF Export
- **One-Click Presets**: Quickly toggle between *Balanced Family*, *Early FIRE (Age 50)*, *Conservative Planner*, and *High Earner*.
- **Save & Load Scenarios**: Export your customized plan to a JSON file (`retirement_plan.json`) or import an existing plan.
- **Auto-Save**: Changes automatically save to your browser's local storage.
- **Executive PDF Report**: Use the `PDF Report` button (or `Cmd+P`) to print a clean executive summary document.
- **100% Private**: Runs completely on your laptop; no financial data is ever sent across the network.
