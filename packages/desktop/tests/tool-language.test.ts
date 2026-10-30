/**
 * @file 行语言映射的纯函数测试，动向句、参数摘要与凭据掩码的口径在此锁定
 * 文案按预览文案口径节的双语映射表，工具实名用本体内置工具的 snake_case 名
 */
import { describe, expect, it } from 'vitest';
import {
  phraseForThought,
  stepPhrase,
  type LiveStep,
} from '@/components/chat/LiveStrip';
import { maskSensitive, summarizeToolInput } from '@persona/shared';
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
  'live.showPose': '切换表情',
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
      '正在读取 chat.ts',
    );
    expect(stepPhrase(t, step('edit_file', 'src/app.ts'))).toBe(
      '正在编辑 app.ts',
    );
    expect(stepPhrase(t, step('write_file', 'config.json'))).toBe(
      '正在写入 config.json',
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
    expect(stepPhrase(t, step('bash', cmd))).toBe(
      `运行 ${cmd.slice(0, 23)}…`,
    );
  });

  it('表情与后台命令族是固定句式', () => {
    expect(stepPhrase(t, step('show_pose', 'happy'))).toBe('切换表情');
    expect(stepPhrase(t, step('get_current_pose', ''))).toBe('查看当前表情');
    expect(stepPhrase(t, step('bash_output', 'bash_1'))).toBe('查看后台输出');
    expect(stepPhrase(t, step('bash_kill', 'bash_1'))).toBe('终止后台命令');
  });

  it('未登记的第三方工具统一正在执行加工具名', () => {
    expect(stepPhrase(t, step('mcp__weather__lookup', ''))).toBe(
      '正在执行 mcp__weather__lookup',
    );
  });
});

describe('phraseForThought 适配器', () => {
  it('工具步经摘要转动向句', () => {
    expect(
      phraseForThought(
        t,
        thought({ toolName: 'read_file', toolInput: { path: '/a/b/app.ts' } }),
      ),
    ).toBe('正在读取 app.ts');
  });

  it('思考行与错误行原样返回正文', () => {
    expect(
      phraseForThought(t, thought({ type: 'thinking', content: '先查日志' })),
    ).toBe('先查日志');
  });
});

describe('summarizeToolInput 参数摘要', () => {
  it('按工具实名取关键参数', () => {
    expect(
      summarizeToolInput('read_file', { path: '/a/b/app.ts' }),
    ).toBe('/a/b/app.ts');
    expect(summarizeToolInput('bash', { command: 'ls -la' })).toBe('ls -la');
    expect(summarizeToolInput('web_fetch', { url: 'https://www.example.com/a' })).toBe(
      'example.com',
    );
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

describe('maskSensitive 凭据掩码', () => {
  it('值形态整段替换', () => {
    expect(maskSensitive('key sk-abcdefgh12345678 end')).toBe(
      'key ******** end',
    );
    expect(maskSensitive('Authorization: Bearer abcdefghijkl789')).toContain(
      '********',
    );
  });

  it('键值对形态保留键只换值', () => {
    expect(maskSensitive('"api_key": "deadbeef1234"')).toBe(
      '"api_key": "********"',
    );
    expect(maskSensitive('password=hunter2alpha')).toBe('password=********');
  });

  it('Bash 命令里的密钥先掩码再进摘要', () => {
    expect(
      summarizeToolInput('bash', { command: 'curl -H sk-abcdefgh12345678' }),
    ).toBe('curl -H ********');
  });
});
