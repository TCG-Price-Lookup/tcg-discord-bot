/**
 * Quick line-chart URL builder backed by quickchart.io.
 *
 * We deliberately use the URL-based service here so the bot stays
 * dependency-free at install time — no native canvas, no headless
 * Chrome, no separate render service to keep alive. The trade-off is
 * a soft external dependency on quickchart.io. If self-hosting matters
 * to you, swap this module for `@napi-rs/canvas` and return a Buffer
 * instead of a URL — the rest of the bot only cares about a string.
 *
 * Reference: https://quickchart.io/documentation/
 */

/** Maximum URL length we'll generate. quickchart accepts much longer, */
/** but Discord caps embed image URLs around 2KB. */
const MAX_URL_LENGTH = 1900;

export interface PriceChartPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Price in USD, or null if there's a gap that day. */
  price: number | null;
}

export interface PriceChartOptions {
  title: string;
  points: PriceChartPoint[];
  /** Width in px. Discord caches images, so consistent sizing helps. */
  width?: number;
  height?: number;
}

/**
 * Build a line chart URL with the given points.
 *
 * Returns null if the points array is empty or every point is null —
 * caller should fall back to a text-only embed in that case.
 */
export function buildPriceChartUrl(opts: PriceChartOptions): string | null {
  const { title, points } = opts;
  const width = opts.width ?? 800;
  const height = opts.height ?? 400;

  // Filter to a clean line — quickchart can handle nulls but the
  // resulting chart looks messy when most points are missing.
  const clean = points.filter((p) => p.price !== null);
  if (clean.length === 0) return null;

  const config = {
    type: "line",
    data: {
      labels: clean.map((p) => p.date),
      datasets: [
        {
          label: title,
          data: clean.map((p) => p.price),
          borderColor: "rgb(147, 51, 234)", // brand purple
          backgroundColor: "rgba(147, 51, 234, 0.15)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: title,
          color: "#e2e8f0",
          font: { size: 18, weight: "bold" },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxTicksLimit: 8 },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
        },
        y: {
          ticks: {
            color: "#94a3b8",
            // The leading $ is rendered by chart.js as a callback —
            // since we can't pass functions through JSON, we accept
            // the default numeric ticks. The footer below the chart
            // labels the axis as USD.
          },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
        },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  const url = `https://quickchart.io/chart?width=${width}&height=${height}&backgroundColor=%231e1b2e&c=${encoded}`;

  if (url.length > MAX_URL_LENGTH) {
    // The points array is too dense — downsample by taking every Nth.
    const factor = Math.ceil(url.length / MAX_URL_LENGTH);
    const downsampled = clean.filter((_, i) => i % factor === 0);
    return buildPriceChartUrl({
      ...opts,
      points: downsampled,
    });
  }

  return url;
}

/**
 * Compute a "price changed by X% over the period" summary string.
 *
 * Used in the embed footer to give users a quick verdict without
 * staring at the chart axes.
 */
export function priceChangeSummary(points: PriceChartPoint[]): string | null {
  const clean = points.filter((p) => p.price !== null);
  if (clean.length < 2) return null;
  const first = clean[0]!.price!;
  const last = clean[clean.length - 1]!.price!;
  if (first === 0) return null;
  const pct = ((last - first) / first) * 100;
  const arrow = pct >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct).toFixed(1)}% over the period (${first.toFixed(2)} → ${last.toFixed(2)} USD)`;
}
