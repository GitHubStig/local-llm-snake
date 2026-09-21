/**
 * Every SVG in `assets/icons`, as raw markup.
 *
 * Relative pattern, never an alias: an unregistered alias makes Vite warn,
 * exit 0, and leave a literal call in the bundle that throws at runtime
 * (ADR-0010).
 */
const modules = import.meta.glob("../assets/icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, svg]) => [path.split("/").pop()?.slice(0, -4) ?? path, svg]),
);

/** Hand-written so the call site gets autocomplete (ADR-0011). */
export type IconName = "play" | "pause" | "step" | "restart" | "sun" | "moon" | "monitor";

if (import.meta.env.DEV) {
  const declared: IconName[] = ["play", "pause", "step", "restart", "sun", "moon", "monitor"];
  const found = Object.keys(ICONS);
  const missing = declared.filter((n) => !found.includes(n));
  const extra = found.filter((n) => !declared.includes(n as IconName));
  if (missing.length || extra.length) {
    console.warn("[icons] IconName is out of step with assets/icons", {
      missing,
      extra,
    });
  }
}
