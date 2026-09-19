import { readFileSync } from "node:fs";

// Layout geometry (window chrome, lyrics breathing room and button offsets) is
// intentionally separate from the seven decorative spacing steps.
const geometry = new Set([50, 56, 58, 64, 70, 90, 100, 120]);
const files = ["src/styles.css", "src/platform/android.css"];
const issues = [];
for (const file of files) {
  const css = readFileSync(file, "utf8");
  for (const match of css.matchAll(
    /(?:^|[;{])\s*(font-size|(?:row-|column-)?gap|padding(?:-[a-z]+)?|border-radius)\s*:\s*([^;{}]+);/gm,
  )) {
    const [, property, value] = match;
    if (property === "font-size" && !value.includes("var(--font-"))
      issues.push(`${file}: ${property}: ${value}`);
    for (const dimension of value.matchAll(/(?<![\w.-])(\d+)px/g)) {
      const n = Number(dimension[1]);
      if (value.includes("calc(") || value.includes("clamp(")) continue;
      if (property.startsWith("padding") && geometry.has(n)) continue;
      issues.push(`${file}: ${property}: ${value} bypasses the shared scale`);
    }
  }
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "UI token audit passed: typography, gaps, radii and decorative padding use shared tokens.",
  );
