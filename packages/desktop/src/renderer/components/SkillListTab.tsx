/**
 * @file src/renderer/components/SkillListTab.tsx
 * @description Skills 列表标签页，展示后端已注册的技能模块名称和描述
 * 使用 2 列网格卡片的 Demo 视觉风格
 */

import React, { useEffect, useState } from 'react';
import { Loader2, FolderOpen } from 'lucide-react';
import { listSkills, type Skill } from '../lib/api';

/**
 * Skills 列表标签页组件，从后端加载可用技能列表并展示名称和描述
 */
export const SkillListTab: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  /**
   * 从后端拉取 Skills 列表并更新本地状态
   */
  const loadSkills = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listSkills();
      setSkills(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4 text-center">
          <p className="text-red-500">加载失败: {error}</p>
          <button
            onClick={loadSkills}
            className="mt-2 text-[13px] text-[#666] hover:text-[#333]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-bold text-[#333]">Skills</h3>
          <button
            onClick={() =>
              window.api?.openPath('~/.local/share/persona-agent/skills/')
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-[#555] border border-[#ddd] bg-white hover:bg-[#f0f0f0] hover:border-[#bbb] transition-colors shadow-sm"
          >
            <FolderOpen className="w-4 h-4" />
            打开目录
          </button>
        </div>
        <p className="text-[12px] text-[#999] mb-4">查看可用的技能模块</p>

        {skills.length === 0 ? (
          <div className="text-[#ccc] text-[13px] py-4 text-center">
            暂无已加载的 Skill
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {skills.map((skill) => (
              <div
                key={skill.name}
                className="px-3 py-3 rounded-xl border border-[#eee] bg-[#fafafa] text-left"
              >
                <div className="text-[13px] font-medium text-[#333] truncate">
                  {skill.name}
                </div>
                {skill.description && (
                  <div className="text-[11px] text-[#999] truncate mt-0.5">
                    {skill.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
