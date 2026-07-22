# Build từ thư mục gốc của monorepo:
#   docker build -f apps/backend/Dockerfile -t cafe-music-backend .
#
# Chọn Dockerfile thay vì Nixpacks vì workspace pnpm cần build
# @cafe-music/shared trước backend và cần prisma generate — làm tay để
# thứ tự build và nội dung image là xác định, không phụ thuộc suy đoán.

FROM node:22-alpine AS base
# openssl: Prisma query engine cần; libc6-compat: binary glibc chạy trên musl
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /app

# ── Rút gọn workspace xuống đúng phần backend cần ────────────────────────────
FROM base AS pruner
COPY . .
RUN pnpm exec turbo prune @cafe-music/backend --docker

# ── Cài dependency + build ───────────────────────────────────────────────────
FROM base AS builder
# Copy manifest trước để layer cài dependency được cache khi source đổi
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @cafe-music/backend exec prisma generate
# turbo tự build @cafe-music/shared trước nhờ dependsOn ["^build"]
RUN pnpm turbo build --filter=@cafe-music/backend

# ── Image chạy thật ──────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Không chạy bằng root
RUN addgroup -S nodejs -g 1001 && adduser -S nestjs -u 1001 -G nodejs

# Giữ nguyên cả cây /app: node_modules của pnpm là symlink vào .pnpm store,
# copy lẻ từng thư mục sẽ làm đứt liên kết.
COPY --from=builder --chown=nestjs:nodejs /app /app

COPY --chown=nestjs:nodejs apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nestjs

# Railway inject PORT lúc chạy; giá trị này chỉ là mặc định khi chạy local
ENV PORT=4000
EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
