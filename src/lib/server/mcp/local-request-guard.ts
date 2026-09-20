import { validateLocalRequest } from '$lib/server/local-request-guard';

export function validateLocalMcpRequest(request: Request): Response | null {
  return validateLocalRequest(request);
}
