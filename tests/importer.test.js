import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSheetText,
  aggregateBalances,
  CATEGORIES,
  SAMPLE_SHEET_DATA
} from '../js/sheet_importer.js';

test('Parse Google Sheets Tab-Separated Clipboard Text', () => {
  // Simulating copying the Retirement table from Google Sheets
  const clipText = [
    'Vanguard 401K:\t$687,038.00\tWells Fargo:\t$1,000,000.00',
    'Fidelity IRA:\t$325,105.00\tFidelity:\t$400,000.00',
    'Fidelity Roth:\t$98,674.00\tESPP:\t$96,145.00',
    'HSA:\t$57,026.00',
    'JH 401K:\t$37,244.00',
    'Oracle 401K:\t$54,388.00'
  ].join('\n');

  const items = parseSheetText(clipText);
  assert.ok(items.length >= 8, `Should extract at least 8 items, got ${items.length}`);

  const v401k = items.find(i => i.name.includes('Vanguard 401K'));
  assert.ok(v401k);
  assert.equal(v401k.amount, 687038);
  assert.equal(v401k.category, CATEGORIES.TAX_DEFERRED);

  const fRoth = items.find(i => i.name.includes('Fidelity Roth'));
  assert.ok(fRoth);
  assert.equal(fRoth.amount, 98674);
  assert.equal(fRoth.category, CATEGORIES.ROTH);

  const hsa = items.find(i => i.name.includes('HSA'));
  assert.ok(hsa);
  assert.equal(hsa.amount, 57026);
  assert.equal(hsa.category, CATEGORIES.ROTH);

  const oracle = items.find(i => i.name.includes('Oracle 401K'));
  assert.ok(oracle);
  assert.equal(oracle.amount, 54388);
  assert.equal(oracle.category, CATEGORIES.TAX_DEFERRED);

  const agg = aggregateBalances(items);
  // Tax-deferred: 687038 + 325105 + 37244 + 54388 = 1,103,775
  assert.equal(agg.taxDeferred, 1103775, 'Tax-Deferred sum should match exact user balance');
  // Roth: 98674 + 57026 = 155,700
  assert.equal(agg.roth, 155700, 'Roth sum should match exact user balance');
  // Liquid: 1,000,000 + 400,000 + 96,145 = 1,496,145
  assert.equal(agg.liquid, 1496145, 'Liquid brokerage sum should match exact user balance');
});

test('Parse Google Sheets Summary Section with Excluded Assets', () => {
  const summaryText = [
    'Total Retirement:\t$1,259,475.00\t38.99%',
    'Total RSUs:\t$195,616.00\t6.06%',
    'Total Brokerage:\t$1,496,145.00\t46.32%',
    'Total Cash:\t$58,833.00\t1.82%',
    'Home Equity:\t$174,508.00\t5.40%',
    'Total Education:\t$39,017.00\t1.21%',
    'Total Crypto:\t$6,605.00\t0.20%'
  ].join('\n');

  const items = parseSheetText(summaryText);
  assert.ok(items.length >= 7);

  // Home equity and Education should be categorized as ignore/exclude
  const home = items.find(i => i.name.toLowerCase().includes('home equity'));
  assert.ok(home);
  assert.equal(home.category, CATEGORIES.IGNORE);
  assert.equal(home.enabled, false);

  const edu = items.find(i => i.name.toLowerCase().includes('education'));
  assert.ok(edu);
  assert.equal(edu.category, CATEGORIES.IGNORE);
  assert.equal(edu.enabled, false);

  const rsu = items.find(i => i.name.toLowerCase().includes('rsus'));
  assert.ok(rsu);
  assert.equal(rsu.category, CATEGORIES.LIQUID);

  const cash = items.find(i => i.name.toLowerCase().includes('cash'));
  assert.ok(cash);
  assert.equal(cash.category, CATEGORIES.LIQUID);
});

test('Parse SAMPLE_SHEET_DATA and Verify Aggregated Subtotals', () => {
  const items = parseSheetText(SAMPLE_SHEET_DATA);
  assert.equal(items.length, 11, 'Should extract 11 items');

  const agg = aggregateBalances(items);
  assert.equal(agg.taxDeferred, 1103775);
  assert.equal(agg.roth, 155700);
  assert.equal(agg.liquid, 1496145);
  assert.equal(agg.ignored, 174508 + 39017);
  assert.equal(agg.totalIncluded, 1103775 + 155700 + 1496145);

  // Test toggling an item off
  items[0].enabled = false;
  const newAgg = aggregateBalances(items);
  assert.equal(newAgg.taxDeferred, 1103775 - 687038);
});

test('Parse CSV Format Accounts', () => {
  const csv = [
    'Vanguard 401k,650000',
    '"Fidelity Roth IRA",120000',
    'Emergency HYSA,"$45,000.00"',
    'Primary Residence Equity,"$250,000.00"'
  ].join('\n');

  const items = parseSheetText(csv);
  assert.equal(items.length, 4);

  const v401k = items.find(i => i.name === 'Vanguard 401k');
  assert.equal(v401k.amount, 650000);
  assert.equal(v401k.category, CATEGORIES.TAX_DEFERRED);

  const roth = items.find(i => i.name === 'Fidelity Roth IRA');
  assert.equal(roth.amount, 120000);
  assert.equal(roth.category, CATEGORIES.ROTH);

  const hysa = items.find(i => i.name === 'Emergency HYSA');
  assert.equal(hysa.amount, 45000);
  assert.equal(hysa.category, CATEGORIES.LIQUID);

  const res = items.find(i => i.name === 'Primary Residence Equity');
  assert.equal(res.amount, 250000);
  assert.equal(res.category, CATEGORIES.IGNORE);
});
