export type CustomerWithOrders = {
  id: string;
  name: string;
  phone: string;
  address: string;
  status: string;
  note?: string;
  createdAt: string;
  orders: OrderDetail[];
};

export type OrderDetail = {
  id: string;
  orderNo: string;
  customerId: string;
  status: string;
  totalAmount: number;
  customer?: CustomerWithOrders;
  windows: WindowUnitDto[];
  summary: OrderSummary;
};

export type WindowUnitDto = {
  id: string;
  orderId: string;
  name: string;
  floor: string;
  position: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  openType: "fixed" | "casement" | "sliding" | "top-hung" | "bottom-hung";
  drawingModel: {
    outerFrame?: { width: number; height: number; profileCode: string };
    mullions: Array<{ id: string; direction: "vertical" | "horizontal"; x?: number; y?: number; fromX?: number; toX?: number; fromY?: number; toY?: number; profileCode?: string }>;
    sashes?: Array<{ id: string; type: "fixed" | "casement" | "sliding" | "top-hung" | "bottom-hung"; openDirection?: "left" | "right" | "top" | "bottom" | "slide-left" | "slide-right"; area: { x: number; y: number; width: number; height: number } }>;
    glassPanels: Array<{ id: string; x?: number; y?: number; width: number; height: number; type: string; quantity: number }>;
    dimensionRules?: DimensionRulesDto;
    openType?: "fixed" | "casement" | "sliding" | "top-hung" | "bottom-hung";
  };
};

export type OrderSummary = {
  takeoff: {
    profiles: Array<{ materialCode: string; label: string; lengthMm: number; quantity: number }>;
    glass: Array<{ glassType: string; widthMm: number; heightMm: number; quantity: number }>;
    windowCount: number;
    windowAreaSqm: number;
  };
  profileCutting: Array<{
    materialCode: string;
    efficiency: number;
    optimization?: { status: "proven-optimal" | "best-effort"; method: string };
    purchaseSummary: Array<{ stockLengthMm: number; count: number }>;
    bars: Array<{ stockLengthMm: number; wasteMm: number; kerfTotalMm?: number; cuts: Array<{ lengthMm: number; label: string; materialCode?: string }> }>;
  }>;
  glassCutting: Array<{
    glassType: string;
    efficiency: number;
    optimization?: { status: "proven-optimal" | "best-effort"; method: string };
    purchaseSummary?: Array<{ sheetWidthMm: number; sheetHeightMm: number; count: number; areaSqm: number }>;
    sheets: Array<{
      sheetWidthMm: number;
      sheetHeightMm: number;
      wasteAreaSqm: number;
      rows: Array<{ heightMm: number; pieces: Array<{ widthMm: number; heightMm: number }> }>;
    }>;
  }>;
  quote: {
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
};

const headers = { "Content-Type": "application/json" };

function authHeaders() {
  const token = localStorage.getItem("windooros-token");
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "DELETE", headers: authHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export type MaterialSettingsDto = {
  stockLengthsMm: number[];
  glassSheetSpecs?: Array<{ widthMm: number; heightMm: number }>;
  kerfMm: number;
  profilePricePerMeter: number;
  glassSheetWidthMm: number;
  glassSheetHeightMm: number;
  glassPricePerSqm: number;
  hardwarePricePerWindow: number;
  laborPricePerSqm: number;
  profitRate: number;
};

export type DimensionRulesDto = {
  frameFaceWidthMm: number;
  mullionFaceWidthMm: number;
  sashFaceWidthMm: number;
  frameDeductionMm: number;
  mullionDeductionMm: number;
  glassDeductionMm: number;
  glassInstallGapMm: number;
  sashDeductionMm: number;
};

export type WindowTemplateDto = {
  id: string;
  name: string;
  category: string;
  widthMm: number;
  heightMm: number;
  openType: "fixed" | "casement" | "sliding" | "top-hung" | "bottom-hung";
  verticalMullions: number;
  horizontalMullions: number;
  drawingModel: WindowUnitDto["drawingModel"];
};

export type InventoryItemDto = {
  id: string;
  materialCode: string;
  materialType: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  quantity: number;
  source: string;
  note?: string;
};

export type ProductionTaskDto = {
  id: string;
  orderId: string;
  title: string;
  status: string;
  priority: number;
  dueDate?: string;
  note?: string;
  order?: { orderNo: string; customer?: { name: string } };
};
