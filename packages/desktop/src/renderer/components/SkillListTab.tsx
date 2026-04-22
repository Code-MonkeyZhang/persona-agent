/**
 * @file src/renderer/components/SkillListTab.tsx
 * @description Skills 列表标签页，展示后端已注册的技能模块名称和描述
 */

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
      <div className="text-center py-12">
        <p className="text-red-600">加载失败: {error}</p>
        <button
          onClick={loadSkills}
          className="mt-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900">Skills</h2>
        <p className="text-sm text-gray-500 mt-1">查看可用的技能模块</p>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>暂无 Skills</p>
          <p className="text-sm mt-1">请在后端配置文件中添加 Skills</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="p-4 border border-gray-200 rounded-lg"
            >
              <h3 className="font-medium text-gray-900">{skill.name}</h3>
              {skill.description && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {skill.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
