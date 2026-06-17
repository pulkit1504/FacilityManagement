type SlaChipProps = {
  days: number;
};

export function SlaChip({ days }: SlaChipProps) {
  const bucket = slaBucket(days);
  return <span className={`badge ${bucket.tone}`}>{bucket.label}</span>;
}

export function slaBucket(days: number) {
  if (days >= 8) return { label: `${days} days | Escalation due`, tone: "danger" as const };
  if (days >= 3) return { label: `${days} days | 3-7 days`, tone: "warning" as const };
  return { label: `${days} days | 0-2 days`, tone: "success" as const };
}
