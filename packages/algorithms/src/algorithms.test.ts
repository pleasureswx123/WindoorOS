import { describe, expect, it } from "vitest";
import { defaultMaterialSettings } from "@windooros/domain";
import { calculateQuote, optimizeGlassCuts, optimizeProfileCuts } from "./index";

describe("cutting algorithms", () => {
  it("counts kerf when fitting profile bars", () => {
    const result = optimizeProfileCuts(
      [{ materialCode: "ALU", label: "外框", lengthMm: 1000, quantity: 3 }],
      { stockLengthsMm: [3000], kerfMm: 5 }
    );

    expect(result[0]?.bars).toHaveLength(2);
    expect(result[0]?.bars[0]?.kerfTotalMm).toBe(5);
  });

  it("creates guillotine-style glass rows", () => {
    const result = optimizeGlassCuts(
      [{ glassType: "5+12A+5", widthMm: 800, heightMm: 600, quantity: 4 }],
      { glassSheetWidthMm: 2440, glassSheetHeightMm: 1830, glassSheetSpecs: [{ widthMm: 2440, heightMm: 1830 }] }
    );

    expect(result[0]?.sheets.length).toBeGreaterThan(0);
    expect(result[0]?.sheets[0]?.rows.length).toBeGreaterThan(0);
  });

  it("calculates quote totals", () => {
    const quote = calculateQuote(
      {
        profiles: [{ materialCode: "ALU", label: "外框", lengthMm: 1000, quantity: 10 }],
        glass: [{ glassType: "5+12A+5", widthMm: 1000, heightMm: 1000, quantity: 2 }],
        windowAreaSqm: 3,
        windowCount: 2
      },
      defaultMaterialSettings
    );

    expect(quote.finalTotal).toBeGreaterThan(quote.subtotal);
  });
});
