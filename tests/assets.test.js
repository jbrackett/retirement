import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Verify File Structure and Asset Completeness', () => {
  const requiredFiles = [
    'index.html',
    'server.js',
    'package.json',
    'css/styles.css',
    'js/app.js',
    'js/charts.js',
    'js/historical_data.js',
    'js/simulation_engine.js',
    'js/sheet_importer.js',
    'tests/strategy.test.js',
    'README.md'
  ];

  for (const rel of requiredFiles) {
    const full = path.join(rootDir, rel);
    assert.ok(fs.existsSync(full), `File ${rel} must exist`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 0, `File ${rel} must not be empty`);
  }
});

test('Verify Re-run Controls and Status Badge in index.html', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes('id="btn-rerun"'), 'Single Re-run button must exist in panel-header');
  assert.ok(!html.includes('id="btn-rerun-section"'), 'Section 7 duplicate Re-run button should be removed');
  assert.ok(!html.includes('id="btn-rerun-chart"'), 'Chart toolbar duplicate Re-run button should be removed');
  assert.ok(html.includes('id="sim-status-badge"'), 'Simulation status badge must exist');
  assert.ok(html.includes('id="input-sim-iterations"'), 'Simulation iterations selector must exist');
  assert.ok(html.includes('id="range-essential-pct"'), 'Essential spending slider must exist');
  assert.ok(html.includes('id="essential-split-display"'), 'Essential split display must exist');
  assert.ok(html.includes('id="guaranteed-floor-badge"'), 'Guaranteed floor badge must exist');
  assert.ok(html.includes('id="input-belt-tightening"'), 'Down-market belt-tightening checkbox must exist');
  assert.ok(html.includes('id="range-belt-tighten-pct"'), 'Belt-tighten percentage slider must exist');
  assert.ok(html.includes('id="input-rule-72t"'), 'Rule 72(t) SEPP checkbox must exist');
});

