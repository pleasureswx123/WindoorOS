import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { DimensionRulesDto, MaterialSettingsDto } from "./dto";
import { StoreService } from "./store.service";

@Controller("materials")
export class MaterialsController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get("settings")
  settings() {
    return this.store.getMaterialSettings();
  }

  @Put("settings")
  updateSettings(@Body() dto: MaterialSettingsDto) {
    return this.store.updateMaterialSettings(dto);
  }

  @Get("dimension-rules")
  dimensionRules() {
    return this.store.getDimensionRules();
  }

  @Put("dimension-rules")
  updateDimensionRules(@Body() dto: DimensionRulesDto) {
    return this.store.updateDimensionRules(dto);
  }
}
