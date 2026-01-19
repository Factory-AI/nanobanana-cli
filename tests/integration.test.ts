import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { generate, edit, getApiKey } from "../lib";

const TEST_OUTPUT_DIR = path.join(process.cwd(), "test-integration-output");

// Check API key availability at module load time
let hasKey = false;
try {
  getApiKey();
  hasKey = true;
} catch {
  console.log("Skipping integration tests: no API key");
}

beforeAll(() => {
  if (hasKey) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe("Integration tests", () => {
  test.skipIf(!hasKey)("parallel generate tests", async () => {
    // Run 5 generate tests in parallel
    const results = await Promise.all([
      generate("a simple blue circle on white background", { outputDir: TEST_OUTPUT_DIR }),
      generate("a red square", { count: 2, outputDir: TEST_OUTPUT_DIR }),
      generate("a tree", { styles: ["watercolor"], outputDir: TEST_OUTPUT_DIR }),
      generate("settings gear, modern style app-icon, rounded corners", { outputDir: TEST_OUTPUT_DIR }),
      generate("login flow, flowchart diagram, professional style", { outputDir: TEST_OUTPUT_DIR }),
    ]);

    // Verify all results
    const [blueCircle, redSquares, tree, icon, diagram] = results;

    // Blue circle
    expect(blueCircle.length).toBe(1);
    expect(fs.existsSync(blueCircle[0])).toBe(true);
    expect(fs.statSync(blueCircle[0]).size).toBeGreaterThan(1000);

    // Red squares (count=2)
    expect(redSquares.length).toBe(2);
    for (const file of redSquares) {
      expect(fs.existsSync(file)).toBe(true);
    }

    // Tree with style
    expect(tree.length).toBe(1);
    expect(fs.existsSync(tree[0])).toBe(true);

    // Icon
    expect(icon.length).toBe(1);
    expect(fs.existsSync(icon[0])).toBe(true);

    // Diagram
    expect(diagram.length).toBe(1);
    expect(fs.existsSync(diagram[0])).toBe(true);

    console.log(`Generated ${results.flat().length} images in parallel`);
  }, 120000);

  test.skipIf(!hasKey)("edit modifies an existing image", async () => {
    // Generate then edit (sequential by necessity)
    const generated = await generate("a white cat", { outputDir: TEST_OUTPUT_DIR });
    expect(generated.length).toBe(1);

    const edited = await edit(generated[0], "add a red bow tie", { outputDir: TEST_OUTPUT_DIR });
    expect(edited.length).toBe(1);
    expect(fs.existsSync(edited[0])).toBe(true);
    expect(edited[0]).not.toBe(generated[0]);
  }, 120000);
});
