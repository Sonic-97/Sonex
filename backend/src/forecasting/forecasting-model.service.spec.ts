import { ForecastingModelService } from './forecasting-model.service';

const series = (values: number[]) => values.map((value, index) => ({ timestamp: `2026-01-${String(index + 1).padStart(2, '0')}`, value }));

describe('ForecastingModelService deterministic baselines and backtests', () => {
  const service = new ForecastingModelService();

  it('records the same-weekday baseline', () => expect(service.select(series(Array(42).fill(100)), 1).baselineMethod).toBe('SAME_WEEKDAY_BASELINE'));
  it('returns one prediction per horizon day', () => expect(service.select(series(Array(42).fill(100)), 7).predictions).toHaveLength(7));
  it('never returns a negative lower bound', () => expect(service.select(series([0, 0, 100, ...Array(39).fill(0)]), 3).lower.every((value) => value >= 0)).toBe(true));
  it('returns ordered intervals', () => { const result = service.select(series(Array(42).fill(25)), 2); expect(result.lower[0]).toBeLessThanOrEqual(result.predictions[0]); expect(result.upper[0]).toBeGreaterThanOrEqual(result.predictions[0]); });
  it('uses a candidate only when it is no worse than baseline', () => { const result = service.select(series(Array.from({ length: 70 }, (_, index) => index + 1)), 1); if (result.selectedAgainstBaseline) expect(result.backtest.wape).toBeLessThanOrEqual(result.baselineBacktest.wape!); else expect(result.method).toBe('SAME_WEEKDAY_BASELINE'); });
  it('keeps baseline when a candidate is worse', () => { const values = Array.from({ length: 70 }, (_, index) => index % 7 === 0 ? 100 : 10); const result = service.select(series(values), 1); expect(result.selectedAgainstBaseline ? result.backtest.wape! <= result.baselineBacktest.wape! : result.method === 'SAME_WEEKDAY_BASELINE').toBe(true); });
  it('calculates MAE', () => expect(service.metrics([{ actual: 10, predicted: 8, lower: 7, upper: 9 }]).mae).toBe(2));
  it('calculates RMSE', () => expect(service.metrics([{ actual: 10, predicted: 8, lower: 7, upper: 9 }]).rmse).toBe(2));
  it('calculates MAPE only on non-zero actuals', () => expect(service.metrics([{ actual: 0, predicted: 1, lower: 0, upper: 2 }]).mape).toBeNull());
  it('calculates WAPE', () => expect(service.metrics([{ actual: 10, predicted: 8, lower: 7, upper: 9 }]).wape).toBe(20));
  it('calculates signed bias', () => expect(service.metrics([{ actual: 10, predicted: 8, lower: 7, upper: 9 }]).bias).toBe(-2));
  it('calculates interval coverage', () => expect(service.metrics([{ actual: 10, predicted: 10, lower: 9, upper: 11 }]).intervalCoverage).toBe(100));
  it('returns deterministic confidence', () => expect(service.confidence(84, 0.95, { mae: 1, rmse: 1, mape: 5, wape: 10, bias: 0, intervalCoverage: 90, sampleSize: 28 }, true)).toBe('HIGH'));
  it('uses medium confidence for adequate data', () => expect(service.confidence(50, 0.8, { mae: 1, rmse: 1, mape: 20, wape: 20, bias: 0, intervalCoverage: 80, sampleSize: 20 }, true)).toBe('MEDIUM'));
  it('uses insufficient confidence when ineligible', () => expect(service.confidence(100, 1, null, false)).toBe('INSUFFICIENT_DATA'));
  it.each([[1000, 'g', 'kg', 1], [2, 'kg', 'g', 2000], [1000, 'ml', 'l', 1], [2, 'l', 'ml', 2000], [3, 'piece', 'pcs', 3]] as const)('converts %s %s to %s', (quantity, from, to, expected) => expect(service.convertUnit(quantity, from, to)).toBe(expected));
  it('rejects incompatible mass and volume conversion', () => expect(service.convertUnit(1, 'kg', 'l')).toBeNull());
  it('rejects unknown units', () => expect(service.convertUnit(1, 'box', 'g')).toBeNull());
  it('does not mutate source observations', () => { const input = series(Array(42).fill(10)); const copy = JSON.stringify(input); service.select(input, 2); expect(JSON.stringify(input)).toBe(copy); });
});
