import { canonicalJson } from './index';

describe('RFC-001 canonical serialization', () => {
  test('canonical JSON is independent of object key insertion order', () => {
    expect(canonicalJson({ z: 1, a: { y: true, b: 'value' } })).toBe(canonicalJson({ a: { b: 'value', y: true }, z: 1 }));
  });
});
