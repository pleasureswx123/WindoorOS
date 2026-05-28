import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { DrawingModel, OpenType } from "@windooros/domain";

export class GlassSheetSpecDto {
  @IsInt()
  @Min(500)
  @Max(6000)
  widthMm!: number;

  @IsInt()
  @Min(500)
  @Max(6000)
  heightMm!: number;
}

export class LoginDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class CreateCustomerDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsString()
  address!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateOrderDto {
  @IsString()
  customerId!: string;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateWindowDto {
  @IsString()
  name!: string;

  @IsString()
  floor!: string;

  @IsString()
  position!: string;

  @IsInt()
  @Min(300)
  @Max(12000)
  widthMm!: number;

  @IsInt()
  @Min(300)
  @Max(12000)
  heightMm!: number;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @IsIn(["fixed", "casement", "sliding", "top-hung", "bottom-hung"])
  openType!: OpenType;

  @IsInt()
  @Min(0)
  @Max(6)
  verticalMullions!: number;

  @IsInt()
  @Min(0)
  @Max(6)
  horizontalMullions!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  verticalPositionsMm?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  horizontalPositionsMm?: number[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsObject()
  drawingModel?: DrawingModel;
}

export class UpdateWindowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(12000)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(12000)
  heightMm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @IsIn(["fixed", "casement", "sliding", "top-hung", "bottom-hung"])
  openType?: OpenType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  verticalMullions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  horizontalMullions?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  verticalPositionsMm?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  horizontalPositionsMm?: number[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsObject()
  drawingModel?: DrawingModel;
}

export class MaterialSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @Min(1000, { each: true })
  @Max(12000, { each: true })
  stockLengthsMm?: number[];

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(12000)
  stockLengthA?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(12000)
  stockLengthB?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(12000)
  stockLengthC?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => GlassSheetSpecDto)
  glassSheetSpecs?: GlassSheetSpecDto[];

  @IsInt()
  @Min(0)
  @Max(20)
  kerfMm!: number;

  @IsInt()
  @Min(0)
  profilePricePerMeter!: number;

  @IsInt()
  @Min(500)
  @Max(6000)
  glassSheetWidthMm!: number;

  @IsInt()
  @Min(500)
  @Max(6000)
  glassSheetHeightMm!: number;

  @IsInt()
  @Min(0)
  glassPricePerSqm!: number;

  @IsInt()
  @Min(0)
  hardwarePricePerWindow!: number;

  @IsInt()
  @Min(0)
  laborPricePerSqm!: number;

  @IsInt()
  @Min(0)
  @Max(300)
  profitRate!: number;
}

export class DimensionRulesDto {
  @IsInt()
  @Min(20)
  @Max(180)
  frameFaceWidthMm!: number;

  @IsInt()
  @Min(20)
  @Max(180)
  mullionFaceWidthMm!: number;

  @IsInt()
  @Min(20)
  @Max(180)
  sashFaceWidthMm!: number;

  @IsInt()
  @Min(0)
  @Max(200)
  frameDeductionMm!: number;

  @IsInt()
  @Min(0)
  @Max(200)
  mullionDeductionMm!: number;

  @IsInt()
  @Min(0)
  @Max(200)
  glassDeductionMm!: number;

  @IsInt()
  @Min(0)
  @Max(80)
  glassInstallGapMm!: number;

  @IsInt()
  @Min(0)
  @Max(200)
  sashDeductionMm!: number;
}

export class InventoryItemDto {
  @IsString()
  materialCode!: string;

  @IsIn(["profile", "glass", "hardware", "scrap"])
  materialType!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lengthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  heightMm?: number;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ProductionTaskDto {
  @IsString()
  orderId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  priority?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateProductionTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  priority?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
