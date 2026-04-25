// Timeline 時間軸 scale 與 tick 生成。所有日期計算使用 UTC，避免本地時區誤差。

const MS_PER_DAY = 86400000;

function parseDateOnly(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function formatIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

// 線性 scale：domainStart..domainEnd → rangeStart..rangeEnd。
// 回傳的 fn 接受 ISO date 字串，回傳 range 內的 px。
// domainStart === domainEnd 時退化為固定回傳 rangeStart（避免除以零）。
export function scaleTime(
  domainStart: string,
  domainEnd: string,
  rangeStart: number,
  rangeEnd: number,
): (date: string) => number {
  const start = parseDateOnly(domainStart);
  const end = parseDateOnly(domainEnd);
  if (!start || !end) {
    return () => rangeStart;
  }
  const domainSpan = end.getTime() - start.getTime();
  const rangeSpan = rangeEnd - rangeStart;
  if (domainSpan <= 0) {
    return () => rangeStart;
  }
  return (date: string) => {
    const d = parseDateOnly(date);
    if (!d) return rangeStart;
    const ratio = (d.getTime() - start.getTime()) / domainSpan;
    return rangeStart + ratio * rangeSpan;
  };
}

export interface TickSet {
  major: string[];
  minor: string[];
}

// 找下一個週一（含當日）
function nextMonday(from: Date): Date {
  const dow = from.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const offset = dow === 0 ? 1 : (8 - dow) % 7;
  return addDays(from, offset);
}

// 找下一個月 1 日（含當日 1 日）
function nextMonthFirst(from: Date): Date {
  if (from.getUTCDate() === 1) return from;
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

// 找下一個季度起始月 (1, 4, 7, 10) 的 1 日
function nextQuarterFirst(from: Date): Date {
  const month = from.getUTCMonth();
  const quarterStart = month - (month % 3);
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), quarterStart, 1));
  if (candidate.getTime() >= from.getTime() && from.getUTCDate() === 1 && from.getUTCMonth() === quarterStart) {
    return candidate;
  }
  return new Date(Date.UTC(from.getUTCFullYear(), quarterStart + 3, 1));
}

// 依 domain 跨度自動切換 tick 密度。回傳 ISO date 字串陣列。
// 規則對齊 design D3：
//   < 14 天：每日 major
//   14-60 天：每週一 major
//   60-365 天：每月 1 日 major + 每週一 minor
//   > 365 天：每季 major + 每月 minor
export function generateTicks(domainStart: string, domainEnd: string): TickSet {
  const start = parseDateOnly(domainStart);
  const end = parseDateOnly(domainEnd);
  if (!start || !end || end.getTime() < start.getTime()) {
    return { major: [], minor: [] };
  }
  const span = diffDays(start, end);
  const major: string[] = [];
  const minor: string[] = [];

  if (span < 14) {
    let cur = start;
    while (cur.getTime() <= end.getTime()) {
      major.push(formatIso(cur));
      cur = addDays(cur, 1);
    }
    return { major, minor };
  }

  if (span < 60) {
    let cur = nextMonday(start);
    while (cur.getTime() <= end.getTime()) {
      major.push(formatIso(cur));
      cur = addDays(cur, 7);
    }
    return { major, minor };
  }

  if (span < 365) {
    let curMonth = nextMonthFirst(start);
    while (curMonth.getTime() <= end.getTime()) {
      major.push(formatIso(curMonth));
      curMonth = new Date(Date.UTC(curMonth.getUTCFullYear(), curMonth.getUTCMonth() + 1, 1));
    }
    let curWeek = nextMonday(start);
    while (curWeek.getTime() <= end.getTime()) {
      const iso = formatIso(curWeek);
      // 跳過同日已是 major 的 tick
      if (curWeek.getUTCDate() !== 1) {
        minor.push(iso);
      }
      curWeek = addDays(curWeek, 7);
    }
    return { major, minor };
  }

  // > 365 天：季 major + 月 minor
  let curQuarter = nextQuarterFirst(start);
  while (curQuarter.getTime() <= end.getTime()) {
    major.push(formatIso(curQuarter));
    curQuarter = new Date(Date.UTC(curQuarter.getUTCFullYear(), curQuarter.getUTCMonth() + 3, 1));
  }
  let curMonth = nextMonthFirst(start);
  while (curMonth.getTime() <= end.getTime()) {
    const month = curMonth.getUTCMonth();
    if (month % 3 !== 0) {
      minor.push(formatIso(curMonth));
    }
    curMonth = new Date(Date.UTC(curMonth.getUTCFullYear(), curMonth.getUTCMonth() + 1, 1));
  }
  return { major, minor };
}

// 給定一組 ISO 日期，回傳最早與最晚（已過濾 null/invalid）。空輸入回 null。
export function dateRange(dates: (string | null | undefined)[]): { min: string; max: string } | null {
  const valid = dates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort();
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

// padding 工具：前後各加 N 天，保持 domain 不貼齊 bar 端點
export function padDomain(min: string, max: string, days: number): { min: string; max: string } {
  const start = parseDateOnly(min);
  const end = parseDateOnly(max);
  if (!start || !end) return { min, max };
  return {
    min: formatIso(addDays(start, -days)),
    max: formatIso(addDays(end, days)),
  };
}

// 對外暴露一個格式化 tick label 的 helper（依 span 決定要顯示啥）。
// span 來自 domain 的天數，與 generateTicks 的判斷一致。
export function formatTickLabel(iso: string, spanDays: number): string {
  const d = parseDateOnly(iso);
  if (!d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  if (spanDays < 14) return `${monthName} ${day}`;
  if (spanDays < 60) return `${monthName} ${day}`;
  if (spanDays < 365) return monthName;
  // > 365: 季 label，例如 "Q2 2026"
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${year}`;
}

export const internals = {
  parseDateOnly,
  formatIso,
  addDays,
  diffDays,
  nextMonday,
  nextMonthFirst,
  nextQuarterFirst,
};
