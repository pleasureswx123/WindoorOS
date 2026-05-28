import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { CreateOrderDto, CreateWindowDto, UpdateOrderDto, UpdateWindowDto } from "./dto";
import { StoreService } from "./store.service";

@Controller("orders")
export class OrdersController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get()
  list(@Query("customerId") customerId?: string) {
    return this.store.listOrders(customerId);
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.store.createOrder(dto);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.store.orderDetail(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrderDto) {
    return this.store.updateOrder(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.store.deleteOrder(id);
  }

  @Get(":orderId/windows")
  windows(@Param("orderId") orderId: string) {
    return this.store.listWindows(orderId);
  }

  @Post(":orderId/windows")
  createWindow(@Param("orderId") orderId: string, @Body() dto: CreateWindowDto) {
    return this.store.createWindow(orderId, dto);
  }

  @Patch("windows/:windowId")
  updateWindow(@Param("windowId") windowId: string, @Body() dto: UpdateWindowDto) {
    return this.store.updateWindow(windowId, dto);
  }

  @Delete("windows/:windowId")
  deleteWindow(@Param("windowId") windowId: string) {
    return this.store.deleteWindow(windowId);
  }

  @Post(":orderId/calculate-materials")
  calculateMaterials(@Param("orderId") orderId: string) {
    return this.store.calculateMaterials(orderId);
  }

  @Post(":orderId/cutting/profile")
  profileCutting(@Param("orderId") orderId: string) {
    return this.store.profileCutting(orderId);
  }

  @Post(":orderId/cutting/glass")
  glassCutting(@Param("orderId") orderId: string) {
    return this.store.glassCutting(orderId);
  }

  @Post(":orderId/quotes")
  quote(@Param("orderId") orderId: string) {
    return this.store.quote(orderId);
  }
}
