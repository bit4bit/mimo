import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

function extractFunction(source: string, functionName: string): string {
  const signature = `function ${functionName}`;
  const start = source.indexOf(signature);
  if (start < 0) {
    throw new Error(`Function not found: ${functionName}`);
  }

  let braceStart = source.indexOf("{", start);
  if (braceStart < 0) {
    throw new Error(`Function body not found: ${functionName}`);
  }

  let depth = 1;
  let cursor = braceStart + 1;
  while (cursor < source.length && depth > 0) {
    const char = source[cursor];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
    cursor += 1;
  }

  if (depth !== 0) {
    throw new Error(`Unable to parse function: ${functionName}`);
  }

  return source.slice(start, cursor);
}

describe("impact dependency renderer", () => {
  it("formats added and removed dependency lines with grouped files", () => {
    const chatPath = join(process.cwd(), "public/js/chat.js");
    const source = readFileSync(chatPath, "utf8");
    const fnSource = extractFunction(source, "renderDependencyChanges");

    const renderDependencyChanges = new Function(
      `${fnSource}; return renderDependencyChanges;`,
    )() as (dependencies: {
      added: Array<{ source: string; target: string; files: string[] }>;
      removed: Array<{ source: string; target: string; files: string[] }>;
    }) => string;

    const html = renderDependencyChanges({
      added: [
        {
          source: "src/components",
          target: "src/utils",
          files: ["src/components/Button.tsx", "src/components/Form.tsx"],
        },
      ],
      removed: [
        {
          source: "src/services",
          target: "src/api",
          files: ["src/services/user.ts"],
        },
      ],
    });

    expect(html).toContain("+ src/components → src/utils");
    expect(html).toContain("- src/services → src/api");
    expect(html).toContain("└── src/components/Button.tsx");
    expect(html).toContain("└── src/services/user.ts");
  });
});
