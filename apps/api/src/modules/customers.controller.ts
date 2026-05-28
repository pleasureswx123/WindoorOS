import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto";
import { StoreService } from "./store.service";

@Controller("customers")
export class CustomersController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get()
  list() {
    return this.store.listCustomers();
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.store.createCustomer(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.store.updateCustomer(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.store.deleteCustomer(id);
  }
}
