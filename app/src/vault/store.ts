export type VaultRecord = {
  v: 1;
  salt: string;
  iterations: number;
  nonce: string;
  data: string;
};

export type VaultStore = {
  read(): Promise<VaultRecord | undefined>;
  write(record: VaultRecord): Promise<void>;
};

const DB = "keelson";
const TABLE = "vault";
const KEY = "main";

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TABLE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async <T>(
  mode: IDBTransactionMode,
  action: (table: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(TABLE, mode).objectStore(TABLE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

export const browserStore: VaultStore = {
  read: async () => (await run("readonly", (table) => table.get(KEY))) as VaultRecord | undefined,
  write: async (record) => {
    await run("readwrite", (table) => table.put(record, KEY));
  },
};
