import { DurableObject } from "cloudflare:workers";
import { EMP002Operations as Calendar } from "../runtime/emp002-operations";
import { EMP003CampaignState as Marketing } from "../runtime/emp003-campaign-state";
import {
  authorizeBoundary,
  boundaryDenied,
  type BoundaryEnv
} from "./workforce-do-boundary";
type IsolatedEnv = Env &
  BoundaryEnv & {
    TENANT_MANIFESTS_JSON?: string;
    EMP003_ASSET_BUCKET?: R2Bucket;
    EMP003_COPY_CONTEXTS_JSON?: string;
  };
/** Composition, not inheritance: domain private/public methods are never RPC exports. */
export class EMP002Operations extends DurableObject<IsolatedEnv> {
  #delegate?: Calendar;
  async fetch(request: Request): Promise<Response> {
    if (!(await authorizeBoundary(request, this.ctx, this.env, "calendar")))
      return boundaryDenied();
    this.#delegate ??= new Calendar(this.ctx, {
      TENANT_MANIFESTS_JSON: this.env.TENANT_MANIFESTS_JSON
    } as ConstructorParameters<typeof Calendar>[1]);
    try {
      return await this.#delegate.fetch(request);
    } catch {
      return Response.json(
        { ok: false, error: "CALENDAR_STORAGE_UNAVAILABLE" },
        { status: 503 }
      );
    }
  }
}
export class EMP003CampaignState extends DurableObject<IsolatedEnv> {
  #delegate?: Marketing;
  async fetch(request: Request): Promise<Response> {
    if (!(await authorizeBoundary(request, this.ctx, this.env, "marketing")))
      return boundaryDenied();
    this.#delegate ??= new Marketing(this.ctx, {
      AI: this.env.AI,
      EMP003_ASSET_BUCKET: this.env.EMP003_ASSET_BUCKET,
      EMP003_COPY_CONTEXTS_JSON: this.env.EMP003_COPY_CONTEXTS_JSON
    } as unknown as Env);
    try {
      return await this.#delegate.fetch(request);
    } catch {
      return Response.json(
        { ok: false, error: "MARKETING_STORAGE_UNAVAILABLE" },
        { status: 503 }
      );
    }
  }
}
