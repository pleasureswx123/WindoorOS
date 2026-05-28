import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { InventoryItemDto } from "./dto";
import { StoreService } from "./store.service";

@Controller("inventory")
export class InventoryController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get()
  list() {
    return this.store.listInventory();
  }

  @Post()
  create(@Body() dto: InventoryItemDto) {
    return this.store.createInventoryItem(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<InventoryItemDto>) {
    return this.store.updateInventoryItem(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.store.deleteInventoryItem(id);
  }
}
