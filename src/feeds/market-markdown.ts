import { formatVolume, type Market } from './market.ts';

/** Render a Market as a Markdown string for detail mode. */
export function renderMarketMd(m: Market): string {
  const lines: string[] = [];
  lines.push(`# ${m.question}`);
  lines.push('');

  // Metadata line
  const meta: string[] = [];
  try {
    const prices: string[] = JSON.parse(m.outcomePrices);
    const outcomes: string[] = JSON.parse(m.outcomes);
    if (outcomes[0] === 'Yes' && prices[0]) {
      meta.push(`Yes: ${(parseFloat(prices[0]) * 100).toFixed(1)}%`);
    }
  } catch {
    /* skip */
  }
  meta.push(`Vol: ${formatVolume(m.volumeNum)}`);
  if (m.endDateIso) meta.push(`Ends: ${m.endDateIso.slice(0, 10)}`);
  lines.push(meta.join(' · '));
  lines.push('');

  // Description
  if (m.description?.trim()) {
    lines.push('## Description');
    lines.push('');
    lines.push(m.description.trim());
    lines.push('');
  }

  lines.push(...renderOutcomes(m));

  // Resolution source
  if (m.resolutionSource?.trim()) {
    lines.push('## Resolution');
    lines.push('');
    lines.push(m.resolutionSource.trim());
    lines.push('');
  }

  return lines.join('\n');
}

function renderOutcomes(m: Market): string[] {
  const lines: string[] = [];
  // Outcomes table
  try {
    const prices: string[] = JSON.parse(m.outcomePrices);
    const outcomes: string[] = JSON.parse(m.outcomes);
    if (outcomes.length > 0) {
      lines.push('## Outcomes');
      lines.push('');
      lines.push('| Outcome | Probability |');
      lines.push('|---------|-------------|');
      for (let i = 0; i < outcomes.length; i++) {
        const pct = prices[i] ? `${(parseFloat(prices[i]) * 100).toFixed(1)}%` : '—';
        lines.push(`| ${outcomes[i]} | ${pct} |`);
      }
      lines.push('');
    }
  } catch {
    /* skip */
  }

  return lines;
}
