const DB_NAME = 'cafe-app-db';
const DB_VERSION = 1;
const STORE_NAME = 'pendingActions';

interface PendingAction {
  id?: number;
  type: string;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addPendingAction(action: Omit<PendingAction, 'id' | 'createdAt' | 'status' | 'retryCount'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add({
      ...action,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    });
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getPendingCount(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const count = store.count('pending');
      count.onsuccess = () => {
        resolve(count.result);
        db.close();
      };
      count.onerror = () => {
        resolve(0);
        db.close();
      };
    });
  } catch {
    return 0;
  }
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => {
      resolve(request.result);
      db.close();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateActionStatus(id: number, status: PendingAction['status'], retryCount?: number) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const action = getRequest.result;
      if (!action) { resolve(undefined); return; }
      action.status = status;
      if (retryCount !== undefined) action.retryCount = retryCount;
      store.put(action);
      tx.oncomplete = () => { resolve(undefined); db.close(); };
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeAction(id: number) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => { resolve(undefined); db.close(); };
    tx.onerror = () => reject(tx.error);
  });
}

const MAX_RETRIES = 3;

export async function syncPendingActions() {
  const actions = await getPendingActions();
  if (actions.length === 0) return;

  for (const action of actions) {
    if (action.retryCount >= MAX_RETRIES) {
      await updateActionStatus(action.id!, 'failed', action.retryCount);
      continue;
    }

    await updateActionStatus(action.id!, 'syncing', action.retryCount);

    try {
      const { default: api } = await import('@/lib/api');
      await api({
        method: action.method,
        url: action.endpoint,
        data: action.payload,
      });
      await removeAction(action.id!);
    } catch {
      const newRetry = action.retryCount + 1;
      await updateActionStatus(action.id!, newRetry >= MAX_RETRIES ? 'failed' : 'pending', newRetry);
    }
  }
}

export async function queueOfflineAction(action: Omit<PendingAction, 'id' | 'createdAt' | 'status' | 'retryCount'>) {
  const id = await addPendingAction(action);

  if (navigator.onLine) {
    await syncPendingActions();
  }

  return id;
}
