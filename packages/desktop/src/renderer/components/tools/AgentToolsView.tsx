/**
 * @file src/renderer/components/tools/AgentToolsView.tsx
 * @description Agent 工具视图，左右双栏
 * 左栏三组为内置工具、已分配工具与未分配工具，数据一份来自注册表条目，
 * 开关与加减号写分配记录，右栏为选中条目的详情
 * Agent 上下文来自入口的当前 Agent，页面内不出现第二处 Agent 选择
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMcpStore } from '../../stores/mcpStore';
import { useAgentStore } from '../../stores/agentStore';
import { logger } from '../../lib/logger';
import { ListState } from '../common/ListState';
import { EmptyPane } from '../common/SidePanel';
import { useValidatedSelection } from '../../hooks/useValidatedSelection';
import { ToolListPanel } from './ToolListPanel';
import { ToolDetailPanel } from './ToolDetailPanel';
import type { ToolSelection } from './toolRows';
import { BUILTIN_TOOLSET_IDS } from '@persona/shared';

/** 内置组首条条目 id，选中态失效时的回退目标 */
const DEFAULT_ENTRY_ID = BUILTIN_TOOLSET_IDS[0];

export const AgentToolsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const entries = useMcpStore((s) => s.entries);
  const entriesError = useMcpStore((s) => s.entriesError);
  const loadTools = useMcpStore((s) => s.loadTools);
  const disposeOAuth = useMcpStore((s) => s.disposeOAuth);

  /**
   * 进入页面与切换 Agent 时拉取条目，界面语言变化也重拉一次，
   * 服务端按请求携带的 lang 现挑中英文案，客户端不存两份。
   */
  useEffect(() => {
    if (currentAgent) {
      void loadTools(currentAgent.id);
    }
    return () => disposeOAuth();
  }, [loadTools, disposeOAuth, currentAgent?.id, i18n.language]);

  /**
   * 选中节点失效时自动修正，回退到内置组首条。
   * 一处逻辑同时覆盖卸载选中服务、切换 Agent、首次进入三种场景。
   */
  const items = entries ?? [];
  const [selection, setSelection] = useValidatedSelection<ToolSelection>(
    (v) => items.some((e) => e.id === v.id),
    () => ({ id: DEFAULT_ENTRY_ID })
  );

  if (!currentAgent) return null;

  const handleSelect = (sel: ToolSelection) => {
    logger.info('[Tools] 选中节点', sel);
    setSelection(sel);
  };

  const selected = items.find((e) => e.id === selection?.id);

  return (
    <ListState
      isLoading={entries === null && !entriesError}
      error={entriesError}
      onRetry={() => void loadTools(currentAgent.id)}
    >
      <div className="flex h-full w-full overflow-hidden">
        <ToolListPanel
          agentId={currentAgent.id}
          entries={items}
          selection={selection}
          onSelect={handleSelect}
        />
        {selected ? (
          <div className="min-h-0 min-w-0 flex-1">
            <ToolDetailPanel entry={selected} />
          </div>
        ) : (
          <EmptyPane text={t('tools.noneSelected')} />
        )}
      </div>
    </ListState>
  );
};
