# nanobanana

Gemini image generation from the command line. Single binary, no dependencies.

## Installation

Download the binary for your platform from [Releases](../../releases), or build from source:

```bash
# Build for current platform
bun build cli.ts --compile --outfile nanobanana

# Cross-compile
bun build cli.ts --compile --target=bun-linux-x64 --outfile nanobanana-linux
bun build cli.ts --compile --target=bun-darwin-arm64 --outfile nanobanana-mac
bun build cli.ts --compile --target=bun-windows-x64 --outfile nanobanana.exe
```

## Setup

Get a Gemini API key at https://aistudio.google.com/apikey and set it:

```bash
export GEMINI_API_KEY="your-api-key"
```

## Usage

```bash
# Generate images
nanobanana generate "sunset over mountains"
nanobanana generate "logo" --count=4 --styles=modern,minimal --preview

# Edit existing images
nanobanana edit photo.png "add sunglasses"

# Restore old photos
nanobanana restore old_photo.jpg "remove scratches"

# Generate icons
nanobanana icon "settings gear" --sizes=64,128,256 --style=minimal

# Create patterns
nanobanana pattern "hexagons" --style=geometric --colors=duotone

# Generate diagrams
nanobanana diagram "login flow" --type=flowchart

# Create image sequences
nanobanana story "seed growing into tree" --steps=5 --type=process
```

## Commands

| Command | Description |
|---------|-------------|
| `generate <prompt>` | Generate images from text |
| `edit <file> <prompt>` | Modify an existing image |
| `restore <file> [prompt]` | Restore old/damaged photos |
| `icon <prompt>` | Generate app icons |
| `pattern <prompt>` | Create seamless patterns |
| `diagram <prompt>` | Generate technical diagrams |
| `story <prompt>` | Create image sequences |
| `tips [command]` | Show prompting tips |

## Options

```
--count=N       Number of variations (1-8)
--styles=a,b    Comma-separated styles
--preview, -p   Open images after generation
--type=TYPE     Type for icons/patterns/diagrams
--steps=N       Steps for stories (2-8)
```

Run `nanobanana tips <command>` for detailed options and examples.

## Output

Images are saved to `./nanobanana-output/` in the current directory.

## Model

Uses `gemini-3-pro-image-preview` (Nano Banana Pro) by default. Override with:

```bash
export NANOBANANA_MODEL="gemini-2.5-flash-image"
```

## License

MIT
