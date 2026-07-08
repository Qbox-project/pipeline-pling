#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretsFile = join(rootDir, ".secrets");
const workflowFile = join(rootDir, ".github", "workflows", "discord-push.yml");
const fixtures = [
  { label: "push", path: join(rootDir, "fixtures", "push.json") },
  { label: "push-anon", path: join(rootDir, "fixtures", "push-anon.json") },
  { label: "push-coauthors", path: join(rootDir, "fixtures", "push-coauthors.json") },
];

function fail(message) {
  console.error(`\nact:test failed: ${message}\n`);
  process.exit(1);
}

function runAct(fixture) {
  console.log(`\n=== act: ${fixture.label} (${fixture.path}) ===\n`);

  const result = spawnSync(
    "act",
    [
      "push",
      "-W",
      workflowFile,
      "--eventpath",
      fixture.path,
      "--secret-file",
      secretsFile,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  if (result.error) {
    fail(
      `could not run act (${result.error.message}). Install act: https://github.com/nektos/act`,
    );
  }

  if (result.status !== 0) {
    fail(`act exited with status ${result.status} for fixture "${fixture.label}"`);
  }

  console.log(`\n=== passed: ${fixture.label} ===\n`);
}

if (!existsSync(secretsFile)) {
  fail(
    [
      "missing .secrets file.",
      "Create one from the example and add your Discord webhook URL:",
      "  Copy-Item .secrets.example .secrets",
      "  notepad .secrets",
      "The .secrets file is gitignored; do not commit real webhook URLs.",
    ].join("\n"),
  );
}

for (const fixture of fixtures) {
  if (!existsSync(fixture.path)) {
    fail(`missing fixture file: ${fixture.path}`);
  }
}

if (!existsSync(workflowFile)) {
  fail(`missing workflow file: ${workflowFile}`);
}

console.log("Running Discord push workflow locally with act...");
console.log(`Workflow: ${workflowFile}`);
console.log(`Secrets:  ${secretsFile}`);
console.log(`Fixtures: ${fixtures.map((fixture) => fixture.label).join(", ")}`);

for (const fixture of fixtures) {
  runAct(fixture);
}

console.log("All act fixtures passed.");
