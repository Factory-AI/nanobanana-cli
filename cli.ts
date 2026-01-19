#!/usr/bin/env bun

import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);
const OUTPUT_DIR = "nanobanana-output";
const DEFAULT_MODEL = "gemini-3-pro-image-preview";

// ============ Utilities ============

function getApiKey(): string {
  const key =
    process.env.NANOBANANA_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!key) {
    console.error(`
Error: No API key found.

Set your Gemini API key:
  export GEMINI_API_KEY="your-api-key"

Get one at: https://aistudio.google.com/apikey
`);
    process.exit(1);
  }
  return key;
}

function ensureOutputDir(): string {
  const outputPath = path.join(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  return outputPath;
}

function findFile(filename: string): string | null {
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

function genFilename(prompt: string, idx = 0): string {
  let base = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 32) || "image";
  const out = ensureOutputDir();
  let name = `${base}.png`;
  let c = idx > 0 ? idx : 1;
  while (fs.existsSync(path.join(out, name))) {
    name = `${base}_${c++}.png`;
  }
  return name;
}

async function saveImage(b64: string, filename: string): Promise<string> {
  const full = path.join(ensureOutputDir(), filename);
  await fs.promises.writeFile(full, Buffer.from(b64, "base64"));
  return full;
}

async function openFile(f: string) {
  try {
    const cmd = process.platform === "darwin" ? `open "${f}"` : process.platform === "win32" ? `start "" "${f}"` : `xdg-open "${f}"`;
    await execAsync(cmd);
  } catch {}
}

function isBase64(d: string): boolean {
  return d && d.length > 1000 && /^[A-Za-z0-9+/]*={0,2}$/.test(d);
}

function parseArgs(args: string[]): { pos: string[]; flags: Record<string, string> } {
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

async function generate(prompt: string, opts: { count?: number; styles?: string[]; variations?: string[]; preview?: boolean } = {}) {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const files: string[] = [];

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
          const f = await saveImage(b64, genFilename(prompts[i], i));
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

async function edit(file: string, prompt: string, opts: { preview?: boolean; mode?: string } = {}) {
  const fp = findFile(file);
  if (!fp) { console.error(`File not found: ${file}`); process.exit(1); }

  console.log(`${opts.mode === "restore" ? "Restoring" : "Editing"} ${fp}...`);

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const imgB64 = (await fs.promises.readFile(fp)).toString("base64");

  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: imgB64, mimeType: "image/png" } }] }],
    });
    for (const part of res.candidates?.[0]?.content?.parts || []) {
      const b64 = part.inlineData?.data || (part.text && isBase64(part.text) ? part.text : null);
      if (b64) {
        const f = await saveImage(b64, genFilename(`${opts.mode || "edit"}_${prompt}`, 0));
        console.log(`  ${f}`);
        if (opts.preview) await openFile(f);
        return [f];
      }
    }
  } catch (e: any) { console.error(`Error: ${e.message || e}`); }
  return [];
}

async function story(prompt: string, opts: { steps?: number; type?: string; style?: string; transition?: string; preview?: boolean } = {}) {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const files: string[] = [];
  const steps = opts.steps || 4;
  const type = opts.type || "story";

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
          const f = await saveImage(b64, genFilename(`${type}_step${i + 1}_${prompt}`, 0));
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

const TIPS: Record<string, string> = {
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

function showTips(cmd?: string) {
  if (!cmd) {
    console.log(`
Tips - run "nanobanana tips <command>" for details

Commands: generate, edit, restore, icon, pattern, diagram, story

General tips:
  - Be specific: "golden retriever puppy" beats "dog"
  - Include style: "watercolor", "photorealistic"
  - Add context: "for a children's book"
`);
  } else {
    console.log(TIPS[cmd] || `Unknown: ${cmd}\nAvailable: generate, edit, restore, icon, pattern, diagram, story`);
  }
}

// ============ Help ============

function showHelp() {
  console.log(`
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
`);
}

// ============ Main ============

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "--help" || args[0] === "-h") { showHelp(); return; }

  const cmd = args[0];
  const { pos, flags } = parseArgs(args.slice(1));
  const preview = flags.preview === "true" || flags.p === "true";

  switch (cmd) {
    case "generate": {
      const prompt = pos.join(" ");
      if (!prompt) { console.error("Error: provide a prompt"); process.exit(1); }
      await generate(prompt, {
        count: flags.count ? parseInt(flags.count) : undefined,
        styles: flags.styles?.split(","),
        variations: flags.variations?.split(","),
        preview,
      });
      break;
    }
    case "edit": {
      const [file, ...rest] = pos;
      const prompt = rest.join(" ");
      if (!file || !prompt) { console.error("Usage: nanobanana edit <file> <prompt>"); process.exit(1); }
      await edit(file, prompt, { preview, mode: "edit" });
      break;
    }
    case "restore": {
      const [file, ...rest] = pos;
      const prompt = rest.join(" ") || "restore and enhance this image";
      if (!file) { console.error("Usage: nanobanana restore <file> [prompt]"); process.exit(1); }
      await edit(file, prompt, { preview, mode: "restore" });
      break;
    }
    case "icon": {
      const prompt = pos.join(" ");
      if (!prompt) { console.error("Error: provide a prompt"); process.exit(1); }
      const type = flags.type || "app-icon";
      const style = flags.style || "modern";
      const bg = flags.background || "transparent";
      const corners = flags.corners || "rounded";
      let full = `${prompt}, ${style} style ${type}`;
      if (type === "app-icon") full += `, ${corners} corners`;
      if (bg !== "transparent") full += `, ${bg} background`;
      full += ", clean design, high quality";
      const sizes = (flags.sizes || "256").split(",").length;
      await generate(full, { count: sizes, preview });
      break;
    }
    case "pattern": {
      const prompt = pos.join(" ");
      if (!prompt) { console.error("Error: provide a prompt"); process.exit(1); }
      const type = flags.type || "seamless";
      const style = flags.style || "abstract";
      const density = flags.density || "medium";
      const colors = flags.colors || "colorful";
      const size = flags.size || "256x256";
      let full = `${prompt}, ${style} style ${type} pattern, ${density} density, ${colors} colors`;
      if (type === "seamless") full += ", tileable";
      full += `, ${size}, high quality`;
      await generate(full, { preview });
      break;
    }
    case "diagram": {
      const prompt = pos.join(" ");
      if (!prompt) { console.error("Error: provide a prompt"); process.exit(1); }
      const type = flags.type || "flowchart";
      const style = flags.style || "professional";
      const layout = flags.layout || "hierarchical";
      const complexity = flags.complexity || "detailed";
      const colors = flags.colors || "accent";
      const full = `${prompt}, ${type} diagram, ${style} style, ${layout} layout, ${complexity} detail, ${colors} colors, clear visual hierarchy`;
      await generate(full, { preview });
      break;
    }
    case "story": {
      const prompt = pos.join(" ");
      if (!prompt) { console.error("Error: provide a prompt"); process.exit(1); }
      await story(prompt, {
        steps: flags.steps ? parseInt(flags.steps) : 4,
        type: flags.type,
        style: flags.style,
        transition: flags.transition,
        preview,
      });
      break;
    }
    case "tips":
      showTips(pos[0]);
      break;
    default:
      // Natural language fallback
      await generate([cmd, ...pos].join(" "), { preview });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
