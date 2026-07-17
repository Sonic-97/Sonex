export interface CoffeeAttributes {
  roast?: string;
  blend?: string;
  sugar?: string;
}

export interface CoffeeIntent {
  isCoffee: boolean;
  roast?: string;
  blend?: string;
  sugar?: string;
}

/**
 * Deterministic parser for Egyptian Arabic coffee ordering expressions.
 *
 * Extracts roast (LIGHT/MEDIUM/DARK), blend (PLAIN/SPICED),
 * and sugar (NO_SUGAR/LIGHT_SUGAR/MEDIUM_SUGAR/EXTRA_SUGAR) from natural language.
 *
 * No AI/LLM dependency. Pure regex and keyword matching.
 */
export class CoffeeAttributeExtractor {
  // ── Roast ──────────────────────────────────────────────
  private readonly roastPatterns: Array<[RegExp, string]> = [
    // Direct keywords — order matters (فاتح before فات for exact match)
    [/(?:فاتح|fate7|fateh|light)/i, 'LIGHT'],
    [/(?:وسط|wosta|wasat|medium)/i, 'MEDIUM'],
    [/(?:غامق|ghame2|ghamek|dark)/i, 'DARK'],
  ];

  // ── Blend ──────────────────────────────────────────────
  private readonly blendSpicedPatterns: RegExp[] = [
    /محوج/i,
    /مهوج/i,
    /m7wag/i,
    /m7waga/i,
  ];

  private readonly blendPlainPatterns: RegExp[] = [
    /غير محوج/i,
    /غير مهوج/i,
    /سادة/i,
    /ساده/i,
    /بلاش حوج/i,
    /من غير حوج/i,
  ];

  // ── Sugar ──────────────────────────────────────────────
  private readonly sugarPatterns: Array<[RegExp, string]> = [
    [/(?:من غير سكر|من غير سكر|مانع|بدون سكر|no sugar|zero sugar|بدون)/i, 'NO_SUGAR'],
    [/(?:سكر خفيف|خفيف|ريحة|على الريحه|على الريحة|خفيف)/i, 'LIGHT_SUGAR'],
    [/(?:مظبوط|مظبوط|نص سكر|half sugar)/i, 'MEDIUM_SUGAR'],
    [/(?:سكر زيادة|زيادة سكر|زيادة|extra sugar)/i, 'EXTRA_SUGAR'],
  ];

  // ── Quantity ───────────────────────────────────────────
  private readonly quantityPatterns: Array<[RegExp, number]> = [
    [/(?:اتنين|اثنين|2|٢)/, 2],
    [/(?:تلاتة|ثلاثة|3|٣)/, 3],
    [/(?:أربعة|اربعة|4|٤)/, 4],
    [/(?:خمسة|5|٥)/, 5],
  ];

  // ── Coffee intent detection ────────────────────────────
  private readonly coffeePatterns: RegExp[] = [
    /قهوة/,
    /قهوه/,
    /coffee/i,
    /one coffee/i,
    /عايز\s+قهوة/,
    /هات\s+قهوة/,
    /ممكن\s+قهوة/,
  ];

  /**
   * Extract coffee intent from a message.
   * Returns whether the message is about coffee and any attributes found.
   */
  extractIntent(text: string): CoffeeIntent {
    const lower = text.toLowerCase().trim();
    const isCoffee = this.coffeePatterns.some(p => p.test(lower));

    if (!isCoffee) {
      return { isCoffee: false };
    }

    return {
      isCoffee: true,
      roast: this.extractRoast(lower) || undefined,
      blend: this.extractBlend(lower) || undefined,
      sugar: this.extractSugar(lower) || undefined,
    };
  }

  /**
   * Extract roast level from text.
   */
  extractRoast(text: string): string | undefined {
    const lower = text.toLowerCase().trim();
    for (const [pattern, value] of this.roastPatterns) {
      if (pattern.test(lower)) return value;
    }
    return undefined;
  }

  /**
   * Extract blend type from text.
   */
  extractBlend(text: string): string | undefined {
    const lower = text.toLowerCase().trim();

    // Check "غير محوج" first (longer pattern)
    for (const p of this.blendPlainPatterns) {
      if (p.test(lower)) return 'PLAIN';
    }

    for (const p of this.blendSpicedPatterns) {
      if (p.test(lower)) return 'SPICED';
    }

    return undefined;
  }

  /**
   * Extract sugar level from text.
   */
  extractSugar(text: string): string | undefined {
    const lower = text.toLowerCase().trim();
    for (const [pattern, value] of this.sugarPatterns) {
      if (pattern.test(lower)) return value;
    }
    return undefined;
  }

  /**
   * Extract quantity from text.
   */
  extractQuantity(text: string): number | undefined {
    const lower = text.toLowerCase().trim();

    // Arabic digits
    const arabicDigits = lower.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const numeric = arabicDigits.match(/\b(\d+)\b/);
    if (numeric) return Math.max(1, Number(numeric[1]));

    // Word patterns
    for (const [pattern, value] of this.quantityPatterns) {
      if (pattern.test(lower)) return value;
    }

    // Single/one
    if (/(?:واحد|one|1|١)/i.test(lower)) return 1;

    return undefined;
  }
}
