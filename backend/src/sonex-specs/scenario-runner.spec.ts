import * as path from 'path';
import * as fs from 'fs';

interface Scenario {
  id: string;
  description: string;
  function: string;
  targets?: string[];
  input: any;
  expectedOutput: any;
  type: 'number' | 'object' | 'boolean';
  tolerance?: number;
  tags?: string[];
}

interface ScenarioFile {
  version: number;
  description: string;
  targets: string[];
  scenarios: Scenario[];
}

const sonexCore = require('../../../sonex-core/index.js');

function loadScenarios(filename: string): ScenarioFile {
  const filePath = path.resolve(__dirname, '../../../sonex-specs/scenarios', filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function deepEqual(actual: any, expected: any, tolerance: number): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (expected === 0) return Math.abs(actual) < tolerance;
    return Math.abs((actual - expected) / expected) < tolerance;
  }
  if (typeof expected === 'object' && expected !== null && typeof actual === 'object' && actual !== null) {
    const expKeys = Object.keys(expected);
    const actKeys = Object.keys(actual);
    if (expKeys.length !== actKeys.length) return false;
    return expKeys.every(key =>
      key in actual && deepEqual(actual[key], expected[key], tolerance),
    );
  }
  return actual === expected;
}

function executeScenario(scenario: Scenario): any {
  const input = scenario.input;

  switch (scenario.function) {
    case 'computeProductCost':
      return sonexCore.computeProductCost(
        input.ingredients,
        input.packaging,
        input.productCost,
        input.costPercent,
      );

    case 'computeCostBreakdown':
      return sonexCore.computeCostBreakdown(input);

    default:
      throw new Error(`Unknown scenario function: ${scenario.function}`);
  }
}

const scenarioFiles = ['costing.json'];
const tolerance = 0.0001;

for (const file of scenarioFiles) {
  const data = loadScenarios(file);

  describe(`sonex-specs: ${file}`, () => {
    it('top-level targets should include backend', () => {
      expect(data.targets).toContain('backend');
    });

    const activeScenarios = data.scenarios.filter(s => {
      const sTargets = s.targets ?? data.targets;
      return sTargets.includes('backend');
    });

    for (const scenario of activeScenarios) {
      it(`${scenario.id}: ${scenario.description}`, () => {
        const actual = executeScenario(scenario);
        const expected = scenario.expectedOutput;

        if (scenario.type === 'number') {
          expect(typeof actual).toBe('number');
          if (expected === 0) {
            expect(Math.abs(actual)).toBeLessThan(tolerance);
          } else {
            expect(Math.abs((actual - expected) / expected)).toBeLessThan(tolerance);
          }
        } else if (scenario.type === 'object') {
          expect(typeof actual).toBe('object');
          expect(actual).not.toBeNull();
          const matches = deepEqual(actual, expected, tolerance);
          if (!matches) {
            console.log(`Expected: ${JSON.stringify(expected, null, 2)}`);
            console.log(`Actual:   ${JSON.stringify(actual, null, 2)}`);
          }
          expect(matches).toBe(true);
        } else {
          expect(actual).toBe(expected);
        }
      });
    }
  });
}
