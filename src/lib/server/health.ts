import { checkDatabase } from '$lib/server/database';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  application: string;
  runtime: string;
  database: 'connected' | 'error';
  timestamp: string;
}

export function getHealthStatus(): HealthStatus {
  const databaseOk = checkDatabase();

  return {
    status: databaseOk ? 'ok' : 'degraded',
    application: 'Modern MCP Forge',
    runtime: `Bun ${Bun.version}`,
    database: databaseOk ? 'connected' : 'error',
    timestamp: new Date().toISOString()
  };
}
