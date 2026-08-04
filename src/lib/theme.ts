export const THEME_COLORS = ["#25B7A5", "#7CC77A", "#B47CE0", "#F09EBB", "#F0A85C", "#5C9CF0", "#4FC3B5", "#E27ABE"];

export function applyThemeColor(color?: string | null) {
  if (typeof document === "undefined") return;
  const c = color || "#25B7A5";
  document.documentElement.style.setProperty(
    "--bg-gradient",
    `linear-gradient(180deg, ${c}33 0%, #ffffff 45%, ${c}26 100%)`,
  );
}
