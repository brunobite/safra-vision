import { DB_NAME } from "@/lib/db";

export async function clearLocalAppDeviceData(): Promise<void> {
  if (typeof window === "undefined") return;

  const deletions: Promise<unknown>[] = [];

  // IndexedDB principal
  deletions.push(new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba."));
  }));

  // Cache API / Service Worker caches
  if ("caches" in window) {
    deletions.push((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }

  // Local/session storage ligados ao app
  const storagePrefixes = ["safra", "baseMode", "import", "offline", "sync", "sidebar"]; 
  const removeByPrefix = (storage: Storage) => {
    const keys = Object.keys(storage);
    keys.forEach((key) => {
      if (storagePrefixes.some((prefix) => key.toLowerCase().includes(prefix.toLowerCase()))) {
        storage.removeItem(key);
      }
    });
  };

  removeByPrefix(window.localStorage);
  removeByPrefix(window.sessionStorage);

  await Promise.allSettled(deletions);

  // unregister SW + hard reload
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}
