export function historicalWorkOrder(date: string, sequence: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("วันที่รับสินค้าหรือลำดับใบงานไม่ถูกต้อง");
  return `JN-${date.replaceAll("-", "")}${String(sequence).padStart(3, "0")}PE`;
}
