import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  await cp(resolve(root, file), resolve(dist, file));
}

await cp(resolve(root, "public"), dist, { recursive: true });

const indexPath = resolve(dist, "index.html");
const css = await readFile(resolve(root, "styles.css"), "utf8");
const index = await readFile(indexPath, "utf8");
await writeFile(
  indexPath,
  index.replace(/<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/>/, `<style>\n${css}\n    </style>`),
  "utf8"
);
