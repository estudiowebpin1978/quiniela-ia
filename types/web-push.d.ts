declare module "web-push" {
  interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
  }
  interface PushSubscription {
    endpoint: string;
    keys: PushSubscriptionKeys;
  }
  interface VapidKeys {
    publicKey: string;
    privateKey: string;
  }
  export function setVapidDetails(
    email: string,
    publicKey: string,
    privateKey: string
  ): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload: string,
    options?: object
  ): Promise<void>;
  export function generateVAPIDKeys(): VapidKeys;
}
