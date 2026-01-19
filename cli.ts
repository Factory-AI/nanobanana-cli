#!/usr/bin/env node

import {
  parseArgs,
  generate,
  edit,
  story,
  showTips,
  showHelp,
} from "./lib.js";

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    console.log(showHelp());
    return;
  }

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
      console.log(showTips(pos[0]));
      break;
    default:
      // Natural language fallback
      await generate([cmd, ...pos].join(" "), { preview });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
