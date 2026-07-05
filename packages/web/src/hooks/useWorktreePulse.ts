import { useEffect, useState } from "react";
import { useActivity } from "../contexts/RefreshContext";

const PULSE_MS = 2000;

/**
 * 當最近一次 live-activity 的來源 worktree 落在 `memberKeys` 內時，短暫回傳 true，
 * 供元件套上 pulse class。快速連續變動時以最後一次 nonce 重新計時，不會 strobe。
 */
export function useWorktreePulse(memberKeys: string[]): boolean {
  const activity = useActivity();
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!activity) return;
    if (!memberKeys.includes(activity.worktree)) return;
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), PULSE_MS);
    return () => clearTimeout(timer);
    // 以 activity.nonce 為觸發：同 worktree 連續變動也會重新計時
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.nonce]);

  return pulsing;
}
