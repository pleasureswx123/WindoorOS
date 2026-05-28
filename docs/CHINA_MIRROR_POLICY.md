# WindoorOS 国内镜像源强制规范

版本：v1.0  
日期：2026-05-27

## 1. 目标

WindoorOS 的前端、后端、Worker、Docker、CI、测试、导出服务、移动端构建中，所有第三方依赖下载必须优先使用国内镜像源。

本规范是强制要求，不是建议。

## 2. 适用范围

适用于：

- 本地开发
- Dockerfile
- Docker Compose
- CI/CD
- 前端依赖安装
- 后端依赖安装
- Python 算法服务，若引入
- Android/Java 构建，若引入
- Playwright 浏览器下载
- 系统包安装

## 3. 禁止项

禁止：

- 在项目脚本中直接使用 `https://registry.npmjs.org`
- 在 Dockerfile 中直接使用默认国外 apt/apk 源
- 在 CI 中不设置 registry 就安装依赖
- 使用 `latest` 基础镜像
- 在 README 中给出默认国外源安装命令
- 绕过项目镜像配置私自安装依赖

## 4. Node.js 包管理

### 4.1 `.npmrc`

项目根目录必须提交：

```ini
registry=https://registry.npmmirror.com
strict-peer-dependencies=false
auto-install-peers=true

sass_binary_site=https://npmmirror.com/mirrors/node-sass/
sharp_binary_host=https://npmmirror.com/mirrors/sharp
sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips
electron_mirror=https://npmmirror.com/mirrors/electron/
playwright_download_host=https://npmmirror.com/mirrors/playwright/
```

### 4.2 pnpm

推荐包管理器：pnpm。

本地初始化：

```bash
corepack enable
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

CI 校验：

```bash
test "$(pnpm config get registry)" = "https://registry.npmmirror.com/"
```

### 4.3 yarn

若必须使用 Yarn，项目根目录必须提交 `.yarnrc.yml`：

```yaml
npmRegistryServer: "https://registry.npmmirror.com"
```

## 5. Docker 镜像源

### 5.1 Docker daemon

开发机和构建机必须配置 `/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerproxy.com"
  ],
  "features": {
    "buildkit": true
  }
}
```

Windows Docker Desktop 需要在 Docker Engine 配置中设置同等内容。

### 5.2 基础镜像规则

必须：

- 固定版本，例如 `node:22.11.0-bookworm-slim`
- 禁止 `node:latest`
- 禁止 `postgres:latest`
- 禁止 `redis:latest`

推荐：

- 企业环境使用 Harbor 缓存基础镜像。
- CI 只从企业镜像仓库拉取基础镜像。

## 6. Debian/Ubuntu apt 源

### 6.1 Debian bookworm

Dockerfile 示例：

```dockerfile
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's/security.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
```

### 6.2 Ubuntu

Dockerfile 示例：

```dockerfile
RUN sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list \
  && sed -i 's/security.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
```

## 7. Alpine apk 源

```dockerfile
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
  && apk add --no-cache ca-certificates curl
```

## 8. Python pip 源

如引入 Python 算法服务，必须提交 `pip.conf`：

```ini
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
trusted-host = pypi.tuna.tsinghua.edu.cn
timeout = 120
```

Dockerfile 示例：

```dockerfile
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn
```

## 9. Maven/Gradle 源

如引入 Android、Java 或 Kotlin，必须配置阿里云 Maven。

Gradle 示例：

```kotlin
pluginManagement {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
    }
}
```

## 10. Playwright

Playwright 浏览器必须从国内镜像下载：

```bash
PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/ pnpm exec playwright install --with-deps
```

若在 Docker 中安装：

```dockerfile
ENV PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/
RUN pnpm exec playwright install chromium
```

## 11. 推荐 Dockerfile 模板

```dockerfile
FROM node:22.11.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/

RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's/security.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
```

## 12. CI 强制校验

CI 第一阶段必须执行：

```bash
set -e

NPM_REGISTRY="$(npm config get registry)"
PNPM_REGISTRY="$(pnpm config get registry)"

test "$NPM_REGISTRY" = "https://registry.npmmirror.com/"
test "$PNPM_REGISTRY" = "https://registry.npmmirror.com/"

grep -R "registry.npmjs.org" . && exit 1 || true
grep -R "deb.debian.org" infra apps packages Dockerfile* && exit 1 || true
grep -R "archive.ubuntu.com" infra apps packages Dockerfile* && exit 1 || true
```

## 13. README 约束

README 中只能出现国内源安装命令。

允许：

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

禁止：

```bash
npm install
```

除非前面已经明确设置国内 registry。

## 14. 例外流程

如果某个依赖国内镜像暂时不可用：

1. 必须记录原因。
2. 必须由项目负责人批准。
3. 必须优先考虑企业内部缓存。
4. 不能把国外源写死进代码库。
5. 必须在问题解决后恢复国内源。

## 15. 验收标准

镜像源规范验收：

- 根目录存在 `.npmrc`。
- Dockerfile 替换 apt/apk 源。
- CI 校验 registry。
- Playwright 使用 `PLAYWRIGHT_DOWNLOAD_HOST`。
- Python/Java 依赖若存在，必须配置国内源。
- 全仓库搜索不得出现未经解释的国外默认源。
