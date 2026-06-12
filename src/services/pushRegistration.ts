import { getApp } from 'firebase/app';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase/firebase';

export type PushChannel = 'fcm' | 'webpush';

export interface PushRegistrationResult {
  success: boolean;
  channel?: PushChannel;
  message: string;
}

interface PortablePushSubscription {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

function supportsNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

function isIosStandalonePwa(): boolean {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone = navigatorWithStandalone.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iP(hone|od|ad)/.test(window.navigator.userAgent || '');

  return isIOS && isStandalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function registerWebPush(): Promise<PushRegistrationResult> {
  if (!('PushManager' in window)) {
    return { success: false, message: 'Web Push is not supported on this browser.' };
  }

  const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined;
  if (!publicKey) {
    return { success: false, message: 'Web Push public key is not configured.' };
  }

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subscriptionJson = subscription.toJSON() as PortablePushSubscription;
  const functions = getFunctions(getApp(), 'europe-west3');
  const saveWebPushSubscription = httpsCallable<{ subscription: PortablePushSubscription }, { success: boolean }>(
    functions,
    'saveWebPushSubscription'
  );

  await saveWebPushSubscription({ subscription: subscriptionJson });

  return { success: true, channel: 'webpush', message: 'Web Push notifications are enabled.' };
}

async function registerFcm(uid: string): Promise<PushRegistrationResult> {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const messaging = getMessaging(getApp());
  const serviceWorkerRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration,
  });

  if (!token) {
    return { success: false, message: 'Could not create an FCM token for this browser.' };
  }

  await setDoc(doc(db, 'users', uid), { fcmToken: token }, { merge: true });

  return { success: true, channel: 'fcm', message: 'Push notifications are enabled.' };
}

export async function registerPushNotifications(
  uid: string | null,
  options: { requestPermission?: boolean } = {}
): Promise<PushRegistrationResult> {
  if (!uid) {
    return { success: false, message: 'You must be signed in to enable notifications.' };
  }

  if (!supportsNotifications()) {
    return { success: false, message: 'Notifications are not supported on this device.' };
  }

  const shouldRequestPermission = options.requestPermission !== false;
  const permission = shouldRequestPermission
    ? await Notification.requestPermission()
    : Notification.permission;

  if (permission !== 'granted') {
    return { success: false, message: 'Notification permission was not granted.' };
  }

  if (isIosStandalonePwa()) {
    return registerWebPush();
  }

  return registerFcm(uid);
}

export async function refreshPushRegistrationIfPermitted(uid: string | null): Promise<PushRegistrationResult | null> {
  if (!supportsNotifications() || Notification.permission !== 'granted') {
    return null;
  }

  return registerPushNotifications(uid, { requestPermission: false });
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!supportsNotifications()) return 'unsupported';
  return Notification.permission;
}
