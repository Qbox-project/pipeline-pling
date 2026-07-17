#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretsFile = join(rootDir, ".secrets");
const workflowsDir = join(rootDir, ".github", "workflows");
const fixturesDir = join(rootDir, "fixtures");

/** @type {{ label: string; description: string; workflow: string; fixture: string }[]} */
const scenarios = [
  {
    label: "push",
    description: "default inputs — multi-commit push with linked authors",
    workflow: "discord-push.yml",
    fixture: "push.json",
  },
  {
    label: "push-anon",
    description: "default inputs — keyword anonymization (!anon)",
    workflow: "discord-push.yml",
    fixture: "push-anon.json",
  },
  {
    label: "push-coauthors",
    description: "default inputs — co-authored commits",
    workflow: "discord-push.yml",
    fixture: "push-coauthors.json",
  },
  {
    label: "push-name-anon",
    description: "name-anon-users — sender + authors anonymized, commits visible",
    workflow: "discord-push-name-anon.yml",
    fixture: "push-name-anon.json",
  },
  {
    label: "push-full-anon",
    description: "full-anon-users — mixed push with full commit redaction",
    workflow: "discord-push-full-anon.yml",
    fixture: "push-full-anon.json",
  },
  {
    label: "push-custom",
    description: "accent-color + use-sender-avatar/use-repo-username disabled",
    workflow: "discord-push-custom.yml",
    fixture: "push.json",
  },
];

function fail(message) {
  console.error(`\nact:test failed: ${message}\n`);
  process.exit(1);
}

function runAct(scenario) {
  const workflowFile = join(workflowsDir, scenario.workflow);
  const fixturePath = join(fixturesDir, scenario.fixture);

  console.log(`\n=== act: ${scenario.label} ===`);
  console.log(`Scenario:  ${scenario.description}`);
  console.log(`Workflow:  ${workflowFile}`);
  console.log(`Fixture:   ${fixturePath}\n`);

  const result = spawnSync(
    "act",
    [
      "push",
      "-W",
      workflowFile,
      "--eventpath",
      fixturePath,
      "--secret-file",
      secretsFile,
      "--use-gitignore=false",
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
    fail(`act exited with status ${result.status} for scenario "${scenario.label}"`);
  }

  console.log(`\n=== passed: ${scenario.label} ===\n`);
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

for (const scenario of scenarios) {
  const workflowFile = join(workflowsDir, scenario.workflow);
  const fixturePath = join(fixturesDir, scenario.fixture);

  if (!existsSync(workflowFile)) {
    fail(`missing workflow file: ${workflowFile}`);
  }

  if (!existsSync(fixturePath)) {
    fail(`missing fixture file: ${fixturePath}`);
  }
}

console.log("Building dist...");
const buildResult = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (buildResult.error) {
  fail(`could not run npm run build (${buildResult.error.message})`);
}

if (buildResult.status !== 0) {
  fail(`npm run build exited with status ${buildResult.status}`);
}

console.log("Running Discord push workflow locally with act...");
console.log(`Secrets: ${secretsFile}`);
console.log(`Scenarios (${scenarios.length}):`);
for (const scenario of scenarios) {
  console.log(`  - ${scenario.label}: ${scenario.description}`);
}

for (const scenario of scenarios) {
  runAct(scenario);
}

console.log("All act scenarios passed.");
