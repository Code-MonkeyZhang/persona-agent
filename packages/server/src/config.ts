/**
 * @fileoverview Server configuration management.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'yaml';

export interface AppConfig {
  enableLogging: boolean;
  /** 工具叙述注入开关，开启时给发往模型的工具 schema 注入 _title 与 _intent 必填栏位 */
  enableToolNarration: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  enableLogging: false,
  enableToolNarration: true,
};

/** 工具叙述注入的运行时开关，启动时从 config 装载，供 agent 层免参读取 */
let toolNarrationEnabled = DEFAULT_CONFIG.enableToolNarration;

/** 更新工具叙述注入的运行时开关 */
export function setToolNarration(enabled: boolean): void {
  toolNarrationEnabled = enabled;
}

/** 读工具叙述注入的运行时开关 */
export function isToolNarrationEnabled(): boolean {
  return toolNarrationEnabled;
}

/** Generate default config YAML string for first-time creation */
export function getDefaultConfigYaml(): string {
  return yaml.stringify(DEFAULT_CONFIG);
}

/**
 * Load configuration from file.
 * @param configPath - Path to config.yaml file
 * @returns Parsed configuration object
 */
export function loadConfig(configPath: string): AppConfig {
  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content) as Partial<AppConfig>;
  return {
    enableLogging: parsed.enableLogging ?? DEFAULT_CONFIG.enableLogging,
    enableToolNarration:
      parsed.enableToolNarration ?? DEFAULT_CONFIG.enableToolNarration,
  };
}

/**
 * Save configuration to file using atomic write.
 * Writes to a temp file first, then renames to target path.
 * @param configPath - Path to config.yaml file
 * @param config - Configuration object to save
 */
export function saveConfig(configPath: string, config: AppConfig): void {
  const content = yaml.stringify(config);
  const tempPath = path.join(os.tmpdir(), `config-${Date.now()}.yaml.tmp`);
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, configPath);
}
