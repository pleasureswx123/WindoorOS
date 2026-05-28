import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  calculateMaterialTakeoff,
  createDrawingModel,
  defaultDimensionRules,
  defaultMaterialSettings,
  validateDrawingModel,
  type DimensionRules,
  type DrawingModel,
  type MaterialSettings,
  type WindowUnit
} from "@windooros/domain";
import { calculateQuote, optimizeGlassCuts, optimizeProfileCuts } from "@windooros/algorithms";
import type {
  CreateCustomerDto,
  CreateOrderDto,
  CreateWindowDto,
  DimensionRulesDto,
  InventoryItemDto,
  MaterialSettingsDto,
  ProductionTaskDto,
  UpdateCustomerDto,
  UpdateOrderDto,
  UpdateProductionTaskDto,
  UpdateWindowDto
} from "./dto";
import { PrismaService } from "./prisma.service";

type ExportTaskStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
const TENANT_ID = "demo-tenant";
const MATERIAL_SETTINGS_KEY = "material-settings";
const DIMENSION_RULES_KEY = "dimension-rules";

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly exportDir = join(process.cwd(), "uploads", "exports");

  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    await this.ensureSeed();
  }

  login(phone: string) {
    const token = this.jwt.sign({ sub: phone, tenantId: TENANT_ID, role: "owner" });
    return {
      token,
      user: {
        id: phone,
        phone,
        tenantId: TENANT_ID,
        role: "owner"
      }
    };
  }

  async listCustomers() {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId: TENANT_ID },
      include: { orders: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" }
    });
    return customers.map((customer) => ({
      ...customer,
      createdAt: customer.createdAt.toISOString(),
      orders: customer.orders.map((order) => ({
        ...order,
        totalAmount: Number(order.totalAmount),
        createdAt: order.createdAt.toISOString()
      }))
    }));
  }

  async createCustomer(dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: TENANT_ID,
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        note: dto.note,
        status: "新线索"
      }
    });
    return { ...customer, createdAt: customer.createdAt.toISOString() };
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    await this.ensureCustomer(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: dto
    });
    return { ...customer, createdAt: customer.createdAt.toISOString() };
  }

  async deleteCustomer(id: string) {
    await this.ensureCustomer(id);
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  async listOrders(customerId?: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId: TENANT_ID, ...(customerId ? { customerId } : {}) },
      orderBy: { createdAt: "desc" }
    });
    return Promise.all(orders.map((order) => this.orderDetail(order.id)));
  }

  async createOrder(dto: CreateOrderDto) {
    await this.ensureCustomer(dto.customerId);
    const count = await this.prisma.order.count({ where: { tenantId: TENANT_ID } });
    const order = await this.prisma.order.create({
      data: {
        tenantId: TENANT_ID,
        customerId: dto.customerId,
        orderNo: `WD${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${count + 1}`,
        status: "DRAFT"
      }
    });
    return this.orderDetail(order.id);
  }

  async updateOrder(id: string, dto: UpdateOrderDto) {
    await this.ensureOrder(id);
    await this.prisma.order.update({
      where: { id },
      data: dto
    });
    return this.orderDetail(id);
  }

  async deleteOrder(id: string) {
    await this.ensureOrder(id);
    await this.prisma.order.delete({ where: { id } });
    return { ok: true };
  }

  async orderDetail(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId: TENANT_ID },
      include: { customer: true, windows: { orderBy: { createdAt: "asc" } } }
    });
    if (!order) throw new NotFoundException("订单不存在");
    const windows = order.windows.map((item) => this.toWindowUnit(item));
    const summary = await this.calculateOrder(id);
    return {
      id: order.id,
      customerId: order.customerId,
      orderNo: order.orderNo,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      customer: order.customer
        ? { ...order.customer, createdAt: order.customer.createdAt.toISOString() }
        : undefined,
      windows,
      summary
    };
  }

  async listWindows(orderId: string) {
    await this.ensureOrder(orderId);
    const windows = await this.prisma.windowUnit.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" }
    });
    return windows.map((item) => this.toWindowUnit(item));
  }

  async createWindow(orderId: string, dto: CreateWindowDto) {
    await this.ensureOrder(orderId);
    const dimensionRules = await this.getDimensionRules();
    const drawingModel = dto.drawingModel
      ? this.normalizeCustomDrawingModel(dto.drawingModel, dto.widthMm, dto.heightMm, dto.openType, dimensionRules)
      : createDrawingModel({
          widthMm: dto.widthMm,
          heightMm: dto.heightMm,
          verticalMullions: dto.verticalMullions,
          horizontalMullions: dto.horizontalMullions,
          verticalPositionsMm: dto.verticalPositionsMm,
          horizontalPositionsMm: dto.horizontalPositionsMm,
          openType: dto.openType,
          dimensionRules
        });
    const windowUnit = await this.prisma.windowUnit.create({
      data: {
        orderId,
        name: dto.name,
        floor: dto.floor,
        position: dto.position,
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
        quantity: dto.quantity,
        openType: dto.openType,
        drawingModel: drawingModel as unknown as Prisma.InputJsonValue,
        note: dto.note
      }
    });
    await this.refreshOrderTotal(orderId);
    return this.toWindowUnit(windowUnit);
  }

  async updateWindow(id: string, dto: UpdateWindowDto) {
    const current = await this.prisma.windowUnit.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("窗户不存在");
    const currentModel = current.drawingModel as unknown as DrawingModel;
    const widthMm = dto.widthMm ?? current.widthMm;
    const heightMm = dto.heightMm ?? current.heightMm;
    const openType = dto.openType ?? (current.openType as WindowUnit["openType"]);
    const verticalMullions = dto.verticalMullions ?? currentModel.mullions.filter((item) => item.direction === "vertical").length;
    const horizontalMullions = dto.horizontalMullions ?? currentModel.mullions.filter((item) => item.direction === "horizontal").length;
    const currentVerticalPositions = currentModel.mullions.filter((item) => item.direction === "vertical").map((item) => item.x ?? 0);
    const currentHorizontalPositions = currentModel.mullions.filter((item) => item.direction === "horizontal").map((item) => item.y ?? 0);
    const dimensionRules = await this.getDimensionRules();
    const drawingModel = dto.drawingModel
      ? this.normalizeCustomDrawingModel(dto.drawingModel, widthMm, heightMm, openType, dimensionRules)
      : createDrawingModel({
          widthMm,
          heightMm,
          verticalMullions,
          horizontalMullions,
          verticalPositionsMm: dto.verticalPositionsMm ?? currentVerticalPositions,
          horizontalPositionsMm: dto.horizontalPositionsMm ?? currentHorizontalPositions,
          openType,
          dimensionRules
        });
    const updated = await this.prisma.windowUnit.update({
      where: { id },
      data: {
        name: dto.name,
        floor: dto.floor,
        position: dto.position,
        widthMm,
        heightMm,
        quantity: dto.quantity,
        openType,
        drawingModel: drawingModel as unknown as Prisma.InputJsonValue,
        note: dto.note
      }
    });
    await this.refreshOrderTotal(current.orderId);
    return this.toWindowUnit(updated);
  }

  async deleteWindow(id: string) {
    const current = await this.prisma.windowUnit.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("窗户不存在");
    await this.prisma.windowUnit.delete({ where: { id } });
    await this.refreshOrderTotal(current.orderId);
    return { ok: true };
  }

  async calculateMaterials(orderId: string) {
    return calculateMaterialTakeoff(await this.listWindows(orderId));
  }

  async profileCutting(orderId: string) {
    const takeoff = await this.calculateMaterials(orderId);
    return optimizeProfileCuts(takeoff.profiles, await this.getMaterialSettings());
  }

  async glassCutting(orderId: string) {
    const takeoff = await this.calculateMaterials(orderId);
    return optimizeGlassCuts(takeoff.glass, await this.getMaterialSettings());
  }

  async quote(orderId: string) {
    await this.ensureOrder(orderId);
    const { quote, takeoff, profileCutting, glassCutting } = await this.calculateOrder(orderId);
    await this.prisma.quote.create({
      data: {
        orderId,
        subtotal: quote.subtotal,
        profit: quote.profit,
        finalTotal: quote.finalTotal,
        detail: { quote, takeoff, profileCutting, glassCutting } as unknown as Prisma.InputJsonValue
      }
    });
    await this.prisma.order.update({ where: { id: orderId }, data: { totalAmount: quote.finalTotal } });
    return quote;
  }

  async createExport(type: string, input: unknown) {
    const orderId = (input as { orderId?: string }).orderId;
    if (!orderId) throw new BadRequestException("缺少 orderId");
    const detail = await this.orderDetail(orderId);
    mkdirSync(this.exportDir, { recursive: true });
    const fileName = `${type}-${orderId}-${Date.now()}.html`;
    const filePath = join(this.exportDir, fileName);
    writeFileSync(filePath, this.renderQuoteHtml(detail), "utf8");
    const task = await this.prisma.exportTask.create({
      data: {
        type,
        status: "SUCCESS" satisfies ExportTaskStatus,
        input: input as Prisma.InputJsonValue,
        resultUrl: `/api/exports/files/${fileName}`
      }
    });
    return { ...task, createdAt: task.createdAt.toISOString() };
  }

  async createPdfExport(input: unknown) {
    const orderId = (input as { orderId?: string }).orderId;
    if (!orderId) throw new BadRequestException("缺少 orderId");
    const detail = await this.orderDetail(orderId);
    mkdirSync(this.exportDir, { recursive: true });
    const fileName = `quote-${orderId}-${Date.now()}.pdf`;
    const filePath = join(this.exportDir, fileName);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.setContent(this.renderQuoteHtml(detail), { waitUntil: "networkidle" });
    await page.pdf({ path: filePath, format: "A4", printBackground: true });
    await browser.close();
    const task = await this.prisma.exportTask.create({
      data: {
        type: "quote-pdf",
        status: "SUCCESS",
        input: input as Prisma.InputJsonValue,
        resultUrl: `/api/exports/files/${fileName}`
      }
    });
    return { ...task, createdAt: task.createdAt.toISOString() };
  }

  async createExcelExport(input: unknown) {
    const orderId = (input as { orderId?: string }).orderId;
    if (!orderId) throw new BadRequestException("缺少 orderId");
    const detail = await this.orderDetail(orderId);
    mkdirSync(this.exportDir, { recursive: true });
    const fileName = `quote-${orderId}-${Date.now()}.xlsx`;
    const filePath = join(this.exportDir, fileName);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WindoorOS";
    const quoteSheet = workbook.addWorksheet("报价单");
    quoteSheet.addRows([
      ["客户", detail.customer?.name ?? "-", "电话", detail.customer?.phone ?? "-"],
      ["地址", detail.customer?.address ?? "-", "订单", detail.orderNo],
      [],
      ["项目", "数量/面积", "金额"],
      ["型材", `${detail.summary.quote.profileMeters.toFixed(2)} 米`, detail.summary.quote.profileCost],
      ["玻璃", `${detail.summary.quote.glassAreaSqm.toFixed(2)} ㎡`, detail.summary.quote.glassCost],
      ["五金辅料", `${detail.summary.quote.windowCount} 樘`, detail.summary.quote.hardwareCost],
      ["人工", `${detail.summary.quote.windowAreaSqm.toFixed(2)} ㎡`, detail.summary.quote.laborCost],
      ["利润", "", detail.summary.quote.profit],
      ["合计", "", detail.summary.quote.finalTotal]
    ]);
    quoteSheet.columns = [{ width: 18 }, { width: 24 }, { width: 18 }, { width: 24 }];

    const cutsSheet = workbook.addWorksheet("型材切割");
    cutsSheet.addRow(["型材", "原料长度", "切割段", "余料"]);
    for (const group of detail.summary.profileCutting) {
      for (const bar of group.bars) {
        cutsSheet.addRow([group.materialCode, bar.stockLengthMm, bar.cuts.map((cut) => `${cut.label}${cut.lengthMm}`).join(" + "), Math.round(bar.wasteMm)]);
      }
    }
    cutsSheet.columns = [{ width: 20 }, { width: 14 }, { width: 70 }, { width: 12 }];

    const glassSheet = workbook.addWorksheet("玻璃排版");
    glassSheet.addRow(["玻璃", "张号", "分条", "余面积"]);
    for (const group of detail.summary.glassCutting) {
      group.sheets.forEach((sheet, index) => {
        glassSheet.addRow([group.glassType, index + 1, sheet.rows.flatMap((row) => row.pieces).map((piece) => `${piece.widthMm}x${piece.heightMm}`).join("，"), sheet.wasteAreaSqm]);
      });
    }
    glassSheet.columns = [{ width: 20 }, { width: 10 }, { width: 70 }, { width: 14 }];
    await workbook.xlsx.writeFile(filePath);

    const task = await this.prisma.exportTask.create({
      data: {
        type: "quote-excel",
        status: "SUCCESS",
        input: input as Prisma.InputJsonValue,
        resultUrl: `/api/exports/files/${fileName}`
      }
    });
    return { ...task, createdAt: task.createdAt.toISOString() };
  }

  async getExport(id: string) {
    const task = await this.prisma.exportTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("导出任务不存在");
    return { ...task, createdAt: task.createdAt.toISOString() };
  }

  getExportFilePath(fileName: string) {
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) throw new BadRequestException("非法文件名");
    const filePath = join(this.exportDir, fileName);
    if (!existsSync(filePath)) throw new NotFoundException("导出文件不存在");
    return filePath;
  }

  async listWindowTemplates() {
    return this.prisma.windowTemplate.findMany({ where: { tenantId: TENANT_ID }, orderBy: { createdAt: "asc" } });
  }

  async listInventory() {
    return this.prisma.inventoryItem.findMany({ where: { tenantId: TENANT_ID }, orderBy: { createdAt: "desc" } });
  }

  async createInventoryItem(dto: InventoryItemDto) {
    return this.prisma.inventoryItem.create({ data: { tenantId: TENANT_ID, ...dto } });
  }

  async updateInventoryItem(id: string, dto: Partial<InventoryItemDto>) {
    await this.ensureInventoryItem(id);
    return this.prisma.inventoryItem.update({ where: { id }, data: dto });
  }

  async deleteInventoryItem(id: string) {
    await this.ensureInventoryItem(id);
    await this.prisma.inventoryItem.delete({ where: { id } });
    return { ok: true };
  }

  async listProductionTasks() {
    return this.prisma.productionTask.findMany({
      where: { tenantId: TENANT_ID },
      include: { order: { include: { customer: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });
  }

  async createProductionTask(dto: ProductionTaskDto) {
    await this.ensureOrder(dto.orderId);
    return this.prisma.productionTask.create({
      data: {
        tenantId: TENANT_ID,
        orderId: dto.orderId,
        title: dto.title,
        status: dto.status ?? "待备料",
        priority: dto.priority ?? 0,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        note: dto.note
      }
    });
  }

  async updateProductionTask(id: string, dto: UpdateProductionTaskDto) {
    await this.ensureProductionTask(id);
    return this.prisma.productionTask.update({
      where: { id },
      data: {
        title: dto.title,
        status: dto.status,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        note: dto.note
      }
    });
  }

  async deleteProductionTask(id: string) {
    await this.ensureProductionTask(id);
    await this.prisma.productionTask.delete({ where: { id } });
    return { ok: true };
  }

  async getMaterialSettings(): Promise<MaterialSettings> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { tenantId_key: { tenantId: TENANT_ID, key: MATERIAL_SETTINGS_KEY } }
    });
    return (setting?.value as unknown as MaterialSettings | undefined) ?? defaultMaterialSettings;
  }

  async updateMaterialSettings(dto: MaterialSettingsDto) {
    const materialSettings: MaterialSettings = {
      stockLengthsMm: [dto.stockLengthA, dto.stockLengthB, dto.stockLengthC].sort((a, b) => a - b),
      kerfMm: dto.kerfMm,
      profilePricePerMeter: dto.profilePricePerMeter,
      glassSheetWidthMm: dto.glassSheetWidthMm,
      glassSheetHeightMm: dto.glassSheetHeightMm,
      glassPricePerSqm: dto.glassPricePerSqm,
      hardwarePricePerWindow: dto.hardwarePricePerWindow,
      laborPricePerSqm: dto.laborPricePerSqm,
      profitRate: dto.profitRate
    };
    await this.prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId: TENANT_ID, key: MATERIAL_SETTINGS_KEY } },
      update: { value: materialSettings as unknown as Prisma.InputJsonValue },
      create: { tenantId: TENANT_ID, key: MATERIAL_SETTINGS_KEY, value: materialSettings as unknown as Prisma.InputJsonValue }
    });
    const orders = await this.prisma.order.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } });
    await Promise.all(orders.map((order) => this.refreshOrderTotal(order.id)));
    return materialSettings;
  }

  async getDimensionRules(): Promise<DimensionRules> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { tenantId_key: { tenantId: TENANT_ID, key: DIMENSION_RULES_KEY } }
    });
    return (setting?.value as unknown as DimensionRules | undefined) ?? defaultDimensionRules;
  }

  async updateDimensionRules(dto: DimensionRulesDto) {
    const dimensionRules: DimensionRules = {
      frameDeductionMm: dto.frameDeductionMm,
      mullionDeductionMm: dto.mullionDeductionMm,
      glassDeductionMm: dto.glassDeductionMm,
      sashDeductionMm: dto.sashDeductionMm
    };
    await this.prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId: TENANT_ID, key: DIMENSION_RULES_KEY } },
      update: { value: dimensionRules as unknown as Prisma.InputJsonValue },
      create: { tenantId: TENANT_ID, key: DIMENSION_RULES_KEY, value: dimensionRules as unknown as Prisma.InputJsonValue }
    });
    await this.rebuildAllWindowModels(dimensionRules);
    const orders = await this.prisma.order.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } });
    await Promise.all(orders.map((order) => this.refreshOrderTotal(order.id)));
    return dimensionRules;
  }

  private async calculateOrder(orderId: string) {
    const takeoff = await this.calculateMaterials(orderId);
    const settings = await this.getMaterialSettings();
    const profileCutting = optimizeProfileCuts(takeoff.profiles, settings);
    const glassCutting = optimizeGlassCuts(takeoff.glass, settings);
    const quote = calculateQuote(takeoff, settings);
    return { takeoff, profileCutting, glassCutting, quote };
  }

  private async refreshOrderTotal(orderId: string) {
    const quote = (await this.calculateOrder(orderId)).quote;
    await this.prisma.order.update({ where: { id: orderId }, data: { totalAmount: quote.finalTotal } });
  }

  private async ensureSeed() {
    await this.prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: { id: TENANT_ID, name: "演示门店", plan: "free" }
    });
    await this.prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId: TENANT_ID, key: MATERIAL_SETTINGS_KEY } },
      update: {},
      create: { tenantId: TENANT_ID, key: MATERIAL_SETTINGS_KEY, value: defaultMaterialSettings as unknown as Prisma.InputJsonValue }
    });
    await this.prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId: TENANT_ID, key: DIMENSION_RULES_KEY } },
      update: {},
      create: { tenantId: TENANT_ID, key: DIMENSION_RULES_KEY, value: defaultDimensionRules as unknown as Prisma.InputJsonValue }
    });
    await this.seedTemplates();
    if ((await this.prisma.inventoryItem.count({ where: { tenantId: TENANT_ID } })) === 0) await this.seedInventory();
    const customerCount = await this.prisma.customer.count({ where: { tenantId: TENANT_ID } });
    if (customerCount > 0) return;
    const customer = await this.createCustomer({
      name: "演示客户",
      phone: "13800000000",
      address: "新房一楼、二楼门窗",
      note: "断桥铝，灰色，双层中空玻璃。"
    });
    const order = await this.createOrder({ customerId: customer.id });
    await this.createWindow(order.id, {
      name: "一楼前窗",
      floor: "一楼",
      position: "前",
      widthMm: 1800,
      heightMm: 1500,
      quantity: 4,
      openType: "sliding",
      verticalMullions: 1,
      horizontalMullions: 0,
      note: "两扇推拉"
    });
    await this.createWindow(order.id, {
      name: "二楼卧室",
      floor: "二楼",
      position: "后",
      widthMm: 1500,
      heightMm: 1400,
      quantity: 3,
      openType: "casement",
      verticalMullions: 1,
      horizontalMullions: 1,
      note: "左侧平开，右侧固定"
    });
    await this.createProductionTask({
      orderId: order.id,
      title: "演示客户门窗生产",
      status: "待备料",
      priority: 1,
      note: "按先后顺序排产"
    });
  }

  private async seedTemplates() {
    const templates = this.defaultWindowTemplates();
    for (const template of templates) {
      const exists = await this.prisma.windowTemplate.findFirst({ where: { tenantId: TENANT_ID, name: template.name } });
      const drawingModel = template.drawingModel ?? createDrawingModel(template);
      if (exists) {
        await this.prisma.windowTemplate.update({
          where: { id: exists.id },
          data: {
            category: template.category,
            widthMm: template.widthMm,
            heightMm: template.heightMm,
            openType: template.openType,
            verticalMullions: template.verticalMullions,
            horizontalMullions: template.horizontalMullions,
            drawingModel: drawingModel as unknown as Prisma.InputJsonValue
          }
        });
        continue;
      }
      await this.prisma.windowTemplate.create({
        data: {
          tenantId: TENANT_ID,
          name: template.name,
          category: template.category,
          widthMm: template.widthMm,
          heightMm: template.heightMm,
          openType: template.openType,
          verticalMullions: template.verticalMullions,
          horizontalMullions: template.horizontalMullions,
          drawingModel: drawingModel as unknown as Prisma.InputJsonValue
        }
      });
    }
  }

  private async seedInventory() {
    await this.prisma.inventoryItem.createMany({
      data: [
        { tenantId: TENANT_ID, materialCode: "ALU-70-FRAME", materialType: "profile", lengthMm: 6000, quantity: 20, source: "采购入库", note: "主框料" },
        { tenantId: TENANT_ID, materialCode: "ALU-70-MULLION", materialType: "profile", lengthMm: 6000, quantity: 12, source: "采购入库", note: "中梃料" },
        { tenantId: TENANT_ID, materialCode: "5+12A+5", materialType: "glass", widthMm: 2440, heightMm: 1830, quantity: 8, source: "采购入库", note: "中空玻璃原片" },
        { tenantId: TENANT_ID, materialCode: "ALU-70-SCRAP", materialType: "scrap", lengthMm: 900, quantity: 6, source: "余料入库", note: "可优先使用" }
      ]
    });
  }

  private async ensureCustomer(id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId: TENANT_ID } });
    if (!customer) throw new NotFoundException("客户不存在");
    return customer;
  }

  private async ensureOrder(id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, tenantId: TENANT_ID } });
    if (!order) throw new NotFoundException("订单不存在");
    return order;
  }

  private async ensureInventoryItem(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, tenantId: TENANT_ID } });
    if (!item) throw new NotFoundException("库存不存在");
    return item;
  }

  private async ensureProductionTask(id: string) {
    const item = await this.prisma.productionTask.findFirst({ where: { id, tenantId: TENANT_ID } });
    if (!item) throw new NotFoundException("生产任务不存在");
    return item;
  }

  private async rebuildAllWindowModels(dimensionRules: DimensionRules) {
    const windows = await this.prisma.windowUnit.findMany({ where: { order: { tenantId: TENANT_ID } } });
    await Promise.all(
      windows.map((window) => {
        const currentModel = window.drawingModel as unknown as DrawingModel;
        const verticals = currentModel.mullions.filter((item) => item.direction === "vertical").map((item) => item.x ?? 0);
        const horizontals = currentModel.mullions.filter((item) => item.direction === "horizontal").map((item) => item.y ?? 0);
        const hasPartialMullions = currentModel.mullions.some((mullion) =>
          mullion.direction === "vertical"
            ? (mullion.fromY ?? 0) > 0 || (mullion.toY ?? window.heightMm) < window.heightMm
            : (mullion.fromX ?? 0) > 0 || (mullion.toX ?? window.widthMm) < window.widthMm
        );
        const drawingModel = hasPartialMullions
          ? this.normalizeCustomDrawingModel(currentModel, window.widthMm, window.heightMm, window.openType as WindowUnit["openType"], dimensionRules)
          : createDrawingModel({
              widthMm: window.widthMm,
              heightMm: window.heightMm,
              openType: window.openType as WindowUnit["openType"],
              verticalMullions: verticals.length,
              horizontalMullions: horizontals.length,
              verticalPositionsMm: verticals,
              horizontalPositionsMm: horizontals,
              dimensionRules
            });
        return this.prisma.windowUnit.update({
          where: { id: window.id },
          data: { drawingModel: drawingModel as unknown as Prisma.InputJsonValue }
        });
      })
    );
  }

  private normalizeCustomDrawingModel(model: DrawingModel, widthMm: number, heightMm: number, openType: WindowUnit["openType"], dimensionRules: DimensionRules) {
    const drawingModel: DrawingModel = {
      ...model,
      version: 1,
      unit: "mm",
      outerFrame: {
        ...model.outerFrame,
        width: widthMm,
        height: heightMm,
        profileCode: model.outerFrame?.profileCode ?? "ALU-70-FRAME"
      },
      openType,
      dimensionRules,
      mullions: (model.mullions ?? []).map((mullion, index) => ({
        ...mullion,
        id: mullion.id || `m-${index + 1}`,
        profileCode: mullion.profileCode || "ALU-70-MULLION"
      })),
      sashes: model.sashes ?? [],
      glassPanels: model.glassPanels ?? []
    };
    const errors = validateDrawingModel(drawingModel);
    if (errors.length) throw new BadRequestException(errors.join("；"));
    return drawingModel;
  }

  private defaultWindowTemplates() {
    const topMiddleBottom = this.createTopMiddleBottomTemplate();
    const templates: Array<{
      name: string;
      category: string;
      widthMm: number;
      heightMm: number;
      openType: WindowUnit["openType"];
      verticalMullions: number;
      horizontalMullions: number;
      drawingModel?: DrawingModel;
    }> = [
      { name: "两扇推拉窗", category: "推拉", widthMm: 1800, heightMm: 1500, openType: "sliding" as const, verticalMullions: 1, horizontalMullions: 0 },
      { name: "三格平开窗", category: "平开", widthMm: 1800, heightMm: 1500, openType: "casement" as const, verticalMullions: 2, horizontalMullions: 0 },
      { name: "上下亮组合窗", category: "组合", widthMm: 1600, heightMm: 1800, openType: "casement" as const, verticalMullions: 1, horizontalMullions: 1 },
      { name: "固定大玻璃", category: "固定", widthMm: 1200, heightMm: 1000, openType: "fixed" as const, verticalMullions: 0, horizontalMullions: 0 },
      topMiddleBottom
    ];
    return templates;
  }

  private createTopMiddleBottomTemplate() {
    const widthMm = 2400;
    const heightMm = 1450;
    const topY = 240;
    const bottomY = 1230;
    const leftX = 520;
    const rightX = 1880;
    const glassType = "5+12A+5";
    const rules = defaultDimensionRules;
    const panel = (id: string, x: number, y: number, width: number, height: number) => ({
      id,
      x,
      y,
      width: Math.max(100, width),
      height: Math.max(100, height),
      type: glassType,
      quantity: 1
    });
    const drawingModel: DrawingModel = {
      version: 1,
      unit: "mm",
      outerFrame: { width: widthMm, height: heightMm, profileCode: "ALU-70-FRAME" },
      openType: "fixed",
      dimensionRules: rules,
      mullions: [
        { id: "hm-top", direction: "horizontal", y: topY, fromX: 0, toX: widthMm, profileCode: "ALU-70-MULLION" },
        { id: "hm-bottom", direction: "horizontal", y: bottomY, fromX: 0, toX: widthMm, profileCode: "ALU-70-MULLION" },
        { id: "vm-left-middle", direction: "vertical", x: leftX, fromY: topY, toY: bottomY, profileCode: "ALU-70-MULLION" },
        { id: "vm-right-middle", direction: "vertical", x: rightX, fromY: topY, toY: bottomY, profileCode: "ALU-70-MULLION" }
      ],
      sashes: [],
      glassPanels: [
        panel("g-top", 0, 0, widthMm, topY),
        panel("g-middle-left", 0, topY, leftX, bottomY - topY),
        panel("g-middle-center", leftX, topY, rightX - leftX, bottomY - topY),
        panel("g-middle-right", rightX, topY, widthMm - rightX, bottomY - topY),
        panel("g-bottom", 0, bottomY, widthMm, heightMm - bottomY)
      ]
    };
    return {
      name: "上下亮中间三格窗",
      category: "组合",
      widthMm,
      heightMm,
      openType: "fixed" as const,
      verticalMullions: 2,
      horizontalMullions: 2,
      drawingModel
    };
  }

  private toWindowUnit(item: {
    id: string;
    orderId: string;
    name: string;
    floor: string;
    position: string;
    widthMm: number;
    heightMm: number;
    quantity: number;
    openType: string;
    drawingModel: Prisma.JsonValue;
    note: string | null;
  }): WindowUnit {
    return {
      id: item.id,
      orderId: item.orderId,
      name: item.name,
      floor: item.floor,
      position: item.position,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      quantity: item.quantity,
      openType: item.openType as WindowUnit["openType"],
      drawingModel: item.drawingModel as unknown as DrawingModel,
      note: item.note ?? undefined
    };
  }

  private renderQuoteHtml(detail: Awaited<ReturnType<StoreService["orderDetail"]>>) {
    const quote = detail.summary.quote;
    const windows = detail.windows
      .map((item) => `<tr><td>${item.floor} ${item.name}</td><td>${item.widthMm} x ${item.heightMm}mm</td><td>${item.quantity}</td><td>${item.openType}</td></tr>`)
      .join("");
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${detail.customer?.name ?? "客户"} 报价单</title>
  <style>
    body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#1f2329;padding:32px;}
    h1{font-size:26px;} table{width:100%;border-collapse:collapse;margin-top:16px;}
    td,th{border:1px solid #dcdfe5;padding:10px;text-align:left;} .total{font-size:24px;color:#3370ff;font-weight:700;}
  </style>
</head>
<body>
  <h1>WindoorOS 门窗报价单</h1>
  <p>客户：${detail.customer?.name ?? "-"}　电话：${detail.customer?.phone ?? "-"}　地址：${detail.customer?.address ?? "-"}</p>
  <table><thead><tr><th>窗户</th><th>尺寸</th><th>数量</th><th>开启</th></tr></thead><tbody>${windows}</tbody></table>
  <table>
    <tr><td>型材</td><td>${quote.profileMeters.toFixed(2)} 米</td><td>￥${quote.profileCost.toFixed(0)}</td></tr>
    <tr><td>玻璃</td><td>${quote.glassAreaSqm.toFixed(2)} ㎡</td><td>￥${quote.glassCost.toFixed(0)}</td></tr>
    <tr><td>五金辅料</td><td>${quote.windowCount} 樘</td><td>￥${quote.hardwareCost.toFixed(0)}</td></tr>
    <tr><td>人工</td><td>${quote.windowAreaSqm.toFixed(2)} ㎡</td><td>￥${quote.laborCost.toFixed(0)}</td></tr>
    <tr><td>利润</td><td></td><td>￥${quote.profit.toFixed(0)}</td></tr>
  </table>
  <p class="total">合计：￥${quote.finalTotal.toFixed(0)}</p>
</body>
</html>`;
  }
}
