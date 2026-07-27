#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretsFile = join(rootDir, ".secrets");
const workflowsDir = join(rootDir, ".github", "workflows");
const fixturesDir = join(rootDir, "fixtures");

/** @type {{ label: string; description: string; workflow: string; fixture: string; event?: string }[]} */
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
  {
    label: "push-repo-name",
    description: "repo-name override — webhook username and header label",
    workflow: "discord-push-repo-name.yml",
    fixture: "push.json",
  },
  {
    label: "push-hide-links",
    description: "hide-links — plain text, no View changes button",
    workflow: "discord-push-hide-links.yml",
    fixture: "push-coauthors.json",
  },
  {
    label: "push-compact",
    description: "compact-mode — consecutive commits without descriptions or authors",
    workflow: "discord-push-compact.yml",
    fixture: "push-coauthors.json",
  },
  {
    label: "push-branch-colors-main",
    description: "branch-colors — green accent for main",
    workflow: "discord-push-branch-colors.yml",
    fixture: "push.json",
  },
  {
    label: "push-branch-colors-develop",
    description: "branch-colors — red accent for develop",
    workflow: "discord-push-branch-colors.yml",
    fixture: "push-branch-develop.json",
  },
  {
    label: "push-branch-colors-fix",
    description: "branch-colors — orange accent for fix/* glob",
    workflow: "discord-push-branch-colors.yml",
    fixture: "push-branch-fix.json",
  },
  {
    label: "pull-request-opened",
    description: "default inputs — opened pull request card",
    workflow: "discord-pull-request.yml",
    fixture: "pull-request-opened.json",
    event: "pull_request_target",
  },
  {
    label: "pull-request-merged",
    description: "default inputs — merged pull request card",
    workflow: "discord-pull-request.yml",
    fixture: "pull-request-merged.json",
    event: "pull_request_target",
  },
  {
    label: "issue-opened",
    description: "default inputs — opened issue card",
    workflow: "discord-issue.yml",
    fixture: "issue-opened.json",
    event: "issues",
  },
  {
    label: "issue-closed",
    description: "default inputs — issue closed as completed",
    workflow: "discord-issue.yml",
    fixture: "issue-closed.json",
    event: "issues",
  },
  {
    label: "issue-not-planned",
    description: "default inputs — issue closed as not planned (grey accent)",
    workflow: "discord-issue.yml",
    fixture: "issue-not-planned.json",
    event: "issues",
  },
];

function fail(message) {
  console.error(`\nact:test failed: ${message}\n`);
  process.exit(1);
}

function selectScenarios(filters) {
  if (filters.length === 0) {
    return scenarios;
  }

  const selected = scenarios.filter((scenario) =>
    filters.some((filter) => scenario.label.includes(filter)),
  );

  if (selected.length === 0) {
    fail(
      [
        `no scenario label matched ${filters.join(", ")}.`,
        "Available labels:",
        ...scenarios.map((scenario) => `  ${scenario.label}`),
      ].join("\n"),
    );
  }

  return selected;
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
      scenario.event ?? "push",
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

const selectedScenarios = selectScenarios(process.argv.slice(2));

for (const scenario of selectedScenarios) {
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

console.log("Running Discord workflow scenarios locally with act...");
console.log(`Secrets: ${secretsFile}`);
console.log(`Scenarios (${selectedScenarios.length}):`);
for (const scenario of selectedScenarios) {
  console.log(`  - ${scenario.label}: ${scenario.description}`);
}

for (const scenario of selectedScenarios) {
  runAct(scenario);
}

console.log("All act scenarios passed.");
