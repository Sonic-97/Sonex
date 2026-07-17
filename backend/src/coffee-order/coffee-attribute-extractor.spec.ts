import { CoffeeAttributeExtractor, CoffeeIntent } from './coffee-attribute-extractor';

describe('CoffeeAttributeExtractor', () => {
  let extractor: CoffeeAttributeExtractor;

  beforeEach(() => {
    extractor = new CoffeeAttributeExtractor();
  });

  // ── Intent detection ─────────────────────────────────

  describe('extractIntent', () => {
    test('detects coffee from "قهوة"', () => {
      const result = extractor.extractIntent('قهوة');
      expect(result.isCoffee).toBe(true);
    });

    test('detects coffee from "عايز قهوة"', () => {
      const result = extractor.extractIntent('عايز قهوة');
      expect(result.isCoffee).toBe(true);
    });

    test('detects coffee from "هات قهوة"', () => {
      const result = extractor.extractIntent('هات قهوة');
      expect(result.isCoffee).toBe(true);
    });

    test('detects coffee from "ممكن قهوة"', () => {
      const result = extractor.extractIntent('ممكن قهوة');
      expect(result.isCoffee).toBe(true);
    });

    test('detects coffee from "coffee"', () => {
      const result = extractor.extractIntent('coffee');
      expect(result.isCoffee).toBe(true);
    });

    test('detects coffee from "one coffee"', () => {
      const result = extractor.extractIntent('one coffee');
      expect(result.isCoffee).toBe(true);
    });

    test('does not detect non-coffee messages', () => {
      expect(extractor.extractIntent('وريني المنيو').isCoffee).toBe(false);
      expect(extractor.extractIntent('عايز كابتشينو').isCoffee).toBe(false);
      expect(extractor.extractIntent('hello').isCoffee).toBe(false);
      expect(extractor.extractIntent('شاي').isCoffee).toBe(false);
    });
  });

  // ── Roast ─────────────────────────────────────────────

  describe('extractRoast', () => {
    test('extracts LIGHT from "فاتح"', () => {
      expect(extractor.extractRoast('فاتح')).toBe('LIGHT');
    });

    test('extracts LIGHT from "fateh"', () => {
      expect(extractor.extractRoast('fateh')).toBe('LIGHT');
    });

    test('extracts MEDIUM from "وسط"', () => {
      expect(extractor.extractRoast('وسط')).toBe('MEDIUM');
    });

    test('extracts DARK from "غامق"', () => {
      expect(extractor.extractRoast('غامق')).toBe('DARK');
    });

    test('returns undefined for no roast', () => {
      expect(extractor.extractRoast('مرحبا')).toBeUndefined();
    });
  });

  // ── Blend ─────────────────────────────────────────────

  describe('extractBlend', () => {
    test('extracts PLAIN from "غير محوج"', () => {
      expect(extractor.extractBlend('غير محوج')).toBe('PLAIN');
    });

    test('extracts PLAIN from "سادة"', () => {
      expect(extractor.extractBlend('سادة')).toBe('PLAIN');
    });

    test('extracts SPICED from "محوج"', () => {
      expect(extractor.extractBlend('محوج')).toBe('SPICED');
    });

    test('returns undefined for no blend', () => {
      expect(extractor.extractBlend('مرحبا')).toBeUndefined();
    });
  });

  // ── Sugar ─────────────────────────────────────────────

  describe('extractSugar', () => {
    test('extracts NO_SUGAR from "من غير سكر"', () => {
      expect(extractor.extractSugar('من غير سكر')).toBe('NO_SUGAR');
    });

    test('extracts NO_SUGAR from "مانع"', () => {
      expect(extractor.extractSugar('مانع')).toBe('NO_SUGAR');
    });

    test('extracts LIGHT_SUGAR from "سكر خفيف"', () => {
      expect(extractor.extractSugar('سكر خفيف')).toBe('LIGHT_SUGAR');
    });

    test('extracts LIGHT_SUGAR from "على الريحة"', () => {
      expect(extractor.extractSugar('على الريحة')).toBe('LIGHT_SUGAR');
    });

    test('extracts MEDIUM_SUGAR from "مظبوط"', () => {
      expect(extractor.extractSugar('مظبوط')).toBe('MEDIUM_SUGAR');
    });

    test('extracts EXTRA_SUGAR from "سكر زيادة"', () => {
      expect(extractor.extractSugar('سكر زيادة')).toBe('EXTRA_SUGAR');
    });

    test('extracts EXTRA_SUGAR from "زيادة"', () => {
      expect(extractor.extractSugar('زيادة')).toBe('EXTRA_SUGAR');
    });

    test('returns undefined for no sugar', () => {
      expect(extractor.extractSugar('مرحبا')).toBeUndefined();
    });
  });

  // ── Quantity ──────────────────────────────────────────

  describe('extractQuantity', () => {
    test('extracts number from digits', () => {
      expect(extractor.extractQuantity('2')).toBe(2);
    });

    test('extracts number from Arabic digits', () => {
      expect(extractor.extractQuantity('٣')).toBe(3);
    });

    test('extracts from "اتنين"', () => {
      expect(extractor.extractQuantity('اتنين')).toBe(2);
    });

    test('extracts from "واحد"', () => {
      expect(extractor.extractQuantity('واحد')).toBe(1);
    });

    test('returns undefined for non-quantity', () => {
      expect(extractor.extractQuantity('hello')).toBeUndefined();
    });
  });

  // ── Full message parsing ──────────────────────────────

  describe('full coffee phrase extraction', () => {
    test('"قهوة" extracts coffee with all attributes missing', () => {
      const r = extractor.extractIntent('قهوة');
      expect(r.isCoffee).toBe(true);
      expect(r.roast).toBeUndefined();
      expect(r.blend).toBeUndefined();
      expect(r.sugar).toBeUndefined();
    });

    test('"قهوة فاتح" extracts LIGHT roast', () => {
      const r = extractor.extractIntent('قهوة فاتح');
      expect(r.roast).toBe('LIGHT');
      expect(r.blend).toBeUndefined();
      expect(r.sugar).toBeUndefined();
    });

    test('"قهوة فاتح سادة" extracts LIGHT + PLAIN', () => {
      const r = extractor.extractIntent('قهوة فاتح سادة');
      expect(r.roast).toBe('LIGHT');
      expect(r.blend).toBe('PLAIN');
      expect(r.sugar).toBeUndefined();
    });

    test('"قهوة فاتح زيادة" extracts LIGHT + EXTRA_SUGAR', () => {
      const r = extractor.extractIntent('قهوة فاتح زيادة');
      expect(r.roast).toBe('LIGHT');
      expect(r.blend).toBeUndefined();
      expect(r.sugar).toBe('EXTRA_SUGAR');
    });

    test('"قهوة فاتح سادة زيادة" extracts LIGHT + PLAIN + EXTRA_SUGAR', () => {
      const r = extractor.extractIntent('قهوة فاتح سادة زيادة');
      expect(r.roast).toBe('LIGHT');
      expect(r.blend).toBe('PLAIN');
      expect(r.sugar).toBe('EXTRA_SUGAR');
    });

    test('"قهوة غامق محوج مظبوط" extracts all three', () => {
      const r = extractor.extractIntent('قهوة غامق محوج مظبوط');
      expect(r.roast).toBe('DARK');
      expect(r.blend).toBe('SPICED');
      expect(r.sugar).toBe('MEDIUM_SUGAR');
    });

    test('"قهوة وسط سادة من غير سكر" extracts MEDIUM + PLAIN + NO_SUGAR', () => {
      const r = extractor.extractIntent('قهوة وسط سادة من غير سكر');
      expect(r.roast).toBe('MEDIUM');
      expect(r.blend).toBe('PLAIN');
      expect(r.sugar).toBe('NO_SUGAR');
    });
  });
});
