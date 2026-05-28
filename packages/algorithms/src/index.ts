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
  optimization: {
    status: "proven-optimal" | "best-effort";
    method: string;
  };
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
  optimization: {
    status: "proven-optimal" | "best-effort";
    method: string;
  };
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
    const exact = optimizeProfileCutsExactly(cuts, stockLengths, settings.kerfMm);
    const bars = exact ?? optimizeProfileCutsHeuristically(cuts, stockLengths, settings.kerfMm);

    const bought = bars.reduce((sum, bar) => sum + bar.stockLengthMm, 0);
    const used = cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
    const purchaseMap = new Map<number, number>();
    for (const bar of bars) purchaseMap.set(bar.stockLengthMm, (purchaseMap.get(bar.stockLengthMm) ?? 0) + 1);

    return {
      materialCode,
      bars,
      efficiency: bought ? (used / bought) * 100 : 0,
      purchaseSummary: [...purchaseMap.entries()].map(([stockLengthMm, count]) => ({ stockLengthMm, count })),
      optimization: {
        status: exact ? "proven-optimal" : "best-effort",
        method: exact ? "型材精确搜索：采购长度最小，其次根数/余料最小" : "型材多策略最佳适配：订单规模较大，返回当前找到的最低采购长度方案"
      }
    };
  });
}

function sumBarUsed(bar: ProfileCutBar) {
  return bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0) + bar.kerfTotalMm;
}

function optimizeProfileCutsExactly(cuts: ProfileCutBar["cuts"], stockLengths: number[], kerfMm: number) {
  if (cuts.length === 0) return [] as ProfileCutBar[];
  if (cuts.length > 16) return null;

  const n = cuts.length;
  const fullMask = (1 << n) - 1;
  const options = new Map<number, ProfileCutBar>();
  for (let mask = 1; mask <= fullMask; mask += 1) {
    const barCuts: ProfileCutBar["cuts"] = [];
    for (let index = 0; index < n; index += 1) {
      if ((mask & (1 << index)) !== 0) barCuts.push(cuts[index]);
    }
    const cutTotal = barCuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
    const kerfTotalMm = Math.max(0, barCuts.length - 1) * kerfMm;
    const needed = cutTotal + kerfTotalMm;
    const stockLengthMm = stockLengths.find((length) => length >= needed);
    if (!stockLengthMm) continue;
    options.set(mask, {
      stockLengthMm,
      cuts: barCuts,
      kerfTotalMm,
      wasteMm: stockLengthMm - needed
    });
  }

  const dp = new Map<number, { boughtLength: number; barCount: number; wasteMm: number; bars: ProfileCutBar[] }>();
  dp.set(0, { boughtLength: 0, barCount: 0, wasteMm: 0, bars: [] });
  for (let mask = 1; mask <= fullMask; mask += 1) {
    let best: { boughtLength: number; barCount: number; wasteMm: number; bars: ProfileCutBar[] } | null = null;
    let barMask = mask;
    while (barMask > 0) {
      const option = options.get(barMask);
      const previous = dp.get(mask ^ barMask);
      if (option && previous) {
        const candidate = {
          boughtLength: previous.boughtLength + option.stockLengthMm,
          barCount: previous.barCount + 1,
          wasteMm: previous.wasteMm + option.wasteMm,
          bars: [...previous.bars, option]
        };
        if (!best || betterProfileScore(candidate, best)) best = candidate;
      }
      barMask = (barMask - 1) & mask;
    }
    if (best) dp.set(mask, best);
  }

  return dp.get(fullMask)?.bars ?? null;
}

function betterProfileScore(
  candidate: { boughtLength: number; barCount: number; wasteMm: number },
  current: { boughtLength: number; barCount: number; wasteMm: number }
) {
  return (
    candidate.boughtLength < current.boughtLength ||
    (candidate.boughtLength === current.boughtLength && candidate.barCount < current.barCount) ||
    (candidate.boughtLength === current.boughtLength && candidate.barCount === current.barCount && candidate.wasteMm < current.wasteMm)
  );
}

function optimizeProfileCutsHeuristically(cuts: ProfileCutBar["cuts"], stockLengths: number[], kerfMm: number) {
  const sorters = [
    (a: ProfileCutBar["cuts"][number], b: ProfileCutBar["cuts"][number]) => b.lengthMm - a.lengthMm,
    (a: ProfileCutBar["cuts"][number], b: ProfileCutBar["cuts"][number]) => a.lengthMm - b.lengthMm
  ];
  let best: ProfileCutBar[] | null = null;
  for (const sorter of sorters) {
    const bars = placeProfileCutsBestFit(cuts.slice().sort(sorter), stockLengths, kerfMm);
    if (!best || profileBarsScore(bars).boughtLength < profileBarsScore(best).boughtLength || (
      profileBarsScore(bars).boughtLength === profileBarsScore(best).boughtLength && profileBarsScore(bars).wasteMm < profileBarsScore(best).wasteMm
    )) {
      best = bars;
    }
  }
  return best ?? [];
}

function placeProfileCutsBestFit(cuts: ProfileCutBar["cuts"], stockLengths: number[], kerfMm: number) {
  const bars: ProfileCutBar[] = [];
  for (const cut of cuts) {
    let best: { bar?: ProfileCutBar; stockLengthMm?: number; waste: number } | null = null;
    for (const bar of bars) {
      const needed = cut.lengthMm + (bar.cuts.length > 0 ? kerfMm : 0);
      const remaining = bar.stockLengthMm - sumBarUsed(bar);
      if (remaining >= needed) {
        const waste = remaining - needed;
        if (!best || waste < best.waste) best = { bar, waste };
      }
    }
    for (const stockLengthMm of stockLengths) {
      if (stockLengthMm >= cut.lengthMm) {
        const waste = stockLengthMm - cut.lengthMm;
        if (!best || waste < best.waste) best = { stockLengthMm, waste };
      }
    }
    if (best?.bar) {
      best.bar.cuts.push(cut);
      best.bar.kerfTotalMm = Math.max(0, best.bar.cuts.length - 1) * kerfMm;
      best.bar.wasteMm = best.bar.stockLengthMm - sumBarUsed(best.bar);
    } else {
      const stockLengthMm = best?.stockLengthMm ?? stockLengths.find((length) => length >= cut.lengthMm) ?? cut.lengthMm;
      bars.push({
        stockLengthMm,
        cuts: [cut],
        kerfTotalMm: 0,
        wasteMm: stockLengthMm - cut.lengthMm
      });
    }
  }
  return bars;
}

function profileBarsScore(bars: ProfileCutBar[]) {
  return {
    boughtLength: bars.reduce((sum, bar) => sum + bar.stockLengthMm, 0),
    wasteMm: bars.reduce((sum, bar) => sum + bar.wasteMm, 0)
  };
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
      .sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm || b.heightMm - a.heightMm || b.widthMm - a.widthMm);
    const sheetSpecs = normalizeGlassSheetSpecs(settings);
    const exact = optimizeGlassCutsExactly(pieces, sheetSpecs);
    const optimized = exact ?? optimizeGlassCutsHeuristically(pieces, sheetSpecs);
    const sheets = finalizeGlassSheets(optimized.sheets);

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
      purchaseSummary: [...purchaseMap.values()],
      optimization: {
        status: exact ? "proven-optimal" : "best-effort",
        method: exact ? "一刀到底精确搜索：采购面积最小，其次余料/张数最小" : "一刀到底多策略搜索：订单规模较大，返回当前找到的最低采购面积方案"
      }
    };
  });
}

type GlassPiece = { widthMm: number; heightMm: number; glassType: string };

type SheetSpec = { widthMm: number; heightMm: number };

type ExactSheetOption = {
  mask: number;
  spec: SheetSpec;
  rows: GlassSheetPlan["rows"];
  boughtArea: number;
  usedArea: number;
  rowWasteArea: number;
};

function optimizeGlassCutsExactly(pieces: GlassPiece[], specs: SheetSpec[]) {
  if (pieces.length === 0) return { sheets: [] as GlassSheetPlan[] };
  if (pieces.length > 15) return null;

  const n = pieces.length;
  const fullMask = (1 << n) - 1;
  const sheetOptions = new Map<number, ExactSheetOption>();

  for (const spec of specs) {
    const rowInfo = new Map<number, { heightMm: number; widthMm: number; pieces: GlassPiece[]; wasteArea: number }>();
    for (let mask = 1; mask <= fullMask; mask += 1) {
      let widthMm = 0;
      let heightMm = 0;
      const rowPieces: GlassPiece[] = [];
      for (let index = 0; index < n; index += 1) {
        if ((mask & (1 << index)) === 0) continue;
        const piece = pieces[index];
        widthMm += piece.widthMm;
        heightMm = Math.max(heightMm, piece.heightMm);
        rowPieces.push(piece);
      }
      if (widthMm <= spec.widthMm) {
        const usedArea = rowPieces.reduce((sum, piece) => sum + piece.widthMm * piece.heightMm, 0);
        rowInfo.set(mask, { heightMm, widthMm, pieces: rowPieces, wasteArea: widthMm * heightMm - usedArea });
      }
    }

    const memo = new Map<number, { heightMm: number; rows: GlassSheetPlan["rows"]; rowWasteArea: number } | null>();
    const fitSubset = (mask: number): { heightMm: number; rows: GlassSheetPlan["rows"]; rowWasteArea: number } | null => {
      if (mask === 0) return { heightMm: 0, rows: [], rowWasteArea: 0 };
      if (memo.has(mask)) return memo.get(mask) ?? null;
      let best: { heightMm: number; rows: GlassSheetPlan["rows"]; rowWasteArea: number } | null = null;
      let rowMask = mask;
      while (rowMask > 0) {
        const row = rowInfo.get(rowMask);
        if (row) {
          const rest = fitSubset(mask ^ rowMask);
          if (rest) {
            const heightMm = row.heightMm + rest.heightMm;
            const rowWasteArea = row.wasteArea + rest.rowWasteArea;
            if (
              heightMm <= spec.heightMm &&
              (!best || heightMm < best.heightMm || (heightMm === best.heightMm && rowWasteArea < best.rowWasteArea))
            ) {
              best = { heightMm, rows: [{ heightMm: row.heightMm, pieces: row.pieces }, ...rest.rows], rowWasteArea };
            }
          }
        }
        rowMask = (rowMask - 1) & mask;
      }
      memo.set(mask, best);
      return best;
    };

    for (let mask = 1; mask <= fullMask; mask += 1) {
      const fit = fitSubset(mask);
      if (!fit) continue;
      const usedArea = maskArea(mask, pieces);
      const option = {
        mask,
        spec,
        rows: fit.rows,
        boughtArea: spec.widthMm * spec.heightMm,
        usedArea,
        rowWasteArea: fit.rowWasteArea
      };
      const current = sheetOptions.get(mask);
      if (
        !current ||
        option.boughtArea < current.boughtArea ||
        (option.boughtArea === current.boughtArea && option.rowWasteArea < current.rowWasteArea) ||
        (option.boughtArea === current.boughtArea && option.rowWasteArea === current.rowWasteArea && option.rows.length < current.rows.length)
      ) {
        sheetOptions.set(mask, option);
      }
    }
  }

  const dp = new Map<number, { boughtArea: number; sheetCount: number; cutComplexity: number; options: ExactSheetOption[] }>();
  dp.set(0, { boughtArea: 0, sheetCount: 0, cutComplexity: 0, options: [] });
  for (let mask = 1; mask <= fullMask; mask += 1) {
    let best: { boughtArea: number; sheetCount: number; cutComplexity: number; options: ExactSheetOption[] } | null = null;
    let sheetMask = mask;
    while (sheetMask > 0) {
      const option = sheetOptions.get(sheetMask);
      if (!option) {
        sheetMask = (sheetMask - 1) & mask;
        continue;
      }
      const previous = dp.get(mask ^ option.mask);
      if (previous) {
        const candidate = {
          boughtArea: previous.boughtArea + option.boughtArea,
          sheetCount: previous.sheetCount + 1,
          cutComplexity: previous.cutComplexity + option.rows.length + option.rows.reduce((sum, row) => sum + row.pieces.length, 0),
          options: [...previous.options, option]
        };
        if (!best || betterGlassScore(candidate, best)) best = candidate;
      }
      sheetMask = (sheetMask - 1) & mask;
    }
    if (best) dp.set(mask, best);
  }

  const best = dp.get(fullMask);
  if (!best) return null;
  return {
    sheets: best.options.map((option) => ({
      sheetWidthMm: option.spec.widthMm,
      sheetHeightMm: option.spec.heightMm,
      rows: option.rows,
      wasteAreaSqm: 0
    }))
  };
}

function betterGlassScore(
  candidate: { boughtArea: number; sheetCount: number; cutComplexity: number },
  current: { boughtArea: number; sheetCount: number; cutComplexity: number }
) {
  return (
    candidate.boughtArea < current.boughtArea ||
    (candidate.boughtArea === current.boughtArea && candidate.sheetCount < current.sheetCount) ||
    (candidate.boughtArea === current.boughtArea && candidate.sheetCount === current.sheetCount && candidate.cutComplexity < current.cutComplexity)
  );
}

function maskArea(mask: number, pieces: GlassPiece[]) {
  let area = 0;
  for (let index = 0; index < pieces.length; index += 1) {
    if ((mask & (1 << index)) !== 0) area += pieces[index].widthMm * pieces[index].heightMm;
  }
  return area;
}

function optimizeGlassCutsHeuristically(pieces: GlassPiece[], specs: SheetSpec[]) {
  const sorters = [
    (a: GlassPiece, b: GlassPiece) => b.widthMm * b.heightMm - a.widthMm * a.heightMm || b.heightMm - a.heightMm,
    (a: GlassPiece, b: GlassPiece) => b.heightMm - a.heightMm || b.widthMm - a.widthMm,
    (a: GlassPiece, b: GlassPiece) => b.widthMm - a.widthMm || b.heightMm - a.heightMm,
    (a: GlassPiece, b: GlassPiece) => Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm)
  ];
  let best: { sheets: GlassSheetPlan[]; boughtArea: number; sheetCount: number; cutComplexity: number } | null = null;
  for (const sorter of sorters) {
    const candidate = placeGlassPiecesBestFit(pieces.slice().sort(sorter), specs);
    const score = {
      sheets: candidate,
      boughtArea: candidate.reduce((sum, sheet) => sum + sheet.sheetWidthMm * sheet.sheetHeightMm, 0),
      sheetCount: candidate.length,
      cutComplexity: candidate.reduce((sum, sheet) => sum + sheet.rows.length + sheet.rows.reduce((rowSum, row) => rowSum + row.pieces.length, 0), 0)
    };
    if (!best || betterGlassScore(score, best)) best = score;
  }
  return { sheets: best?.sheets ?? [] };
}

function placeGlassPiecesBestFit(pieces: GlassPiece[], specs: SheetSpec[]) {
  const sheets: GlassSheetPlan[] = [];
  for (const piece of pieces) {
    let best:
      | { sheet: GlassSheetPlan; row?: GlassSheetPlan["rows"][number]; spec?: SheetSpec; score: number }
      | null = null;
    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        const usedWidth = row.pieces.reduce((sum, item) => sum + item.widthMm, 0);
        if (piece.heightMm <= row.heightMm && usedWidth + piece.widthMm <= sheet.sheetWidthMm) {
          const heightMismatchArea = (row.heightMm - piece.heightMm) * piece.widthMm;
          const remainingWidth = sheet.sheetWidthMm - usedWidth - piece.widthMm;
          const score = heightMismatchArea + remainingWidth * 2;
          if (!best || score < best.score) best = { sheet, row, score };
        }
      }
      const usedHeight = sheet.rows.reduce((sum, row) => sum + row.heightMm, 0);
      if (usedHeight + piece.heightMm <= sheet.sheetHeightMm && piece.widthMm <= sheet.sheetWidthMm) {
        const remainingHeight = sheet.sheetHeightMm - usedHeight - piece.heightMm;
        const remainingWidth = sheet.sheetWidthMm - piece.widthMm;
        const score = remainingHeight * sheet.sheetWidthMm + remainingWidth;
        if (!best || score < best.score) best = { sheet, score };
      }
    }
    for (const spec of specs) {
      if (piece.widthMm <= spec.widthMm && piece.heightMm <= spec.heightMm) {
        const score = spec.widthMm * spec.heightMm + (spec.widthMm - piece.widthMm) * piece.heightMm;
        if (!best || score < best.score) best = { sheet: null as unknown as GlassSheetPlan, spec, score };
      }
    }
    if (!best) {
      const spec = chooseGlassSheetSpec(piece, specs);
      sheets.push({ sheetWidthMm: spec.widthMm, sheetHeightMm: spec.heightMm, rows: [{ heightMm: piece.heightMm, pieces: [piece] }], wasteAreaSqm: 0 });
    } else if (best.row) {
      best.row.pieces.push(piece);
    } else if (best.spec) {
      sheets.push({ sheetWidthMm: best.spec.widthMm, sheetHeightMm: best.spec.heightMm, rows: [{ heightMm: piece.heightMm, pieces: [piece] }], wasteAreaSqm: 0 });
    } else {
      best.sheet.rows.push({ heightMm: piece.heightMm, pieces: [piece] });
    }
  }
  return sheets;
}

function finalizeGlassSheets(sheets: GlassSheetPlan[]) {
  return sheets.map((sheet) => {
    const usedArea = sheet.rows.flatMap((row) => row.pieces).reduce((sum, piece) => sum + (piece.widthMm * piece.heightMm) / 1_000_000, 0);
    const sheetArea = (sheet.sheetWidthMm * sheet.sheetHeightMm) / 1_000_000;
    return { ...sheet, wasteAreaSqm: Math.max(0, sheetArea - usedArea) };
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
