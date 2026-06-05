// SPDX-License-Identifier: AGPL-3.0-only
import type { FileService } from "../files/types.js";

const AT_MENTION_PATTERN = /(^|[\s])@([\S]+)/g;

export function parseAtMentions(message: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(AT_MENTION_PATTERN.source, AT_MENTION_PATTERN.flags);
  while ((match = regex.exec(message)) !== null) {
    paths.push(match[2]);
  }
  return [...new Set(paths)];
}

export async function resolveAtMentions(
  message: string,
  workspacePath: string,
  fileService: FileService,
): Promise<string> {
  const paths = parseAtMentions(message);
  if (paths.length === 0) return message;

  const fileBlocks: string[] = [];

  for (const filePath of paths) {
    try {
      const content = await fileService.readFile(workspacePath, filePath);
      fileBlocks.push(`<file path="${filePath}">\n${content}\n</file>`);
    } catch {
      // File doesn't exist — leave the @token as-is
    }
  }

  if (fileBlocks.length === 0) return message;

  return fileBlocks.join("\n\n") + "\n\n" + message;
}
