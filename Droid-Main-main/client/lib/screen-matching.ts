export interface Point {
  x: number;
  y: number;
}

export function calculateEuclideanDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getAlignmentStatus(
  drift: number,
  threshold = 15
): "aligned" | "drifting" | "critical" {
  if (drift <= threshold) return "aligned";
  if (drift <= threshold * 2.5) return "drifting";
  return "critical";
}

export function calculateAccuracyPercentage(drift: number, maxDrift = 100): number {
  if (drift <= 0) return 100;
  if (drift >= maxDrift) return 0;
  return Math.round((1 - drift / maxDrift) * 100);
}
