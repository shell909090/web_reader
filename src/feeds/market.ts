export type Market = {
  question: string;
  slug: string;
  outcomePrices: string;
  outcomes: string;
  volumeNum: number;
  endDateIso?: string;
  description?: string;
  resolutionSource?: string;
  active: boolean;
  closed: boolean;
};

/** Format a USD volume number as $XM, $XK, or $X. */
export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${Math.round(vol)}`;
}

/** Build the notes string from market fields. */
export function buildNotes(market: Market): string {
  const parts: string[] = [];

  try {
    const prices: string[] = JSON.parse(market.outcomePrices);
    const outcomes: string[] = JSON.parse(market.outcomes);
    if (
      outcomes.length === 2 &&
      outcomes[0] === 'Yes' &&
      outcomes[1] === 'No' &&
      prices.length >= 1
    ) {
      const pct = (parseFloat(prices[0]) * 100).toFixed(1);
      parts.push(`Yes: ${pct}%`);
    }
  } catch {
    // malformed JSON — skip probability
  }

  parts.push(`Vol: ${formatVolume(market.volumeNum)}`);

  if (market.endDateIso) parts.push(`Ends: ${market.endDateIso.slice(0, 10)}`);

  return parts.join(' · ');
}
