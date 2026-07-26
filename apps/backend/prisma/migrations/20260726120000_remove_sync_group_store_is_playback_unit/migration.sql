-- Bỏ tầng SyncGroup: quán (`Store`) trở thành đơn vị phát nhạc.
--
-- SyncGroup và Store trùng chức năng (mỗi nhóm thực tế chỉ phục vụ một quán),
-- nên trạng thái phát dời thẳng về Store và khái niệm override/rejoin biến mất
-- — không còn nhóm thì không có gì để tách ra hay quay về.

-- CreateEnum
CREATE TYPE "PlaybackStatus" AS ENUM ('PLAYING', 'PAUSED', 'STOPPED');

-- Lịch phát cũ trỏ vào sync group. Không có cách map 1-1 sang quán (một nhóm
-- có thể gồm nhiều quán), và tính năng lịch chưa được dùng thật — xoá sạch rồi
-- dựng lại theo quán, thay vì để migration chết vì cột NOT NULL không có giá trị.
DELETE FROM "PlaylistSchedule";

-- DropForeignKey
ALTER TABLE "PlaylistSchedule" DROP CONSTRAINT "PlaylistSchedule_syncGroupId_fkey";

-- DropForeignKey
ALTER TABLE "Store" DROP CONSTRAINT "Store_syncGroupId_fkey";

-- DropForeignKey
ALTER TABLE "StoreOverride" DROP CONSTRAINT "StoreOverride_storeId_fkey";

-- DropIndex
DROP INDEX "PlaylistSchedule_syncGroupId_idx";

-- AlterTable
ALTER TABLE "PlaylistSchedule" DROP COLUMN "syncGroupId",
ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Store" DROP COLUMN "syncGroupId",
ADD COLUMN     "currentTrackId" TEXT,
ADD COLUMN     "startedAtTs" BIGINT,
ADD COLUMN     "status" "PlaybackStatus" NOT NULL DEFAULT 'STOPPED',
ADD COLUMN     "trackIndex" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "StoreOverride";

-- DropTable
DROP TABLE "SyncGroup";

-- DropEnum
DROP TYPE "SyncGroupStatus";

-- DropEnum
DROP TYPE "SyncMode";

-- CreateIndex
CREATE INDEX "PlaylistSchedule_storeId_idx" ON "PlaylistSchedule"("storeId");

-- AddForeignKey
ALTER TABLE "PlaylistSchedule" ADD CONSTRAINT "PlaylistSchedule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
