/** Client-side guards shared by navigation and the destructive Close action. */
const guards = new Set<() => boolean>();
let confirmed = false;

export function registerProjectLeaveGuard(guard: () => boolean) {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export function canLeaveProject() {
  return confirmed || [...guards].every((guard) => guard());
}

export async function afterConfirmingProjectLeave(action: () => Promise<void>) {
  if (!canLeaveProject()) return;
  confirmed = true;
  try {
    await action();
  } finally {
    confirmed = false;
  }
}
