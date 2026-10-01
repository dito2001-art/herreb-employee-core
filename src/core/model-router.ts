import type { EmployeeId } from "./contracts";

export interface ModelRouteRequest {
  tenantId: string;
  employeeId: EmployeeId;
  taskType?: string;
  requiresVision?: boolean;
  requiresTools?: boolean;
}

export interface ModelRoute {
  provider: string;
  model: string;
  reason: string;
}

export interface ModelRouter {
  resolve(request: ModelRouteRequest): Promise<ModelRoute> | ModelRoute;
}

export class StaticModelRouter implements ModelRouter {
  constructor(private readonly route: ModelRoute) {}

  resolve(_request: ModelRouteRequest): ModelRoute {
    return this.route;
  }
}
