// Reusable statistics. The caller defines strata and the statistic.
export const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
export function wilson(k, n) {
  if (!n) throw new Error('Cannot estimate an empty stratum');
  const p = k / n, z = 1.959963984540054, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { value: p, low: Math.max(0, c - h), high: Math.min(1, c + h), k, n };
}
export function bootstrap(groups, statistic, seed = 20261029, draws = 2000) {
  if (groups.some(g => !g.length)) throw new Error('Empty bootstrap stratum');
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const values = Array.from({ length: draws }, () => statistic(groups.map(g => g.map(() => g[Math.floor(random() * g.length)])))).sort((a, b) => a - b);
  return { value: statistic(groups), low: values[Math.floor(draws * .025)], high: values[Math.floor(draws * .975)], draws, seed };
}
