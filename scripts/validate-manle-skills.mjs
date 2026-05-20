#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, ".agents", "skills");
const agentsDir = path.join(root, ".codex", "agents");

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function parseFrontmatter(file, text) {
  if (!text.startsWith("---\n")) {
    fail(`${file}: missing YAML frontmatter`);
    return null;
  }

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    fail(`${file}: unterminated YAML frontmatter`);
    return null;
  }

  const raw = text.slice(4, end).trim();
  const fields = new Map();
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      fail(`${file}: unsupported frontmatter line "${line}"`);
      continue;
    }

    const [, key, value] = match;
    if (fields.has(key)) {
      fail(`${file}: duplicate frontmatter key "${key}"`);
    }
    fields.set(key, value.replace(/^"|"$/g, ""));
  }

  for (const key of fields.keys()) {
    if (key !== "name" && key !== "description") {
      fail(`${file}: unexpected frontmatter key "${key}"`);
    }
  }

  if (!fields.get("name")) {
    fail(`${file}: missing frontmatter name`);
  }

  if (!fields.get("description")) {
    fail(`${file}: missing frontmatter description`);
  }

  return fields;
}

if (!existsSync(skillsDir)) {
  fail(`missing skills directory: ${path.relative(root, skillsDir)}`);
} else {
  const skillNames = new Set(
    readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

  for (const skillName of [...skillNames].sort()) {
    const file = path.join(skillsDir, skillName, "SKILL.md");
    const relativeFile = path.relative(root, file);

    if (!existsSync(file)) {
      fail(`${relativeFile}: missing SKILL.md`);
      continue;
    }

    const text = readFileSync(file, "utf8");
    const fields = parseFrontmatter(relativeFile, text);
    const declaredName = fields?.get("name");

    if (declaredName && declaredName !== skillName) {
      fail(`${relativeFile}: frontmatter name "${declaredName}" does not match folder "${skillName}"`);
    }

    if (!/^[a-z0-9-]+$/.test(skillName)) {
      fail(`${relativeFile}: skill folder must be lowercase hyphen-case`);
    }

    if (skillName.length >= 64) {
      fail(`${relativeFile}: skill name must be under 64 characters`);
    }

    const description = fields?.get("description") ?? "";
    if (description.length < 80) {
      warn(`${relativeFile}: description is short; trigger coverage may be weak`);
    }

    const references = [...text.matchAll(/\$([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g)].map((match) => match[1]);
    for (const reference of references) {
      if (reference.startsWith("manle-") && !skillNames.has(reference)) {
        fail(`${relativeFile}: unknown skill reference $${reference}`);
      }
    }
  }
}

for (const requiredPath of [
  "CONTEXT.md",
  "docs/agents/domain.md",
  "docs/agents/triage-labels.md",
  "docs/agents/issue-slices.md",
  "docs/agents/handoff.md",
  "docs/adr/0000-template.md",
]) {
  if (!existsSync(path.join(root, requiredPath))) {
    fail(`missing required agent document: ${requiredPath}`);
  }
}

if (existsSync(agentsDir)) {
  const agentFiles = readdirSync(agentsDir)
    .filter((fileName) => fileName.endsWith(".toml"))
    .sort();

  for (const fileName of agentFiles) {
    const file = path.join(agentsDir, fileName);
    const relativeFile = path.relative(root, file);
    const text = readFileSync(file, "utf8");
    const skillPaths = [...text.matchAll(/path = "([^"]+)"/g)].map((match) => match[1]);

    for (const skillPath of skillPaths) {
      if (!existsSync(path.join(root, skillPath))) {
        fail(`${relativeFile}: configured skill path does not exist: ${skillPath}`);
      }
    }
  }
}

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`Validated MANLE skills in ${path.relative(root, skillsDir)}.`);
