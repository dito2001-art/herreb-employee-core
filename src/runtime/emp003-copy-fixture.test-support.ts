import { webcrypto } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CopyContext } from "./emp003-copy-context";
interface FixtureStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T = unknown>(options: { prefix: string }): Promise<Map<string, T>>;
  transaction<T>(work: (txn: FixtureStorage) => Promise<T>): Promise<T>;
}
export function copyFixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE records(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  let queue = Promise.resolve();
  const storage: FixtureStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const row = db
        .prepare("SELECT value FROM records WHERE key=?")
        .get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) : undefined;
    },
    async put<T>(key: string, value: T) {
      db.prepare(
        "INSERT INTO records VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).run(key, JSON.stringify(value));
    },
    async list<T = unknown>(options: { prefix: string }) {
      return new Map(
        (
          db
            .prepare("SELECT key,value FROM records WHERE substr(key,1,?)=?")
            .all(options.prefix.length, options.prefix) as {
            key: string;
            value: string;
          }[]
        ).map((x) => [x.key, JSON.parse(x.value) as T])
      );
    },
    async transaction<T>(
      work: (txn: FixtureStorage) => Promise<T>
    ): Promise<T> {
      const before = queue;
      let release!: () => void;
      queue = new Promise((r) => {
        release = r;
      });
      await before;
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = await work(storage);
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      } finally {
        release();
      }
    }
  };
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    async put(key: string, bytes: Uint8Array) {
      objects.set(key, Uint8Array.from(bytes));
    },
    async get(key: string) {
      const data = objects.get(key);
      return data
        ? {
            async arrayBuffer() {
              return Uint8Array.from(data).buffer;
            }
          }
        : null;
    }
  };
  return { db, storage, bucket: bucket as unknown as R2Bucket, objects };
}
export const copyBlueprint = {
  tenantId: "tenant-a",
  correlationId: "corr",
  name: "Campaña noviembre",
  schedule: { startDate: "2026-11-01", endDate: "2026-11-30" },
  objective: "Recibir consultas",
  audiences: ["Empresas"],
  positioning: "Consultoría",
  keyMessages: ["Consultanos"],
  channels: [{ name: "Email", actions: ["Preparar copy"] }],
  kpis: [{ metric: "Consultas", target: "10", measurement: "CRM" }],
  assumptions: [],
  evidenceRefs: ["https://example.com/service"],
  status: "DRAFT" as const,
  publishApproved: false as const
};
export const copyContext: CopyContext = {
  tenantId: "tenant-a",
  revision: 1,
  dailyLimit: 3,
  brand: {
    tenantId: "tenant-a",
    name: "HerreB",
    voice: ["vos"],
    prohibitedThemes: ["garantías"]
  },
  audiences: [
    {
      id: "audience",
      tenantId: "tenant-a",
      name: "Empresas",
      description: "Empresas paraguayas",
      needs: [],
      channels: ["Email"]
    }
  ],
  offerings: [
    {
      id: "offering",
      tenantId: "tenant-a",
      type: "SERVICE",
      name: "Consultoría",
      active: true,
      metadata: {}
    }
  ],
  knowledge: [
    {
      id: "knowledge",
      tenantId: "tenant-a",
      namespace: "brand",
      kind: "CANONICAL",
      subject: "Oferta",
      content: { service: "Consultoría" },
      sourceRefs: ["https://example.com/service"],
      verified: true,
      updatedAt: "2026-10-28"
    }
  ],
  claims: [
    {
      id: "claim",
      tenantId: "tenant-a",
      offeringId: "offering",
      text: "Ofrecemos consultoría",
      sourceKnowledgeIds: ["knowledge"],
      verified: true
    }
  ],
  campaigns: [
    {
      campaignId: "campaign",
      campaignRevision: 1,
      audienceId: "audience",
      offeringId: "offering",
      channel: "Email",
      objective: {
        id: "objective",
        tenantId: "tenant-a",
        name: "Consultas",
        outcome: "Recibir consultas",
        targetMetric: "Consultas",
        targetValue: 10,
        startsAt: "2026-11-01",
        endsAt: "2026-11-30"
      }
    }
  ]
};
export const copyRequest = {
  campaignId: "campaign",
  assetId: "copy",
  operationId: "op-1",
  expectedRevision: 0,
  campaignRevision: 1,
  channel: "Email"
};

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
export async function copyAuth() {
  const pair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const token = async (email: string) => {
    const seconds = Math.floor(Date.now() / 1000);
    const payload =
      encode({ alg: "RS256", kid: "copy" }) +
      "." +
      encode({
        iss: "https://copy.cloudflareaccess.com",
        aud: "copy",
        email,
        iat: seconds - 10,
        exp: seconds + 600
      });
    return (
      payload +
      "." +
      Buffer.from(
        await webcrypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          pair.privateKey,
          new TextEncoder().encode(payload)
        )
      ).toString("base64url")
    );
  };
  return {
    a: await token("a@test.invalid"),
    b: await token("b@test.invalid"),
    fetcher: (async () =>
      Response.json({
        keys: [{ ...jwk, kid: "copy", alg: "RS256", use: "sig" }]
      })) as typeof fetch
  };
}
