export type CheckIntervalParts = {
  years: number;
  months: number;
  days: number;
};

const DEFAULT_INTERVAL_PARTS: CheckIntervalParts = {
  years: 0,
  months: 0,
  days: 7,
};

const CHECK_INTERVAL_PATTERN = /(\d+)\s*(year|years|month|months|week|weeks|day|days)/gi;

function toSafeWholeNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function normalizeCheckIntervalParts(parts: CheckIntervalParts): CheckIntervalParts {
  return {
    years: toSafeWholeNumber(parts.years),
    months: toSafeWholeNumber(parts.months),
    days: toSafeWholeNumber(parts.days),
  };
}

export function hasCheckIntervalValue(parts: CheckIntervalParts): boolean {
  const normalized = normalizeCheckIntervalParts(parts);
  return normalized.years > 0 || normalized.months > 0 || normalized.days > 0;
}

export function parseCheckIntervalParts(interval?: string | null): CheckIntervalParts {
  if (!interval) return { ...DEFAULT_INTERVAL_PARTS };

  const parts: CheckIntervalParts = {
    years: 0,
    months: 0,
    days: 0,
  };

  let matched = false;
  for (const match of interval.matchAll(CHECK_INTERVAL_PATTERN)) {
    matched = true;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (unit.startsWith('year')) {
      parts.years += amount;
    } else if (unit.startsWith('month')) {
      parts.months += amount;
    } else if (unit.startsWith('week')) {
      parts.days += amount * 7;
    } else if (unit.startsWith('day')) {
      parts.days += amount;
    }
  }

  if (!matched) return { ...DEFAULT_INTERVAL_PARTS };
  return normalizeCheckIntervalParts(parts);
}

export function formatCheckInterval(parts: CheckIntervalParts): string {
  const normalized = normalizeCheckIntervalParts(parts);
  const segments: string[] = [];

  if (normalized.years > 0) {
    segments.push(`${normalized.years} ${normalized.years === 1 ? 'year' : 'years'}`);
  }
  if (normalized.months > 0) {
    segments.push(`${normalized.months} ${normalized.months === 1 ? 'month' : 'months'}`);
  }
  if (normalized.days > 0) {
    segments.push(`${normalized.days} ${normalized.days === 1 ? 'day' : 'days'}`);
  }

  return segments.join(' ');
}

export function checkIntervalPartsToDays(parts: CheckIntervalParts): number {
  const normalized = normalizeCheckIntervalParts(parts);
  return normalized.years * 365 + normalized.months * 30 + normalized.days;
}

export function parseCheckIntervalDays(interval: string): number {
  return checkIntervalPartsToDays(parseCheckIntervalParts(interval));
}