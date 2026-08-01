-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "storeId" TEXT;

-- CreateIndex
CREATE INDEX "Track_organizationId_storeId_idx" ON "Track"("organizationId", "storeId");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
