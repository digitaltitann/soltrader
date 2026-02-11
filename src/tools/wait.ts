import { ToolResult } from '../types';
import { logInfo } from '../logger';

export async function waitTool(params: { seconds?: number }): Promise<ToolResult> {
  const seconds = Math.min(300, Math.max(10, params.seconds ?? 60));
  logInfo(`Agent waiting ${seconds}s before next cycle...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  return {
    success: true,
    data: { waited_seconds: seconds, resumed_at: new Date().toISOString() },
  };
}
