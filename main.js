"use strict";

const { Plugin, ItemView, Notice, PluginSettingTab, Setting, Platform } = require("obsidian");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PLUGIN_ID = "codex-workflow";
const VIEW_TYPE_CODEX_LAUNCHER = "codex-workflow-launcher-view";

const DEFAULT_SETTINGS = {
  terminalPath: "wt.exe",
  codexCommand: "codex",
  autoLaunchOnRibbon: true,
  startupPrompt:
    "You are running as a Codex assistant inside an Obsidian vault.\n\n" +
    "工作目录：{{vaultPath}}\n" +
    "当前活动笔记：{{activeFilePath}}\n\n" +
    "Help me work with notes, source files, and project context in this vault.\n" +
    "Prefer direct file edits when asked, then briefly explain what changed.\n\n" +
    "First confirm that you understand the current vault and active note, then wait for my next instruction."
};

function escapePowerShellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

class CodexTerminalPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_CODEX_LAUNCHER,
      (leaf) => new CodexTerminalView(leaf, this)
    );

    this.addRibbonIcon("terminal", "Open Codex terminal", async () => {
      await this.openLauncher();
      if (this.settings.autoLaunchOnRibbon) {
        this.launchCodexTerminal();
      }
    });

    this.addCommand({
      id: "open-codex-terminal",
      name: "Open Codex terminal",
      callback: async () => {
        await this.openLauncher();
        this.launchCodexTerminal();
      }
    });

    this.addCommand({
      id: "show-codex-terminal-launcher",
      name: "Show Codex terminal launcher",
      callback: async () => {
        await this.openLauncher();
      }
    });

    this.addSettingTab(new CodexTerminalSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CODEX_LAUNCHER);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultPath() {
    const adapter = this.app.vault.adapter;
    return adapter && adapter.basePath ? adapter.basePath : "";
  }

  getActiveFilePath() {
    const file = this.app.workspace.getActiveFile();
    return file ? file.path : "";
  }

  getPluginTempDir() {
    const vaultPath = this.getVaultPath();
    return path.join(vaultPath, ".obsidian", "plugins", PLUGIN_ID, ".tmp");
  }

  renderStartupPrompt() {
    const prompt = this.settings.startupPrompt || "";
    return prompt
      .replace(/\{\{vaultPath\}\}/g, this.getVaultPath())
      .replace(/\{\{activeFilePath\}\}/g, this.getActiveFilePath() || "none");
  }

  createLaunchScript() {
    const tempDir = this.getPluginTempDir();
    fs.mkdirSync(tempDir, { recursive: true });

    const promptPath = path.join(tempDir, "startup-prompt.md");
    const scriptPath = path.join(tempDir, "launch-codex.ps1");
    const vaultPath = this.getVaultPath();
    const codexCommand = (this.settings.codexCommand || "").trim();

    fs.writeFileSync(promptPath, this.renderStartupPrompt(), "utf8");

    const script = [
      "$ErrorActionPreference = 'Stop'",
      `Set-Location -LiteralPath '${escapePowerShellSingleQuoted(vaultPath)}'`,
      `Write-Host 'Codex vault: ${escapePowerShellSingleQuoted(vaultPath)}'`,
      `Write-Host 'Startup prompt: ${escapePowerShellSingleQuoted(promptPath)}'`,
      `$prompt = Get-Content -Raw -LiteralPath '${escapePowerShellSingleQuoted(promptPath)}'`,
      `${codexCommand} $prompt`
    ].join("\r\n");

    fs.writeFileSync(scriptPath, script, "utf8");
    return scriptPath;
  }

  async openLauncher() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CODEX_LAUNCHER)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_CODEX_LAUNCHER,
        active: true
      });
    }

    this.app.workspace.revealLeaf(leaf);
  }

  buildLaunch() {
    const vaultPath = this.getVaultPath();
    const codexCommand = (this.settings.codexCommand || "").trim();
    const terminalPath = (this.settings.terminalPath || "").trim();

    if (!vaultPath) {
      throw new Error("无法解析当前 vault 路径。");
    }

    if (!codexCommand) {
      throw new Error("Codex 命令为空。");
    }

    if (Platform.isWin) {
      const scriptPath = this.createLaunchScript();

      if (terminalPath.toLowerCase() === "wt" || terminalPath.toLowerCase() === "wt.exe") {
        return {
          command: "wt.exe",
          args: [
            "new-tab",
            "--title",
            "Codex",
            "powershell.exe",
            "-NoExit",
            "-NoLogo",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            scriptPath
          ]
        };
      }

      return {
        command: terminalPath || "powershell.exe",
        args: [
          "-NoExit",
          "-NoLogo",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath
        ]
      };
    }

    if (Platform.isMacOS) {
      const script = `tell application "Terminal" to do script "cd ${JSON.stringify(vaultPath)}; ${codexCommand.replace(/"/g, '\\"')}"`;
      return {
        command: "osascript",
        args: ["-e", script]
      };
    }

    return {
      command: terminalPath || "x-terminal-emulator",
      args: ["-e", "bash", "-lc", `cd "${vaultPath.replace(/"/g, '\\"')}" && ${codexCommand}; exec bash`]
    };
  }

  launchCodexTerminal() {
    let launch;
    try {
      launch = this.buildLaunch();
    } catch (error) {
      new Notice(error && error.message ? error.message : String(error));
      return;
    }

    try {
      const child = spawn(launch.command, launch.args, {
        cwd: this.getVaultPath(),
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });

      child.on("error", (error) => {
        console.error("[codex-terminal] Failed to launch Codex terminal", error);
        new Notice("启动 Codex terminal 失败，请查看开发者控制台。");
      });

      child.unref();
      new Notice("已打开 Codex terminal。");
      this.refreshViews();
    } catch (error) {
      console.error("[codex-terminal] Failed to launch Codex terminal", error);
      new Notice("启动 Codex terminal 失败，请查看开发者控制台。");
    }
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CODEX_LAUNCHER)) {
      if (leaf.view && typeof leaf.view.render === "function") {
        leaf.view.render();
      }
    }
  }
}

class CodexTerminalView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.codexCommandEl = null;
    this.startupPromptEl = null;
  }

  getViewType() {
    return VIEW_TYPE_CODEX_LAUNCHER;
  }

  getDisplayText() {
    return "Codex Terminal";
  }

  getIcon() {
    return "terminal";
  }

  async onOpen() {
    this.render();
  }

  async saveInlineSettings() {
    const codexCommand = ((this.codexCommandEl && this.codexCommandEl.value) || "").trim();
    const startupPrompt = ((this.startupPromptEl && this.startupPromptEl.value) || "").trim();

    this.plugin.settings.codexCommand = codexCommand || DEFAULT_SETTINGS.codexCommand;
    this.plugin.settings.startupPrompt = startupPrompt || DEFAULT_SETTINGS.startupPrompt;
    await this.plugin.saveSettings();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codex-terminal-root");

    contentEl.createEl("div", {
      cls: "codex-terminal-title",
      text: "Codex Terminal"
    });

    contentEl.createEl("div", {
      cls: "codex-terminal-path",
      text: this.plugin.getVaultPath() || "No vault path"
    });

    const button = contentEl.createEl("button", {
      cls: "mod-cta codex-terminal-launch",
      text: "Open Terminal"
    });
    button.addEventListener("click", async () => {
      await this.saveInlineSettings();
      this.plugin.launchCodexTerminal();
    });

    contentEl.createEl("label", {
      cls: "codex-terminal-label",
      text: "Codex command"
    });

    this.codexCommandEl = contentEl.createEl("input", {
      cls: "codex-terminal-command-input",
      type: "text",
      value: this.plugin.settings.codexCommand
    });
    this.codexCommandEl.addEventListener("change", async () => {
      await this.saveInlineSettings();
    });

    contentEl.createEl("label", {
      cls: "codex-terminal-label",
      text: "Startup prompt"
    });

    this.startupPromptEl = contentEl.createEl("textarea", {
      cls: "codex-terminal-prompt"
    });
    this.startupPromptEl.value = this.plugin.settings.startupPrompt;
    this.startupPromptEl.addEventListener("change", async () => {
      await this.saveInlineSettings();
    });

    contentEl.createEl("div", {
      cls: "codex-terminal-hint",
      text: `Variables: {{vaultPath}}, {{activeFilePath}}. Current active file: ${this.plugin.getActiveFilePath() || "none"}.`
    });
  }
}

class CodexTerminalSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Codex Terminal" });

    new Setting(containerEl)
      .setName("Terminal")
      .setDesc("Windows 默认使用 wt.exe。")
      .addText((text) =>
        text
          .setPlaceholder("wt.exe")
          .setValue(this.plugin.settings.terminalPath)
          .onChange(async (value) => {
            this.plugin.settings.terminalPath = value.trim() || "wt.exe";
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("Codex command")
      .setDesc("点击图标后在 vault 目录中运行的命令。")
      .addTextArea((text) =>
        text
          .setPlaceholder("codex")
          .setValue(this.plugin.settings.codexCommand)
          .onChange(async (value) => {
            this.plugin.settings.codexCommand =
              value.trim() || DEFAULT_SETTINGS.codexCommand;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("Ribbon icon launches terminal")
      .setDesc("打开后，点击左侧图标会显示右侧面板并立刻启动 Codex terminal。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoLaunchOnRibbon)
          .onChange(async (value) => {
            this.plugin.settings.autoLaunchOnRibbon = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Startup prompt")
      .setDesc("启动 Codex terminal 时作为第一条消息发送。可用变量：{{vaultPath}}, {{activeFilePath}}。")
      .addTextArea((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.startupPrompt)
          .setValue(this.plugin.settings.startupPrompt)
          .onChange(async (value) => {
            this.plugin.settings.startupPrompt =
              value.trim() || DEFAULT_SETTINGS.startupPrompt;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );
  }
}

module.exports = CodexTerminalPlugin;
