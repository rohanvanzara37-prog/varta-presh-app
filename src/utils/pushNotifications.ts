export type PushPermissionState = NotificationPermission | 'unsupported';

export function getPushPermission(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export async function sendPushNotification(params: {
  title: string;
  body: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(params.title, {
          body: params.body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: params.tag ?? 'tredaura-alert',
          renotify: true,
        } as NotificationOptions);
        return true;
      }
    }

    new Notification(params.title, {
      body: params.body,
      icon: '/pwa-192x192.png',
      tag: params.tag ?? 'tredaura-alert',
    });
    return true;
  } catch {
    return false;
  }
}
