export const VegBadge = ({ type, size = 16, className = "" }) => {
  if (!type) return null;
  const color = type === "non_veg" ? "#b3391f" : type === "egg" ? "#c98a00" : "#3a7d34";
  const label = type === "non_veg" ? "Non-veg" : type === "egg" ? "Contains egg" : "Veg";
  const dot = Math.round(size * 0.42);
  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`veg-badge-${type}`}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, border: `1.5px solid ${color}`, borderRadius: 3 }}
    >
      <span style={{ width: dot, height: dot, borderRadius: "50%", background: color }} />
    </span>
  );
};
