#!/usr/bin/env node
// Package the OnlineJourno Installer into a downloadable zip.
// Usage: node scripts/package.mjs

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = join(DIST, "onlinejourno-installer.zip");

const INCLUDE = [
  "index.html",
  "installer.css",
  "installer.js",
  "server.mjs",
  "start.sh",
  "start.bat",
  "README.md",
  "package.json",
];

async function main() {
  await mkdir(DIST, { recursive: true });

  try {
    execFileSync("zip", ["-r", OUT, ...INCLUDE], { cwd: ROOT, stdio: "inherit" });
    console.log(`Created ${OUT}`);
    return;
  } catch {
    console.log("System `zip` not available; falling back to archiver.");
  }

  // Fallback: use archiver if installed.
  const archiver = await import("archiver").then((m) => m.default).catch(() => null);
  if (!archiver) {
    console.error("Install `archiver` to package without system `zip`: npm install -D archiver");
    process.exit(1);
  }

  const output = createWriteStream(OUT);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
  archive.pipe(output);

  for (const file of INCLUDE) {
    archive.file(join(ROOT, file), { name: file });
  }

  await archive.finalize();
  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
  });

  console.log(`Created ${OUT} (${archive.pointer()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
