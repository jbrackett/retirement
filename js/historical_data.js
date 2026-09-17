/**
 * Historical Annual Financial Market Returns (1928 - 2024)
 * 
 * Sources:
 * - US Large Cap Equities: S&P 500 Total Returns (including dividend reinvestment)
 * - US 10-Year Treasury Bonds: Total Return (coupons + price changes)
 * - Inflation: US Bureau of Labor Statistics CPI-U annual rate
 * - Cash: 3-Month US Treasury Bill rate
 */

export const HISTORICAL_DATA = [
  { year: 1928, stock: 0.4381, bond: 0.0084, inflation: -0.0115, cash: 0.0356 },
  { year: 1929, stock: -0.0830, bond: 0.0420, inflation: 0.0058, cash: 0.0475 },
  { year: 1930, stock: -0.2512, bond: 0.0454, inflation: -0.0640, cash: 0.0241 },
  { year: 1931, stock: -0.4334, bond: -0.0256, inflation: -0.0932, cash: 0.0107 },
  { year: 1932, stock: -0.0864, bond: 0.0879, inflation: -0.1027, cash: 0.0079 },
  { year: 1933, stock: 0.4998, bond: 0.0186, inflation: 0.0076, cash: 0.0051 },
  { year: 1934, stock: -0.0119, bond: 0.0796, inflation: 0.0152, cash: 0.0016 },
  { year: 1935, stock: 0.4674, bond: 0.0447, inflation: 0.0299, cash: 0.0017 },
  { year: 1936, stock: 0.3194, bond: 0.0502, inflation: 0.0145, cash: 0.0018 },
  { year: 1937, stock: -0.3534, bond: 0.0138, inflation: 0.0286, cash: 0.0031 },
  { year: 1938, stock: 0.2928, bond: 0.0421, inflation: -0.0278, cash: 0.0008 },
  { year: 1939, stock: -0.0110, bond: 0.0441, inflation: 0.0000, cash: 0.0004 },
  { year: 1940, stock: -0.1067, bond: 0.0540, inflation: 0.0071, cash: 0.0004 },
  { year: 1941, stock: -0.1277, bond: -0.0202, inflation: 0.0993, cash: 0.0013 },
  { year: 1942, stock: 0.1917, bond: 0.0229, inflation: 0.0903, cash: 0.0034 },
  { year: 1943, stock: 0.2506, bond: 0.0249, inflation: 0.0296, cash: 0.0038 },
  { year: 1944, stock: 0.1903, bond: 0.0258, inflation: 0.0230, cash: 0.0038 },
  { year: 1945, stock: 0.3582, bond: 0.0380, inflation: 0.0225, cash: 0.0038 },
  { year: 1946, stock: -0.0843, bond: 0.0313, inflation: 0.1813, cash: 0.0038 },
  { year: 1947, stock: 0.0520, bond: 0.0092, inflation: 0.0884, cash: 0.0060 },
  { year: 1948, stock: 0.0570, bond: 0.0195, inflation: 0.0299, cash: 0.0104 },
  { year: 1949, stock: 0.1830, bond: 0.0466, inflation: -0.0207, cash: 0.0112 },
  { year: 1950, stock: 0.3081, bond: 0.0043, inflation: 0.0593, cash: 0.0120 },
  { year: 1951, stock: 0.2368, bond: -0.0030, inflation: 0.0600, cash: 0.0152 },
  { year: 1952, stock: 0.1815, bond: 0.0227, inflation: 0.0075, cash: 0.0172 },
  { year: 1953, stock: -0.0121, bond: 0.0414, inflation: 0.0075, cash: 0.0190 },
  { year: 1954, stock: 0.5256, bond: 0.0329, inflation: -0.0074, cash: 0.0095 },
  { year: 1955, stock: 0.3260, bond: -0.0134, inflation: 0.0037, cash: 0.0175 },
  { year: 1956, stock: 0.0644, bond: -0.0226, inflation: 0.0300, cash: 0.0266 },
  { year: 1957, stock: -0.1046, bond: 0.0680, inflation: 0.0291, cash: 0.0326 },
  { year: 1958, stock: 0.4372, bond: -0.0210, inflation: 0.0176, cash: 0.0183 },
  { year: 1959, stock: 0.1206, bond: -0.0265, inflation: 0.0173, cash: 0.0339 },
  { year: 1960, stock: 0.0034, bond: 0.1164, inflation: 0.0136, cash: 0.0293 },
  { year: 1961, stock: 0.2664, bond: 0.0206, inflation: 0.0067, cash: 0.0238 },
  { year: 1962, stock: -0.0881, bond: 0.0569, inflation: 0.0124, cash: 0.0278 },
  { year: 1963, stock: 0.2261, bond: 0.0168, inflation: 0.0165, cash: 0.0318 },
  { year: 1964, stock: 0.1642, bond: 0.0373, inflation: 0.0119, cash: 0.0355 },
  { year: 1965, stock: 0.1240, bond: 0.0072, inflation: 0.0192, cash: 0.0395 },
  { year: 1966, stock: -0.0997, bond: 0.0291, inflation: 0.0346, cash: 0.0488 },
  { year: 1967, stock: 0.2380, bond: -0.0158, inflation: 0.0304, cash: 0.0433 },
  { year: 1968, stock: 0.1081, bond: 0.0327, inflation: 0.0472, cash: 0.0534 },
  { year: 1969, stock: -0.0824, bond: -0.0501, inflation: 0.0620, cash: 0.0667 },
  { year: 1970, stock: 0.0356, bond: 0.1675, inflation: 0.0560, cash: 0.0652 },
  { year: 1971, stock: 0.1422, bond: 0.0979, inflation: 0.0327, cash: 0.0439 },
  { year: 1972, stock: 0.1876, bond: 0.0282, inflation: 0.0341, cash: 0.0407 },
  { year: 1973, stock: -0.1431, bond: 0.0366, inflation: 0.0871, cash: 0.0703 },
  { year: 1974, stock: -0.2590, bond: 0.0199, inflation: 0.1234, cash: 0.0792 },
  { year: 1975, stock: 0.3700, bond: 0.0361, inflation: 0.0694, cash: 0.0583 },
  { year: 1976, stock: 0.2383, bond: 0.1598, inflation: 0.0486, cash: 0.0497 },
  { year: 1977, stock: -0.0698, bond: 0.0129, inflation: 0.0670, cash: 0.0527 },
  { year: 1978, stock: 0.0651, bond: -0.0078, inflation: 0.0902, cash: 0.0721 },
  { year: 1979, stock: 0.1852, bond: 0.0067, inflation: 0.1329, cash: 0.1007 },
  { year: 1980, stock: 0.3174, bond: -0.0299, inflation: 0.1252, cash: 0.1143 },
  { year: 1981, stock: -0.0470, bond: 0.0820, inflation: 0.0892, cash: 0.1403 },
  { year: 1982, stock: 0.2042, bond: 0.3281, inflation: 0.0383, cash: 0.1061 },
  { year: 1983, stock: 0.2234, bond: 0.0320, inflation: 0.0379, cash: 0.0861 },
  { year: 1984, stock: 0.0615, bond: 0.1373, inflation: 0.0395, cash: 0.0952 },
  { year: 1985, stock: 0.3124, bond: 0.2571, inflation: 0.0380, cash: 0.0749 },
  { year: 1986, stock: 0.1849, bond: 0.2428, inflation: 0.0110, cash: 0.0597 },
  { year: 1987, stock: 0.0569, bond: -0.0496, inflation: 0.0443, cash: 0.0583 },
  { year: 1988, stock: 0.1654, bond: 0.0822, inflation: 0.0442, cash: 0.0667 },
  { year: 1989, stock: 0.3148, bond: 0.1769, inflation: 0.0465, cash: 0.0811 },
  { year: 1990, stock: -0.0306, bond: 0.0624, inflation: 0.0611, cash: 0.0751 },
  { year: 1991, stock: 0.3023, bond: 0.1500, inflation: 0.0306, cash: 0.0541 },
  { year: 1992, stock: 0.0749, bond: 0.0936, inflation: 0.0290, cash: 0.0345 },
  { year: 1993, stock: 0.0997, bond: 0.1421, inflation: 0.0275, cash: 0.0302 },
  { year: 1994, stock: 0.0133, bond: -0.0804, inflation: 0.0267, cash: 0.0427 },
  { year: 1995, stock: 0.3720, bond: 0.2348, inflation: 0.0254, cash: 0.0551 },
  { year: 1996, stock: 0.2268, bond: 0.0143, inflation: 0.0332, cash: 0.0502 },
  { year: 1997, stock: 0.3310, bond: 0.0994, inflation: 0.0170, cash: 0.0507 },
  { year: 1998, stock: 0.2834, bond: 0.1492, inflation: 0.0161, cash: 0.0481 },
  { year: 1999, stock: 0.2089, bond: -0.0825, inflation: 0.0268, cash: 0.0466 },
  { year: 2000, stock: -0.0903, bond: 0.1666, inflation: 0.0339, cash: 0.0588 },
  { year: 2001, stock: -0.1185, bond: 0.0557, inflation: 0.0155, cash: 0.0340 },
  { year: 2002, stock: -0.2197, bond: 0.1512, inflation: 0.0238, cash: 0.0161 },
  { year: 2003, stock: 0.2836, bond: 0.0038, inflation: 0.0188, cash: 0.0102 },
  { year: 2004, stock: 0.1074, bond: 0.0449, inflation: 0.0326, cash: 0.0137 },
  { year: 2005, stock: 0.0483, bond: 0.0287, inflation: 0.0342, cash: 0.0316 },
  { year: 2006, stock: 0.1561, bond: 0.0196, inflation: 0.0254, cash: 0.0473 },
  { year: 2007, stock: 0.0548, bond: 0.1021, inflation: 0.0408, cash: 0.0441 },
  { year: 2008, stock: -0.3655, bond: 0.2010, inflation: 0.0009, cash: 0.0138 },
  { year: 2009, stock: 0.2594, bond: -0.1112, inflation: 0.0272, cash: 0.0015 },
  { year: 2010, stock: 0.1482, bond: 0.0846, inflation: 0.0150, cash: 0.0013 },
  { year: 2011, stock: 0.0210, bond: 0.1604, inflation: 0.0296, cash: 0.0006 },
  { year: 2012, stock: 0.1589, bond: 0.0297, inflation: 0.0174, cash: 0.0009 },
  { year: 2013, stock: 0.3215, bond: -0.0910, inflation: 0.0150, cash: 0.0007 },
  { year: 2014, stock: 0.1352, bond: 0.1075, inflation: 0.0076, cash: 0.0005 },
  { year: 2015, stock: 0.0138, bond: 0.0128, inflation: 0.0073, cash: 0.0021 },
  { year: 2016, stock: 0.1196, bond: 0.0069, inflation: 0.0207, cash: 0.0032 },
  { year: 2017, stock: 0.2161, bond: 0.0280, inflation: 0.0211, cash: 0.0086 },
  { year: 2018, stock: -0.0423, bond: -0.0002, inflation: 0.0191, cash: 0.0182 },
  { year: 2019, stock: 0.3121, bond: 0.0964, inflation: 0.0229, cash: 0.0214 },
  { year: 2020, stock: 0.1801, bond: 0.1133, inflation: 0.0136, cash: 0.0035 },
  { year: 2021, stock: 0.2847, bond: -0.0442, inflation: 0.0704, cash: 0.0005 },
  { year: 2022, stock: -0.1804, bond: -0.1783, inflation: 0.0645, cash: 0.0202 },
  { year: 2023, stock: 0.2606, bond: 0.0388, inflation: 0.0335, cash: 0.0505 },
  { year: 2024, stock: 0.2502, bond: 0.0185, inflation: 0.0290, cash: 0.0520 }
];

/**
 * Iconic historical stress test start years
 */
export const HISTORICAL_SCENARIOS = [
  {
    id: '1929',
    name: '1929 Great Crash',
    startYear: 1929,
    description: 'Catastrophic initial stock drop (-86% cumulative over 4 years) followed by deflation and 1930s volatility.'
  },
  {
    id: '1937',
    name: '1937 Roosevelt Double-Dip',
    startYear: 1937,
    description: 'Premature recovery trap: -35.3% stock plunge in year one, followed by pre-WWII volatility (-11% in 1940, -13% in 1941).'
  },
  {
    id: '1946',
    name: '1946 Post-WWII Inflation Shock',
    startYear: 1946,
    description: 'The bond trap: inflation skyrocketed to +18.1% (1946) and +8.8% (1947), destroying real purchasing power while stocks fell -8.4%.'
  },
  {
    id: '1966',
    name: '1966 Stagflation Horizon',
    startYear: 1966,
    description: 'The infamous worst 30-year retirement start in modern history due to persistent 1970s double-digit inflation.'
  },
  {
    id: '1973',
    name: '1973 Oil Shock & Bear Market',
    startYear: 1973,
    description: 'Crushing 1973-1974 equity decline of -37% paired with surging 12% inflation and bond stagnation.'
  },
  {
    id: '1977',
    name: '1977 Volcker Rate Squeeze',
    startYear: 1977,
    description: 'Double-digit inflation peak (13.3% in 1979, 12.5% in 1980) and 20% Fed rate hikes that drove negative real returns across stocks and bonds.'
  },
  {
    id: '1982',
    name: '1982 Golden Bull Run',
    startYear: 1982,
    description: 'The best historical launchpad: 20% equity surge and high initial bond yields ushering in a multi-decade boom.'
  },
  {
    id: '2000',
    name: '2000 Dot-Com Crash',
    startYear: 2000,
    description: 'Three consecutive negative stock years (-9%, -12%, -22%) right at retirement, followed soon by 2008.'
  },
  {
    id: '2008',
    name: '2008 Global Financial Crisis',
    startYear: 2008,
    description: 'Immediate -36.5% equity crash in year one, followed by prolonged low interest rate recovery.'
  },
  {
    id: '2022',
    name: '2022 Dual Stock & Bond Crash',
    startYear: 2022,
    description: 'Worst year for the 60/40 portfolio since 1937: stocks fell -18.0% and 10-year Treasuries plunged -17.8% alongside +6.5% inflation.'
  }
];

/**
 * Computes series statistics: arithmetic mean, geometric mean (CAGR), std deviation, min, max
 */
export function computeSeriesStats(series) {
  if (!series || series.length === 0) {
    return { mean: 0, cagr: 0, stdDev: 0, min: 0, max: 0 };
  }
  const n = series.length;
  const mean = series.reduce((acc, v) => acc + v, 0) / n;
  
  let prod = 1.0;
  for (let i = 0; i < n; i++) {
    prod *= Math.max(0.0001, 1 + series[i]);
  }
  const cagr = Math.pow(prod, 1 / n) - 1;
  
  const variance = series.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...series);
  const max = Math.max(...series);

  return { mean, cagr, stdDev, min, max };
}

/**
 * Returns complete dataset statistics across the 1928-2024 range
 */
export function getHistoricalSummary() {
  const stocks = HISTORICAL_DATA.map(d => d.stock);
  const bonds = HISTORICAL_DATA.map(d => d.bond);
  const inflation = HISTORICAL_DATA.map(d => d.inflation);
  const cash = HISTORICAL_DATA.map(d => d.cash);

  // Correlation between stocks and bonds
  const stockStats = computeSeriesStats(stocks);
  const bondStats = computeSeriesStats(bonds);
  let cov = 0;
  for (let i = 0; i < stocks.length; i++) {
    cov += (stocks[i] - stockStats.mean) * (bonds[i] - bondStats.mean);
  }
  cov /= (stocks.length - 1);
  const stockBondCorrelation = cov / (stockStats.stdDev * bondStats.stdDev);

  return {
    startYear: HISTORICAL_DATA[0].year,
    endYear: HISTORICAL_DATA[HISTORICAL_DATA.length - 1].year,
    totalYears: HISTORICAL_DATA.length,
    stocks: stockStats,
    bonds: bondStats,
    inflation: computeSeriesStats(inflation),
    cash: computeSeriesStats(cash),
    stockBondCorrelation
  };
}

/**
 * Gets all continuous historical rolling sequences of length `durationYears`
 * If duration exceeds available data from a starting year, it wraps back around seamlessly
 */
export function getRollingSequences(durationYears) {
  const sequences = [];
  const total = HISTORICAL_DATA.length;
  
  // Every possible starting year from index 0 to total - 1
  for (let startIdx = 0; startIdx < total; startIdx++) {
    const startYear = HISTORICAL_DATA[startIdx].year;
    const years = [];
    for (let offset = 0; offset < durationYears; offset++) {
      const idx = (startIdx + offset) % total;
      years.push(HISTORICAL_DATA[idx]);
    }
    sequences.push({
      startYear,
      endYear: HISTORICAL_DATA[(startIdx + durationYears - 1) % total].year,
      years
    });
  }
  return sequences;
}
