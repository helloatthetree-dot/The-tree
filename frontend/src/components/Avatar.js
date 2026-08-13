export function Avatar({ user, size = 36, className = "" }) {
  const name = user?.name || "?";
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const style = { width: size, height: size, minWidth: size };
  if (user?.picture) {
    return (
      <img
        src={user.picture}
        alt={name}
        style={style}
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover border border-komorebi-border ${className}`}
      />
    );
  }
  return (
    <span
      style={style}
      className={`rounded-full bg-komorebi-green text-white grid place-items-center font-semibold ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials}</span>
    </span>
  );
}
