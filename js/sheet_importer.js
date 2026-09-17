/**
 * Google Sheet / CSV Net Worth Parser & Auto-Categorizer
 * 
 * Supports:
 * - Tab-separated text copied directly from Google Sheets (Cmd+C / Cmd+V)
 * - Side-by-side tables (e.g. Retirement in Col A-B, Brokerage in Col C-D)
 * - CSV / TSV file uploads
 * - Automatic categorization into:
 *     1. Liquid / Taxable (Checking, Savings, Brokerage, Cash, ESPP, RSUs, Crypto)
 *     2. Tax-Deferred (401k, 403b, Traditional IRA, Rollover IRA)
 *     3. Tax-Free (Roth IRA, Roth 401k, HSA)
 *     4. Ignore / Exclude (Home Equity, 529 Education, Parent Totals)
 */

export const CATEGORIES = {
  LIQUID: 'liquid',
  TAX_DEFERRED: 'taxDeferred',
  ROTH: 'roth',
  IGNORE: 'ignore'
};

export const CATEGORY_LABELS = {
  liquid: 'Liquid / Taxable',
  taxDeferred: 'Tax-Deferred (401k/IRA)',
  roth: 'Tax-Free (Roth/HSA)',
  ignore: 'Ignore / Do Not Include'
};

/**
 * Determines category based on account name keywords
 */
export function categorizeAccount(name) {
  const n = (name || '').toLowerCase().trim();

  // 1. Excluded / Ignored items
  if (
    n.includes('home') ||
    n.includes('residence') ||
    n.includes('house') ||
    n.includes('property') ||
    n.includes('real estate') ||
    n.includes('mortgage') ||
    n.includes('education') ||
    n.includes('529') ||
    n.includes('total net worth') ||
    n.includes('grand total')
  ) {
    return CATEGORIES.IGNORE;
  }

  // If it's a parent total like "total retirement", ignore by default so detail 401k/IRA items aren't double counted
  if (n === 'total retirement' || n === 'retirement total') {
    return CATEGORIES.IGNORE;
  }

  // 2. Tax-Free (Roth & HSA)
  if (
    n.includes('roth') ||
    n.includes('hsa') ||
    n.includes('health savings')
  ) {
    return CATEGORIES.ROTH;
  }

  // 3. Tax-Deferred (Traditional 401k, 403b, IRA)
  if (
    n.includes('401k') ||
    n.includes('401(k)') ||
    n.includes('403b') ||
    n.includes('403(b)') ||
    n.includes('ira') || // Note: Roth already handled above
    n.includes('traditional') ||
    n.includes('rollover') ||
    n.includes('sep') ||
    n.includes('simple') ||
    n.includes('pension')
  ) {
    return CATEGORIES.TAX_DEFERRED;
  }

  // 4. Liquid / Taxable (Checking, Savings, Brokerage, RSUs, ESPP, Crypto, Cash)
  if (
    n.includes('brokerage') ||
    n.includes('wells fargo') ||
    n.includes('fidelity') ||
    n.includes('vanguard') ||
    n.includes('schwab') ||
    n.includes('robinhood') ||
    n.includes('espp') ||
    n.includes('rsu') ||
    n.includes('crypto') ||
    n.includes('bitcoin') ||
    n.includes('eth') ||
    n.includes('cash') ||
    n.includes('checking') ||
    n.includes('savings') ||
    n.includes('hysa') ||
    n.includes('money market') ||
    n.includes('cd') ||
    n.includes('treasury') ||
    n.includes('t-bill') ||
    n.includes('taxable')
  ) {
    return CATEGORIES.LIQUID;
  }

  // Default fallback for ambiguous financial assets
  return CATEGORIES.LIQUID;
}

/**
 * Extracts dollar balance number from a string
 */
export function extractAmount(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // If text is pure percentage, ignore
  if (trimmed.includes('%') && !trimmed.includes('$')) return null;

  // 1. If text contains explicit '$' currency symbol
  if (trimmed.includes('$')) {
    const match = trimmed.match(/-?\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      return isNaN(val) ? null : val;
    }
  }

  // 2. If text contains alphabetical characters (e.g. "401k", "403b", "IRA"), it is an account name, not a balance!
  if (/[a-zA-Z]/.test(trimmed)) {
    return null;
  }

  // 3. Standalone numeric cell (e.g. "687,038.00" or "1496000")
  const numMatch = trimmed.match(/^-?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)$/);
  if (numMatch) {
    const val = parseFloat(numMatch[1].replace(/,/g, ''));
    return isNaN(val) ? null : val;
  }

  return null;
}

/**
 * Parses raw text copied from Google Sheets or CSV
 */
export function parseSheetText(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const items = [];
  let idCounter = 1;

  const addItem = (name, amount) => {
    if (!name || amount === null) return;
    const category = categorizeAccount(name);
    items.push({
      id: idCounter++,
      name,
      amount,
      category,
      enabled: category !== CATEGORIES.IGNORE
    });
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    // Check if line is tab-separated (standard Google Sheets clipboard)
    if (line.includes('\t')) {
      const cells = line.split('\t').map(c => c.trim());
      
      // Process cells in pairs: [Label, Amount, Label, Amount] (handles side-by-side tables)
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell) continue;

        const nextCell = cells[i + 1];
        const currentAmount = extractAmount(cell);
        const nextAmount = nextCell ? extractAmount(nextCell) : null;

        if (currentAmount === null && nextAmount !== null && nextCell) {
          // Found [Label, Amount] pair
          const cleanName = cell.replace(/:$/, '').trim();
          if (cleanName && cleanName.length < 50) {
            addItem(cleanName, nextAmount);
            i++; // Skip amount cell
          }
        } else if (cell.includes(':') && currentAmount !== null) {
          // Label and amount in single cell (e.g. "Vanguard 401K: $687,038.00")
          const parts = cell.split(':');
          addItem(parts[0].trim(), currentAmount);
        }
      }
      continue;
    }

    // Check comma-separated (CSV format)
    if (line.includes(',')) {
      const match = line.match(/^([^,]+),(.+)$/);
      if (match) {
        const cleanName = match[1].replace(/["']/g, '').replace(/:$/, '').trim();
        const amt = extractAmount(match[2]);
        if (cleanName && amt !== null) {
          addItem(cleanName, amt);
          continue;
        }
      }
    }

    // Colon or space separated line (e.g. "Total Brokerage: $1,496,145.00")
    if (line.includes(':')) {
      const parts = line.split(':');
      addItem(parts[0].trim(), extractAmount(parts.slice(1).join(':')));
    }
  }

  // Deduplicate items with identical name and amount
  const uniqueItems = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  return uniqueItems;
}

/**
 * Computes aggregated balances from parsed accounts
 */
export function aggregateBalances(items) {
  let liquid = 0;
  let taxDeferred = 0;
  let roth = 0;
  let ignored = 0;

  for (const item of items) {
    if (!item.enabled) {
      ignored += item.amount;
      continue;
    }

    switch (item.category) {
      case CATEGORIES.LIQUID:
        liquid += item.amount;
        break;
      case CATEGORIES.TAX_DEFERRED:
        taxDeferred += item.amount;
        break;
      case CATEGORIES.ROTH:
        roth += item.amount;
        break;
      case CATEGORIES.IGNORE:
      default:
        ignored += item.amount;
        break;
    }
  }

  return {
    liquid: Math.round(liquid),
    taxDeferred: Math.round(taxDeferred),
    roth: Math.round(roth),
    ignored: Math.round(ignored),
    totalIncluded: Math.round(liquid + taxDeferred + roth)
  };
}

export const SAMPLE_SHEET_DATA = [
  'Vanguard 401K:\t$687,038.00\tWells Fargo:\t$1,000,000.00',
  'Fidelity IRA:\t$325,105.00\tFidelity:\t$400,000.00',
  'Fidelity Roth:\t$98,674.00\tESPP:\t$96,145.00',
  'HSA:\t$57,026.00',
  'JH 401K:\t$37,244.00',
  'Oracle 401K:\t$54,388.00',
  'Home Equity:\t$174,508.00',
  '529 College Savings:\t$39,017.00'
].join('\n');
