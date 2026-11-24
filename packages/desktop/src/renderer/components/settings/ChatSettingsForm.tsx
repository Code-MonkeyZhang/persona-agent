/**
 * @file src/renderer/components/settings/ChatSettingsForm.tsx
 * @description 聊天设置页，收压缩偏好与陪伴演出两组
 * 压缩偏好的配置本体是服务端全局那份，呼吸与思考气泡两个开关按设备本地存，界面归组在同一页
 */

import React, { useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/configStore';
import type { CompressionPrefs } from '../../stores/configStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Switch } from '../ui/Switch';
import { Card } from '../ui/Card';
import { SettingRow } from '../common/SettingRow';
import { NumberInput } from '../agent-editor/NumberInput';

/**
 * 压缩偏好卡。自动压缩开关与阈值即时持久化到服务端 config 的 compression 节，
 * 失败回滚展示值。阈值行随开关联动收展，收起态卸载输入框不占焦点，
 * 行间距走内容内 padding 与行高一起收拢。
 */
function CompressionCard() {
  const { t } = useTranslation();
  const config = useConfigStore((s) => s.config);
  const updateField = useConfigStore((s) => s.updateField);
  const saveConfig = useConfigStore((s) => s.saveConfig);
  /** 阈值编辑草稿，null 表示跟随已存值，失焦提交 */
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);
  if (!config) return null;
  const autoCompress = config.compression.autoCompress;
  const thresholdText = thresholdDraft ?? String(config.compression.threshold);

  const persist = async (next: CompressionPrefs) => {
    const prev = config.compression;
    updateField('compression', next);
    try {
      await saveConfig({ ...config, compression: next });
    } catch {
      updateField('compression', prev);
    }
  };

  /** 提交阈值草稿，钳制 1 到 100，解析失败或数值未变时丢弃草稿 */
  const commitThreshold = () => {
    if (thresholdDraft === null) return;
    setThresholdDraft(null);
    const parsed = parseInt(thresholdDraft, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(100, Math.max(1, Math.round(parsed)));
    if (clamped === config.compression.threshold) return;
    void persist({ ...config.compression, threshold: clamped });
  };

  return (
    <Card
      title={t('config.compression')}
      titleClassName="text-title-section font-semibold"
    >
      <div className="flex flex-col">
        <SettingRow
          label={t('config.autoCompress')}
          desc={t('config.autoCompressDesc')}
        >
          <Switch
            checked={autoCompress}
            onCheckedChange={(checked) =>
              void persist({ ...config.compression, autoCompress: checked })
            }
          />
        </SettingRow>
        <Collapsible.Root open={autoCompress}>
          <Collapsible.Content className="collapsible-content">
            <div className="pb-4 pt-4">
              <SettingRow
                label={t('config.threshold')}
                desc={t('config.thresholdDesc')}
              >
                <NumberInput
                  value={thresholdText}
                  onChange={setThresholdDraft}
                  onBlur={commitThreshold}
                  min={1}
                  max={100}
                />
              </SettingRow>
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
    </Card>
  );
}

/**
 * 聊天设置表单组件，压缩偏好卡与演出卡
 * 呼吸与思考气泡两个开关绑定 settingsStore，按设备本地持久化，不进服务端
 */
export const ChatSettingsForm: React.FC = () => {
  const { t } = useTranslation();
  const breathEnabled = useSettingsStore((s) => s.breathEnabled);
  const setBreathEnabled = useSettingsStore((s) => s.setBreathEnabled);
  const thinkingBubbleEnabled = useSettingsStore(
    (s) => s.thinkingBubbleEnabled
  );
  const setThinkingBubbleEnabled = useSettingsStore(
    (s) => s.setThinkingBubbleEnabled
  );

  return (
    <div className="p-5 flex flex-col gap-4">
      <CompressionCard />

      <Card
        title={t('config.performance')}
        titleClassName="text-title-section font-semibold"
      >
        {/* 呼吸动画开关：关掉后陪伴立绘完全静止，不按角色分 */}
        <SettingRow
          label={t('config.breathAnimation')}
          desc={t('config.breathAnimationDesc')}
        >
          <Switch checked={breathEnabled} onCheckedChange={setBreathEnabled} />
        </SettingRow>
        {/* 思考气泡开关：关掉后生成期间头顶不再冒思考气泡，情绪气泡照出，运行中拨动立即生效 */}
        <SettingRow
          label={t('config.thinkingBubble')}
          desc={t('config.thinkingBubbleDesc')}
        >
          <Switch
            checked={thinkingBubbleEnabled}
            onCheckedChange={setThinkingBubbleEnabled}
          />
        </SettingRow>
      </Card>
    </div>
  );
};
