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
    expect(result[0]?.bars.some((bar) => bar.kerfTotalMm === 5)).toBe(true);
    expect(result[0]?.optimization.status).toBe("proven-optimal");
  });

  it("chooses the lowest purchase length for profile cuts", () => {
    const result = optimizeProfileCuts(
      [{ materialCode: "ALU", label: "外框", lengthMm: 1000, quantity: 3 }],
      { stockLengthsMm: [2000, 3000], kerfMm: 0 }
    );

    expect(result[0]?.purchaseSummary).toEqual([{ stockLengthMm: 3000, count: 1 }]);
  });

  it("creates guillotine-style glass rows", () => {
    const result = optimizeGlassCuts(
      [{ glassType: "5+12A+5", widthMm: 800, heightMm: 600, quantity: 4 }],
      { glassSheetWidthMm: 2440, glassSheetHeightMm: 1830, glassSheetSpecs: [{ widthMm: 2440, heightMm: 1830 }] }
    );

    expect(result[0]?.sheets.length).toBeGreaterThan(0);
    expect(result[0]?.sheets[0]?.rows.length).toBeGreaterThan(0);
  });

  it("keeps the real piece height inside guillotine rows", () => {
    const result = optimizeGlassCuts(
      [
        { glassType: "5+12A+5", widthMm: 410, heightMm: 1240, quantity: 1 },
        { glassType: "5+12A+5", widthMm: 375, heightMm: 1240, quantity: 1 },
        { glassType: "5+12A+5", widthMm: 255, heightMm: 1120, quantity: 1 }
      ],
      { glassSheetWidthMm: 2440, glassSheetHeightMm: 1830, glassSheetSpecs: [{ widthMm: 2440, heightMm: 1830 }] }
    );

    const sheet = result[0]?.sheets[0];
    const pieces = sheet?.rows.flatMap((row) => row.pieces) ?? [];

    expect(result[0]?.optimization.status).toBe("proven-optimal");
    expect(pieces.find((piece) => piece.widthMm === 255)?.heightMm).toBe(1120);
    expect(sheet?.rows[0]?.heightMm).toBe(1240);
  });

  it("chooses the lowest purchase area sheet under guillotine constraints", () => {
    const result = optimizeGlassCuts(
      [{ glassType: "5+12A+5", widthMm: 800, heightMm: 800, quantity: 1 }],
      {
        glassSheetWidthMm: 2000,
        glassSheetHeightMm: 2000,
        glassSheetSpecs: [
          { widthMm: 2000, heightMm: 2000 },
          { widthMm: 1000, heightMm: 1000 }
        ]
      }
    );

    expect(result[0]?.sheets[0]?.sheetWidthMm).toBe(1000);
    expect(result[0]?.sheets[0]?.sheetHeightMm).toBe(1000);
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
