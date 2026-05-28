import { Body, Controller, Inject, Post } from "@nestjs/common";
import { LoginDto } from "./dto";
import { StoreService } from "./store.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.store.login(dto.phone);
  }
}
