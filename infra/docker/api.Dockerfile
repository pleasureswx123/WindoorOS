FROM node:22.11.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/

RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's/security.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && pnpm config set registry https://registry.npmmirror.com

WORKDIR /app
COPY .npmrc package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/algorithms/package.json packages/algorithms/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @windooros/api build

EXPOSE 3001
CMD ["pnpm", "--filter", "@windooros/api", "start"]
