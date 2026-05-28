# WindoorOS

门窗小老板使用的量尺、绘图、算料、切割和报价系统。

## 国内镜像源

本项目强制使用国内镜像源。首次开发前执行：

```bash
corepack enable
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

Playwright 下载必须使用：

```bash
$env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright/"
```

## 本地开发

启动基础设施：

```bash
docker compose -f infra/compose.yaml up -d
pnpm --filter @windooros/api prisma:push
```

启动前后端：

```bash
pnpm dev
```

访问：

- Web: http://127.0.0.1:5173
- API health: http://127.0.0.1:3001/api/health
- PostgreSQL: 127.0.0.1:55432
- Redis: 127.0.0.1:56379
- MinIO console: http://127.0.0.1:59001

## 验证

```bash
pnpm lint:mirrors
pnpm test
pnpm typecheck
pnpm build
```
