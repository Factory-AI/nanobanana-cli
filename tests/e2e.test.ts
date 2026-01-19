import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("CLI e2e", () => {
  test("shows help with --help", async () => {
    const result = await $`bun run cli.ts --help`.text();
    expect(result).toContain("nanobanana");
    expect(result).toContain("generate");
    expect(result).toContain("GEMINI_API_KEY");
  });

  test("shows help with -h", async () => {
    const result = await $`bun run cli.ts -h`.text();
    expect(result).toContain("nanobanana");
  });

  test("shows help with no args", async () => {
    const result = await $`bun run cli.ts`.text();
    expect(result).toContain("nanobanana");
  });

  test("tips command shows general tips", async () => {
    const result = await $`bun run cli.ts tips`.text();
    expect(result).toContain("Tips");
    expect(result).toContain("Be specific");
  });

  test("tips generate shows generate tips", async () => {
    const result = await $`bun run cli.ts tips generate`.text();
    expect(result).toContain("generate");
    expect(result).toContain("--count");
    expect(result).toContain("Styles");
  });

  test("tips edit shows edit tips", async () => {
    const result = await $`bun run cli.ts tips edit`.text();
    expect(result).toContain("edit");
    expect(result).toContain("Modify");
  });

  test("tips unknown shows error", async () => {
    const result = await $`bun run cli.ts tips unknown`.text();
    expect(result).toContain("Unknown");
    expect(result).toContain("Available");
  });

  test("generate without prompt shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "cli.ts", "generate"], {
      stderr: "pipe",
      env: { ...process.env, GEMINI_API_KEY: "test" },
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("provide a prompt");
  });

  test("edit without file shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "cli.ts", "edit"], {
      stderr: "pipe",
      env: { ...process.env, GEMINI_API_KEY: "test" },
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("Usage");
  });

  test("restore without file shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "cli.ts", "restore"], {
      stderr: "pipe",
      env: { ...process.env, GEMINI_API_KEY: "test" },
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(stderr).toContain("Usage");
  });
});
