import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

const PUBLIC_GET_PREFIXES = ["/api/health", "/api/customers", "/api/orders", "/api/materials", "/api/templates", "/api/inventory", "/api/production", "/api/exports/files"];
const PUBLIC_POST_PREFIXES = ["/api/auth/login"];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;
    if ((request.method === "GET" || request.method === "HEAD") && PUBLIC_GET_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
    if (request.method === "POST" && PUBLIC_POST_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;

    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("请先登录后再保存或导出。");
    try {
      this.jwt.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException("登录已过期，请重新登录。");
    }
  }
}
