import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { AuthController } from "./auth.controller";
import { StoreService } from "./store.service";
import { CustomersController } from "./customers.controller";
import { OrdersController } from "./orders.controller";
import { ExportsController } from "./exports.controller";
import { MaterialsController } from "./materials.controller";
import { PrismaService } from "./prisma.service";
import { AuthGuard } from "./auth.guard";
import { InventoryController } from "./inventory.controller";
import { ProductionController } from "./production.controller";
import { TemplatesController } from "./templates.controller";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "windooros-dev-secret",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [AppController, AuthController, CustomersController, OrdersController, ExportsController, MaterialsController, InventoryController, ProductionController, TemplatesController],
  providers: [
    StoreService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard
    }
  ]
})
export class AppModule {}
