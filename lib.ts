import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);
export const OUTPUT_DIR = "nanobanana-output";
export const DEFAULT_MODEL = "gemini-3-pro-image-preview";

// ============ Utilities ============

export function getApiKey(): string {
  const key =
    process.env.NANOBANANA_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!key) {
    throw new Error("No API key found. Set GEMINI_API_KEY environment variable.");
  }
  return key;
}

export function ensureOutputDir(baseDir?: string): string {
  const outputPath = path.join(baseDir || process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  return outputPath;
}

export function findFile(filename: string): string | null {
  const paths = [
    process.cwd(),
    path.join(process.cwd(), OUTPUT_DIR),
    path.join(process.env.HOME || "~", "Downloads"),
    path.join(process.env.HOME || "~", "Desktop"),
  ];
  if (path.isAbsolute(filename) && fs.existsSync(filename)) return filename;
  for (const p of paths) {
    const full = path.join(p, filename);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

export function genFilename(prompt: string, idx = 0, outputDir?: string): string {
  let base = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 32) || "image";
  const out = outputDir || ensureOutputDir();
  let name = `${base}.png`;
  let c = idx > 0 ? idx : 1;
  while (fs.existsSync(path.join(out, name))) {
    name = `${base}_${c++}.png`;
  }
  return name;
}

export async function saveImage(b64: string, filename: string, outputDir?: string): Promise<string> {
  const out = outputDir || ensureOutputDir();
  const full = path.join(out, filename);
  await fs.promises.writeFile(full, Buffer.from(b64, "base64"));
  return full;
}

export async function openFile(f: string) {
  try {
    const cmd = process.platform === "darwin" ? `open "${f}"` : process.platform === "win32" ? `start "" "${f}"` : `xdg-open "${f}"`;
    await execAsync(cmd);
  } catch {}
}

export function isBase64(d: string): boolean {
  return !!d && d.length > 1000 && /^[A-Za-z0-9+/]*={0,2}$/.test(d);
}

export function parseArgs(args: string[]): { pos: string[]; flags: Record<string, string> } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (const a of args) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v || "true";
    } else if (a.startsWith("-") && a.length === 2) {
      flags[a[1]] = "true";
    } else {
      pos.push(a);
    }
  }
  return { pos, flags };
}

// ============ Core Functions ============

export interface GenerateOptions {
  count?: number;
  styles?: string[];
  variations?: string[];
  preview?: boolean;
  outputDir?: string;
}

export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const files: string[] = [];
  const outputDir = opts.outputDir || ensureOutputDir();

  let prompts = [prompt];
  if (opts.styles?.length) prompts = opts.styles.map(s => `${prompt}, ${s} style`);
  if (opts.variations?.length) {
    const base = prompts;
    prompts = [];
    for (const b of base) {
      for (const v of opts.variations) {
        if (v === "lighting") { prompts.push(`${b}, dramatic lighting`); prompts.push(`${b}, soft lighting`); }
        else if (v === "mood") { prompts.push(`${b}, cheerful mood`); prompts.push(`${b}, dramatic mood`); }
        else prompts.push(`${b}, ${v}`);
      }
    }
  }
  if (opts.count && opts.count > 1 && prompts.length === 1) prompts = Array(opts.count).fill(prompt);
  if (opts.count && prompts.length > opts.count) prompts = prompts.slice(0, opts.count);

  console.log(`Generating ${prompts.length} image(s)...`);

  for (let i = 0; i < prompts.length; i++) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: "user", parts: [{ text: prompts[i] }] }] });
      for (const part of res.candidates?.[0]?.content?.parts || []) {
        const b64 = part.inlineData?.data || (part.text && isBase64(part.text) ? part.text : null);
        if (b64) {
          const filename = genFilename(prompts[i], i, outputDir);
          const f = await saveImage(b64, filename, outputDir);
          files.push(f);
          console.log(`  ${f}`);
          break;
        }
      }
    } catch (e: any) { console.error(`  Error: ${e.message || e}`); }
  }

  if (opts.preview) for (const f of files) await openFile(f);
  return files;
}

export interface EditOptions {
  preview?: boolean;
  mode?: string;
  outputDir?: string;
}

export async function edit(file: string, prompt: string, opts: EditOptions = {}): Promise<string[]> {
  const fp = findFile(file);
  if (!fp) { 
    throw new Error(`File not found: ${file}`);
  }

  console.log(`${opts.mode === "restore" ? "Restoring" : "Editing"} ${fp}...`);

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const imgB64 = (await fs.promises.readFile(fp)).toString("base64");
  const outputDir = opts.outputDir || ensureOutputDir();

  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: imgB64, mimeType: "image/png" } }] }],
    });
    for (const part of res.candidates?.[0]?.content?.parts || []) {
      const b64 = part.inlineData?.data || (part.text && isBase64(part.text) ? part.text : null);
      if (b64) {
        const filename = genFilename(`${opts.mode || "edit"}_${prompt}`, 0, outputDir);
        const f = await saveImage(b64, filename, outputDir);
        console.log(`  ${f}`);
        if (opts.preview) await openFile(f);
        return [f];
      }
    }
  } catch (e: any) { console.error(`Error: ${e.message || e}`); }
  return [];
}

export interface StoryOptions {
  steps?: number;
  type?: string;
  style?: string;
  transition?: string;
  preview?: boolean;
  outputDir?: string;
}

export async function story(prompt: string, opts: StoryOptions = {}): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const files: string[] = [];
  const steps = opts.steps || 4;
  const type = opts.type || "story";
  const outputDir = opts.outputDir || ensureOutputDir();

  console.log(`Generating ${steps}-step ${type}...`);

  for (let i = 0; i < steps; i++) {
    let p = `${prompt}, step ${i + 1} of ${steps}`;
    if (type === "process") p += ", instructional illustration";
    else if (type === "tutorial") p += ", educational diagram";
    else if (type === "timeline") p += ", chronological";
    else p += `, ${opts.style || "consistent"} style`;
    if (i > 0) p += `, ${opts.transition || "smooth"} transition`;

    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: "user", parts: [{ text: p }] }] });
      for (const part of res.candidates?.[0]?.content?.parts || []) {
        const b64 = part.inlineData?.data || (part.text && isBase64(part.text) ? part.text : null);
        if (b64) {
          const filename = genFilename(`${type}_step${i + 1}_${prompt}`, 0, outputDir);
          const f = await saveImage(b64, filename, outputDir);
          files.push(f);
          console.log(`  Step ${i + 1}: ${f}`);
          break;
        }
      }
    } catch (e: any) { console.error(`  Error step ${i + 1}: ${e.message || e}`); }
  }

  if (opts.preview) for (const f of files) await openFile(f);
  return files;
}

// ============ Tips ============

export const TIPS: Record<string, string> = {
  generate: `
generate: Create images from text

  nanobanana generate "sunset over mountains"
  nanobanana generate "logo" --count=4 --styles=modern,minimal
  nanobanana generate "cat" --variations=lighting,mood --preview

Options: --count, --styles, --variations, --preview
Styles: photorealistic, watercolor, oil-painting, sketch, pixel-art, anime, vintage, modern, abstract, minimalist
Variations: lighting, angle, color-palette, composition, mood, season, time-of-day
`,
  edit: `
edit: Modify an existing image

  nanobanana edit photo.png "add sunglasses"
  nanobanana edit landscape.jpg "change sky to sunset" --preview

Be specific about what to change and where.
`,
  restore: `
restore: Enhance old or damaged photos

  nanobanana restore old_photo.jpg
  nanobanana restore damaged.png "remove scratches, enhance clarity"
`,
  icon: `
icon: Generate app icons

  nanobanana icon "settings gear" --sizes=64,128,256
  nanobanana icon "logo" --type=favicon --style=minimal

Options: --type (app-icon,favicon,ui-element), --style (flat,minimal,modern), --sizes, --background, --corners
`,
  pattern: `
pattern: Create seamless patterns

  nanobanana pattern "hexagons" --style=geometric --colors=duotone
  nanobanana pattern "wood grain" --type=texture

Options: --type, --style, --density, --colors, --size
`,
  diagram: `
diagram: Generate technical diagrams

  nanobanana diagram "login flow" --type=flowchart
  nanobanana diagram "microservices" --type=architecture

Options: --type (flowchart,architecture,network,database,wireframe,mindmap,sequence), --style, --layout, --complexity, --colors
`,
  story: `
story: Create sequential images

  nanobanana story "seed growing into tree" --steps=5
  nanobanana story "making coffee" --type=tutorial --steps=6

Options: --steps (2-8), --type (story,process,tutorial,timeline), --style, --transition
`,
};

export function showTips(cmd?: string): string {
  if (!cmd) {
    return `
Tips - run "nanobanana tips <command>" for details

Commands: generate, edit, restore, icon, pattern, diagram, story

General tips:
  - Be specific: "golden retriever puppy" beats "dog"
  - Include style: "watercolor", "photorealistic"
  - Add context: "for a children's book"
`;
  } else {
    return TIPS[cmd] || `Unknown: ${cmd}\nAvailable: generate, edit, restore, icon, pattern, diagram, story`;
  }
}

// ============ Help ============

export function showHelp(): string {
  return `
nanobanana - Gemini image generation CLI

Commands:
  generate <prompt>       Generate images from text
  edit <file> <prompt>    Modify an existing image
  restore <file> [prompt] Restore old/damaged photos
  icon <prompt>           Generate app icons
  pattern <prompt>        Create seamless patterns
  diagram <prompt>        Generate technical diagrams
  story <prompt>          Create image sequences
  tips [command]          Show prompting tips

Options:
  --count=N       Number of variations (1-8)
  --styles=a,b    Comma-separated styles
  --preview, -p   Open images after generation
  --type=TYPE     Type for icons/patterns/diagrams
  --steps=N       Steps for stories (2-8)

Environment:
  GEMINI_API_KEY  Your Gemini API key (required)

Output saved to: ./nanobanana-output/
`;
}
