/**
 * @file src/renderer/components/tools/AgentToolsView.tsx
 * @description Agent 工具视图，左右双栏
 * 左栏上下两组为已分配工具与未分配工具，加减号即时分配，右栏为选中工具的详情
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
import {
  BUILT_IN_TOOLS,
  isToolSelectionValid,
  type ToolSelection,
} from './builtInTools';

export const AgentToolsView: React.FC = () => {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const servers = useMcpStore((s) => s.servers);
  const loading = useMcpStore((s) => s.loading);
  const error = useMcpStore((s) => s.error);
  const load = useMcpStore((s) => s.load);
  const disposeOAuth = useMcpStore((s) => s.disposeOAuth);

  useEffect(() => {
    void load();
    return () => disposeOAuth();
  }, [load, disposeOAuth]);

  /**
   * 选中节点失效时自动修正，回退到第一个内置工具。
   * 一处逻辑同时覆盖卸载选中服务、切换 Agent、首次进入三种场景。
   */
  const entries = servers ?? [];
  const [selection, setSelection] = useValidatedSelection<ToolSelection>(
    (v) => isToolSelectionValid(v, entries),
    () => ({ kind: 'builtin', id: BUILT_IN_TOOLS[0].id })
  );

  if (!currentAgent) return null;

  const handleSelect = (sel: ToolSelection) => {
    logger.info('[Tools] 选中节点', sel);
    setSelection(sel);
  };

  return (
    <ListState
      isLoading={loading && servers === null}
      error={error}
      onRetry={load}
    >
      <div className="flex h-full w-full overflow-hidden">
        <ToolListPanel
          agentId={currentAgent.id}
          servers={entries}
          selection={selection}
          onSelect={handleSelect}
        />
        {selection ? (
          <div className="min-h-0 min-w-0 flex-1">
            <ToolDetailPanel selection={selection} />
          </div>
        ) : (
          <EmptyPane text={t('tools.noneSelected')} />
        )}
      </div>
    </ListState>
  );
};
