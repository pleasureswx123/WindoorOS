import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { ProductionTaskDto, UpdateProductionTaskDto } from "./dto";
import { StoreService } from "./store.service";

@Controller("production")
export class ProductionController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get()
  list() {
    return this.store.listProductionTasks();
  }

  @Post()
  create(@Body() dto: ProductionTaskDto) {
    return this.store.createProductionTask(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductionTaskDto) {
    return this.store.updateProductionTask(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.store.deleteProductionTask(id);
  }
}
