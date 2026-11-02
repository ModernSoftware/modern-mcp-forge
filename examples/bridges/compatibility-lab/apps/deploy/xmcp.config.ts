import type { XmcpConfig } from 'xmcp';
export default {
  stdio: true,
  http: false,
  paths: { tools: 'src/tools', prompts: false, resources: false }
} satisfies XmcpConfig;
