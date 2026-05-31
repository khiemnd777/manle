#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, ".agents", "skills");
const agentsDir = path.join(root, ".codex", "agents");

const errors = [];
const warnings = [];
let skillNames = new Set();

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
  skillNames = new Set(
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

    const metadataFile = path.join(skillsDir, skillName, "agents", "openai.yaml");
    const relativeMetadataFile = path.relative(root, metadataFile);
    if (!existsSync(metadataFile)) {
      fail(`${relativeMetadataFile}: missing skill interface metadata`);
    } else {
      const metadataText = readFileSync(metadataFile, "utf8");
      const displayName = metadataText.match(/^\s*display_name:\s*"([^"]+)"/m)?.[1];
      const shortDescription = metadataText.match(/^\s*short_description:\s*"([^"]+)"/m)?.[1];
      const defaultPrompt = metadataText.match(/^\s*default_prompt:\s*"([^"]+)"/m)?.[1];

      if (!metadataText.startsWith("interface:\n")) {
        fail(`${relativeMetadataFile}: metadata must start with interface block`);
      }

      if (!displayName) {
        fail(`${relativeMetadataFile}: missing interface display_name`);
      } else if (!displayName.startsWith("MANLE ")) {
        fail(`${relativeMetadataFile}: display_name should use MANLE branding`);
      }

      if (!shortDescription) {
        fail(`${relativeMetadataFile}: missing interface short_description`);
      }

      if (!defaultPrompt) {
        fail(`${relativeMetadataFile}: missing interface default_prompt`);
      } else if (!defaultPrompt.includes(`$${skillName}`)) {
        fail(`${relativeMetadataFile}: default_prompt should reference $${skillName}`);
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
  const referencedSkillNames = new Set();

  for (const fileName of agentFiles) {
    const file = path.join(agentsDir, fileName);
    const relativeFile = path.relative(root, file);
    const text = readFileSync(file, "utf8");
    const expectedName = fileName.replace(/\.toml$/, "");
    const declaredName = text.match(/^name = "([^"]+)"/m)?.[1];
    const description = text.match(/^description = "([^"]+)"/m)?.[1];
    const sandboxMode = text.match(/^sandbox_mode = "([^"]+)"/m)?.[1];
    const developerInstructions = text.match(/^developer_instructions = """\n([\s\S]*?)\n"""/m)?.[1]?.trim();
    const skillPaths = [...text.matchAll(/path = "([^"]+)"/g)].map((match) => match[1]);

    if (!declaredName) {
      fail(`${relativeFile}: missing agent name`);
    } else if (declaredName !== expectedName) {
      fail(`${relativeFile}: agent name "${declaredName}" does not match file "${expectedName}"`);
    }

    if (!description) {
      fail(`${relativeFile}: missing agent description`);
    } else if (description.length < 80) {
      warn(`${relativeFile}: description is short; routing coverage may be weak`);
    }

    if (sandboxMode !== "read-only" && sandboxMode !== "workspace-write") {
      fail(`${relativeFile}: sandbox_mode must be read-only or workspace-write`);
    }

    if (!developerInstructions) {
      fail(`${relativeFile}: missing developer_instructions block`);
    }

    if (skillPaths.length === 0) {
      warn(`${relativeFile}: no skills configured`);
    }

    const seenSkillPaths = new Set();
    for (const skillPath of skillPaths) {
      if (seenSkillPaths.has(skillPath)) {
        fail(`${relativeFile}: duplicate skill path: ${skillPath}`);
      }
      seenSkillPaths.add(skillPath);

      if (!existsSync(path.join(root, skillPath))) {
        fail(`${relativeFile}: configured skill path does not exist: ${skillPath}`);
      }

      const skillName = skillPath.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/)?.[1];
      if (skillName) {
        referencedSkillNames.add(skillName);
      }
    }
  }

  for (const skillName of [...skillNames].sort()) {
    if (!referencedSkillNames.has(skillName)) {
      warn(`.agents/skills/${skillName}/SKILL.md: skill is not referenced by any .codex/agents subagent`);
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

console.log(`Validated MANLE skills and agents in ${path.relative(root, skillsDir)} and ${path.relative(root, agentsDir)}.`);
