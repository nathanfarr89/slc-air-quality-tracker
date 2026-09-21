const TZ = 'America/Denver';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function mtParts(ms: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFmt.formatToParts(ms)) p[type] = Number(value);
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

/**
 * The instant re-expressed as a UTC timestamp whose UTC fields equal Mountain wall-clock time.
 * Chart libraries that only render UTC or "local" time then show Utah time for every viewer.
 */
export function mtWallMs(ms: number): number {
  const p = mtParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in Mountain time. */
export function mtDateKey(ms: number): string {
  const p = mtParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DD HH:mm` wall-clock string (what Plotly wants for timezone-free axes). */
export function mtWallString(ms: number): string {
  const p = mtParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

export const formatMtDateTime = (ms: number) => dateTimeFmt.format(ms);
export const formatMtTime = (ms: number) => timeFmt.format(ms);

export const celsiusToF = (c: number) => (c * 9) / 5 + 32;
export const round1 = (n: number) => Math.round(n * 10) / 10;
