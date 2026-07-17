import { Injectable } from '@nestjs/common';
import { BacktestMetrics, ForecastConfidence } from './forecasting.types';

export interface NumericObservation { timestamp: string; value: number; }
export interface ModelSelection {
  method: string; baselineMethod: string; selectedAgainstBaseline: boolean;
  predictions: number[]; lower: number[]; upper: number[];
  backtest: BacktestMetrics; baselineBacktest: BacktestMetrics;
}

@Injectable()
export class ForecastingModelService {
  select(observations: NumericObservation[], horizon: number): ModelSelection {
    const values = observations.map((row) => Math.max(0, Number(row.value) || 0));
    const baselineErrors = this.rollingErrors(values, 'SAME_WEEKDAY_BASELINE');
    const candidateErrors = this.rollingErrors(values, 'WEIGHTED_MOVING_AVERAGE');
    const baselineBacktest = this.metrics(baselineErrors);
    const candidateBacktest = this.metrics(candidateErrors);
    const baselineScore = baselineBacktest.wape ?? baselineBacktest.mae;
    const candidateScore = candidateBacktest.wape ?? candidateBacktest.mae;
    const useCandidate = candidateErrors.length >= 7 && candidateScore <= baselineScore;
    const method = useCandidate ? 'WEIGHTED_MOVING_AVERAGE' : 'SAME_WEEKDAY_BASELINE';
    const backtest = useCandidate ? candidateBacktest : baselineBacktest;
    const residual = Math.max(backtest.mae, this.standardDeviation(values.slice(-28)) * 0.8, 1);
    const predictions = Array.from({ length: horizon }, (_, index) => this.predict(values, method, index));
    return {
      method, baselineMethod: 'SAME_WEEKDAY_BASELINE', selectedAgainstBaseline: useCandidate,
      predictions: predictions.map(this.round),
      lower: predictions.map((value) => this.round(Math.max(0, value - residual * 1.28))),
      upper: predictions.map((value) => this.round(value + residual * 1.28)),
      backtest, baselineBacktest,
    };
  }

  confidence(days: number, completeness: number, metrics: BacktestMetrics | null, eligible: boolean): ForecastConfidence {
    if (!eligible) return 'INSUFFICIENT_DATA';
    const wape = metrics?.wape ?? 100;
    if (days >= 84 && completeness >= 0.9 && wape <= 15) return 'HIGH';
    if (days >= 42 && completeness >= 0.75 && wape <= 30) return 'MEDIUM';
    return 'LOW';
  }

  metrics(errors: Array<{ actual: number; predicted: number; lower: number; upper: number }>): BacktestMetrics {
    if (!errors.length) return { mae: 0, rmse: 0, mape: null, wape: null, bias: 0, intervalCoverage: 0, sampleSize: 0 };
    const absolute = errors.map((row) => Math.abs(row.actual - row.predicted));
    const signed = errors.map((row) => row.predicted - row.actual);
    const nonZero = errors.filter((row) => row.actual !== 0);
    const actualTotal = errors.reduce((sum, row) => sum + Math.abs(row.actual), 0);
    return {
      mae: this.round(absolute.reduce((a, b) => a + b, 0) / errors.length),
      rmse: this.round(Math.sqrt(errors.reduce((sum, row) => sum + ((row.predicted - row.actual) ** 2), 0) / errors.length)),
      mape: nonZero.length ? this.round(nonZero.reduce((sum, row) => sum + Math.abs((row.actual - row.predicted) / row.actual), 0) / nonZero.length * 100) : null,
      wape: actualTotal ? this.round(absolute.reduce((a, b) => a + b, 0) / actualTotal * 100) : null,
      bias: this.round(signed.reduce((a, b) => a + b, 0) / errors.length),
      intervalCoverage: this.round(errors.filter((row) => row.actual >= row.lower && row.actual <= row.upper).length / errors.length * 100),
      sampleSize: errors.length,
    };
  }

  convertUnit(quantity: number, from: string, to: string): number | null {
    const source = from.trim().toLowerCase(); const target = to.trim().toLowerCase();
    if (source === target) return this.round(quantity);
    const factors: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, piece: 1, pieces: 1, pcs: 1 };
    const families: Record<string, string> = { g: 'mass', kg: 'mass', ml: 'volume', l: 'volume', piece: 'count', pieces: 'count', pcs: 'count' };
    if (!factors[source] || !factors[target] || families[source] !== families[target]) return null;
    return this.round(quantity * factors[source] / factors[target]);
  }

  private rollingErrors(values: number[], method: string) {
    const start = Math.max(14, values.length - 28);
    return values.slice(start).map((actual, offset) => {
      const index = start + offset; const predicted = this.predict(values.slice(0, index), method, 0);
      const residual = this.standardDeviation(values.slice(Math.max(0, index - 28), index)) || 1;
      return { actual, predicted, lower: Math.max(0, predicted - residual * 1.28), upper: predicted + residual * 1.28 };
    });
  }

  private predict(values: number[], method: string, horizonIndex: number) {
    if (!values.length) return 0;
    if (method === 'WEIGHTED_MOVING_AVERAGE') {
      const recent = values.slice(-14); const weightTotal = recent.reduce((sum, _, index) => sum + index + 1, 0);
      return recent.reduce((sum, value, index) => sum + value * (index + 1), 0) / weightTotal;
    }
    const weekdayValues: number[] = [];
    for (let index = values.length - 7 + (horizonIndex % 7); index >= 0; index -= 7) {
      if (values[index] !== undefined) weekdayValues.push(values[index]);
      if (weekdayValues.length === 8) break;
    }
    const sample = weekdayValues.length ? weekdayValues : values.slice(-28);
    return sample.reduce((a, b) => a + b, 0) / sample.length;
  }

  private standardDeviation(values: number[]) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
  }
  private round(value: number) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
}
