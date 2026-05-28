import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Download, FileText, LogIn, Plus, RotateCcw, Ruler, Save, Scissors, Search, Trash2, Undo2 } from "lucide-react";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type CustomerWithOrders,
  type DimensionRulesDto,
  type InventoryItemDto,
  type MaterialSettingsDto,
  type OrderDetail,
  type OrderSummary,
  type ProductionTaskDto,
  type WindowTemplateDto,
  type WindowUnitDto
} from "./api";

type WindowForm = {
  name: string;
  floor: string;
  position: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  openType: "fixed" | "casement" | "sliding" | "top-hung";
  verticalMullions: number;
  horizontalMullions: number;
  verticalPositionsMm: number[];
  horizontalPositionsMm: number[];
  drawingModel?: WindowUnitDto["drawingModel"];
};

const defaultWindow: WindowForm = {
  name: "一楼前窗",
  floor: "一楼",
  position: "前",
  widthMm: 1800,
  heightMm: 1500,
  quantity: 1,
  openType: "sliding",
  verticalMullions: 1,
  horizontalMullions: 0,
  verticalPositionsMm: [900],
  horizontalPositionsMm: [],
  drawingModel: undefined
};

const defaultMaterials: MaterialSettingsDto = {
  stockLengthsMm: [2400, 3000, 6000],
  glassSheetSpecs: [{ widthMm: 2440, heightMm: 1830 }],
  kerfMm: 3,
  profilePricePerMeter: 28,
  glassSheetWidthMm: 2440,
  glassSheetHeightMm: 1830,
  glassPricePerSqm: 118,
  hardwarePricePerWindow: 85,
  laborPricePerSqm: 65,
  profitRate: 18
};

const defaultDimensionRules: DimensionRulesDto = {
  frameDeductionMm: 38,
  mullionDeductionMm: 18,
  glassDeductionMm: 12,
  sashDeductionMm: 26
};

export function App() {
  const [customers, setCustomers] = useState<CustomerWithOrders[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderDetail | null>(null);
  const [phone, setPhone] = useState("13800000000");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("windooros-token"));
  const [form, setForm] = useState(defaultWindow);
  const [customerForm, setCustomerForm] = useState({ name: "新客户", phone: "", address: "", note: "" });
  const [customerEdit, setCustomerEdit] = useState({ name: "", phone: "", address: "", status: "", note: "" });
  const [message, setMessage] = useState("未登录也可以体验；登录后进入云端保存流程。");
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [selectedGlassId, setSelectedGlassId] = useState<string | null>(null);
  const [selectedMullionId, setSelectedMullionId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [drawingHistory, setDrawingHistory] = useState<WindowUnitDto["drawingModel"][]>([]);
  const freeDragBaselineRef = useRef<WindowUnitDto["drawingModel"] | null>(null);
  const freeDragHistoryPushedRef = useRef(false);
  const [materials, setMaterials] = useState<MaterialSettingsDto>(defaultMaterials);
  const [dimensionRules, setDimensionRules] = useState<DimensionRulesDto>(defaultDimensionRules);
  const [templates, setTemplates] = useState<WindowTemplateDto[]>([]);
  const [inventory, setInventory] = useState<InventoryItemDto[]>([]);
  const [inventoryForm, setInventoryForm] = useState({
    materialCode: "ALU-70-SCRAP",
    materialType: "scrap",
    lengthMm: 1200,
    widthMm: 0,
    heightMm: 0,
    quantity: 1,
    source: "余料入库",
    note: ""
  });
  const [production, setProduction] = useState<ProductionTaskDto[]>([]);

  async function refresh() {
    const [customersResult, settingsResult, rulesResult, templateResult, inventoryResult, productionResult] = await Promise.allSettled([
      apiGet<CustomerWithOrders[]>("/api/customers"),
      apiGet<MaterialSettingsDto>("/api/materials/settings"),
      apiGet<DimensionRulesDto>("/api/materials/dimension-rules"),
      apiGet<WindowTemplateDto[]>("/api/templates/windows"),
      apiGet<InventoryItemDto[]>("/api/inventory"),
      apiGet<ProductionTaskDto[]>("/api/production")
    ]);
    if (settingsResult.status === "fulfilled") setMaterials(settingsResult.value);
    if (rulesResult.status === "fulfilled") setDimensionRules(rulesResult.value);
    if (templateResult.status === "fulfilled") setTemplates(templateResult.value);
    if (inventoryResult.status === "fulfilled") setInventory(inventoryResult.value);
    if (productionResult.status === "fulfilled") setProduction(productionResult.value);
    if (customersResult.status === "fulfilled") {
      const data = customersResult.value;
      setCustomers(data);
      const firstOrder = data[0]?.orders[0];
      if (firstOrder) {
        const order = await apiGet<OrderDetail>(`/api/orders/${firstOrder.id}`);
        setActiveOrder(order);
        setActiveWindowId(order.windows[0]?.id ?? null);
        if (order.windows[0]) setForm(windowToForm(order.windows[0]));
      }
    } else {
      setMessage("后端暂未连接，当前先使用本地默认材料规格；启动后端后会自动读取保存的真实配置。");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!activeOrder?.customer) return;
    setCustomerEdit({
      name: activeOrder.customer.name,
      phone: activeOrder.customer.phone,
      address: activeOrder.customer.address,
      status: activeOrder.customer.status,
      note: activeOrder.customer.note ?? ""
    });
  }, [activeOrder?.customer?.id]);

  const activeWindow = activeOrder?.windows.find((item) => item.id === activeWindowId) ?? activeOrder?.windows[0];
  const groupedCustomers = useMemo(() => customers.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [customers]);
  const freeModel = form.drawingModel;
  const selectedGlass = freeModel?.glassPanels.find((panel) => panel.id === selectedGlassId);
  const selectedMullion = freeModel?.mullions.find((mullion) => mullion.id === selectedMullionId);
  const stockLengths = getStockLengths(materials);
  const glassSheetSpecs = getGlassSheetSpecs(materials);

  async function login() {
    const result = await apiPost<{ token: string }>("/api/auth/login", { phone, code: "000000" });
    localStorage.setItem("windooros-token", result.token);
    setToken(result.token);
    setMessage("已登录演示账号，后续可接真实短信验证码。");
  }

  async function createCustomer() {
    const customer = await apiPost<CustomerWithOrders>("/api/customers", customerForm);
    const order = await apiPost<OrderDetail>("/api/orders", { customerId: customer.id });
    await refresh();
    setActiveOrder(await apiGet<OrderDetail>(`/api/orders/${order.id}`));
    setMessage("客户和订单已创建。");
  }

  async function updateOrderStatus(status: string) {
    if (!activeOrder) return;
    const order = await apiPatch<OrderDetail>(`/api/orders/${activeOrder.id}`, { status });
    setActiveOrder(order);
    await refreshCustomersOnly();
    setMessage(`订单状态已更新为：${status}`);
  }

  async function saveCustomerDetail() {
    if (!activeOrder?.customer) return;
    await apiPatch(`/api/customers/${activeOrder.customer.id}`, customerEdit);
    await refreshCustomersOnly();
    setActiveOrder(await apiGet<OrderDetail>(`/api/orders/${activeOrder.id}`));
    setMessage("客户资料已保存。");
  }

  async function refreshCustomersOnly() {
    setCustomers(await apiGet<CustomerWithOrders[]>("/api/customers"));
  }

  async function addWindow() {
    if (!activeOrder) return;
    const created = await apiPost<WindowUnitDto>(`/api/orders/${activeOrder.id}/windows`, form);
    const order = await apiGet<OrderDetail>(`/api/orders/${activeOrder.id}`);
    setActiveOrder(order);
    setActiveWindowId(created.id);
    setMessage("窗户已保存，算料、切割和报价已刷新。");
  }

  async function updateWindow() {
    if (!activeOrder || !activeWindow) return;
    await apiPatch<WindowUnitDto>(`/api/orders/windows/${activeWindow.id}`, form);
    const order = await apiGet<OrderDetail>(`/api/orders/${activeOrder.id}`);
    setActiveOrder(order);
    setMessage("窗户已更新，所有方案已重新计算。");
  }

  async function deleteWindow() {
    if (!activeOrder || !activeWindow) return;
    await apiDelete(`/api/orders/windows/${activeWindow.id}`);
    const order = await apiGet<OrderDetail>(`/api/orders/${activeOrder.id}`);
    setActiveOrder(order);
    setActiveWindowId(order.windows[0]?.id ?? null);
    setMessage("窗户已删除，订单已重新计算。");
  }

  async function saveMaterials() {
    if (!materials) return;
    const nextStockLengths = normalizeStockLengths(stockLengths);
    const nextMaterials = {
      stockLengthsMm: nextStockLengths,
      glassSheetSpecs,
      kerfMm: materials.kerfMm,
      profilePricePerMeter: Math.round(materials.profilePricePerMeter),
      glassSheetWidthMm: glassSheetSpecs[0]?.widthMm ?? materials.glassSheetWidthMm,
      glassSheetHeightMm: glassSheetSpecs[0]?.heightMm ?? materials.glassSheetHeightMm,
      glassPricePerSqm: Math.round(materials.glassPricePerSqm),
      hardwarePricePerWindow: Math.round(materials.hardwarePricePerWindow),
      laborPricePerSqm: Math.round(materials.laborPricePerSqm),
      profitRate: Math.round(materials.profitRate)
    };
    setMaterials(nextMaterials);
    try {
      await apiPut("/api/materials/settings", nextMaterials);
      if (activeOrder) setActiveOrder(await apiGet<OrderDetail>(`/api/orders/${activeOrder.id}`));
      setMessage("材料价格、原料规格和锯缝已保存。");
    } catch {
      setMessage("本地页面已更新材料规格；后端未连接或未登录，暂时无法持久保存。");
    }
  }

  function updateStockLength(index: number, value: number) {
    if (!materials) return;
    const next = [...stockLengths];
    next[index] = Math.round(value || 0);
    setMaterials({ ...materials, stockLengthsMm: next });
  }

  function addStockLength() {
    if (!materials) return;
    const largest = Math.max(...stockLengths, 0);
    setMaterials({ ...materials, stockLengthsMm: [...stockLengths, largest >= 6000 ? largest : 6000] });
  }

  function removeStockLength(index: number) {
    if (!materials || stockLengths.length <= 1) return;
    setMaterials({ ...materials, stockLengthsMm: stockLengths.filter((_, itemIndex) => itemIndex !== index) });
  }

  function updateGlassSheetSpec(index: number, field: "widthMm" | "heightMm", value: number) {
    if (!materials) return;
    const next = [...glassSheetSpecs];
    next[index] = { ...next[index], [field]: Math.round(value || 0) };
    setMaterials({ ...materials, glassSheetSpecs: next, glassSheetWidthMm: next[0]?.widthMm ?? materials.glassSheetWidthMm, glassSheetHeightMm: next[0]?.heightMm ?? materials.glassSheetHeightMm });
  }

  function addGlassSheetSpec() {
    if (!materials) return;
    setMaterials({ ...materials, glassSheetSpecs: [...glassSheetSpecs, { widthMm: 2440, heightMm: 1830 }] });
  }

  function removeGlassSheetSpec(index: number) {
    if (!materials || glassSheetSpecs.length <= 1) return;
    const next = glassSheetSpecs.filter((_, itemIndex) => itemIndex !== index);
    setMaterials({ ...materials, glassSheetSpecs: next, glassSheetWidthMm: next[0]?.widthMm ?? materials.glassSheetWidthMm, glassSheetHeightMm: next[0]?.heightMm ?? materials.glassSheetHeightMm });
  }

  async function saveDimensionRules() {
    if (!dimensionRules) return;
    await apiPut("/api/materials/dimension-rules", {
      frameDeductionMm: Math.round(dimensionRules.frameDeductionMm),
      mullionDeductionMm: Math.round(dimensionRules.mullionDeductionMm),
      glassDeductionMm: Math.round(dimensionRules.glassDeductionMm),
      sashDeductionMm: Math.round(dimensionRules.sashDeductionMm)
    });
    if (activeOrder) setActiveOrder(await apiGet<OrderDetail>(`/api/orders/${activeOrder.id}`));
    setMessage("行业扣尺规则已保存，并已重算图纸、算料、切割和报价。");
  }

  async function saveInventoryItem() {
    await apiPost("/api/inventory", {
      materialCode: inventoryForm.materialCode,
      materialType: inventoryForm.materialType,
      lengthMm: inventoryForm.lengthMm || undefined,
      widthMm: inventoryForm.widthMm || undefined,
      heightMm: inventoryForm.heightMm || undefined,
      quantity: inventoryForm.quantity,
      source: inventoryForm.source,
      note: inventoryForm.note
    });
    setInventory(await apiGet<InventoryItemDto[]>("/api/inventory"));
    setMessage("库存/余料已入库，可用于后续采购和切割决策。");
  }

  async function exportQuote() {
    if (!activeOrder) return;
    const task = await apiPost<{ id: string; status: string; resultUrl: string }>("/api/exports/quote/pdf", { orderId: activeOrder.id });
    window.open(task.resultUrl, "_blank");
    setMessage(`报价导出完成：${task.resultUrl}`);
  }

  async function exportExcel() {
    if (!activeOrder) return;
    const task = await apiPost<{ id: string; status: string; resultUrl: string }>("/api/exports/quote/excel", { orderId: activeOrder.id });
    window.open(task.resultUrl, "_blank");
    setMessage(`Excel 下料报价表已导出：${task.resultUrl}`);
  }

  async function createProductionTask() {
    if (!activeOrder) return;
    await apiPost("/api/production", {
      orderId: activeOrder.id,
      title: `${activeOrder.customer?.name ?? "客户"}门窗生产`,
      status: "待备料",
      priority: 1,
      note: "从报价单生成"
    });
    setProduction(await apiGet<ProductionTaskDto[]>("/api/production"));
    setMessage("生产任务已加入排单。");
  }

  async function updateProductionStatus(task: ProductionTaskDto, status: string) {
    await apiPatch(`/api/production/${task.id}`, { status });
    setProduction(await apiGet<ProductionTaskDto[]>("/api/production"));
  }

  function applyTemplate(template: WindowTemplateDto) {
    const drawingModel = normalizeDrawingModelGeometry(template.drawingModel, template.widthMm, template.heightMm, template.openType);
    setForm({
      name: template.name,
      floor: form.floor,
      position: form.position,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      quantity: form.quantity,
      openType: template.openType,
      verticalMullions: template.verticalMullions,
      horizontalMullions: template.horizontalMullions,
      verticalPositionsMm: drawingModel.mullions.filter((m) => m.direction === "vertical").map((m) => m.x ?? 0),
      horizontalPositionsMm: drawingModel.mullions.filter((m) => m.direction === "horizontal").map((m) => m.y ?? 0),
      drawingModel
    });
    setSelectedGlassId(null);
    setSelectedMullionId(null);
    setDrawingHistory([]);
  }

  function selectWindow(item: WindowUnitDto) {
    const drawingModel = normalizeDrawingModelGeometry(item.drawingModel, item.widthMm, item.heightMm, item.openType);
    setActiveWindowId(item.id);
    setForm({
      name: item.name,
      floor: item.floor,
      position: item.position,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      quantity: item.quantity,
      openType: item.openType,
      verticalMullions: drawingModel.mullions.filter((mullion) => mullion.direction === "vertical").length,
      horizontalMullions: drawingModel.mullions.filter((mullion) => mullion.direction === "horizontal").length,
      verticalPositionsMm: drawingModel.mullions.filter((mullion) => mullion.direction === "vertical").map((mullion) => mullion.x ?? 0),
      horizontalPositionsMm: drawingModel.mullions.filter((mullion) => mullion.direction === "horizontal").map((mullion) => mullion.y ?? 0),
      drawingModel
    });
    setSelectedGlassId(null);
    setSelectedMullionId(null);
    setDrawingHistory([]);
  }

  function setMullionCount(direction: "vertical" | "horizontal", count: number) {
    const safeCount = Math.max(0, Math.min(6, count));
    if (direction === "vertical") {
      setForm({ ...form, drawingModel: undefined, verticalMullions: safeCount, verticalPositionsMm: evenPositions(form.widthMm, safeCount) });
    } else {
      setForm({ ...form, drawingModel: undefined, horizontalMullions: safeCount, horizontalPositionsMm: evenPositions(form.heightMm, safeCount) });
    }
  }

  function moveMullion(direction: "vertical" | "horizontal", index: number, positionMm: number) {
    const total = direction === "vertical" ? form.widthMm : form.heightMm;
    const key = direction === "vertical" ? "verticalPositionsMm" : "horizontalPositionsMm";
    const next = [...form[key]];
    next[index] = Math.round(Math.min(total - 180, Math.max(180, positionMm)));
    next.sort((a, b) => a - b);
    setForm({ ...form, drawingModel: undefined, [key]: next });
  }

  function ensureFreeModel() {
    return cloneDrawingModel(form.drawingModel ?? buildFreeModelFromForm(form));
  }

  function commitDrawingModel(model: WindowUnitDto["drawingModel"], nextMessage: string) {
    if (form.drawingModel) setDrawingHistory((items) => [...items.slice(-9), cloneDrawingModel(form.drawingModel!)]);
    setForm({ ...form, drawingModel: model });
    setMessage(nextMessage);
  }

  function undoDrawingEdit() {
    const previous = drawingHistory[drawingHistory.length - 1];
    if (!previous) {
      setMessage("暂无可撤销的分格操作。");
      return;
    }
    setDrawingHistory((items) => items.slice(0, -1));
    setForm({ ...form, drawingModel: previous });
    setSelectedGlassId(null);
    setSelectedMullionId(null);
    setMessage("已撤销上一步分格操作。");
  }

  function resetFreeEditor() {
    setDrawingHistory((items) => [...items.slice(-9), cloneDrawingModel(ensureFreeModel())]);
    setForm({ ...form, drawingModel: buildFreeModelFromForm(form) });
    setSelectedGlassId(null);
    setSelectedMullionId(null);
    setMessage("已按当前宽高和中梃数量重置分格。");
  }

  function splitSelectedGlass(direction: "vertical" | "horizontal") {
    const model = ensureFreeModel();
    const target = model.glassPanels.find((panel) => panel.id === selectedGlassId);
    if (!target) {
      setMessage("请先点选一个玻璃区域，再执行切分。");
      return;
    }
    const x = target.x ?? 0;
    const y = target.y ?? 0;
    if (direction === "vertical" && target.width < 360) {
      setMessage("当前玻璃太窄，不能继续竖切。");
      return;
    }
    if (direction === "horizontal" && target.height < 360) {
      setMessage("当前玻璃太矮，不能继续横切。");
      return;
    }
    const firstSize = Math.round(((direction === "vertical" ? target.width : target.height) * splitPercent) / 100);
    const secondSize = (direction === "vertical" ? target.width : target.height) - firstSize;
    const nextPanels = model.glassPanels.filter((panel) => panel.id !== target.id);
    const cutId = `m-${Date.now()}`;
    const panelId = `g-${Date.now()}`;
    if (direction === "vertical") {
      const cutX = x + firstSize;
      nextPanels.push(
        { ...target, id: `${panelId}-l`, x, y, width: firstSize, height: target.height },
        { ...target, id: `${panelId}-r`, x: cutX, y, width: secondSize, height: target.height }
      );
      model.mullions.push({ id: cutId, direction: "vertical", x: cutX, fromY: y, toY: y + target.height, profileCode: "ALU-70-MULLION" });
    } else {
      const cutY = y + firstSize;
      nextPanels.push(
        { ...target, id: `${panelId}-t`, x, y, width: target.width, height: firstSize },
        { ...target, id: `${panelId}-b`, x, y: cutY, width: target.width, height: secondSize }
      );
      model.mullions.push({ id: cutId, direction: "horizontal", y: cutY, fromX: x, toX: x + target.width, profileCode: "ALU-70-MULLION" });
    }
    commitDrawingModel({ ...model, glassPanels: sortPanels(nextPanels) }, direction === "vertical" ? "已竖切选中玻璃区域。" : "已横切选中玻璃区域。");
    setSelectedGlassId(null);
    setSelectedMullionId(cutId);
  }

  function deleteSelectedMullion() {
    const model = ensureFreeModel();
    const mullion = model.mullions.find((item) => item.id === selectedMullionId);
    if (!mullion) {
      setMessage("请先点选一根中梃。");
      return;
    }
    const nextPanels = mergePanelsAcrossMullion(model.glassPanels, mullion);
    if (nextPanels.length === model.glassPanels.length && nextPanels.every((panel) => model.glassPanels.some((current) => current.id === panel.id))) {
      setMessage("这根中梃两侧玻璃没有对齐，暂不能直接删除。");
      return;
    }
    commitDrawingModel({ ...model, mullions: model.mullions.filter((item) => item.id !== mullion.id), glassPanels: sortPanels(nextPanels) }, "已删除中梃，并尝试合并相邻玻璃区域。");
    setSelectedMullionId(null);
    setSelectedGlassId(null);
  }

  function beginFreeMullionDrag() {
    freeDragBaselineRef.current = cloneDrawingModel(ensureFreeModel());
    freeDragHistoryPushedRef.current = false;
  }

  function finishFreeMullionDrag() {
    freeDragBaselineRef.current = null;
    freeDragHistoryPushedRef.current = false;
  }

  function moveFreeMullion(id: string, positionMm: number) {
    const model = ensureFreeModel();
    const mullion = model.mullions.find((item) => item.id === id);
    if (!mullion) return;
    const minPanel = 180;
    const updatedPanels = movePanelsWithMullion(model.glassPanels, mullion, positionMm, form.widthMm, form.heightMm, minPanel);
    if (!updatedPanels) {
      setMessage("移动后相邻玻璃尺寸太小，已限制。");
      return;
    }
    if (freeDragBaselineRef.current && !freeDragHistoryPushedRef.current) {
      setDrawingHistory((items) => [...items.slice(-9), cloneDrawingModel(freeDragBaselineRef.current!)]);
      freeDragHistoryPushedRef.current = true;
    }
    const nextMullions = model.mullions.map((item) =>
      item.id === id
        ? item.direction === "vertical"
          ? { ...item, x: positionMm }
          : { ...item, y: positionMm }
        : item
    );
    setForm({ ...form, drawingModel: { ...model, mullions: nextMullions, glassPanels: sortPanels(updatedPanels) } });
    setSelectedMullionId(id);
    setSelectedGlassId(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <div>
            <strong>WindoorOS</strong>
            <small>门窗量尺 · 算料 · 报价</small>
          </div>
        </div>
        <label className="search">
          <Search size={16} />
          <input placeholder="搜索客户、电话、地址" />
        </label>
        <div className="login">
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          <button className="ghost">{token ? "已登录" : "未登录体验"}</button>
          <button onClick={login}>
            <LogIn size={16} />
            登录
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>门窗量尺、算料、报价，一次做完</h1>
          <p>手机现场记录尺寸，电脑回店生成型材切割、玻璃排版和客户报价单。</p>
        </div>
        <div className="hero-actions">
          <button onClick={addWindow}>
            <Ruler size={17} />
            开始画窗
          </button>
          <button className="ghost" onClick={exportQuote}>
            <Download size={17} />
            导出PDF
          </button>
          <button className="ghost" onClick={exportExcel}>
            <Download size={17} />
            导出Excel
          </button>
        </div>
      </section>

      <main className="workspace">
        <aside className="panel queue">
          <div className="panel-title">
            <h2>客户队列</h2>
            <span>{customers.length} 位</span>
          </div>
          <div className="quick-form">
            <input placeholder="客户姓名" value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} />
            <input placeholder="电话" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
            <input placeholder="地址" value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} />
            <button onClick={createCustomer}>
              <Plus size={16} />
              新建客户
            </button>
          </div>
          <div className="customer-list">
            {groupedCustomers.map((customer) => (
              <button key={customer.id} className="customer-item" onClick={() => customer.orders[0] && apiGet<OrderDetail>(`/api/orders/${customer.orders[0].id}`).then((order) => { setActiveOrder(order); setActiveWindowId(order.windows[0]?.id ?? null); if (order.windows[0]) setForm(windowToForm(order.windows[0])); })}>
                <strong>{customer.name}</strong>
                <span>{customer.address || "未填写地址"}</span>
                <small>{customer.orders.length} 个订单 · {customer.status}</small>
              </button>
            ))}
          </div>
          {activeOrder?.customer && (
            <div className="customer-detail-form">
              <div className="panel-title compact"><h2>客户详情</h2><span>可编辑</span></div>
              <Field label="姓名" value={customerEdit.name} onChange={(value) => setCustomerEdit({ ...customerEdit, name: value })} />
              <Field label="电话" value={customerEdit.phone} onChange={(value) => setCustomerEdit({ ...customerEdit, phone: value })} />
              <Field label="地址" value={customerEdit.address} onChange={(value) => setCustomerEdit({ ...customerEdit, address: value })} />
              <div className="grid2">
                <Field label="状态" value={customerEdit.status} onChange={(value) => setCustomerEdit({ ...customerEdit, status: value })} />
                <Field label="备注" value={customerEdit.note} onChange={(value) => setCustomerEdit({ ...customerEdit, note: value })} />
              </div>
              <button className="ghost full" onClick={saveCustomerDetail}>保存客户资料</button>
            </div>
          )}
        </aside>

        <section className="panel canvas-panel">
          <div className="panel-title">
            <h2>{activeOrder?.customer?.name ?? "演示订单"} · 门窗画布</h2>
            <span>{activeOrder?.orderNo ?? "-"}</span>
          </div>
          {activeOrder && (
            <div className="detail-strip">
              <div>
                <small>客户</small>
                <strong>{activeOrder.customer?.name}</strong>
                <span>{activeOrder.customer?.phone || "未填电话"} · {activeOrder.customer?.address || "未填地址"}</span>
              </div>
              <label>
                订单状态
                <select value={activeOrder.status} onChange={(event) => updateOrderStatus(event.target.value)}>
                  <option value="DRAFT">草稿</option>
                  <option value="MEASURED">已量尺</option>
                  <option value="QUOTED">已报价</option>
                  <option value="WON">已成交</option>
                  <option value="MATERIAL_READY">已备料</option>
                  <option value="PRODUCING">生产中</option>
                  <option value="READY_TO_INSTALL">待安装</option>
                  <option value="INSTALLED">已安装</option>
                  <option value="PAID">已收款</option>
                  <option value="LOST">丢单</option>
                </select>
              </label>
              <div>
                <small>订单合计</small>
                <strong>￥{activeOrder.summary.quote.finalTotal.toFixed(0)}</strong>
                <span>{activeOrder.windows.length} 个窗型 · {activeOrder.summary.quote.windowCount} 樘</span>
              </div>
            </div>
          )}
          <div className="template-bar">
            {templates.map((template) => (
              <button key={template.id} className="ghost" onClick={() => applyTemplate(template)}>{template.name}</button>
            ))}
          </div>
          <div className="free-editor-bar">
            <div className="free-editor-actions">
              <button className="ghost" onClick={() => splitSelectedGlass("vertical")}>竖切</button>
              <button className="ghost" onClick={() => splitSelectedGlass("horizontal")}>横切</button>
              <button className="danger" onClick={deleteSelectedMullion}>删中梃</button>
              <button className="ghost icon-button" title="撤销" onClick={undoDrawingEdit}><Undo2 size={16} /></button>
              <button className="ghost icon-button" title="重置分格" onClick={resetFreeEditor}><RotateCcw size={16} /></button>
            </div>
            <label className="split-control">
              切分比例
              <input type="range" min="25" max="75" step="5" value={splitPercent} onChange={(event) => setSplitPercent(Number(event.target.value))} />
              <strong>{splitPercent}%</strong>
            </label>
            <div className="selection-card">
              {selectedGlass ? (
                <>
                  <strong>玻璃区域</strong>
                  <span>{Math.round(selectedGlass.width)} x {Math.round(selectedGlass.height)}mm</span>
                </>
              ) : selectedMullion ? (
                <>
                  <strong>{selectedMullion.direction === "vertical" ? "竖中梃" : "横中梃"}</strong>
                  <span>
                    {selectedMullion.direction === "vertical"
                      ? `${Math.round((selectedMullion.toY ?? form.heightMm) - (selectedMullion.fromY ?? 0))}mm`
                      : `${Math.round((selectedMullion.toX ?? form.widthMm) - (selectedMullion.fromX ?? 0))}mm`}
                  </span>
                </>
              ) : (
                <>
                  <strong>自由分格</strong>
                  <span>先点玻璃或中梃</span>
                </>
              )}
            </div>
          </div>
          <WindowCanvas
            windowUnit={activeWindow}
            draft={form}
            selectedGlassId={selectedGlassId}
            selectedMullionId={selectedMullionId}
            onSelectGlass={(id) => {
              setSelectedGlassId(id);
              setSelectedMullionId(null);
            }}
            onSelectMullion={(id) => {
              setSelectedMullionId(id);
              setSelectedGlassId(null);
            }}
            onMoveMullion={moveMullion}
            onBeginFreeMullionDrag={beginFreeMullionDrag}
            onMoveFreeMullion={moveFreeMullion}
            onFinishFreeMullionDrag={finishFreeMullionDrag}
          />
          <div className="window-list">
            {activeOrder?.windows.map((item) => (
              <article key={item.id} className={item.id === activeWindow?.id ? "active-window" : ""} onClick={() => selectWindow(item)}>
                <strong>{item.floor} {item.name}</strong>
                <span>{item.widthMm} x {item.heightMm}mm · {item.quantity} 樘</span>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel editor">
          <div className="panel-title">
            <h2>窗户参数</h2>
            <span>mm</span>
          </div>
          <Field label="位置" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <div className="grid2">
            <Field label="楼层" value={form.floor} onChange={(value) => setForm({ ...form, floor: value })} />
            <Field label="朝向" value={form.position} onChange={(value) => setForm({ ...form, position: value })} />
            <NumberField label="宽" value={form.widthMm} onChange={(value) => setForm({ ...form, drawingModel: undefined, widthMm: value, verticalPositionsMm: evenPositions(value, form.verticalMullions) })} />
            <NumberField label="高" value={form.heightMm} onChange={(value) => setForm({ ...form, drawingModel: undefined, heightMm: value, horizontalPositionsMm: evenPositions(value, form.horizontalMullions) })} />
            <NumberField label="数量" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
            <NumberField label="竖中梃" value={form.verticalMullions} onChange={(value) => setMullionCount("vertical", value)} />
            <NumberField label="横中梃" value={form.horizontalMullions} onChange={(value) => setMullionCount("horizontal", value)} />
            <label>
              开启
              <select value={form.openType} onChange={(event) => setForm({ ...form, drawingModel: undefined, openType: event.target.value as WindowForm["openType"] })}>
                <option value="fixed">固定</option>
                <option value="casement">平开</option>
                <option value="sliding">推拉</option>
                <option value="top-hung">上悬</option>
              </select>
            </label>
          </div>
          <button className="full" onClick={addWindow}>
            <Save size={16} />
            新增窗户并算料
          </button>
          <div className="editor-actions">
            <button className="ghost" onClick={updateWindow}><Save size={16} />更新</button>
            <button className="danger" onClick={deleteWindow}><Trash2 size={16} />删除</button>
          </div>
          <button className="ghost full" onClick={createProductionTask}>加入生产排单</button>
          {materials && (
            <div className="materials-box">
              <div className="panel-title compact"><h2>材料设置</h2><span>真实影响报价</span></div>
              <p className="hint-text">厂家型材原料长度，切割方案会按这些固定规格反推采购根数。</p>
              <div className="stock-length-list">
                {stockLengths.map((length, index) => (
                  <div key={index} className="stock-length-row">
                    <NumberField label={`型材规格${index + 1}`} value={length} onChange={(value) => updateStockLength(index, value)} />
                    <button className="ghost icon-button" title="删除规格" onClick={() => removeStockLength(index)} disabled={stockLengths.length <= 1}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button className="ghost full" onClick={addStockLength}><Plus size={15} />增加型材规格</button>
              </div>
              <div className="grid2">
                <NumberField label="锯缝" value={materials.kerfMm} onChange={(value) => setMaterials({ ...materials, kerfMm: value })} />
                <NumberField label="型材元/米" value={materials.profilePricePerMeter} onChange={(value) => setMaterials({ ...materials, profilePricePerMeter: value })} />
                <NumberField label="玻璃元/㎡" value={materials.glassPricePerSqm} onChange={(value) => setMaterials({ ...materials, glassPricePerSqm: value })} />
                <NumberField label="利润率%" value={materials.profitRate} onChange={(value) => setMaterials({ ...materials, profitRate: value })} />
              </div>
              <p className="hint-text">玻璃厂家原片规格，排版会优先选择能放下且余料更少的规格。</p>
              <div className="glass-sheet-spec-list">
                {glassSheetSpecs.map((spec, index) => (
                  <div key={index} className="glass-sheet-spec-row">
                    <NumberField label={`原片${index + 1}宽`} value={spec.widthMm} onChange={(value) => updateGlassSheetSpec(index, "widthMm", value)} />
                    <NumberField label={`原片${index + 1}高`} value={spec.heightMm} onChange={(value) => updateGlassSheetSpec(index, "heightMm", value)} />
                    <button className="ghost icon-button" title="删除玻璃规格" onClick={() => removeGlassSheetSpec(index)} disabled={glassSheetSpecs.length <= 1}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button className="ghost full" onClick={addGlassSheetSpec}><Plus size={15} />增加玻璃原片规格</button>
              </div>
              <button className="ghost full" onClick={saveMaterials}>保存材料设置</button>
            </div>
          )}
          {dimensionRules && (
            <div className="materials-box">
              <div className="panel-title compact"><h2>下料扣减</h2><span>影响实际切割尺寸</span></div>
              <p className="hint-text">扣尺就是量到的净尺寸不能直接下料，要扣掉框料搭接、胶缝、安装间隙等预留量。</p>
              <div className="grid2">
                <NumberField label="框料扣减" value={dimensionRules.frameDeductionMm} onChange={(value) => setDimensionRules({ ...dimensionRules, frameDeductionMm: value })} />
                <NumberField label="中梃扣减" value={dimensionRules.mullionDeductionMm} onChange={(value) => setDimensionRules({ ...dimensionRules, mullionDeductionMm: value })} />
                <NumberField label="玻璃扣减" value={dimensionRules.glassDeductionMm} onChange={(value) => setDimensionRules({ ...dimensionRules, glassDeductionMm: value })} />
                <NumberField label="扇料扣减" value={dimensionRules.sashDeductionMm} onChange={(value) => setDimensionRules({ ...dimensionRules, sashDeductionMm: value })} />
              </div>
              <button className="ghost full" onClick={saveDimensionRules}>保存下料扣减</button>
            </div>
          )}
          <p className="message">{message}</p>
        </aside>
      </main>

      <section className="reports">
        <ReportCard icon={<Scissors size={18} />} title="型材切割方案" className="profile-report">
          {activeOrder?.summary.profileCutting.map((group) => (
            <div key={group.materialCode} className="report-block">
              <strong>{group.materialCode} · 利用率 {group.efficiency.toFixed(1)}%</strong>
              <p>{group.purchaseSummary.map((item) => `${item.stockLengthMm}mm ${item.count} 根`).join("，")}</p>
              <ProfileCutVisualizer bars={group.bars} kerfMm={materials?.kerfMm ?? 3} />
              {group.bars.map((bar, index) => (
                <small key={index}>第 {index + 1} 根 {bar.stockLengthMm}mm：{bar.cuts.map((cut) => `${cut.label}${cut.lengthMm}`).join(" + ")}，余 {Math.round(bar.wasteMm)}mm</small>
              ))}
            </div>
          ))}
        </ReportCard>
        <ReportCard icon={<Ruler size={18} />} title="玻璃一刀到底排版">
          {activeOrder?.summary.glassCutting.map((group) => (
            <div key={group.glassType} className="report-block">
              <strong>{group.glassType} · {group.sheets.length} 张 · 利用率 {group.efficiency.toFixed(1)}%</strong>
              {group.sheets.slice(0, 4).map((sheet, index) => (
                <div key={index} className="glass-sheet">
                  <small>第 {index + 1} 张：原片 {sheet.sheetWidthMm}x{sheet.sheetHeightMm}mm · 余面积 {sheet.wasteAreaSqm.toFixed(2)}㎡</small>
                  <div className="glass-layout">
                    {sheet.rows.map((row, rowIndex) => (
                      <div key={rowIndex} className="glass-row" style={{ height: `${Math.max(22, row.heightMm / 20)}px` }}>
                        {row.pieces.map((piece, pieceIndex) => (
                          <span key={pieceIndex} style={{ flex: `${piece.widthMm}` }}>{piece.widthMm}x{piece.heightMm}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </ReportCard>
        <ReportCard icon={<FileText size={18} />} title="客户报价单">
          {activeOrder && (
            <div className="quote">
              <p>型材：{activeOrder.summary.quote.profileMeters.toFixed(2)} 米 · ￥{activeOrder.summary.quote.profileCost.toFixed(0)}</p>
              <p>玻璃：{activeOrder.summary.quote.glassAreaSqm.toFixed(2)} ㎡ · ￥{activeOrder.summary.quote.glassCost.toFixed(0)}</p>
              <p>五金人工：￥{(activeOrder.summary.quote.hardwareCost + activeOrder.summary.quote.laborCost).toFixed(0)}</p>
              <strong>合计：￥{activeOrder.summary.quote.finalTotal.toFixed(0)}</strong>
            </div>
          )}
        </ReportCard>
        <ReportCard icon={<Scissors size={18} />} title="库存/余料">
          <div className="inventory-form">
            <Field label="编码" value={inventoryForm.materialCode} onChange={(value) => setInventoryForm({ ...inventoryForm, materialCode: value })} />
            <label>
              类型
              <select value={inventoryForm.materialType} onChange={(event) => setInventoryForm({ ...inventoryForm, materialType: event.target.value })}>
                <option value="profile">型材</option>
                <option value="glass">玻璃</option>
                <option value="hardware">五金</option>
                <option value="scrap">余料</option>
              </select>
            </label>
            <div className="grid3">
              <NumberField label="长度" value={inventoryForm.lengthMm} onChange={(value) => setInventoryForm({ ...inventoryForm, lengthMm: value })} />
              <NumberField label="宽" value={inventoryForm.widthMm} onChange={(value) => setInventoryForm({ ...inventoryForm, widthMm: value })} />
              <NumberField label="高" value={inventoryForm.heightMm} onChange={(value) => setInventoryForm({ ...inventoryForm, heightMm: value })} />
            </div>
            <div className="grid2">
              <NumberField label="数量" value={inventoryForm.quantity} onChange={(value) => setInventoryForm({ ...inventoryForm, quantity: value })} />
              <Field label="来源" value={inventoryForm.source} onChange={(value) => setInventoryForm({ ...inventoryForm, source: value })} />
            </div>
            <button className="ghost full" onClick={saveInventoryItem}>新增库存/余料</button>
          </div>
          {inventory.slice(0, 8).map((item) => (
            <div key={item.id} className="mini-row">
              <strong>{item.materialCode}</strong>
              <span>{item.materialType} · {item.lengthMm ? `${item.lengthMm}mm` : `${item.widthMm}x${item.heightMm}`} · {item.quantity}</span>
            </div>
          ))}
        </ReportCard>
        <ReportCard icon={<FileText size={18} />} title="生产排单">
          {production.slice(0, 8).map((task) => (
            <div key={task.id} className="task-row">
              <div><strong>{task.title}</strong><span>{task.order?.customer?.name ?? ""} · {task.order?.orderNo ?? ""}</span></div>
              <select value={task.status} onChange={(event) => updateProductionStatus(task, event.target.value)}>
                <option>待备料</option>
                <option>待切割</option>
                <option>切割中</option>
                <option>组装中</option>
                <option>待安装</option>
                <option>已完成</option>
              </select>
            </div>
          ))}
        </ReportCard>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^\d*$/.test(next)) return;
          setDraft(next);
          if (next !== "") onChange(Number(next));
        }}
        onBlur={() => {
          if (draft === "") setDraft(String(value));
        }}
      />
    </label>
  );
}

function getStockLengths(materials: MaterialSettingsDto | null) {
  return materials?.stockLengthsMm?.length ? materials.stockLengthsMm : [2400, 3000, 6000];
}

function normalizeStockLengths(lengths: number[]) {
  const safeLengths = lengths
    .filter((length) => Number.isFinite(length))
    .map((length) => Math.round(length))
    .filter((length) => length >= 1000 && length <= 12000);
  return [...new Set(safeLengths.length ? safeLengths : [2400, 3000, 6000])].sort((a, b) => a - b);
}

function getGlassSheetSpecs(materials: MaterialSettingsDto | null) {
  const specs = materials?.glassSheetSpecs?.length ? materials.glassSheetSpecs : [{ widthMm: materials?.glassSheetWidthMm ?? 2440, heightMm: materials?.glassSheetHeightMm ?? 1830 }];
  return specs.length ? specs : [{ widthMm: 2440, heightMm: 1830 }];
}

function ReportCard({ icon, title, children, className = "" }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <article className={`panel report-card ${className}`}>
      <div className="panel-title">
        <h2>{icon}{title}</h2>
      </div>
      {children}
    </article>
  );
}

function ProfileCutVisualizer({
  bars,
  kerfMm
}: {
  bars: OrderSummary["profileCutting"][number]["bars"];
  kerfMm: number;
}) {
  if (!bars.length) return <small>暂无型材切割数据。</small>;
  const maxStockLength = Math.max(...bars.map((bar) => bar.stockLengthMm));
  return (
    <div className="profile-cut-list">
      {bars.map((bar, index) => {
        const cutTotal = bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
        const visibleKerf = Math.max(0, bar.kerfTotalMm ?? Math.max(0, bar.cuts.length - 1) * kerfMm);
        const waste = Math.max(0, bar.stockLengthMm - cutTotal - visibleKerf);
        return (
          <div key={`${bar.stockLengthMm}-${index}`} className="profile-cut-row">
            <div className="profile-cut-meta">
              <strong>第 {index + 1} 根</strong>
              <span>规格 {bar.stockLengthMm}mm · 切料 {cutTotal}mm · 锯缝 {Math.round(visibleKerf)}mm · 余料 {Math.round(waste)}mm</span>
            </div>
            <div className="profile-cut-track" aria-label={`第 ${index + 1} 根 ${bar.stockLengthMm}mm 型材切割图`}>
              <div className="profile-cut-bar" style={{ width: `${Math.max(12, (bar.stockLengthMm / maxStockLength) * 100)}%` }}>
              {bar.cuts.map((cut, cutIndex) => {
                const showKerfAfter = cutIndex < bar.cuts.length - 1 && kerfMm > 0;
                return (
                  <Fragment key={`${cut.label}-${cut.lengthMm}-${cutIndex}`}>
                    <span
                      className={`profile-cut-segment ${profileCutClass(cut.label)}`}
                      style={{ flexGrow: cut.lengthMm, flexBasis: 0 }}
                      title={`${cut.label} ${cut.lengthMm}mm`}
                    >
                      <b>{shortCutLabel(cut.label)}</b>
                      <em>{cut.lengthMm}</em>
                    </span>
                    {showKerfAfter && (
                      <span
                        className="profile-cut-kerf"
                        style={{ flexGrow: kerfMm, flexBasis: 0 }}
                        title={`锯缝 ${kerfMm}mm`}
                      />
                    )}
                  </Fragment>
                );
              })}
              {waste > 0 && (
                <span
                  className="profile-cut-waste"
                  style={{ flexGrow: waste, flexBasis: 0 }}
                  title={`余料 ${Math.round(waste)}mm`}
                >
                  <b>余料</b>
                  <em>{Math.round(waste)}</em>
                </span>
              )}
              </div>
            </div>
          </div>
        );
      })}
      <div className="profile-cut-legend">
        <span><i className="legend-frame" />外框</span>
        <span><i className="legend-mullion" />中梃</span>
        <span><i className="legend-sash" />扇料</span>
        <span><i className="legend-waste" />余料</span>
        <span><i className="legend-kerf" />锯缝</span>
      </div>
    </div>
  );
}

function shortCutLabel(label: string) {
  return label.replace("外框", "框").replace("横料", "横").replace("竖料", "竖").replace("中梃", "中梃");
}

function profileCutClass(label: string) {
  if (label.includes("外框")) return "profile-cut-frame";
  if (label.includes("中梃")) return "profile-cut-mullion";
  if (label.includes("扇")) return "profile-cut-sash";
  return "profile-cut-other";
}

function evenPositions(total: number, count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => Math.round((total * (index + 1)) / (count + 1)));
}

function windowToForm(item: WindowUnitDto): WindowForm {
  const drawingModel = normalizeDrawingModelGeometry(item.drawingModel, item.widthMm, item.heightMm, item.openType);
  const verticals = drawingModel.mullions.filter((mullion) => mullion.direction === "vertical");
  const horizontals = drawingModel.mullions.filter((mullion) => mullion.direction === "horizontal");
  return {
    name: item.name,
    floor: item.floor,
    position: item.position,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    quantity: item.quantity,
    openType: item.openType,
    verticalMullions: verticals.length,
    horizontalMullions: horizontals.length,
    verticalPositionsMm: verticals.map((mullion) => mullion.x ?? 0),
    horizontalPositionsMm: horizontals.map((mullion) => mullion.y ?? 0),
    drawingModel
  };
}

function normalizeDrawingModelGeometry(model: WindowUnitDto["drawingModel"], widthMm: number, heightMm: number, openType: WindowForm["openType"]): WindowUnitDto["drawingModel"] {
  const base = cloneDrawingModel({
    ...model,
    outerFrame: model.outerFrame ?? { width: widthMm, height: heightMm, profileCode: "ALU-70-FRAME" },
    openType
  });
  if (hasValidPanelCoverage(base.glassPanels, widthMm, heightMm)) return base;
  return {
    ...base,
    glassPanels: reconstructPanelsFromMullions(base.mullions, widthMm, heightMm)
  };
}

function hasValidPanelCoverage(panels: WindowUnitDto["drawingModel"]["glassPanels"], widthMm: number, heightMm: number) {
  if (!panels.length) return false;
  const tolerance = Math.max(2, widthMm * heightMm * 0.002);
  const totalArea = panels.reduce((sum, panel) => sum + panel.width * panel.height, 0);
  if (Math.abs(totalArea - widthMm * heightMm) > tolerance) return false;
  for (let i = 0; i < panels.length; i += 1) {
    const a = panels[i];
    if ((a.x ?? 0) < -1 || (a.y ?? 0) < -1 || (a.x ?? 0) + a.width > widthMm + 1 || (a.y ?? 0) + a.height > heightMm + 1) return false;
    for (let j = i + 1; j < panels.length; j += 1) {
      const b = panels[j];
      const overlapX = Math.max(0, Math.min((a.x ?? 0) + a.width, (b.x ?? 0) + b.width) - Math.max(a.x ?? 0, b.x ?? 0));
      const overlapY = Math.max(0, Math.min((a.y ?? 0) + a.height, (b.y ?? 0) + b.height) - Math.max(a.y ?? 0, b.y ?? 0));
      if (overlapX * overlapY > 1) return false;
    }
  }
  return true;
}

function reconstructPanelsFromMullions(mullions: WindowUnitDto["drawingModel"]["mullions"], widthMm: number, heightMm: number) {
  let panels: WindowUnitDto["drawingModel"]["glassPanels"] = [{ id: "g-root", x: 0, y: 0, width: widthMm, height: heightMm, type: "5+12A+5", quantity: 1 }];
  const sortedMullions = mullions
    .slice()
    .sort((a, b) => (a.direction === b.direction ? ((a.x ?? a.y ?? 0) - (b.x ?? b.y ?? 0)) : a.direction === "horizontal" ? -1 : 1));
  for (const mullion of sortedMullions) {
    const next: WindowUnitDto["drawingModel"]["glassPanels"] = [];
    for (const panel of panels) {
      const px = panel.x ?? 0;
      const py = panel.y ?? 0;
      if (mullion.direction === "vertical") {
        const x = mullion.x ?? 0;
        const fromY = mullion.fromY ?? 0;
        const toY = mullion.toY ?? heightMm;
        const spansPanel = fromY <= py + 1 && toY >= py + panel.height - 1;
        if (x > px + 120 && x < px + panel.width - 120 && spansPanel) {
          next.push({ ...panel, id: `${panel.id}-l`, x: px, width: x - px }, { ...panel, id: `${panel.id}-r`, x, width: px + panel.width - x });
        } else {
          next.push(panel);
        }
      } else {
        const y = mullion.y ?? 0;
        const fromX = mullion.fromX ?? 0;
        const toX = mullion.toX ?? widthMm;
        const spansPanel = fromX <= px + 1 && toX >= px + panel.width - 1;
        if (y > py + 120 && y < py + panel.height - 120 && spansPanel) {
          next.push({ ...panel, id: `${panel.id}-t`, y: py, height: y - py }, { ...panel, id: `${panel.id}-b`, y, height: py + panel.height - y });
        } else {
          next.push(panel);
        }
      }
    }
    panels = next;
  }
  return sortPanels(panels.map((panel, index) => ({ ...panel, id: `g-repair-${index + 1}` })));
}

function buildFreeModelFromForm(form: WindowForm): WindowUnitDto["drawingModel"] {
  const verticals = form.verticalPositionsMm.length === form.verticalMullions ? form.verticalPositionsMm : evenPositions(form.widthMm, form.verticalMullions);
  const horizontals = form.horizontalPositionsMm.length === form.horizontalMullions ? form.horizontalPositionsMm : evenPositions(form.heightMm, form.horizontalMullions);
  const xs = [0, ...verticals, form.widthMm];
  const ys = [0, ...horizontals, form.heightMm];
  const mullions = [
    ...verticals.map((mm, index) => ({ id: `vm-${index + 1}`, direction: "vertical" as const, x: mm, fromY: 0, toY: form.heightMm, profileCode: "ALU-70-MULLION" })),
    ...horizontals.map((mm, index) => ({ id: `hm-${index + 1}`, direction: "horizontal" as const, y: mm, fromX: 0, toX: form.widthMm, profileCode: "ALU-70-MULLION" }))
  ];
  const glassPanels = ys.slice(0, -1).flatMap((y, row) =>
    xs.slice(0, -1).map((x, column) => ({
      id: `g-${row + 1}-${column + 1}`,
      x,
      y,
      width: xs[column + 1] - x,
      height: ys[row + 1] - y,
      type: "5+12A+5",
      quantity: 1
    }))
  );
  return {
    outerFrame: { width: form.widthMm, height: form.heightMm, profileCode: "ALU-70-FRAME" },
    mullions,
    glassPanels,
    openType: form.openType
  };
}

function cloneDrawingModel(model: WindowUnitDto["drawingModel"]): WindowUnitDto["drawingModel"] {
  return {
    ...model,
    outerFrame: model.outerFrame ? { ...model.outerFrame } : undefined,
    mullions: model.mullions.map((mullion) => ({ ...mullion })),
    glassPanels: model.glassPanels.map((panel) => ({ ...panel })),
    dimensionRules: model.dimensionRules ? { ...model.dimensionRules } : undefined
  };
}

function sortPanels<T extends { x?: number; y?: number }>(panels: T[]) {
  return panels.slice().sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
}

function mergePanelsAcrossMullion(panels: WindowUnitDto["drawingModel"]["glassPanels"], mullion: WindowUnitDto["drawingModel"]["mullions"][number]) {
  const tolerance = 2;
  const used = new Set<string>();
  const merged: WindowUnitDto["drawingModel"]["glassPanels"] = [];
  if (mullion.direction === "vertical") {
    const x = mullion.x ?? 0;
    for (const left of panels) {
      if (used.has(left.id)) continue;
      const lx = left.x ?? 0;
      const ly = left.y ?? 0;
      const right = panels.find((panel) => {
        if (panel.id === left.id || used.has(panel.id)) return false;
        const px = panel.x ?? 0;
        const py = panel.y ?? 0;
        const withinMullion = ly >= (mullion.fromY ?? 0) - tolerance && ly + left.height <= (mullion.toY ?? Number.POSITIVE_INFINITY) + tolerance;
        return withinMullion && Math.abs(lx + left.width - x) <= tolerance && Math.abs(px - x) <= tolerance && Math.abs(py - ly) <= tolerance && Math.abs(panel.height - left.height) <= tolerance;
      });
      if (right) {
        used.add(left.id);
        used.add(right.id);
        merged.push({ ...left, id: `g-merged-${Date.now()}-${merged.length}`, x: lx, y: ly, width: left.width + right.width, height: left.height });
      }
    }
  } else {
    const y = mullion.y ?? 0;
    for (const top of panels) {
      if (used.has(top.id)) continue;
      const tx = top.x ?? 0;
      const ty = top.y ?? 0;
      const bottom = panels.find((panel) => {
        if (panel.id === top.id || used.has(panel.id)) return false;
        const px = panel.x ?? 0;
        const py = panel.y ?? 0;
        const withinMullion = tx >= (mullion.fromX ?? 0) - tolerance && tx + top.width <= (mullion.toX ?? Number.POSITIVE_INFINITY) + tolerance;
        return withinMullion && Math.abs(ty + top.height - y) <= tolerance && Math.abs(py - y) <= tolerance && Math.abs(px - tx) <= tolerance && Math.abs(panel.width - top.width) <= tolerance;
      });
      if (bottom) {
        used.add(top.id);
        used.add(bottom.id);
        merged.push({ ...top, id: `g-merged-${Date.now()}-${merged.length}`, x: tx, y: ty, width: top.width, height: top.height + bottom.height });
      }
    }
  }
  if (!merged.length) return panels;
  return panels.filter((panel) => !used.has(panel.id)).concat(merged);
}

function movePanelsWithMullion(
  panels: WindowUnitDto["drawingModel"]["glassPanels"],
  mullion: WindowUnitDto["drawingModel"]["mullions"][number],
  nextPosition: number,
  widthMm: number,
  heightMm: number,
  minPanel: number
) {
  const currentPosition = mullion.direction === "vertical" ? mullion.x ?? 0 : mullion.y ?? 0;
  const delta = nextPosition - currentPosition;
  if (Math.abs(delta) < 1) return panels;
  const tolerance = 2;
  const next = panels.map((panel) => ({ ...panel }));
  if (mullion.direction === "vertical") {
    const fromY = mullion.fromY ?? 0;
    const toY = mullion.toY ?? heightMm;
    const leftPanels = next.filter((panel) => Math.abs((panel.x ?? 0) + panel.width - currentPosition) <= tolerance && (panel.y ?? 0) >= fromY - tolerance && (panel.y ?? 0) + panel.height <= toY + tolerance);
    const rightPanels = next.filter((panel) => Math.abs((panel.x ?? 0) - currentPosition) <= tolerance && (panel.y ?? 0) >= fromY - tolerance && (panel.y ?? 0) + panel.height <= toY + tolerance);
    if (!leftPanels.length || !rightPanels.length) return null;
    if (leftPanels.some((panel) => panel.width + delta < minPanel) || rightPanels.some((panel) => panel.width - delta < minPanel)) return null;
    if (nextPosition < minPanel || nextPosition > widthMm - minPanel) return null;
    for (const panel of leftPanels) panel.width += delta;
    for (const panel of rightPanels) {
      panel.x = (panel.x ?? 0) + delta;
      panel.width -= delta;
    }
    return next;
  }
  const fromX = mullion.fromX ?? 0;
  const toX = mullion.toX ?? widthMm;
  const topPanels = next.filter((panel) => Math.abs((panel.y ?? 0) + panel.height - currentPosition) <= tolerance && (panel.x ?? 0) >= fromX - tolerance && (panel.x ?? 0) + panel.width <= toX + tolerance);
  const bottomPanels = next.filter((panel) => Math.abs((panel.y ?? 0) - currentPosition) <= tolerance && (panel.x ?? 0) >= fromX - tolerance && (panel.x ?? 0) + panel.width <= toX + tolerance);
  if (!topPanels.length || !bottomPanels.length) return null;
  if (topPanels.some((panel) => panel.height + delta < minPanel) || bottomPanels.some((panel) => panel.height - delta < minPanel)) return null;
  if (nextPosition < minPanel || nextPosition > heightMm - minPanel) return null;
  for (const panel of topPanels) panel.height += delta;
  for (const panel of bottomPanels) {
    panel.y = (panel.y ?? 0) + delta;
    panel.height -= delta;
  }
  return next;
}

function WindowCanvas({
  windowUnit,
  draft,
  selectedGlassId,
  selectedMullionId,
  onSelectGlass,
  onSelectMullion,
  onMoveMullion,
  onBeginFreeMullionDrag,
  onMoveFreeMullion,
  onFinishFreeMullionDrag
}: {
  windowUnit?: WindowUnitDto;
  draft: WindowForm;
  selectedGlassId: string | null;
  selectedMullionId: string | null;
  onSelectGlass: (id: string) => void;
  onSelectMullion: (id: string) => void;
  onMoveMullion: (direction: "vertical" | "horizontal", index: number, positionMm: number) => void;
  onBeginFreeMullionDrag: () => void;
  onMoveFreeMullion: (id: string, positionMm: number) => void;
  onFinishFreeMullionDrag: () => void;
}) {
  const width = draft.widthMm;
  const height = draft.heightMm;
  const verticals = draft.verticalPositionsMm.length === draft.verticalMullions ? draft.verticalPositionsMm : evenPositions(width, draft.verticalMullions);
  const horizontals = draft.horizontalPositionsMm.length === draft.horizontalMullions ? draft.horizontalPositionsMm : evenPositions(height, draft.horizontalMullions);
  const customMullions = draft.drawingModel?.mullions;
  const viewW = 760;
  const viewH = 460;
  const margin = 70;
  const scale = Math.min((viewW - margin * 2) / width, (viewH - margin * 2) / height);
  const w = width * scale;
  const h = height * scale;
  const x = (viewW - w) / 2;
  const y = 56;
  const frame = Math.max(18, 48 * scale);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<{ direction: "vertical" | "horizontal"; index: number } | null>(null);
  const [draggingFree, setDraggingFree] = useState<{ id: string; direction: "vertical" | "horizontal" } | null>(null);

  function pointerToMm(event: PointerEvent<SVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { xMm: 0, yMm: 0 };
    const px = ((event.clientX - rect.left) / rect.width) * viewW;
    const py = ((event.clientY - rect.top) / rect.height) * viewH;
    return {
      xMm: Math.round((px - x) / scale),
      yMm: Math.round((py - y) / scale)
    };
  }

  function onPointerMove(event: PointerEvent<SVGElement>) {
    const point = pointerToMm(event);
    if (draggingFree) {
      onMoveFreeMullion(draggingFree.id, draggingFree.direction === "vertical" ? point.xMm : point.yMm);
      return;
    }
    if (dragging) onMoveMullion(dragging.direction, dragging.index, dragging.direction === "vertical" ? point.xMm : point.yMm);
  }

  function stopFreeDrag() {
    if (draggingFree) onFinishFreeMullionDrag();
    setDraggingFree(null);
  }

  function stopDragging() {
    setDragging(null);
    stopFreeDrag();
  }

  return (
    <svg ref={svgRef} className="window-svg" viewBox={`0 0 ${viewW} ${viewH}`} role="img" aria-label="门窗效果图" onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerLeave={stopDragging}>
      <defs>
        <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cdeef5" />
        </linearGradient>
      </defs>
      <rect width={viewW} height={viewH} rx="8" fill="#f8fafc" />
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#8a6a52" />
      {draft.drawingModel?.glassPanels.length ? (
        draft.drawingModel.glassPanels.map((panel) => {
          const panelX = x + (panel.x ?? 0) * scale + 3;
          const panelY = y + (panel.y ?? 0) * scale + 3;
          const panelW = Math.max(4, panel.width * scale - 6);
          const panelH = Math.max(4, panel.height * scale - 6);
          const showLabel = panelW > 76 && panelH > 34;
          return (
            <g key={panel.id} className="glass-panel-group">
              <rect
                className="glass-panel"
                x={panelX}
                y={panelY}
                width={panelW}
                height={panelH}
                fill="url(#glass)"
                stroke={selectedGlassId === panel.id ? "#3370ff" : "#9fcbd3"}
                strokeWidth={selectedGlassId === panel.id ? 5 : 2}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectGlass(panel.id);
                }}
              />
              {showLabel && (
                <text x={panelX + panelW / 2} y={panelY + panelH / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#23545c" pointerEvents="none">
                  {Math.round(panel.width)}x{Math.round(panel.height)}
                </text>
              )}
            </g>
          );
        })
      ) : (
        <rect x={x + frame} y={y + frame} width={w - frame * 2} height={h - frame * 2} fill="url(#glass)" stroke="#9fcbd3" strokeWidth="2" />
      )}
      {customMullions
        ? customMullions.map((mullion) =>
            mullion.direction === "vertical" ? (
              <g key={mullion.id} className="mullion-free-group">
                <rect
                  className="mullion-free"
                  x={x + (mullion.x ?? 0) * scale - 10}
                  y={y + (mullion.fromY ?? 0) * scale}
                  width="20"
                  height={((mullion.toY ?? height) - (mullion.fromY ?? 0)) * scale}
                  fill={selectedMullionId === mullion.id ? "#3370ff" : "#765841"}
                  pointerEvents="none"
                />
                <rect
                  className="mullion-hit"
                  x={x + (mullion.x ?? 0) * scale - 24}
                  y={y + (mullion.fromY ?? 0) * scale}
                  width="48"
                  height={((mullion.toY ?? height) - (mullion.fromY ?? 0)) * scale}
                  fill="transparent"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onSelectMullion(mullion.id);
                    onBeginFreeMullionDrag();
                    setDraggingFree({ id: mullion.id, direction: "vertical" });
                  }}
                  onPointerUp={stopFreeDrag}
                />
              </g>
            ) : (
              <g key={mullion.id} className="mullion-free-group">
                <rect
                  className="mullion-free"
                  x={x + (mullion.fromX ?? 0) * scale}
                  y={y + (mullion.y ?? 0) * scale - 10}
                  width={((mullion.toX ?? width) - (mullion.fromX ?? 0)) * scale}
                  height="20"
                  fill={selectedMullionId === mullion.id ? "#3370ff" : "#765841"}
                  pointerEvents="none"
                />
                <rect
                  className="mullion-hit"
                  x={x + (mullion.fromX ?? 0) * scale}
                  y={y + (mullion.y ?? 0) * scale - 24}
                  width={((mullion.toX ?? width) - (mullion.fromX ?? 0)) * scale}
                  height="48"
                  fill="transparent"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onSelectMullion(mullion.id);
                    onBeginFreeMullionDrag();
                    setDraggingFree({ id: mullion.id, direction: "horizontal" });
                  }}
                  onPointerUp={stopFreeDrag}
                />
              </g>
            )
          )
        : verticals.map((mm, index) => (
            <g key={`v-${index}`} className="mullion-handle" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging({ direction: "vertical", index }); }}>
              <rect x={x + mm * scale - 10} y={y + frame} width="20" height={h - frame * 2} fill="#765841" />
              <circle cx={x + mm * scale} cy={y + h / 2} r="17" fill="#3370ff" />
              <text x={x + mm * scale} y={y + h / 2 + 5} textAnchor="middle" fontSize="11" fill="#fff">{Math.round(mm)}</text>
            </g>
          ))}
      {!customMullions &&
        horizontals.map((mm, index) => (
          <g key={`h-${index}`} className="mullion-handle" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging({ direction: "horizontal", index }); }}>
            <rect x={x + frame} y={y + mm * scale - 10} width={w - frame * 2} height="20" fill="#765841" />
            <circle cx={x + w / 2} cy={y + mm * scale} r="17" fill="#3370ff" />
            <text x={x + w / 2} y={y + mm * scale + 5} textAnchor="middle" fontSize="11" fill="#fff">{Math.round(mm)}</text>
          </g>
        ))}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#5f4533" strokeWidth="6" />
      <line x1={x} y1={y + h + 30} x2={x + w} y2={y + h + 30} stroke="#2b3038" strokeWidth="2" />
      <text x={x + w / 2} y={y + h + 54} textAnchor="middle" fontSize="16" fontWeight="700">{width}mm</text>
      <line x1={x - 34} y1={y} x2={x - 34} y2={y + h} stroke="#2b3038" strokeWidth="2" />
      <text x={x - 48} y={y + h / 2} transform={`rotate(-90 ${x - 48} ${y + h / 2})`} textAnchor="middle" fontSize="16" fontWeight="700">{height}mm</text>
      <text x={viewW / 2} y="30" textAnchor="middle" fontSize="18" fontWeight="700">{draft.name || windowUnit?.name} · {draft.quantity} 樘</text>
    </svg>
  );
}
