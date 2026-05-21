import fs from "fs";
import path from "path";
import { supabase } from "../supabaseClient";

export interface CacheStats {
  hitsL1: number;
  hitsL2: number;
  hitsL3: number;
  misses: number;
}

// Global Cache Telemetry Stats
export const cacheStats: CacheStats = {
  hitsL1: 0,
  hitsL2: 0,
  hitsL3: 0,
  misses: 0
};

const CACHE_DIR = path.join(process.cwd(), "training", "cache");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export class MultiLayerCache<T = any> {
  private namespace: string;
  private l1Cache = new Map<string, { value: T; expiry: number }>();
  private defaultTTL: number;
  private diskFilePath: string;

  constructor(namespace: string, defaultTTLMs: number = 10 * 60 * 1000) {
    this.namespace = namespace;
    this.defaultTTL = defaultTTLMs;
    this.diskFilePath = path.join(CACHE_DIR, `${namespace}.json`);
    ensureCacheDir();
    this.loadL2FromDisk();
  }

  /**
   * Reads L2 persistent cache from disk on initialization.
   */
  private loadL2FromDisk() {
    try {
      if (fs.existsSync(this.diskFilePath)) {
        const fileContent = fs.readFileSync(this.diskFilePath, "utf8");
        const parsed = JSON.parse(fileContent);
        
        // Populate L1 cache with valid items from L2 disk
        const now = Date.now();
        for (const [key, item] of Object.entries(parsed) as any[]) {
          if (item.expiry > now) {
            this.l1Cache.set(key, { value: item.value, expiry: item.expiry });
          }
        }
        console.log(`[Cache:${this.namespace}] Loaded ${this.l1Cache.size} items from L2 disk cache.`);
      }
    } catch (e) {
      console.error(`[Cache:${this.namespace}] Failed to load L2 cache from disk:`, e);
    }
  }

  /**
   * Persists current L1 memory cache state back to L2 disk file.
   */
  private saveL2ToDisk() {
    try {
      ensureCacheDir();
      const obj: Record<string, any> = {};
      const now = Date.now();
      
      for (const [key, item] of this.l1Cache.entries()) {
        if (item.expiry > now) {
          obj[key] = { value: item.value, expiry: item.expiry };
        }
      }
      
      fs.writeFileSync(this.diskFilePath, JSON.stringify(obj, null, 2), "utf8");
    } catch (e) {
      console.error(`[Cache:${this.namespace}] Failed to save L2 cache to disk:`, e);
    }
  }

  /**
   * Retrieves value from the 3-level hierarchy.
   */
  async get<R = T>(key: string): Promise<R | null> {
    const now = Date.now();
    const namespacedKey = `${this.namespace}:${key}`;

    // ---- LEVEL 1: In-Memory ----
    const l1Item = this.l1Cache.get(key);
    if (l1Item) {
      if (l1Item.expiry > now) {
        cacheStats.hitsL1 += 1;
        return l1Item.value as unknown as R;
      } else {
        this.l1Cache.delete(key);
      }
    }

    // ---- LEVEL 2: Disk Cache ----
    // Note: Items from disk are pre-loaded to L1 on startup.
    // However, if written dynamically and cleared in memory, we verify disk:
    try {
      if (fs.existsSync(this.diskFilePath)) {
        const fileContent = fs.readFileSync(this.diskFilePath, "utf8");
        const diskData = JSON.parse(fileContent);
        const l2Item = diskData[key];
        if (l2Item && l2Item.expiry > now) {
          cacheStats.hitsL2 += 1;
          // Populate L1 cache
          this.l1Cache.set(key, { value: l2Item.value, expiry: l2Item.expiry });
          return l2Item.value as unknown as R;
        }
      }
    } catch (e) {
      // Ignore disk parse errors
    }

    // ---- LEVEL 3: Distributed Database Cache (Supabase) ----
    try {
      const { data, error } = await supabase
        .from("candy_cache")
        .select("value, expiry")
        .eq("key", namespacedKey)
        .single();

      if (data && !error) {
        const dbExpiry = new Date(data.expiry).getTime();
        if (dbExpiry > now) {
          cacheStats.hitsL3 += 1;
          const val = data.value as unknown as T;

          // Backfill L1 and L2
          this.l1Cache.set(key, { value: val, expiry: dbExpiry });
          this.saveL2ToDisk();

          return val as unknown as R;
        } else {
          // Expired database item cleanup
          supabase.from("candy_cache").delete().eq("key", namespacedKey).then();
        }
      }
    } catch (e) {
      console.warn(`[Cache:${this.namespace}] L3 Database Cache lookup failed:`, e);
    }

    // Cache Miss
    cacheStats.misses += 1;
    return null;
  }

  /**
   * Sets value across all 3 tiers.
   */
  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTTL;
    const expiryTime = Date.now() + ttl;
    const namespacedKey = `${this.namespace}:${key}`;

    // 1. Write to L1 In-Memory
    this.l1Cache.set(key, { value, expiry: expiryTime });

    // 2. Write to L2 Local Disk
    this.saveL2ToDisk();

    // 3. Write to L3 Supabase Cache Table
    try {
      const expiryDate = new Date(expiryTime).toISOString();
      const { error } = await supabase
        .from("candy_cache")
        .upsert({
          key: namespacedKey,
          value: value as any,
          expiry: expiryDate
        }, {
          onConflict: "key"
        });

      if (error) {
        console.warn(`[Cache:${this.namespace}] L3 Database Cache write error:`, error);
      }
    } catch (e) {
      console.warn(`[Cache:${this.namespace}] L3 Database Cache upsert exception:`, e);
    }
  }

  /**
   * Invalidates a key across all 3 tiers.
   */
  async invalidate(key: string): Promise<void> {
    const namespacedKey = `${this.namespace}:${key}`;
    this.l1Cache.delete(key);
    this.saveL2ToDisk();
    
    try {
      await supabase
        .from("candy_cache")
        .delete()
        .eq("key", namespacedKey);
    } catch (e) {
      console.error(`[Cache:${this.namespace}] L3 Invalidation failed:`, e);
    }
  }

  /**
   * Invalidates keys matching a regular expression pattern.
   * Useful for context-based invalidations like conversation/session IDs.
   */
  async invalidatePattern(regexPattern: RegExp): Promise<void> {
    let modified = false;
    for (const key of this.l1Cache.keys()) {
      if (regexPattern.test(key)) {
        this.l1Cache.delete(key);
        modified = true;
      }
    }

    if (modified) {
      this.saveL2ToDisk();
    }

    // Invalidate L3 matching keys by prefix or substring
    try {
      const patternStr = `%${this.namespace}%`;
      const { data, error } = await supabase
        .from("candy_cache")
        .select("key")
        .like("key", patternStr);

      if (data && !error) {
        const keysToDelete = data
          .map(d => d.key)
          .filter(k => {
            const rawKey = k.replace(`${this.namespace}:`, "");
            return regexPattern.test(rawKey);
          });

        if (keysToDelete.length > 0) {
          await supabase
            .from("candy_cache")
            .delete()
            .in("key", keysToDelete);
        }
      }
    } catch (e) {
      console.warn(`[Cache:${this.namespace}] Pattern invalidation error:`, e);
    }
  }

  /**
   * Clears the entire cache tier.
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    try {
      if (fs.existsSync(this.diskFilePath)) {
        fs.unlinkSync(this.diskFilePath);
      }
    } catch (e) {}

    try {
      const patternStr = `${this.namespace}:%`;
      await supabase
        .from("candy_cache")
        .delete()
        .like("key", patternStr);
    } catch (e) {}
  }
}

// Global cache instances supporting standard L1/L2/L3 tiers under backward-compatible APIs
export const searchCache = new MultiLayerCache<any>("tool_outputs", 15 * 60 * 1000); // 15 mins cache for search / tool outputs
export const embeddingCache = new MultiLayerCache<any>("embeddings", 60 * 60 * 1000); // 1 hour cache for vectors
export const queryCache = new MultiLayerCache<any>("queries", 2 * 60 * 1000); // 2 mins cache for exact query responses
