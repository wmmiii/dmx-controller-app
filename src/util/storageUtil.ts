const DB_KEY = 'dmx-controller';
const BLOBSTORE_KEY = 'blobstore';

export async function getBlob(key: string): Promise<Uint8Array> {
  const db = await getDb();
  const transaction = db.transaction([BLOBSTORE_KEY], 'readonly');
  const os = transaction.objectStore(BLOBSTORE_KEY);
  const request = os.get(key);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = reject;
  });
}

export async function storeBlob(key: string, value: Uint8Array): Promise<void> {
  const object = {
    key,
    value,
  };
  const db = await getDb();
  const transaction = db.transaction([BLOBSTORE_KEY], 'readwrite');
  const os = transaction.objectStore(BLOBSTORE_KEY);
  const request = os.put(object);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = reject;
  });
}

function getDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_KEY, 1);

  request.onupgradeneeded = (ev) => {
    const db: IDBDatabase = (ev.target as IDBOpenDBRequest).result;
    db.createObjectStore(BLOBSTORE_KEY, {
      keyPath: 'key',
    });
  };

  return new Promise((resolve, reject) => {
    request.onsuccess = (ev) => resolve((ev.target as IDBOpenDBRequest).result);
    request.onerror = (ev) => reject(ev);
  });
}
