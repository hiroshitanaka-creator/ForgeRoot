import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const skillsRoot = path.join(repoRoot, ".agents", "skills");
const allowedFrontmatterKeys = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
]);
const maxSkillNameLength = 64;
const maxDescriptionLength = 1024;

const errors = [];

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

function unquoteScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(skillPath, content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`${normalizePath(skillPath)}: missing YAML frontmatter`);
    return null;
  }

  const frontmatter = new Map();
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim() || /^\s/.test(line)) {
      continue;
    }

    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) {
      errors.push(
        `${normalizePath(skillPath)}:${index + 2}: unsupported frontmatter line`,
      );
      continue;
    }

    frontmatter.set(field[1], unquoteScalar(field[2]));
  }

  return frontmatter;
}

function validateFrontmatter(skillDir, skillPath, frontmatter) {
  if (!frontmatter) {
    return null;
  }

  for (const key of frontmatter.keys()) {
    if (!allowedFrontmatterKeys.has(key)) {
      errors.push(
        `${normalizePath(skillPath)}: unexpected frontmatter key "${key}"`,
      );
    }
  }

  const name = frontmatter.get("name")?.trim() ?? "";
  const description = frontmatter.get("description")?.trim() ?? "";

  if (!name) {
    errors.push(`${normalizePath(skillPath)}: missing "name"`);
  } else {
    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push(`${normalizePath(skillPath)}: invalid skill name "${name}"`);
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      errors.push(`${normalizePath(skillPath)}: invalid hyphen use in "${name}"`);
    }
    if (name.length > maxSkillNameLength) {
      errors.push(`${normalizePath(skillPath)}: skill name is too long`);
    }
    if (path.basename(skillDir) !== name) {
      errors.push(
        `${normalizePath(skillPath)}: skill name must match directory name`,
      );
    }
  }

  if (!description) {
    errors.push(`${normalizePath(skillPath)}: missing "description"`);
  } else {
    if (description.includes("<") || description.includes(">")) {
      errors.push(`${normalizePath(skillPath)}: description contains angle brackets`);
    }
    if (description.length > maxDescriptionLength) {
      errors.push(`${normalizePath(skillPath)}: description is too long`);
    }
  }

  return name || null;
}

function yamlScalar(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "m"));
  return match ? unquoteScalar(match[1]) : "";
}

function validateOpenAiYaml(skillDir, skillName) {
  const yamlPath = path.join(skillDir, "agents", "openai.yaml");
  if (!existsSync(yamlPath)) {
    errors.push(`${normalizePath(yamlPath)}: missing agents/openai.yaml`);
    return;
  }

  const content = readUtf8(yamlPath);
  if (!content.includes("interface:")) {
    errors.push(`${normalizePath(yamlPath)}: missing interface block`);
  }

  const displayName = yamlScalar(content, "display_name");
  const shortDescription = yamlScalar(content, "short_description");
  const defaultPrompt = yamlScalar(content, "default_prompt");

  if (!displayName) {
    errors.push(`${normalizePath(yamlPath)}: missing display_name`);
  }
  if (!shortDescription) {
    errors.push(`${normalizePath(yamlPath)}: missing short_description`);
  }
  if (!defaultPrompt) {
    errors.push(`${normalizePath(yamlPath)}: missing default_prompt`);
  } else if (!defaultPrompt.includes(`$${skillName}`)) {
    errors.push(
      `${normalizePath(yamlPath)}: default_prompt must mention $${skillName}`,
    );
  }
}

function validateReferencedResources(skillDir, skillPath, content) {
  const resourcePattern = /`((?:references|templates|scripts|agents)\/[^`]+)`/g;
  for (const match of content.matchAll(resourcePattern)) {
    const resourcePath = match[1].replace(/[.,;:]+$/, "");
    const absolutePath = path.join(skillDir, ...resourcePath.split("/"));
    if (!existsSync(absolutePath)) {
      errors.push(
        `${normalizePath(skillPath)}: referenced resource is missing: ${resourcePath}`,
      );
    }
  }
}

function validateSkill(skillDir) {
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) {
    errors.push(`${normalizePath(skillDir)}: missing SKILL.md`);
    return;
  }

  const content = readUtf8(skillPath);
  const frontmatter = parseFrontmatter(skillPath, content);
  const skillName = validateFrontmatter(skillDir, skillPath, frontmatter);
  validateReferencedResources(skillDir, skillPath, content);

  if (skillName) {
    validateOpenAiYaml(skillDir, skillName);
  }
}

if (!existsSync(skillsRoot)) {
  errors.push(`${normalizePath(skillsRoot)}: skills root does not exist`);
} else {
  const skillDirs = readdirSync(skillsRoot)
    .map((entry) => path.join(skillsRoot, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .sort();

  if (skillDirs.length === 0) {
    errors.push(`${normalizePath(skillsRoot)}: no skills found`);
  }

  for (const skillDir of skillDirs) {
    validateSkill(skillDir);
  }
}

if (errors.length > 0) {
  console.error("Skill validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Skill validation passed.");
