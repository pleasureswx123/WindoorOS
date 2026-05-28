import type { GlassRequirement, MaterialSettings, MaterialTakeoff, ProfileRequirement } from "@windooros/domain";

export type ProfileCutBar = {
  stockLengthMm: number;
  cuts: Array<{ lengthMm: number; label: string; materialCode: string }>;
  kerfTotalMm: number;
  wasteMm: number;
};

export type ProfileCutResult = {
  materialCode: string;
  bars: ProfileCutBar[];
  efficiency: number;
  purchaseSummary: Array<{ stockLengthMm: number; count: number }>;
};

export type GlassSheetPlan = {
  sheetWidthMm: number;
  sheetHeightMm: number;
  rows: Array<{
    heightMm: number;
    pieces: Array<{ widthMm: number; heightMm: number; glassType: string }>;
  }>;
  wasteAreaSqm: number;
};

export type GlassCutResult = {
  glassType: string;
  sheets: GlassSheetPlan[];
  efficiency: number;
  purchaseSummary: Array<{ sheetWidthMm: number; sheetHeightMm: number; count: number; areaSqm: number }>;
};

export type QuoteResult = {
  profileMeters: number;
  glassAreaSqm: number;
  windowAreaSqm: number;
  windowCount: number;
  profileCost: number;
  glassCost: number;
  hardwareCost: number;
  laborCost: number;
  subtotal: number;
  profit: number;
  finalTotal: number;
};

export function optimizeProfileCuts(requirements: ProfileRequirement[], settings: Pick<MaterialSettings, "stockLengthsMm" | "kerfMm">): ProfileCutResult[] {
  const groups = new Map<string, ProfileRequirement[]>();
  for (const req of requirements) {
    groups.set(req.materialCode, [...(groups.get(req.materialCode) ?? []), req]);
  }

  return [...groups.entries()].map(([materialCode, reqs]) => {
    const cuts = reqs
      .flatMap((req) =>
        Array.from({ length: req.quantity }, () => ({
          lengthMm: req.lengthMm,
          label: req.label,
          materialCode: req.materialCode
        }))
      )
      .sort((a, b) => b.lengthMm - a.lengthMm);
    const stockLengths = [...settings.stockLengthsMm].sort((a, b) => a - b);
    const bars: ProfileCutBar[] = [];

    for (const cut of cuts) {
      let best: { bar: ProfileCutBar; needed: number; waste: number } | null = null;
      for (const bar of bars) {
        const needed = cut.lengthMm + (bar.cuts.length > 0 ? settings.kerfMm : 0);
        const remaining = bar.stockLengthMm - sumBarUsed(bar);
        if (remaining >= needed) {
          const waste = remaining - needed;
          if (!best || waste < best.waste) best = { bar, needed, waste };
        }
      }

      if (best) {
        best.bar.cuts.push(cut);
        best.bar.kerfTotalMm += best.bar.cuts.length > 1 ? settings.kerfMm : 0;
        best.bar.wasteMm = best.bar.stockLengthMm - sumBarUsed(best.bar);
        continue;
      }

      const stockLengthMm = stockLengths.find((length) => length >= cut.lengthMm) ?? stockLengths[stockLengths.length - 1] ?? cut.lengthMm;
      bars.push({
        stockLengthMm,
        cuts: [cut],
        kerfTotalMm: 0,
        wasteMm: stockLengthMm - cut.lengthMm
      });
    }

    const bought = bars.reduce((sum, bar) => sum + bar.stockLengthMm, 0);
    const used = cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
    const purchaseMap = new Map<number, number>();
    for (const bar of bars) purchaseMap.set(bar.stockLengthMm, (purchaseMap.get(bar.stockLengthMm) ?? 0) + 1);

    return {
      materialCode,
      bars,
      efficiency: bought ? (used / bought) * 100 : 0,
      purchaseSummary: [...purchaseMap.entries()].map(([stockLengthMm, count]) => ({ stockLengthMm, count }))
    };
  });
}

function sumBarUsed(bar: ProfileCutBar) {
  return bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0) + bar.kerfTotalMm;
}

export function optimizeGlassCuts(requirements: GlassRequirement[], settings: Pick<MaterialSettings, "glassSheetWidthMm" | "glassSheetHeightMm" | "glassSheetSpecs">): GlassCutResult[] {
  const groups = new Map<string, GlassRequirement[]>();
  for (const req of requirements) {
    groups.set(req.glassType, [...(groups.get(req.glassType) ?? []), req]);
  }

  return [...groups.entries()].map(([glassType, reqs]) => {
    const pieces = reqs
      .flatMap((req) =>
        Array.from({ length: req.quantity }, () => ({
          widthMm: req.widthMm,
          heightMm: req.heightMm,
          glassType
        }))
      )
      .sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm);
    const sheetSpecs = normalizeGlassSheetSpecs(settings);
    const sheets: GlassSheetPlan[] = [];

    for (const piece of pieces) {
      let placed = false;
      for (const sheet of sheets) {
        for (const row of sheet.rows) {
          const usedWidth = row.pieces.reduce((sum, item) => sum + item.widthMm, 0);
          if (piece.heightMm <= row.heightMm && usedWidth + piece.widthMm <= sheet.sheetWidthMm) {
            row.pieces.push(piece);
            placed = true;
            break;
          }
        }
        if (placed) break;

        const usedHeight = sheet.rows.reduce((sum, row) => sum + row.heightMm, 0);
        if (usedHeight + piece.heightMm <= sheet.sheetHeightMm && piece.widthMm <= sheet.sheetWidthMm) {
          sheet.rows.push({ heightMm: piece.heightMm, pieces: [piece] });
          placed = true;
          break;
        }
      }

      if (!placed) {
        const spec = chooseGlassSheetSpec(piece, sheetSpecs);
        sheets.push({
          sheetWidthMm: spec.widthMm,
          sheetHeightMm: spec.heightMm,
          rows: [{ heightMm: piece.heightMm, pieces: [piece] }],
          wasteAreaSqm: 0
        });
      }
    }

    for (const sheet of sheets) {
      const usedArea = sheet.rows.flatMap((row) => row.pieces).reduce((sum, piece) => sum + (piece.widthMm * piece.heightMm) / 1_000_000, 0);
      const sheetArea = (sheet.sheetWidthMm * sheet.sheetHeightMm) / 1_000_000;
      sheet.wasteAreaSqm = Math.max(0, sheetArea - usedArea);
    }

    const used = pieces.reduce((sum, piece) => sum + piece.widthMm * piece.heightMm, 0);
    const bought = sheets.reduce((sum, sheet) => sum + sheet.sheetWidthMm * sheet.sheetHeightMm, 0);
    const purchaseMap = new Map<string, { sheetWidthMm: number; sheetHeightMm: number; count: number; areaSqm: number }>();
    for (const sheet of sheets) {
      const key = `${sheet.sheetWidthMm}x${sheet.sheetHeightMm}`;
      const current = purchaseMap.get(key) ?? { sheetWidthMm: sheet.sheetWidthMm, sheetHeightMm: sheet.sheetHeightMm, count: 0, areaSqm: 0 };
      current.count += 1;
      current.areaSqm += (sheet.sheetWidthMm * sheet.sheetHeightMm) / 1_000_000;
      purchaseMap.set(key, current);
    }

    return {
      glassType,
      sheets,
      efficiency: bought ? (used / bought) * 100 : 0,
      purchaseSummary: [...purchaseMap.values()]
    };
  });
}

function normalizeGlassSheetSpecs(settings: Pick<MaterialSettings, "glassSheetWidthMm" | "glassSheetHeightMm" | "glassSheetSpecs">) {
  const specs = settings.glassSheetSpecs?.length ? settings.glassSheetSpecs : [{ widthMm: settings.glassSheetWidthMm, heightMm: settings.glassSheetHeightMm }];
  return specs
    .filter((spec) => spec.widthMm > 0 && spec.heightMm > 0)
    .sort((a, b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm);
}

function chooseGlassSheetSpec(piece: { widthMm: number; heightMm: number }, specs: Array<{ widthMm: number; heightMm: number }>) {
  return specs.find((spec) => piece.widthMm <= spec.widthMm && piece.heightMm <= spec.heightMm) ?? specs[specs.length - 1] ?? { widthMm: piece.widthMm, heightMm: piece.heightMm };
}

export function calculateQuote(takeoff: MaterialTakeoff, settings: MaterialSettings): QuoteResult {
  const profileMeters = takeoff.profiles.reduce((sum, req) => sum + (req.lengthMm * req.quantity) / 1000, 0);
  const glassAreaSqm = takeoff.glass.reduce((sum, req) => sum + (req.widthMm * req.heightMm * req.quantity) / 1_000_000, 0);
  const profileCost = profileMeters * settings.profilePricePerMeter;
  const glassCost = glassAreaSqm * settings.glassPricePerSqm;
  const hardwareCost = takeoff.windowCount * settings.hardwarePricePerWindow;
  const laborCost = takeoff.windowAreaSqm * settings.laborPricePerSqm;
  const subtotal = profileCost + glassCost + hardwareCost + laborCost;
  const profit = subtotal * (settings.profitRate / 100);

  return {
    profileMeters,
    glassAreaSqm,
    windowAreaSqm: takeoff.windowAreaSqm,
    windowCount: takeoff.windowCount,
    profileCost,
    glassCost,
    hardwareCost,
    laborCost,
    subtotal,
    profit,
    finalTotal: subtotal + profit
  };
}
