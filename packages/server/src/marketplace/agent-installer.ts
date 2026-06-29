/**
 * @fileoverview Agent 商城安装编排。
 *
 * installAgentFromMarketplace：
 *   下载商品包到临时目录 → 解析 config.json → 防御性清理 → 创建 Agent → 复制资产 → 清理临时目录。
 *
 * 和 Skill / MCP 安装的关键区别：Agent 的 ID 由 createAgentConfig 自动生成, 格式 xxxxxxxx-YYYYMMDD-HHmmss,
 * 安装前不知道目标目录路径，因此必须先下到临时目录，拿到 ID 后再复制资产过去。
 * 详见实现计划文档「阶段 2 - 临时目录方案」。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { downloadPackage } from './downloader.js';
import { REPO_OWNER, REPO_NAME } from './config.js';
import { AgentConfigInputSchema, createAgentConfig } from '../agent/index.js';
import { getAgentAssetsDir, getAgentDir } from '../util/paths.js';
import { Logger } from '../util/logger.js';
import type { AgentConfig } from '../agent/index.js';
import type { AgentMarketplaceEntry } from '@persona/shared';

/**
 * 从商城安装一个 Agent。
 *
 * 流程：下载商品包到临时目录 → 解析 config.json → 防御性清理系统字段 →
 * 校验 → createAgentConfig, 生成新 ID + 建目录树 → 复制 assets + 语音样本 → 清理临时目录。
 *
 * 卡片展示图与聊天头像统一取自 assets/avatar.png，随 assets 目录一起复制，无需单独处理。
 *
 * 重名拦截在路由层处理, 同一模板只能装一次; 此处写入 marketplaceSource
 * 供商城"已安装"判定使用。
 *
 * @param entry Agent 清单条目
 * @returns 新创建的 AgentConfig, 含自动生成的 ID
 * @throws 下载失败、config.json 缺失或非法时抛出
 */
export async function installAgentFromMarketplace(
  entry: AgentMarketplaceEntry
): Promise<AgentConfig> {
  const name = entry.path.split('/').pop()!;

  // 建唯一命名的临时目录，避免并发安装冲突
  const tempDir = path.join(
    os.tmpdir(),
    `agent-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    // - 下载整个商品包到临时目录, downloadPackage 内部含路径安全 + 并发 + 回滚
    Logger.log('MARKETPLACE', `Installing agent '${name}'`);
    await downloadPackage(entry.path, tempDir);
    Logger.log('MARKETPLACE', `Downloaded '${name}' to ${tempDir}`);

    // - 读 config.json
    const configPath = path.join(tempDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('Agent package missing config.json');
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<
      string,
      unknown
    >;

    // - 读 systemPrompt.md 注入 raw，config.json 不再包含该字段
    const promptPath = path.join(tempDir, 'systemPrompt.md');
    if (fs.existsSync(promptPath)) {
      raw['systemPrompt'] = fs.readFileSync(promptPath, 'utf-8');
      Logger.log('MARKETPLACE', `Loaded systemPrompt.md for '${name}'`);
    }

    // - 防御性清理：即使作者失误包含了系统字段也不影响
    delete raw['id'];
    delete raw['createdAt'];
    delete raw['updatedAt'];
    delete raw['defaultWorkspacePath'];
    delete raw['voiceId'];
    delete raw['marketplaceSource'];
    raw['skillNames'] = [];
    raw['mcpNames'] = [];

    // 写入商城来源标识, 格式 owner/repo/folder, 供已安装判定使用
    raw['marketplaceSource'] = `${REPO_OWNER}/${REPO_NAME}/${name}`;

    // - 校验, AgentConfigInputSchema 是 AgentConfigSchema 去掉 id/createdAt/updatedAt
    const result = AgentConfigInputSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Invalid agent config in package: ${JSON.stringify(result.error.issues)}`
      );
    }

    // - 创建 Agent, 生成新 ID + 建完整目录树：agents/{id}/, assets/, pose/, backgrounds/, sessions/, memory/
    const agent = createAgentConfig(result.data);
    Logger.log('MARKETPLACE', `Created agent ${agent.id} for '${name}'`);

    // - 复制 assets/, createAgentConfig 已建好空目录，这里覆盖为下载的文件
    const srcAssets = path.join(tempDir, 'assets');
    if (fs.existsSync(srcAssets)) {
      fs.cpSync(srcAssets, getAgentAssetsDir(agent.id), { recursive: true });
    }

    // - 复制语音样本, 清单声明了 voiceSample 且文件存在时才复制
    if (entry.voiceSample) {
      const voiceSrc = path.join(tempDir, entry.voiceSample);
      if (fs.existsSync(voiceSrc)) {
        fs.copyFileSync(
          voiceSrc,
          path.join(getAgentDir(agent.id), entry.voiceSample)
        );
      }
    }

    Logger.log('MARKETPLACE', `Agent '${name}' installed successfully`);
    return agent;
  } finally {
    // 无论成功还是失败，都清理临时目录
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      /* 忽略清理错误 */
    }
  }
}
