export function signatureViewBox(paths: string[]): string {
  const points = paths.flatMap(path => [...path.matchAll(/[ML]\s+(\d+)\s+(\d+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) })));
  if (!points.length) return "0 0 300 500";
  const minX = Math.max(0, Math.min(...points.map(point => point.x)) - 12);
  const minY = Math.max(0, Math.min(...points.map(point => point.y)) - 12);
  const maxX = Math.min(300, Math.max(...points.map(point => point.x)) + 12);
  const maxY = Math.min(500, Math.max(...points.map(point => point.y)) + 12);
  return `${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`;
}
