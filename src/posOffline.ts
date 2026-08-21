import type { api } from "./api";

export type PosState = Awaited<ReturnType<typeof api.posState>>;
export type PendingSale = {
  cashSessionId?: string;
  operationId: string;
  expectedTotalCents: number;
  paymentMethod: "cash" | "card";
  items: Array<{ productId: string; quantity: number }>;
  createdAt: string;
  status: "pending" | "conflict";
  error?: string;
};
type Snapshot = { state: PosState; syncedAt: number };

const databaseName = "kontia-pos-offline";
const snapshotStore = "snapshot";
const outboxStore = "outbox";

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(snapshotStore))
        db.createObjectStore(snapshotStore);
      if (!db.objectStoreNames.contains(outboxStore))
        db.createObjectStore(outboxStore, { keyPath: "operationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore<T>(
  name: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = action(transaction.objectStore(name));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export const posOffline = {
  saveSnapshot: (state: PosState, syncedAt = Date.now()) =>
    useStore(snapshotStore, "readwrite", (store) =>
      store.put({ state, syncedAt } satisfies Snapshot, "current"),
    ),
  snapshot: () =>
    useStore<Snapshot | undefined>(snapshotStore, "readonly", (store) =>
      store.get("current"),
    ),
  putSale: (sale: PendingSale) =>
    useStore(outboxStore, "readwrite", (store) => store.put(sale)),
  sales: () =>
    useStore<PendingSale[]>(outboxStore, "readonly", (store) => store.getAll()),
  removeSale: (operationId: string) =>
    useStore(outboxStore, "readwrite", (store) => store.delete(operationId)),
  clear: async () => {
    await Promise.all([
      useStore(snapshotStore, "readwrite", (store) => store.clear()),
      useStore(outboxStore, "readwrite", (store) => store.clear()),
    ]);
  },
};

export const offlineLimitMs = 60 * 60 * 1000;
