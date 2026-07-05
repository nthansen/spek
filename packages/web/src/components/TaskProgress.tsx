interface TaskProgressProps {
  completed: number;
  total: number;
  /** 精簡模式：固定寬度的小條，供群組變體列並排比較（如 3/4 vs 2/4） */
  compact?: boolean;
}

export function TaskProgress({ completed, total, compact = false }: TaskProgressProps) {
  if (total === 0) {
    return compact ? null : <span className="text-text-muted text-sm">No tasks</span>;
  }

  const percent = Math.round((completed / total) * 100);

  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <div
        className={`${compact ? "w-16" : "flex-1"} h-2 bg-bg-tertiary rounded-full overflow-hidden`}
      >
        <div
          className={`h-full rounded-full transition-all ${completed === total ? "bg-green-500" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={`text-text-secondary whitespace-nowrap ${compact ? "text-xs" : "text-sm"}`}
      >
        {completed} / {total}
      </span>
    </div>
  );
}
