/**
 * @fileoverview 初始 Agent 预装（seed）。
 *
 * 三要素门控（同时满足才播种，各跳过分支均有日志）：
 * - env PERSONA_AGENT_TEMPLATE_DIR 存在且指向存在的目录
 * - config/agent-seed.json 未标记已播种
 * - agents/ 无有效 Agent
 *
 * 语言检测链：env PERSONA_AGENT_LANG（测试/特殊场景显式覆盖）→
 * Intl 主机语言（zh* → zh-CN、en* → en、其余 → zh-CN）。
 * 播种只发生在首启，此刻 app 必无用户语言记录，主机语言即最可靠信号。
 *
 * 流程：读模板档案 → safeParse → createAgentConfig → cpSync assets →
 * 原子写 agent-seed.json。任一步失败 log 后放弃，绝不阻塞启动。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonFile } from '../util/fs-helpers.js';
import { Logger } from '../util/logger.js';
import { getAgentAssetsDir, getAgentSeedStatusPath } from '../util/paths.js';
import type { AgentSeedStatus } from '@persona/shared';
import { createAgentConfig, listAgentConfigs } from './agent-config-store.js';
import { AgentConfigInputSchema } from './types.js';

/** 模板名，与 templates/ 目录下的文件夹同名 */
const TEMPLATE_NAME = 'arona-adult';

/**
 * 解析播种语言。
 *
 * env PERSONA_AGENT_LANG 以 zh/en 前缀识别（如 en-US 也归入 en），
 * 未设置或无法识别时回退 Intl 主机语言，其余地区默认 zh-CN。
 */
export function resolveSeedLang(): 'zh-CN' | 'en' {
  const override = process.env['PERSONA_AGENT_LANG'];
  if (override) {
    const lower = override.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en';
  }
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  if (locale.startsWith('zh')) return 'zh-CN';
  if (locale.startsWith('en')) return 'en';
  return 'zh-CN';
}

/**
 * 读取播种状态文件。
 * 文件不存在或损坏（非法 json）视同未播种，返回 { seeded: false }。
 */
export function readAgentSeedStatus(): AgentSeedStatus {
  return readJsonFile<AgentSeedStatus>(getAgentSeedStatusPath(), {
    seeded: false,
  });
}

/** 原子写播种状态文件（tmp + rename，与 agent-config-store 同模式） */
function writeSeedStatus(status: AgentSeedStatus): void {
  const filePath = getAgentSeedStatusPath();
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(status, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * 静默播种初始 Agent。
 *
 * 挂载点在 initSessionManagers 之前（src/index.ts 动态 import server），
 * 创建的 Agent 由后者统一注册并补建聊天 Session。
 * 任何失败只 log，不影响 server 正常启动。
 */
export function seedInitialAgent(): void {
  const templateDir = process.env['PERSONA_AGENT_TEMPLATE_DIR'];
  if (!templateDir || !fs.existsSync(templateDir)) {
    Logger.log('AGENT', 'Seed skipped: PERSONA_AGENT_TEMPLATE_DIR not set');
    return;
  }

  if (readAgentSeedStatus().seeded) {
    Logger.log('AGENT', 'Seed skipped: already seeded');
    return;
  }

  const agents = listAgentConfigs();
  if (agents.length > 0) {
    Logger.log(
      'AGENT',
      `Seed skipped: ${agents.length} agent(s) already exist`
    );
    return;
  }

  try {
    const lang = resolveSeedLang();
    const profileDir = path.join(templateDir, TEMPLATE_NAME, lang);

    const rawConfig = readJsonFile<Record<string, unknown> | null>(
      path.join(profileDir, 'config.json'),
      null
    );
    if (rawConfig === null) {
      Logger.log('AGENT', `Seed aborted: profile config not found (${lang})`);
      return;
    }
    const systemPrompt = fs.readFileSync(
      path.join(profileDir, 'systemPrompt.md'),
      'utf-8'
    );

    const parsed = AgentConfigInputSchema.safeParse({
      ...rawConfig,
      systemPrompt,
    });
    if (!parsed.success) {
      Logger.log(
        'AGENT',
        `Seed aborted: invalid template config (${lang}): ${JSON.stringify(
          parsed.error.issues
        )}`
      );
      return;
    }

    const agent = createAgentConfig(parsed.data);

    const srcAssets = path.join(templateDir, TEMPLATE_NAME, 'assets');
    if (fs.existsSync(srcAssets)) {
      fs.cpSync(srcAssets, getAgentAssetsDir(agent.id), { recursive: true });
    }

    writeSeedStatus({
      seeded: true,
      template: TEMPLATE_NAME,
      lang,
      agentId: agent.id,
      seededAt: Date.now(),
    });
    Logger.log('AGENT', `Seeded initial agent (${lang}): ${agent.id}`);
  } catch (error) {
    Logger.log(
      'AGENT',
      `Seed failed, fallback to empty state: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
