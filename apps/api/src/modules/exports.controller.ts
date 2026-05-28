import { Body, Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
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
  file(@Param("fileName") fileName: string, @Res() res: Response) {
    if (fileName.endsWith(".pdf")) {
      res.type("application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    } else if (fileName.endsWith(".xlsx")) {
      res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    } else {
      res.type("text/html; charset=utf-8");
    }
    return res.sendFile(this.store.getExportFilePath(fileName));
  }

  @Get(":taskId")
  detail(@Param("taskId") taskId: string) {
    return this.store.getExport(taskId);
  }
}
