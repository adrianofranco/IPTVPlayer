// Armazenamento chave-valor para cache. IndexedDB no runtime; memoria como fallback/teste.

export interface CacheRecord {
  fetchedAt: number;
  value: unknown;
}

export interface KvStore {
  get(key: string): Promise<CacheRecord | undefined>;
  set(key: string, rec: CacheRecord): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'iptv-cache';
const STORE = 'kv';

export class IndexedDbStore implements KvStore {
  private dbp?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbp;
  }

  async get(key: string): Promise<CacheRecord | undefined> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as CacheRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async set(key: string, rec: CacheRecord): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export class MemoryStore implements KvStore {
  private readonly map = new Map<string, CacheRecord>();
  async get(key: string): Promise<CacheRecord | undefined> {
    return this.map.get(key);
  }
  async set(key: string, rec: CacheRecord): Promise<void> {
    this.map.set(key, rec);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
}

/** Escolhe o store disponivel: IndexedDB (browser/Tizen) ou memoria (fallback). */
export function makeStore(): KvStore {
  return typeof indexedDB !== 'undefined' ? new IndexedDbStore() : new MemoryStore();
}
