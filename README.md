# Codex Workflow

Codex Workflow is a plugin for launching Codex CLI from the current vault.

Manage your Obsidian knowledge base with Codex!

## Features

- Adds a ribbon icon and command to launch Codex CLI
- Opens Windows Terminal by default
- Starts in the current Obsidian vault directory
- Passes a configurable startup prompt to Codex
- Supports `{{vaultPath}}` and `{{activeFilePath}}` variables
- Includes a compact right-sidebar launcher panel

## Installation

This is currently a manual/local plugin. You can install it from the GitHub release assets or from the repository source.

1. Download or clone this repository.
2. Copy the repository folder to:

```text
<your-vault>/.obsidian/plugins/codex-workflow
```

3. In Obsidian, open `Settings -> Community plugins`.
4. Disable Safe mode if needed.
5. Enable `Codex Workflow`.

## Requirements

- Obsidian desktop
- Codex CLI available in your shell path
- A terminal application

On Windows, the default terminal command is:

```text
wt.exe
```

The default Codex command is:

```text
codex
```

Both can be configured in the plugin settings.

## Settings

- `Terminal`: terminal executable used to open Codex
- `Codex command`: command run inside the vault directory
- `Ribbon icon launches terminal`: whether clicking the ribbon icon launches immediately
- `Startup prompt`: the first prompt passed to Codex

Available startup prompt variables:

- `{{vaultPath}}`
- `{{activeFilePath}}`

## Notes

The plugin writes temporary launch files under:

```text
<your-vault>/.obsidian/plugins/codex-workflow/.tmp
```

Runtime settings are stored by Obsidian in `data.json`; this file is intentionally ignored by Git.

## Release checklist

For an Obsidian-compatible GitHub release, attach these files:

- `main.js`
- `manifest.json`
- `styles.css`

## Contributing

If you have suggestions for improvement or would like to help maintain this project, feel free to open an issue or contact me at yifutian@link.cuhk.edu.cn.
