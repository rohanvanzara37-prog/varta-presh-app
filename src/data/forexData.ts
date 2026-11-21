export interface GoldHistoryPoint {
  date: string;
  rate: number;
}

export function buildXauGoldSeries(days: number, spotPrice: number): GoldHistoryPoint[] {
  const points: GoldHistoryPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const cycle =
      Math.sin(i * 0.28) * 26 +
      Math.cos(i * 0.65) * 11 -
      ((days - 1 - i) / Math.max(1, days - 1) - 0.6) * 42;
    const rate = i === 0 ? spotPrice : Number((spotPrice + cycle).toFixed(2));
    points.push({
      date: d.toISOString().slice(0, 10),
      rate,
    });
  }
  return points;
}
