/**
 * @fileoverview Marketplace 路由 —— 从 GitHub 仓库读清单、下载安装、卸载。
 *
 * Routes:
 * - GET    /api/marketplace/skills              - 拉取 Skill 清单
 * - POST   /api/marketplace/skills/:name/install - 下载安装
 * - DELETE /api/marketplace/skills/:name         - 卸载
 * - GET    /api/marketplace/mcps                 - 拉取 MCP 清单
 * - POST   /api/marketplace/mcps/:name/install   - 下载安装 MCP
 * - DELETE /api/marketplace/mcps/:name           - 卸载 MCP
 * - GET    /api/marketplace/agents               - 拉取 Agent 清单
 * - POST   /api/marketplace/agents/:name/install - 下载安装 Agent
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Router } from 'express';
import { asyncHandler, getParam } from './utils.js';
import { AppError } from '../../util/errors.js';
import {
  fetchManifest,
  fetchMcpManifest,
  fetchAgentManifest,
} from '../../marketplace/manifest.js';
import { downloadSkill } from '../../marketplace/downloader.js';
import { isSafeSkillName, folderNameOf } from '../../marketplace/util.js';
import { getSkillsDir } from '../../util/paths.js';
import { getSkill, hasSkill } from '../../skill/index.js';
import { installMcp, uninstallMcp } from '../../marketplace/mcp-installer.js';
import { installAgentFromMarketplace } from '../../marketplace/agent-installer.js';
import { cdnUrl, REPO_OWNER, REPO_NAME } from '../../marketplace/config.js';
import { listAgentConfigs } from '../../agent/index.js';
import { getMcpServer } from '../../mcp/index.js';
import { Logger } from '../../util/logger.js';
import type { SessionManagersMap } from './agent.js';
import { registerSessionManager } from './agent.js';

export function createMarketplaceRouter(
  sessionManagers?: SessionManagersMap
): Router {
  const router = Router();

  /** GET /api/marketplace/skills - 拉取 Skill 清单 */
  router.get(
    '/skills',
    asyncHandler(
      'MARKETPLACE',
      'Error listing marketplace skills',
      async (_req, res) => {
        const skills = await fetchManifest();
        res.json({ skills });
      }
    )
  );

  /**
   * POST /api/marketplace/skills/:name/install
   * 后端只管"下载到全局 skills 目录"，不关心分配给哪个 Agent；
   * 分配由前端装成功后调 updateAgentSkillNames 自己做。
   *
   * 状态码：400 名字非法 / 409 已装过 / 404 清单无此条目 / 500 下载失败或 SKILL.md 无法解析。
   */
  router.post(
    '/skills/:name/install',
    asyncHandler('MARKETPLACE', 'Error installing skill', async (req, res) => {
      const name = getParam(req.params['name']);
      if (!name || !isSafeSkillName(name)) {
        throw new AppError(400, 'Invalid skill name');
      }

      // 重名拒绝：hasSkill 按名懒加载，能发现已存在的
      if (hasSkill(name)) {
        throw new AppError(
          409,
          `Skill "${name}" already installed, please uninstall first`
        );
      }

      // 重拉清单，按文件夹名找到条目
      const manifest = await fetchManifest();
      const entry = manifest.find((e) => folderNameOf(e) === name);
      if (!entry) {
        throw new AppError(404, `Skill "${name}" not found in marketplace`);
      }

      // 下载
      const skillDir = await downloadSkill(entry);

      // 入池：listSkills 不扫目录，必须主动按名加载一次，否则商城"已安装"状态对不上。
      // 若 getSkill 返回 undefined，说明下载下来的 SKILL.md 无法解析——回滚并报错。
      const loaded = getSkill(name);
      if (!loaded) {
        fs.rmSync(skillDir, { recursive: true });
        throw new AppError(500, '下载的 SKILL.md 无法解析，请向作者反馈');
      }

      res.json({ success: true, name });
    })
  );

  /**
   * DELETE /api/marketplace/skills/:name
   * 删除本地 skill 文件夹；池子在下次访问时自动移除该条目。
   */
  router.delete(
    '/skills/:name',
    asyncHandler(
      'MARKETPLACE',
      'Error uninstalling skill',
      async (req, res) => {
        const name = getParam(req.params['name']);
        if (!name || !isSafeSkillName(name)) {
          throw new AppError(400, 'Invalid skill name');
        }

        const skillDir = path.join(getSkillsDir(), name);
        if (fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true });
        }
        res.json({ success: true, name });
      }
    )
  );

  // --- MCP 商城 ---

  /** GET /api/marketplace/mcps - 拉取 MCP 清单, 每条附带 logoUrl; 无 logo 时为 undefined, 前端用扳手兜底 */
  router.get(
    '/mcps',
    asyncHandler(
      'MARKETPLACE',
      'Error listing marketplace MCPs',
      async (_req, res) => {
        const mcps = await fetchMcpManifest();
        const withLogos = mcps.map((e) => ({
          ...e,
          logoUrl: e.logo ? cdnUrl(e.path, e.logo) : undefined,
        }));
        res.json({ mcps: withLogos });
      }
    )
  );

  /**
   * POST /api/marketplace/mcps/:name/install
   * 下载 MCP 商品文件夹 → 读 mcp.json → 替换 ${SERVERS_DIR} → 写用户配置 → 连接池注册。
   * 不自动分配给 Agent——用户装完后去 AgentToolsView 手动勾选。
   *
   * 状态码：400 名字非法 / 409 已装过 / 404 清单无此条目 / 500 下载失败或 mcp.json 无法解析
   */
  router.post(
    '/mcps/:name/install',
    asyncHandler('MARKETPLACE', 'Error installing MCP', async (req, res) => {
      const name = getParam(req.params['name']);
      if (!name || !isSafeSkillName(name)) {
        throw new AppError(400, 'Invalid MCP name');
      }

      // 重名拒绝
      if (getMcpServer(name)) {
        throw new AppError(
          409,
          `MCP "${name}" already installed, please uninstall first`
        );
      }

      // 重拉清单，按文件夹名找到条目
      const manifest = await fetchMcpManifest();
      const entry = manifest.find((e) => folderNameOf(e) === name);
      if (!entry) {
        throw new AppError(404, `MCP "${name}" not found in marketplace`);
      }

      await installMcp(entry);

      // 返回连接状态（installMcp 内部已经 addServer，查池拿状态）
      const server = getMcpServer(name);
      res.json({
        success: true,
        name,
        status: server?.status ?? 'disconnected',
        error: server?.error,
      });
    })
  );

  /**
   * DELETE /api/marketplace/mcps/:name
   * 断连 + 从池移除 → 从 mcp.json 删 → 删代码目录。
   */
  router.delete(
    '/mcps/:name',
    asyncHandler('MARKETPLACE', 'Error uninstalling MCP', async (req, res) => {
      const name = getParam(req.params['name']);
      if (!name || !isSafeSkillName(name)) {
        throw new AppError(400, 'Invalid MCP name');
      }

      await uninstallMcp(name);
      res.json({ success: true, name });
    })
  );

  // --- Agent 商城 ---

  /** GET /api/marketplace/agents - 拉取 Agent 清单, 卡片图固定取自 assets/avatar.png, 与聊天头像共用 */
  router.get(
    '/agents',
    asyncHandler(
      'MARKETPLACE',
      'Error listing marketplace agents',
      async (_req, res) => {
        const agents = await fetchAgentManifest();
        const withLogos = agents.map((e) => ({
          ...e,
          logoUrl: cdnUrl(e.path, 'assets/avatar.png'),
          source: `${REPO_OWNER}/${REPO_NAME}/${folderNameOf(e)}`,
        }));
        res.json({ agents: withLogos });
      }
    )
  );

  /**
   * POST /api/marketplace/agents/:name/install
   * 下载 Agent 商品包 → 创建新 Agent 实体 → 复制资产 → 注册 SessionManager。
   * 安装后前端刷新 agent 列表并切换到新 Agent。
   *
   * 状态码：400 名字非法 / 404 清单无此条目 / 409 已安装 / 500 安装失败
   *
   * 同一模板只能安装一次——已安装时返回 409，前端商城卡片也会显示"已安装"禁用按钮。
   */
  router.post(
    '/agents/:name/install',
    asyncHandler('MARKETPLACE', 'Error installing agent', async (req, res) => {
      const name = getParam(req.params['name']);
      if (!name || !isSafeSkillName(name)) {
        throw new AppError(400, 'Invalid agent name');
      }

      // 重拉清单，按文件夹名找到条目
      const manifest = await fetchAgentManifest();
      const entry = manifest.find((e) => folderNameOf(e) === name);
      if (!entry) {
        throw new AppError(404, `Agent "${name}" not found in marketplace`);
      }

      // 重名拦截：同一模板只能装一次, marketplaceSource 唯一
      const source = `${REPO_OWNER}/${REPO_NAME}/${name}`;
      const alreadyInstalled = listAgentConfigs().some(
        (a) => a.marketplaceSource === source
      );
      if (alreadyInstalled) {
        Logger.log('MARKETPLACE', `Agent '${name}' already installed`);
        throw new AppError(409, `Agent "${name}" already installed`);
      }

      // 下载 + 创建 Agent + 复制资产
      const agent = await installAgentFromMarketplace(entry);

      // 注册 SessionManager + 创建初始聊天 Session, 和 POST /api/agents 的逻辑一致
      if (sessionManagers) {
        registerSessionManager(agent.id, sessionManagers);
      }

      Logger.log(
        'MARKETPLACE',
        `Installed agent from marketplace: ${agent.id}`
      );
      res.status(201).json({ success: true, agent });
    })
  );

  return router;
}
