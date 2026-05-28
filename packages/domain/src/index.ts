export type OrderStatus =
  | "DRAFT"
  | "MEASURED"
  | "QUOTED"
  | "WON"
  | "LOST"
  | "MATERIAL_READY"
  | "PRODUCING"
  | "READY_TO_INSTALL"
  | "INSTALLED"
  | "PAID";

export type OpenType = "fixed" | "casement" | "sliding" | "top-hung" | "bottom-hung";
export type OpenDirection = "left" | "right" | "top" | "bottom" | "slide-left" | "slide-right";
export type MullionDirection = "vertical" | "horizontal";

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  status: string;
  note?: string;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNo: string;
  customerId: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
};

export type Mullion = {
  id: string;
  direction: MullionDirection;
  x?: number;
  y?: number;
  fromX?: number;
  toX?: number;
  fromY?: number;
  toY?: number;
  profileCode: string;
};

export type Sash = {
  id: string;
  type: OpenType;
  openDirection?: OpenDirection;
  area: RectMm;
};

export type GlassPanel = {
  id: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  type: string;
  quantity: number;
};

export type RectMm = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DimensionRules = {
  frameFaceWidthMm: number;
  mullionFaceWidthMm: number;
  sashFaceWidthMm: number;
  frameDeductionMm: number;
  mullionDeductionMm: number;
  glassDeductionMm: number;
  glassInstallGapMm: number;
  sashDeductionMm: number;
};

export type DrawingModel = {
  version: 1;
  unit: "mm";
  outerFrame: {
    width: number;
    height: number;
    profileCode: string;
  };
  mullions: Mullion[];
  sashes: Sash[];
  glassPanels: GlassPanel[];
  openType: OpenType;
  dimensionRules: DimensionRules;
};

export type WindowUnit = {
  id: string;
  orderId: string;
  name: string;
  floor: string;
  position: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  openType: OpenType;
  drawingModel: DrawingModel;
  note?: string;
};

export type MaterialSettings = {
  stockLengthsMm: number[];
  glassSheetSpecs: Array<{ widthMm: number; heightMm: number }>;
  kerfMm: number;
  profilePricePerMeter: number;
  glassSheetWidthMm: number;
  glassSheetHeightMm: number;
  glassPricePerSqm: number;
  hardwarePricePerWindow: number;
  laborPricePerSqm: number;
  profitRate: number;
};

export type ProfileRequirement = {
  materialCode: string;
  label: string;
  lengthMm: number;
  quantity: number;
};

export type GlassRequirement = {
  glassType: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
};

export type MaterialTakeoff = {
  profiles: ProfileRequirement[];
  glass: GlassRequirement[];
  windowCount: number;
  windowAreaSqm: number;
};

export const defaultDimensionRules: DimensionRules = {
  frameFaceWidthMm: 70,
  mullionFaceWidthMm: 70,
  sashFaceWidthMm: 60,
  frameDeductionMm: 0,
  mullionDeductionMm: 90,
  glassDeductionMm: 24,
  glassInstallGapMm: 12,
  sashDeductionMm: 120
};

export const defaultMaterialSettings: MaterialSettings = {
  stockLengthsMm: [2400, 3000, 6000],
  glassSheetSpecs: [{ widthMm: 2440, heightMm: 1830 }],
  kerfMm: 3,
  profilePricePerMeter: 28,
  glassSheetWidthMm: 2440,
  glassSheetHeightMm: 1830,
  glassPricePerSqm: 95,
  hardwarePricePerWindow: 120,
  laborPricePerSqm: 80,
  profitRate: 18
};

export function createDrawingModel(input: {
  widthMm: number;
  heightMm: number;
  verticalMullions: number;
  horizontalMullions: number;
  verticalPositionsMm?: number[];
  horizontalPositionsMm?: number[];
  openType: OpenType;
  profileCode?: string;
  glassType?: string;
  dimensionRules?: DimensionRules;
}): DrawingModel {
  const rules = input.dimensionRules ?? defaultDimensionRules;
  const profileCode = input.profileCode ?? "ALU-70";
  const glassType = input.glassType ?? "5+12A+5";
  const mullions: Mullion[] = [];

  const verticalPositions = normalizePositions(input.verticalPositionsMm, input.verticalMullions, input.widthMm);
  const horizontalPositions = normalizePositions(input.horizontalPositionsMm, input.horizontalMullions, input.heightMm);

  for (let index = 1; index <= input.verticalMullions; index += 1) {
    const x = verticalPositions[index - 1] ?? Math.round((input.widthMm * index) / (input.verticalMullions + 1));
    mullions.push({
      id: `vm-${index}`,
      direction: "vertical",
      x,
      fromY: 0,
      toY: input.heightMm,
      profileCode: `${profileCode}-MULLION`
    });
  }

  for (let index = 1; index <= input.horizontalMullions; index += 1) {
    const y = horizontalPositions[index - 1] ?? Math.round((input.heightMm * index) / (input.horizontalMullions + 1));
    mullions.push({
      id: `hm-${index}`,
      direction: "horizontal",
      y,
      fromX: 0,
      toX: input.widthMm,
      profileCode: `${profileCode}-MULLION`
    });
  }

  const columns = input.verticalMullions + 1;
  const rows = input.horizontalMullions + 1;
  const columnWidths = segmentSizes(input.widthMm, verticalPositions);
  const rowHeights = segmentSizes(input.heightMm, horizontalPositions);
  const glassPanels: GlassPanel[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      glassPanels.push({
        id: `g-${row + 1}-${column + 1}`,
        x: [0, ...verticalPositions][column] ?? 0,
        y: [0, ...horizontalPositions][row] ?? 0,
        width: Math.max(100, Math.floor(columnWidths[column] ?? input.widthMm)),
        height: Math.max(100, Math.floor(rowHeights[row] ?? input.heightMm)),
        type: glassType,
        quantity: 1
      });
    }
  }

  return {
    version: 1,
    unit: "mm",
    outerFrame: {
      width: input.widthMm,
      height: input.heightMm,
      profileCode: `${profileCode}-FRAME`
    },
    mullions,
    sashes:
      input.openType === "fixed"
        ? []
        : [
            {
              id: "sash-1",
              type: input.openType,
              openDirection: input.openType === "top-hung" ? "top" : input.openType === "bottom-hung" ? "bottom" : input.openType === "sliding" ? "slide-right" : "right",
              area: { x: 0, y: 0, width: columnWidths[0] ?? Math.floor(input.widthMm / columns), height: input.heightMm }
            }
          ],
    glassPanels,
    openType: input.openType,
    dimensionRules: rules
  };
}

function normalizePositions(positions: number[] | undefined, count: number, total: number) {
  const minGap = 180;
  const usable = (positions ?? Array.from({ length: count }, (_, index) => Math.round((total * (index + 1)) / (count + 1))))
    .slice(0, count)
    .map((value) => Math.round(Math.min(total - minGap, Math.max(minGap, value))))
    .sort((a, b) => a - b);
  while (usable.length < count) usable.push(Math.round((total * (usable.length + 1)) / (count + 1)));
  return usable;
}

function segmentSizes(total: number, positions: number[]) {
  const points = [0, ...positions, total];
  return points.slice(1).map((point, index) => point - points[index]);
}

export function validateDrawingModel(model: DrawingModel): string[] {
  const errors: string[] = [];
  if (model.unit !== "mm") errors.push("图纸单位必须是 mm。");
  if (model.outerFrame.width < 300) errors.push("外框宽度不能小于 300mm。");
  if (model.outerFrame.height < 300) errors.push("外框高度不能小于 300mm。");
  for (const mullion of model.mullions) {
    if (mullion.direction === "vertical" && ((mullion.x ?? 0) <= 0 || (mullion.x ?? 0) >= model.outerFrame.width)) {
      errors.push(`竖中梃 ${mullion.id} 超出外框。`);
    }
    if (mullion.direction === "horizontal" && ((mullion.y ?? 0) <= 0 || (mullion.y ?? 0) >= model.outerFrame.height)) {
      errors.push(`横中梃 ${mullion.id} 超出外框。`);
    }
  }
  return errors;
}

export function calculateMaterialTakeoff(windows: WindowUnit[]): MaterialTakeoff {
  const profiles = new Map<string, ProfileRequirement>();
  const glass = new Map<string, GlassRequirement>();
  let windowCount = 0;
  let windowAreaSqm = 0;

  function addProfile(materialCode: string, label: string, lengthMm: number, quantity: number) {
    const key = `${materialCode}:${label}:${Math.round(lengthMm)}`;
    const current = profiles.get(key);
    if (current) current.quantity += quantity;
    else profiles.set(key, { materialCode, label, lengthMm: Math.round(lengthMm), quantity });
  }

  function addGlass(glassType: string, widthMm: number, heightMm: number, quantity: number) {
    const key = `${glassType}:${Math.round(widthMm)}:${Math.round(heightMm)}`;
    const current = glass.get(key);
    if (current) current.quantity += quantity;
    else glass.set(key, { glassType, widthMm: Math.round(widthMm), heightMm: Math.round(heightMm), quantity });
  }

  for (const item of windows) {
    const qty = item.quantity;
    const model = item.drawingModel;
    const rules = { ...defaultDimensionRules, ...(model.dimensionRules ?? {}) };
    windowCount += qty;
    windowAreaSqm += (item.widthMm * item.heightMm * qty) / 1_000_000;
    addProfile(model.outerFrame.profileCode, "外框横料", Math.max(100, item.widthMm - rules.frameDeductionMm), qty * 2);
    addProfile(model.outerFrame.profileCode, "外框竖料", Math.max(100, item.heightMm - rules.frameDeductionMm), qty * 2);

    for (const mullion of model.mullions) {
      const length =
        mullion.direction === "vertical"
          ? (mullion.toY ?? item.heightMm) - (mullion.fromY ?? 0) - rules.mullionDeductionMm
          : (mullion.toX ?? item.widthMm) - (mullion.fromX ?? 0) - rules.mullionDeductionMm;
      addProfile(mullion.profileCode, mullion.direction === "vertical" ? "竖中梃" : "横中梃", Math.max(100, length), qty);
    }

    for (const sash of model.sashes ?? []) {
      const sashClear = rectClearOpening(model, sash.area);
      addProfile(`${model.outerFrame.profileCode.replace("-FRAME", "")}-SASH`, "扇横料", Math.max(100, sashClear.width), qty * 2);
      addProfile(`${model.outerFrame.profileCode.replace("-FRAME", "")}-SASH`, "扇竖料", Math.max(100, sashClear.height - rules.sashDeductionMm), qty * 2);
    }

    for (const panel of model.glassPanels) {
      const sash = (model.sashes ?? []).find((item) => sameRect(item.area, panelRect(panel)));
      const clear = sash ? sashInnerGlassOpening(model, sash.area) : panelClearOpening(model, panel);
      const deduction = rules.glassDeductionMm || rules.glassInstallGapMm * 2;
      addGlass(panel.type, Math.max(100, clear.width - deduction), Math.max(100, clear.height - deduction), qty * panel.quantity);
    }
  }

  return {
    profiles: [...profiles.values()],
    glass: [...glass.values()],
    windowCount,
    windowAreaSqm
  };
}

function panelRect(panel: GlassPanel): RectMm {
  return { x: panel.x ?? 0, y: panel.y ?? 0, width: panel.width, height: panel.height };
}

function sameRect(a: RectMm, b: RectMm) {
  return Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;
}

function rectClearOpening(model: DrawingModel, area: RectMm) {
  const rules = { ...defaultDimensionRules, ...(model.dimensionRules ?? {}) };
  const left = area.x <= 1 ? rules.frameFaceWidthMm : rules.mullionFaceWidthMm / 2;
  const right = area.x + area.width >= model.outerFrame.width - 1 ? rules.frameFaceWidthMm : rules.mullionFaceWidthMm / 2;
  const top = area.y <= 1 ? rules.frameFaceWidthMm : rules.mullionFaceWidthMm / 2;
  const bottom = area.y + area.height >= model.outerFrame.height - 1 ? rules.frameFaceWidthMm : rules.mullionFaceWidthMm / 2;
  return {
    x: area.x + left,
    y: area.y + top,
    width: Math.max(100, area.width - left - right),
    height: Math.max(100, area.height - top - bottom)
  };
}

function panelClearOpening(model: DrawingModel, panel: GlassPanel) {
  return rectClearOpening(model, panelRect(panel));
}

function sashInnerGlassOpening(model: DrawingModel, area: RectMm) {
  const rules = { ...defaultDimensionRules, ...(model.dimensionRules ?? {}) };
  const sashOuter = rectClearOpening(model, area);
  const inset = rules.sashFaceWidthMm;
  return {
    x: sashOuter.x + inset,
    y: sashOuter.y + inset,
    width: Math.max(100, sashOuter.width - inset * 2),
    height: Math.max(100, sashOuter.height - inset * 2)
  };
}
