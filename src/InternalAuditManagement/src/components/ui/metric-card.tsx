type MetricCardProps = {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
};

export function MetricCard({ label, value, tone = "success" }: MetricCardProps) {
  return (
    <section className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <span className={`badge ${tone}`}>{tone === "success" ? "On track" : tone === "warning" ? "Needs attention" : "Critical"}</span>
    </section>
  );
}
