import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { scripts } = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("package scripts", () => {
  it("every script that serves the app binds 127.0.0.1 only", () => {
    const serving = Object.entries(scripts).filter(([, command]) =>
      /\bnext (dev|start)\b/.test(command),
    );
    expect(serving.map(([name]) => name).sort()).toEqual(["dev", "start"]);
    for (const [name, command] of serving) {
      expect(command, name).toContain("--hostname 127.0.0.1");
    }
  });
});
