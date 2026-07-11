/**
 * 時間軸要用的日期工具。
 *
 * 這三個函式在 spek web 的 `utils/lifecycle.ts` 裡也有一份 —— 但那個檔案還有 web 專用的
 * `formatLifecycleListRow` / `formatLifecycleBanner`（list row 與 detail banner 的文案），
 * 而套件不該把宿主的文案一起吞進來。
 *
 * **套件必須自足**（它不能 import 宿主的任何東西），因此這裡自帶一份純函式。web 的
 * `utils/lifecycle.ts` 維持原樣不動 —— 抽出套件不該連帶動到它其餘的使用者。
 */

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseDateOnly(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // 用 UTC 構造避免本地時區造成隔日跳動
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function daysBetween(a: string, b: string): number {
  const da = parseDateOnly(a);
  const db = parseDateOnly(b);
  if (!da || !db) return 0;
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / 86400000);
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatShortDate(iso: string): string {
  const d = parseDateOnly(iso);
  if (!d) return iso;
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
