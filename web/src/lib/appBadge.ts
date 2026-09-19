type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

// The number on the home-screen icon: overdue invoices, recurring expenses
// due and bills due within three days, the same things the daily
// notification counts. iPhone shows it once notifications are allowed.
export function showOnAppIcon(count: number) {
  const nav = navigator as BadgeNavigator;
  try {
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    done?.catch(() => {});
  } catch {
    // No badge support here.
  }
}
