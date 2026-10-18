export type HealthState = 'ok' | 'degraded';
export type HealthCheckState = 'up' | 'down';

/** Payload of `GET /health` (inside the unified `{ code, data }` envelope). */
export interface HealthData {
  status: HealthState;
  version: string;
  uptimeSeconds: number;
  checks: {
    database: HealthCheckState;
  };
}
