export type HealthState = 'ok' | 'degraded';
export type HealthCheckState = 'up' | 'down';

/** Payload of `GET /health` and its liveness/readiness probes (unified envelope). */
export interface HealthData {
  status: HealthState;
  version: string;
  uptimeSeconds: number;
  /** `database` is absent on the liveness probe (`GET /health/live`). */
  checks: {
    database?: HealthCheckState;
  };
}
