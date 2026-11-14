import packageJson from "../../../package.json" with { type: "json" };

export const MCP_SERVER_NAME = "qraftbox-tools";
export const MCP_SERVER_VERSION = packageJson.version;

export function formatAllowedToolName(toolName: string): string {
  return `mcp__${MCP_SERVER_NAME}__${toolName}`;
}
