import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { AuthGuard } from "./auth.guard";
import { StoreService } from "./store.service";
import { PrismaService } from "./prisma.service";

describe("StoreService API behavior", () => {
  it("allows public reads but protects write and export endpoints with JWT", () => {
    const jwt = new JwtService({ secret: "test" });
    const guard = new AuthGuard(jwt);

    expect(guard.canActivate(mockContext("GET", "/api/orders"))).toBe(true);
    expect(guard.canActivate(mockContext("POST", "/api/auth/login"))).toBe(true);
    expect(() => guard.canActivate(mockContext("POST", "/api/customers"))).toThrow("请先登录后再保存或导出。");

    const token = jwt.sign({ sub: "13800000000", tenantId: "demo-tenant", role: "owner" });
    expect(guard.canActivate(mockContext("POST", "/api/customers", `Bearer ${token}`))).toBe(true);
    expect(() => guard.canActivate(mockContext("POST", "/api/customers", "Bearer invalid-token"))).toThrow("登录已过期，请重新登录。");
  });

  it("creates customers, orders, windows and quotes in PostgreSQL", async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    const store = new StoreService(new JwtService({ secret: "test" }), prisma);
    await store.onModuleInit();
    const customer = store.createCustomer({ name: "王老板", phone: "13900000000", address: "城南新房" });
    const createdCustomer = await customer;
    const order = await store.createOrder({ customerId: createdCustomer.id });
    const windowUnit = await store.createWindow(order.id, {
      name: "厨房窗",
      floor: "一楼",
      position: "后",
      widthMm: 1200,
      heightMm: 1000,
      quantity: 1,
      openType: "casement",
      verticalMullions: 1,
      horizontalMullions: 0
    });

    expect((await store.calculateMaterials(order.id)).profiles.length).toBeGreaterThan(0);
    expect((await store.profileCutting(order.id)).length).toBeGreaterThan(0);
    expect((await store.glassCutting(order.id)).length).toBeGreaterThan(0);
    expect((await store.quote(order.id)).finalTotal).toBeGreaterThan(0);

    await store.deleteWindow(windowUnit.id);
    await store.deleteOrder(order.id);
    await store.deleteCustomer(createdCustomer.id);
    await prisma.$disconnect();
  });

  it("runs the full business flow with profile system, exports, inventory and production", async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    const store = new StoreService(new JwtService({ secret: "test" }), prisma);
    await store.onModuleInit();

    const originalSettings = await store.getMaterialSettings();
    const originalRules = await store.getDimensionRules();
    let productionTaskId = "";
    let inventoryItemId = "";
    let windowId = "";
    let orderId = "";
    let customerId = "";

    try {
      await store.updateMaterialSettings({
        stockLengthsMm: [2400, 3000, 6000],
        glassSheetSpecs: [{ widthMm: 2440, heightMm: 1830 }, { widthMm: 2000, heightMm: 1500 }],
        kerfMm: 5,
        profilePricePerMeter: 28,
        glassSheetWidthMm: 2440,
        glassSheetHeightMm: 1830,
        glassPricePerSqm: 95,
        hardwarePricePerWindow: 85,
        laborPricePerSqm: 120,
        profitRate: 18
      });
      await store.updateDimensionRules({
        frameFaceWidthMm: 80,
        mullionFaceWidthMm: 90,
        sashFaceWidthMm: 65,
        frameDeductionMm: 20,
        mullionDeductionMm: 100,
        glassDeductionMm: 30,
        glassInstallGapMm: 15,
        sashDeductionMm: 130
      });

      const customer = await store.createCustomer({ name: "验收客户", phone: "13911112222", address: "一楼东侧", note: "全流程测试" });
      customerId = customer.id;
      const order = await store.createOrder({ customerId });
      orderId = order.id;
      const windowUnit = await store.createWindow(orderId, {
        name: "客厅测试窗",
        floor: "一楼",
        position: "前",
        widthMm: 1800,
        heightMm: 1500,
        quantity: 2,
        openType: "casement",
        verticalMullions: 1,
        horizontalMullions: 0
      });
      windowId = windowUnit.id;

      const detail = await store.orderDetail(orderId);
      expect(detail.summary.takeoff.profiles.some((item) => item.label === "扇横料")).toBe(true);
      expect(detail.summary.takeoff.glass.every((item) => item.widthMm > 0 && item.heightMm > 0)).toBe(true);
      expect(detail.summary.profileCutting.flatMap((group) => group.purchaseSummary).length).toBeGreaterThan(0);
      expect(detail.summary.profileCutting.every((group) => group.bars.length === group.purchaseSummary.reduce((sum, item) => sum + item.count, 0))).toBe(true);
      expect(detail.summary.glassCutting.flatMap((group) => group.purchaseSummary).length).toBeGreaterThan(0);
      expect(detail.summary.quote.finalTotal).toBeGreaterThan(0);

      const quote = await store.quote(orderId);
      expect(quote.finalTotal).toBe(detail.summary.quote.finalTotal);

      const htmlTask = await store.createExport("quote", { orderId });
      const htmlPath = store.getExportFilePath(fileNameFromResultUrl(htmlTask.resultUrl));
      expect(readFileSync(htmlPath, "utf8")).toContain("验收客户");

      const excelTask = await store.createExcelExport({ orderId });
      const excelPath = store.getExportFilePath(fileNameFromResultUrl(excelTask.resultUrl));
      expect(existsSync(excelPath)).toBe(true);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelPath);
      expect(workbook.getWorksheet("报价单")?.getCell("A1").value).toBe("客户");
      expect(workbook.getWorksheet("厂家采购建议")?.rowCount).toBeGreaterThan(1);
      expect(workbook.getWorksheet("型材切割")?.rowCount).toBeGreaterThan(1);
      expect(workbook.getWorksheet("玻璃排版")?.rowCount).toBeGreaterThan(1);

      const pdfTask = await store.createPdfExport({ orderId });
      const pdfPath = store.getExportFilePath(fileNameFromResultUrl(pdfTask.resultUrl));
      expect(readFileSync(pdfPath).subarray(0, 4).toString()).toBe("%PDF");

      const inventory = await store.createInventoryItem({
        materialCode: "ALU-TEST",
        materialType: "profile",
        lengthMm: 6000,
        quantity: 3,
        source: "验收入库"
      });
      inventoryItemId = inventory.id;
      expect((await store.listInventory()).some((item) => item.id === inventoryItemId)).toBe(true);
      await store.updateInventoryItem(inventoryItemId, { quantity: 2 });
      expect((await store.listInventory()).find((item) => item.id === inventoryItemId)?.quantity).toBe(2);

      const productionTask = await store.createProductionTask({
        orderId,
        title: "验收生产排单",
        status: "待备料",
        priority: 9,
        note: "自动化测试"
      });
      productionTaskId = productionTask.id;
      await store.updateProductionTask(productionTaskId, { status: "生产中", priority: 10 });
      expect((await store.listProductionTasks()).find((item) => item.id === productionTaskId)?.status).toBe("生产中");
    } finally {
      if (productionTaskId) await store.deleteProductionTask(productionTaskId);
      if (inventoryItemId) await store.deleteInventoryItem(inventoryItemId);
      if (windowId) await store.deleteWindow(windowId);
      if (orderId) await store.deleteOrder(orderId);
      if (customerId) await store.deleteCustomer(customerId);
      await store.updateMaterialSettings(originalSettings);
      await store.updateDimensionRules(originalRules);
      await prisma.$disconnect();
    }
  });
});

function mockContext(method: string, path: string, authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        headers: authorization ? { authorization } : {}
      })
    })
  } as ExecutionContext;
}

function fileNameFromResultUrl(resultUrl: string | null) {
  expect(resultUrl).toBeTruthy();
  return resultUrl?.split("/").pop() ?? "";
}
