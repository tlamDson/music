/**
 * JSON.stringify không hỗ trợ BigInt (Prisma trả BigInt cho các cột @db.BigInt,
 * vd Store.startedAtTs) — thiếu patch này mọi response chứa BigInt sẽ 500.
 */
export function installBigIntJsonSupport(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => string };
  if (!proto.toJSON) {
    proto.toJSON = function (this: bigint) {
      return this.toString();
    };
  }
}
