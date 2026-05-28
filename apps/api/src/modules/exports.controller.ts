import { Body, Controller, Get, Header, Inject, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { StoreService } from "./store.service";

@Controller("exports")
export class ExportsController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Post("quote")
  quote(@Body() body: { orderId: string }) {
    return this.store.createExport("quote", body);
  }

  @Post("quote/pdf")
  quotePdf(@Body() body: { orderId: string }) {
    return this.store.createPdfExport(body);
  }

  @Post("quote/excel")
  quoteExcel(@Body() body: { orderId: string }) {
    return this.store.createExcelExport(body);
  }

  @Get("files/:fileName")
  @Header("Content-Type", "text/html; charset=utf-8")
  file(@Param("fileName") fileName: string, @Res() res: Response) {
    return res.sendFile(this.store.getExportFilePath(fileName));
  }

  @Get(":taskId")
  detail(@Param("taskId") taskId: string) {
    return this.store.getExport(taskId);
  }
}
