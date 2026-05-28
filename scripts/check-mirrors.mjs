import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const blocked = [
  "registry.npmjs.org",
  "deb.debian.org",
  "archive.ubuntu.com",
  "security.ubuntu.com",
  "dl-cdn.alpinelinux.org"
];
const allowFiles = new Set([
  "docs/CHINA_MIRROR_POLICY.md",
  "docs/TECHNICAL_DESIGN.md",
  "infra/docker/api.Dockerfile",
  "infra/docker/web.Dockerfile",
  "scripts/check-mirrors.mjs"
]);

function walk(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      const rel = path.slice(root.length + 1).replaceAll("\\", "/");
      if (["node_modules", ".git", "dist", "coverage"].includes(name)) return [];
      if (statSync(path).isDirectory()) return walk(path);
      return [rel];
    });
}

const failures = [];
for (const file of walk(root)) {
  if (allowFiles.has(file)) continue;
  const text = readFileSync(join(root, file), "utf8");
  for (const word of blocked) {
    if (text.includes(word)) failures.push(`${file}: contains ${word}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Mirror policy check passed.");
