# Tech Defaults — Cafe Music

Nền tảng phát nhạc đồng bộ cho chuỗi quán cafe. Monorepo TypeScript (pnpm + Turborepo).

## Kiến trúc

| App/Package | Path | Stack | Vai trò |
|---|---|---|---|
| Backend | `apps/backend` | NestJS 11, Prisma 6, Redis (ioredis), Socket.IO | API `/api/v1` (port 4000), modules: auth, organizations, stores, users, tracks, playlists, sync, scheduler |
| Web | `apps/web` | Next.js App Router | `dashboard/*` (quản trị), `player/[storeId]` (trang phát nhạc) — port 3000 |
| Shared | `packages/shared` | Zod schemas, types, constants | Dùng chung backend/web |

Chi tiết setup/local dev đầy đủ: `docs/DEVELOPER_GUIDE.md`.

## Hạ tầng dev (`docker-compose.yml`)

| Service | URL/Port | Mục đích |
|---|---|---|
| PostgreSQL | `localhost:5432` | Database chính |
| PostgreSQL (test) | `localhost:5433` | Integration tests (tmpfs) |
| Redis | `localhost:6379` | Sync state, pub/sub |
| MinIO | `http://localhost:9000` (console `:9001`) | S3-compatible storage cho track self-hosted |

```bash
docker compose up -d
pnpm install
pnpm dev              # tất cả apps qua turbo
curl http://localhost:4000/api/v1/health
```

## Yêu cầu tối thiểu

Node.js >= 20 LTS, pnpm >= 11, Python 3.x (dùng cho script skill `ui-ux-pro-max`, xem `.claude/rules/design.md`).
