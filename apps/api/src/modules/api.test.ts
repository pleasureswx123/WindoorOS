import { describe, expect, it } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { StoreService } from "./store.service";
import { PrismaService } from "./prisma.service";

describe("StoreService API behavior", () => {
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
});
