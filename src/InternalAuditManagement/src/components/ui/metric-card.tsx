type MetricCardProps = {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
  active?: boolean;
  onClick?: () => void;
};

export function MetricCard({ label, value, tone = "success", active = false, onClick }: MetricCardProps) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <span className={`badge ${tone}`}>{tone === "success" ? "On track" : tone === "warning" ? "Needs attention" : "Critical"}</span>
    </>
  );

  if (onClick) {
    return (
      <button className={`card metric metric-action${active ? " active" : ""}`} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <section className="card metric">{content}</section>;
}
