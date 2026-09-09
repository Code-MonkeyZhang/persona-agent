import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll
} from 'vitest';
import { logger, setupGlobalErrorLogging } from '@/lib/logger';
import type { WindowAPI } from '@shared/api';

describe('Renderer Logger', () => {
  const originalWindow = global.window;
  const logMock = vi.fn();

  beforeAll(() => {
    global.window = new EventTarget() as unknown as Window & typeof globalThis;
    global.window.api = { log: logMock } as unknown as WindowAPI;
  });

  beforeEach(() => {
    logMock.mockClear();
  });

  afterAll(() => {
    global.window = originalWindow;
  });

  it('should forward info logs with scope prefix', () => {
    logger.info('updater', 'user triggered update check');

    expect(logMock).toHaveBeenCalledWith(
      'info',
      '[updater]',
      'user triggered update check'
    );
  });

  it('should serialize Error objects with stack', () => {
    const err = new Error('boom');
    logger.error('renderer', err);

    const payload = logMock.mock.calls.at(-1)?.[2] as string;
    expect(payload).toContain('Error: boom');
    expect(payload).toContain('at ');
  });

  it('should stay silent when window.api is missing', () => {
    global.window.api = undefined;

    expect(() => logger.info('updater', 'silent')).not.toThrow();
    expect(logMock).not.toHaveBeenCalled();

    global.window.api = { log: logMock } as unknown as WindowAPI;
  });

  it('should forward uncaught error events to the log', () => {
    setupGlobalErrorLogging();

    global.window.dispatchEvent(
      Object.assign(new Event('error'), { message: 'crash', filename: 'app.tsx' })
    );

    expect(logMock).toHaveBeenCalledWith(
      'error',
      '[renderer]',
      'crash',
      'app.tsx',
      undefined
    );
  });
});
