import { expect, test } from 'bun:test';
import {
  afterConfirmingProjectLeave,
  canLeaveProject,
  registerProjectLeaveGuard
} from '../../src/lib/navigation/project-leave';

test('declining an unsaved-change guard prevents close side effects', async () => {
  const dispose = registerProjectLeaveGuard(() => false);
  let closed = false;
  try {
    await afterConfirmingProjectLeave(async () => {
      closed = true;
    });
    expect(closed).toBe(false);
  } finally {
    dispose();
  }
  expect(canLeaveProject()).toBe(true);
});

test('confirmed close prompts once, and a failed close restores guarding', async () => {
  let checks = 0;
  const dispose = registerProjectLeaveGuard(() => {
    checks++;
    return true;
  });
  try {
    await expect(
      afterConfirmingProjectLeave(async () => {
        expect(canLeaveProject()).toBe(true);
        throw new Error('cleanup failed');
      })
    ).rejects.toThrow('cleanup failed');
    expect(checks).toBe(1);
    expect(canLeaveProject()).toBe(true);
    expect(checks).toBe(2);
  } finally {
    dispose();
  }
});
