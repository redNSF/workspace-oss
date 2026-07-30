import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = join(root, "src");
const migrationsRoot = join(root, "supabase", "migrations");

async function collectFiles(directory, allowedExtensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, allowedExtensions)));
    } else if (allowedExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

const migrationFiles = (await collectFiles(migrationsRoot, new Set([".sql"]))).sort();
const sourceFiles = await collectFiles(sourceRoot, new Set([".ts", ".tsx"]));

const migrationText = (
  await Promise.all(migrationFiles.map((file) => readFile(file, "utf8")))
).join("\n");

const schemaTables = new Set(
  matches(migrationText, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi),
);
const schemaFunctions = new Set(
  matches(
    migrationText,
    /create\s+or\s+replace\s+function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi,
  ),
);
const rlsTables = new Set(
  matches(
    migrationText,
    /alter\s+table\s+public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
  ),
);

const referencedTables = new Map();
const referencedFunctions = new Map();

for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  const displayPath = relative(root, file);

  for (const table of matches(text, /\.from\(\s*["']([a-z_][a-z0-9_]*)["']\s*\)/gi)) {
    const references = referencedTables.get(table) ?? new Set();
    references.add(displayPath);
    referencedTables.set(table, references);
  }

  for (const fn of matches(text, /\.rpc\(\s*["']([a-z_][a-z0-9_]*)["']/gi)) {
    const references = referencedFunctions.get(fn) ?? new Set();
    references.add(displayPath);
    referencedFunctions.set(fn, references);
  }
}

const errors = [];

for (const [table, files] of referencedTables) {
  if (!schemaTables.has(table)) {
    errors.push(
      `Table "${table}" is referenced by ${[...files].join(", ")} but is not created by a migration.`,
    );
  }
}

for (const [fn, files] of referencedFunctions) {
  if (!schemaFunctions.has(fn)) {
    errors.push(
      `RPC "${fn}" is referenced by ${[...files].join(", ")} but is not created by a migration.`,
    );
  }
}

for (const table of schemaTables) {
  if (!rlsTables.has(table)) {
    errors.push(`Table "${table}" is created without enabling Row Level Security.`);
  }
}

if (errors.length > 0) {
  console.error("Schema contract validation failed:\n");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `Schema contract valid: ${schemaTables.size} tables, ${schemaFunctions.size} functions, ` +
      `${referencedTables.size} referenced tables, ${referencedFunctions.size} referenced RPCs.`,
  );
}
