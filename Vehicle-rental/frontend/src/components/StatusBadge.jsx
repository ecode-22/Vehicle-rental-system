export default function StatusBadge({ status, label }) {
  return <span className={`badge ${status}`}>{label ?? status}</span>;
}
