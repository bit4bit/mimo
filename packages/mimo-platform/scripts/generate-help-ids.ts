#!/usr/bin/env bun
/**
 * Help ID Generation Script
 *
 * Scans JSX component files, finds interactive elements, injects data-help-id
 * attributes, and generates a skeleton help.yaml file.
 *
 * Usage:
 *   bun run scripts/generate-help-ids.ts
 *   bun run scripts/generate-help-ids.ts --dry-run
 *   bun run scripts/generate-help-ids.ts --verbose
 */

import { join, relative } from "path";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);
const SKIP_ATTRS = new Set(["type", "disabled", "readonly", "placeholder"]);

interface HelpIdEntry {
  id: string;
  component: string;
  tag: string;
  context?: string;
}

interface ParseResult {
  modified: string;
  entries: HelpIdEntry[];
}

function findJsxFiles(dir: string): string[] {
  const files: string[] = [];

  if (!statSync(dir).isDirectory()) {
    return [dir];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...findJsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".jsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function extractComponentName(filePath: string): string {
  const basename = filePath.split("/").pop() || "";
  return basename.replace(/\.(tsx|jsx)$/, "");
}

function extractContext(attrs: string[]): string {
  const idAttr = attrs.find(a => a.startsWith("id="));
  const classAttr = attrs.find(a => a.startsWith("class="));
  const nameAttr = attrs.find(a => a.startsWith("name="));

  if (idAttr) {
    const match = idAttr.match(/id="([^"]+)"/);
    if (match) return match[1];
  }
  if (classAttr) {
    const match = classAttr.match(/class="([^"]+)"/);
    if (match) {
      const classes = match[1].split(" ").filter(c => !c.startsWith("btn") && !c.startsWith("data-table"));
      if (classes.length > 0) return classes[0];
    }
  }
  if (nameAttr) {
    const match = nameAttr.match(/name="([^"]+)"/);
    if (match) return match[1];
  }

  return "";
}

function parseJsxFile(content: string, filePath: string): ParseResult {
  const componentName = toKebabCase(extractComponentName(filePath));
  const entries: HelpIdEntry[] = [];
  let modified = content;

  const tagRegex = /<([a-z]+)([^>]*?)(\/?)>/gi;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (!INTERACTIVE_TAGS.has(tag)) continue;

    const fullMatch = match[0];
    const attrsString = match[2];

    const hasDataHelpId = attrsString.includes("data-help-id");
    if (hasDataHelpId) continue;

    const existingAttrs: string[] = [];
    const attrRegex = /([a-zA-Z-]+)=(?:"([^"]*)"|'([^']*)')/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
      existingAttrs.push(`${attrMatch[1]}="${attrMatch[2] || attrMatch[3]}"`);
    }

    const context = extractContext(existingAttrs);
    const sectionPart = context ? `-${toKebabCase(context)}` : "";
    const helpId = `${componentName}${sectionPart}-${tag}`;

    entries.push({
      id: helpId,
      component: componentName,
      tag,
      context: context || undefined,
    });

    const newTag = `<${tag}${attrsString} data-help-id="${helpId}"${match[3] === "/" ? " /" : ""}>`;
    modified = modified.replace(fullMatch, newTag);
  }

  return { modified, entries };
}

function generateYamlSkeleton(entries: HelpIdEntry[]): string {
  const lines = ["# Help content for MIMO platform", "# Add descriptions for each help entry", "", ""];

  for (const entry of entries) {
    lines.push(`${entry.id}:`);
    lines.push(`  title: "${entry.tag.charAt(0).toUpperCase() + entry.tag.slice(1)} - ${entry.component}"`);
    lines.push(`  content: |`);
    lines.push(`    Add description for this ${entry.tag} element.`);
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");

  const componentsDir = join(process.cwd(), "src", "components");
  const jsxFiles = findJsxFiles(componentsDir);

  if (jsxFiles.length === 0) {
    console.log("No JSX files found in src/components/");
    return;
  }

  console.log(`Found ${jsxFiles.length} JSX files`);

  const allEntries: HelpIdEntry[] = [];
  const results: { file: string; entries: HelpIdEntry[]; modified: string }[] = [];

  for (const file of jsxFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const { modified, entries } = parseJsxFile(content, file);

      if (entries.length > 0) {
        results.push({ file, entries, modified });
        allEntries.push(...entries);
        if (verbose) {
          console.log(`  ${relative(process.cwd(), file)}: ${entries.length} entries`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`\nGenerated ${allEntries.length} help IDs`);

  for (const result of results) {
    if (dryRun) {
      console.log(`\nWould modify: ${relative(process.cwd(), result.file)}`);
    } else {
      writeFileSync(result.file, result.modified, "utf-8");
      console.log(`Modified: ${relative(process.cwd(), result.file)}`);
    }
  }

  const yamlPath = join(homedir(), ".mimo", "help.yaml.example");
  const skeleton = generateYamlSkeleton(allEntries);

  if (dryRun) {
    console.log(`\nWould create skeleton at: ${yamlPath}`);
  } else {
    const mimoDir = join(homedir(), ".mimo");
    try {
      writeFileSync(yamlPath, skeleton, "utf-8");
      console.log(`Created skeleton help.yaml at: ${yamlPath}`);
    } catch (error) {
      console.log(`\nSkeleton content (could not write to ${yamlPath}):`);
      console.log(skeleton);
    }
  }

  console.log("\nSummary:");
  console.log(`  Files processed: ${jsxFiles.length}`);
  console.log(`  Files modified: ${results.length}`);
  console.log(`  Total help IDs: ${allEntries.length}`);

  if (dryRun) {
    console.log("\n(Dry run - no files were actually modified)");
  }
}

main();