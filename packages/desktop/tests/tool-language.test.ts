/**
 * @file 行语言映射的纯函数测试，动向句、参数摘要与凭据掩码的口径在此锁定
 * 文案按预览文案口径节的双语映射表，工具实名用本体内置工具的 snake_case 名
 */
import { describe, expect, it } from 'vitest';
import { phraseForThought, type LiveStep } from '@/components/chat/LiveStrip';
import {
  BUBBLE_CN,
  BUBBLE_NAMES,
  BUILTIN_TOOLSET_IDS,
  MOTION_CN,
  MOTION_NAMES,
  THINKING_BUBBLE,
  isBubbleName,
  isMotionName,
  maskSensitive,
  stepPhrase,
  successfulShowPose,
  summarizeToolInput,
} from '@persona/shared';
import { EFFECT_URLS } from '@/assets/effects';
import { BUILTIN_ICONS } from '@/components/tools/toolRows';
import type { Thought } from '@/types/chat';

/** 测试用的中文文案表，键与 i18n 的 live 组一致 */
const dict: Record<string, string> = {
  'live.thinking': '思考中',
  'live.read': '正在读取',
  'live.readFallback': '正在读取文件',
  'live.write': '正在写入',
  'live.writeFallback': '正在写入文件',
  'live.edit': '正在编辑',
  'live.editFallback': '正在编辑文件',
  'live.bash': '运行',
  'live.bashFallback': '正在运行命令',
  'live.bashOutput': '查看后台输出',
  'live.bashKill': '终止后台命令',
  'live.webfetch': '正在抓取网页',
  'live.webfetchFallback': '正在抓取网页',
  'live.showPose': '正在演出',
  'live.getPose': '查看当前表情',
  'live.executing': '正在执行',
};

const t = (key: string) => dict[key];

/** 便捷构造一步动向 */
const step = (tool: string, detail: string): LiveStep => ({
  tool,
  detail,
  startedAt: 0,
  endedAt: 1,
});

/** 便捷构造一条思考步骤 */
const thought = (partial: Partial<Thought>): Thought => ({
  id: 't1',
  type: 'tool_use',
  timestamp: new Date(),
  ...partial,
});

describe('stepPhrase 动向句映射', () => {
  it('文件工具取 basename 拼对象', () => {
    expect(stepPhrase(t, step('read_file', '/a/b/chat.ts'))).toBe(
      '正在读取 chat.ts'
    );
    expect(stepPhrase(t, step('edit_file', 'src/app.ts'))).toBe(
      '正在编辑 app.ts'
    );
    expect(stepPhrase(t, step('write_file', 'config.json'))).toBe(
      '正在写入 config.json'
    );
  });

  it('对象拼不出回退各工具的纯动词形态', () => {
    expect(stepPhrase(t, step('read_file', ''))).toBe('正在读取文件');
    expect(stepPhrase(t, step('write_file', ''))).toBe('正在写入文件');
    expect(stepPhrase(t, step('edit_file', ''))).toBe('正在编辑文件');
    expect(stepPhrase(t, step('bash', ''))).toBe('正在运行命令');
    expect(stepPhrase(t, step('web_fetch', ''))).toBe('正在抓取网页');
  });

  it('Bash 命令按文档截断 24', () => {
    const cmd = 'npm run build --mode production --verbose';
    expect(stepPhrase(t, step('bash', cmd))).toBe(`运行 ${cmd.slice(0, 23)}…`);
  });

  it('表情与后台命令族是固定句式', () => {
    expect(stepPhrase(t, step('show_pose', 'happy'))).toBe('正在演出');
    expect(stepPhrase(t, step('get_current_pose', ''))).toBe('查看当前表情');
    expect(stepPhrase(t, step('bash_output', 'bash_1'))).toBe('查看后台输出');
    expect(stepPhrase(t, step('bash_kill', 'bash_1'))).toBe('终止后台命令');
  });

  it('未登记的第三方工具统一正在执行加短名', () => {
    expect(stepPhrase(t, step('weather__lookup', ''))).toBe('正在执行 lookup');
  });

  it('全名先剥条目前缀再查表', () => {
    expect(
      stepPhrase(t, step('built_in_files__read_file', '/a/b/app.ts'))
    ).toBe('正在读取 app.ts');
    expect(
      stepPhrase(t, step('built_in_terminal__bash_output', 'bash_1'))
    ).toBe('查看后台输出');
    expect(stepPhrase(t, step('built_in_pose__show_pose', 'happy'))).toBe(
      '正在演出'
    );
  });
});

describe('phraseForThought 适配器', () => {
  it('工具步经摘要转动向句', () => {
    expect(
      phraseForThought(
        t,
        thought({ toolName: 'read_file', toolInput: { path: '/a/b/app.ts' } })
      )
    ).toBe('正在读取 app.ts');
  });

  it('思考行与错误行原样返回正文', () => {
    expect(
      phraseForThought(t, thought({ type: 'thinking', content: '先查日志' }))
    ).toBe('先查日志');
  });
});

describe('summarizeToolInput 参数摘要', () => {
  it('按工具实名取关键参数', () => {
    expect(summarizeToolInput('read_file', { path: '/a/b/app.ts' })).toBe(
      '/a/b/app.ts'
    );
    expect(summarizeToolInput('bash', { command: 'ls -la' })).toBe('ls -la');
    expect(
      summarizeToolInput('web_fetch', { url: 'https://www.example.com/a' })
    ).toBe('example.com');
  });

  it('show_pose 摘要覆盖三参数，动作与气泡转中文观感', () => {
    expect(
      summarizeToolInput('show_pose', {
        pose: '开心',
        motion: 'happy-bounce',
        bubble: 'happy',
      })
    ).toBe('开心 开心弹跳 高兴');
    expect(summarizeToolInput('show_pose', { bubble: 'sigh' })).toBe('叹气');
    expect(summarizeToolInput('show_pose', {})).toBe('');
  });

  it('缺参与空对象返回空串', () => {
    expect(summarizeToolInput('read_file', {})).toBe('');
    expect(summarizeToolInput('bash')).toBe('');
  });

  it('未登记工具 JSON 化掩码后截断 40', () => {
    const summary = summarizeToolInput('custom_tool', {
      blob: 'x'.repeat(80),
    });
    expect(summary.length).toBeLessThanOrEqual(40);
    expect(summary.endsWith('…')).toBe(true);
  });
});

describe('演出名单常量', () => {
  it('动作四个，情绪气泡十五个，思考气泡不在名单里，中文表的键集与名单逐一对应', () => {
    expect([...MOTION_NAMES]).toEqual([
      'happy-bounce',
      'angry-stomp',
      'heart-beat',
      'sad-sink',
    ]);
    expect(BUBBLE_NAMES).toHaveLength(15);
    expect(BUBBLE_NAMES).not.toContain(THINKING_BUBBLE);
    expect(THINKING_BUBBLE).toBe('thinking');
    expect(Object.keys(MOTION_CN)).toEqual([...MOTION_NAMES]);
    expect(Object.keys(BUBBLE_CN)).toEqual([...BUBBLE_NAMES]);
  });

  it('名单守卫只放行名单内的字符串，思考气泡与未登记的名字一并挡下', () => {
    expect(isMotionName('heart-beat')).toBe(true);
    expect(isMotionName('angry-jump')).toBe(false);
    expect(isBubbleName('flutter')).toBe(true);
    expect(isBubbleName('star')).toBe(false);
    expect(isBubbleName('thinking')).toBe(false);
    expect(isBubbleName(undefined)).toBe(false);
  });
});

describe('successfulShowPose 三参数提取', () => {
  it('收窄出合法的三参数', () => {
    expect(
      successfulShowPose({
        pose: 'angry',
        motion: 'angry-stomp',
        bubble: 'angry',
      })
    ).toEqual({ pose: 'angry', motion: 'angry-stomp', bubble: 'angry' });
  });

  it('名单外的动作与气泡按缺省处理，空字符串的立绘不算填', () => {
    expect(
      successfulShowPose({ pose: '', motion: 'angry-jump', bubble: 'star' })
    ).toBeUndefined();
    expect(
      successfulShowPose({
        pose: '开心',
        motion: 'angry-jump',
        bubble: 'happy',
      })
    ).toEqual({ pose: '开心', bubble: 'happy' });
  });

  it('缺参数对象或三值全空时返回 undefined', () => {
    expect(successfulShowPose(undefined)).toBeUndefined();
    expect(successfulShowPose({})).toBeUndefined();
  });
});

describe('maskSensitive 凭据掩码', () => {
  it('值形态整段替换', () => {
    expect(maskSensitive('key sk-abcdefgh12345678 end')).toBe(
      'key ******** end'
    );
    expect(maskSensitive('Authorization: Bearer abcdefghijkl789')).toContain(
      '********'
    );
  });

  it('键值对形态保留键只换值', () => {
    expect(maskSensitive('"api_key": "deadbeef1234"')).toBe(
      '"api_key": "********"'
    );
    expect(maskSensitive('password=hunter2alpha')).toBe('password=********');
  });

  it('Bash 命令里的密钥先掩码再进摘要', () => {
    expect(
      summarizeToolInput('bash', { command: 'curl -H sk-abcdefgh12345678' })
    ).toBe('curl -H ********');
  });
});

describe('气泡资源索引', () => {
  it('键集是 shared 的气泡名单加思考气泡，加图漏登记当场拦截', () => {
    expect(Object.keys(EFFECT_URLS).sort()).toEqual(
      [...BUBBLE_NAMES, THINKING_BUBBLE].sort()
    );
    expect(Object.values(EFFECT_URLS).every((url) => url.length > 0)).toBe(
      true
    );
  });
});

describe('内置图标表覆盖', () => {
  it('键集与 shared 的内置条目 id 完全一致，改名漏改当场拦截', () => {
    expect(Object.keys(BUILTIN_ICONS).sort()).toEqual(
      [...BUILTIN_TOOLSET_IDS].sort()
    );
  });
});
