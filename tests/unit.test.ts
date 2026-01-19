import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  parseArgs,
  isBase64,
  genFilename,
  ensureOutputDir,
  findFile,
  showHelp,
  showTips,
  TIPS,
  OUTPUT_DIR,
} from "../lib";

describe("parseArgs", () => {
  test("parses positional arguments", () => {
    const result = parseArgs(["hello", "world"]);
    expect(result.pos).toEqual(["hello", "world"]);
    expect(result.flags).toEqual({});
  });

  test("parses long flags with values", () => {
    const result = parseArgs(["--count=4", "--styles=modern,minimal"]);
    expect(result.pos).toEqual([]);
    expect(result.flags).toEqual({ count: "4", styles: "modern,minimal" });
  });

  test("parses long flags without values as true", () => {
    const result = parseArgs(["--preview"]);
    expect(result.flags).toEqual({ preview: "true" });
  });

  test("parses short flags", () => {
    const result = parseArgs(["-p"]);
    expect(result.flags).toEqual({ p: "true" });
  });

  test("parses mixed arguments", () => {
    const result = parseArgs(["generate", "a cat", "--count=2", "-p"]);
    expect(result.pos).toEqual(["generate", "a cat"]);
    expect(result.flags).toEqual({ count: "2", p: "true" });
  });
});

describe("isBase64", () => {
  test("returns false for empty string", () => {
    expect(isBase64("")).toBe(false);
  });

  test("returns false for short strings", () => {
    expect(isBase64("SGVsbG8=")).toBe(false);
  });

  test("returns false for invalid base64", () => {
    expect(isBase64("a".repeat(2000) + "!!!")).toBe(false);
  });

  test("returns true for valid long base64", () => {
    const validBase64 = "A".repeat(2000);
    expect(isBase64(validBase64)).toBe(true);
  });

  test("returns true for base64 with padding", () => {
    const validBase64 = "A".repeat(1998) + "==";
    expect(isBase64(validBase64)).toBe(true);
  });
});

describe("genFilename", () => {
  const testDir = path.join(process.cwd(), "test-output-" + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("generates filename from prompt", () => {
    const filename = genFilename("a beautiful sunset", 0, testDir);
    expect(filename).toBe("a_beautiful_sunset.png");
  });

  test("removes special characters", () => {
    const filename = genFilename("hello! @world# $test", 0, testDir);
    expect(filename).toBe("hello_world_test.png");
  });

  test("truncates long prompts to 32 chars", () => {
    const longPrompt = "a".repeat(100);
    const filename = genFilename(longPrompt, 0, testDir);
    expect(filename.length).toBeLessThanOrEqual(36); // 32 + ".png"
  });

  test("handles empty prompt", () => {
    const filename = genFilename("", 0, testDir);
    expect(filename).toBe("image.png");
  });

  test("increments filename if exists", () => {
    fs.writeFileSync(path.join(testDir, "test.png"), "");
    const filename = genFilename("test", 0, testDir);
    expect(filename).toBe("test_1.png");
  });

  test("uses index for initial increment", () => {
    const filename = genFilename("test", 3, testDir);
    expect(filename).toBe("test.png"); // First file, no increment needed
  });
});

describe("ensureOutputDir", () => {
  const testDir = path.join(process.cwd(), "test-ensure-" + Date.now());

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("creates output directory if not exists", () => {
    const outputPath = ensureOutputDir(testDir);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(outputPath).toBe(path.join(testDir, OUTPUT_DIR));
  });

  test("returns existing directory without error", () => {
    const outputPath1 = ensureOutputDir(testDir);
    const outputPath2 = ensureOutputDir(testDir);
    expect(outputPath1).toBe(outputPath2);
  });
});

describe("findFile", () => {
  const testDir = path.join(process.cwd(), "test-find-" + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("returns null for non-existent file", () => {
    expect(findFile("nonexistent-file-12345.png")).toBe(null);
  });

  test("finds file with absolute path", () => {
    const filePath = path.join(testDir, "test.png");
    fs.writeFileSync(filePath, "test");
    expect(findFile(filePath)).toBe(filePath);
  });
});

describe("showHelp", () => {
  test("returns help text", () => {
    const help = showHelp();
    expect(help).toContain("nanobanana");
    expect(help).toContain("generate");
    expect(help).toContain("edit");
    expect(help).toContain("GEMINI_API_KEY");
  });
});

describe("showTips", () => {
  test("returns general tips without command", () => {
    const tips = showTips();
    expect(tips).toContain("Tips");
    expect(tips).toContain("generate");
    expect(tips).toContain("Be specific");
  });

  test("returns command-specific tips", () => {
    const tips = showTips("generate");
    expect(tips).toContain("generate");
    expect(tips).toContain("--count");
  });

  test("returns error for unknown command", () => {
    const tips = showTips("unknown");
    expect(tips).toContain("Unknown");
  });

  test("has tips for all commands", () => {
    const commands = ["generate", "edit", "restore", "icon", "pattern", "diagram", "story"];
    for (const cmd of commands) {
      expect(TIPS[cmd]).toBeDefined();
      expect(TIPS[cmd].length).toBeGreaterThan(50);
    }
  });
});
