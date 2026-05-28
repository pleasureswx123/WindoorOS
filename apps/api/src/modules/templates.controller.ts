import { Controller, Get, Inject } from "@nestjs/common";
import { StoreService } from "./store.service";

@Controller("templates")
export class TemplatesController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get("windows")
  list() {
    return this.store.listWindowTemplates();
  }
}
