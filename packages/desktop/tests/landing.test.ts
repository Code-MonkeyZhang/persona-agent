/**
 * @file 首启向导纯逻辑测试，覆盖 shouldAutoShowWizard 的触发对照表
 */
import { describe, it, expect } from 'vitest';
import { shouldAutoShowWizard } from '@/lib/landing';
import type { AgentSeedStatus } from '@persona/shared';

const freshSeed: AgentSeedStatus = {
  seeded: true,
  onboarded: false,
  agentId: 'agent-1',
};

describe('shouldAutoShowWizard', () => {
  it('shows wizard for local connection to seeded un-onboarded host', () => {
    expect(
      shouldAutoShowWizard({
        isLocalConnection: true,
        seed: freshSeed,
        seededAgentExists: true,
      })
    ).toBe(true);
  });

  it('never shows wizard on remote connection', () => {
    expect(
      shouldAutoShowWizard({
        isLocalConnection: false,
        seed: freshSeed,
        seededAgentExists: true,
      })
    ).toBe(false);
  });

  it('does not show wizard when host is already onboarded', () => {
    expect(
      shouldAutoShowWizard({
        isLocalConnection: true,
        seed: { ...freshSeed, onboarded: true },
        seededAgentExists: true,
      })
    ).toBe(false);
  });

  it('treats missing onboarded field as un-onboarded', () => {
    const legacySeed: AgentSeedStatus = { seeded: true, agentId: 'agent-1' };
    expect(
      shouldAutoShowWizard({
        isLocalConnection: true,
        seed: legacySeed,
        seededAgentExists: true,
      })
    ).toBe(true);
  });

  it('does not show wizard when seeded agent is gone', () => {
    expect(
      shouldAutoShowWizard({
        isLocalConnection: true,
        seed: freshSeed,
        seededAgentExists: false,
      })
    ).toBe(false);
  });

  it('does not show wizard when host is not seeded', () => {
    expect(
      shouldAutoShowWizard({
        isLocalConnection: true,
        seed: { seeded: false },
        seededAgentExists: false,
      })
    ).toBe(false);
  });
});
