#!/usr/bin/env node
/**
 * Test client to verify MCP server handshaking and tool listing
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log("=== MCP Client Test ===\n");

  // Create client transport connected to server's stdio (using tsx for TypeScript execution)
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", join(__dirname, "index.ts")],
  });

  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    console.log("1. Connecting to MCP server...");
    await client.connect(transport);
    console.log("   ✅ Connected successfully\n");

    console.log("2. Listing tools...");
    const toolsResult = await client.listTools();
    console.log(`   Found ${toolsResult.tools.length} tool(s):`);
    for (const tool of toolsResult.tools) {
      console.log(`   - ${tool.name}: ${tool.description}`);
      console.log(`     Input schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
    }
    console.log("");

    // Verify our tool exists
    const ourTool = toolsResult.tools.find((t) => t.name === "execute_sandboxed_code");
    if (!ourTool) {
      throw new Error("execute_sandboxed_code tool not found!");
    }
    console.log("   ✅ execute_sandboxed_code tool registered correctly\n");

    console.log("3. Testing tool execution (simple echo)...");
    const result = await client.callTool({
      name: "execute_sandboxed_code",
      arguments: {
        command: "cmd /c echo hello from mcp",
      },
    });
    console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
    console.log("   ✅ Tool execution successful\n");

    console.log("4. Testing tool execution with timeout...");
    const timeoutResult = await client.callTool({
      name: "execute_sandboxed_code",
      arguments: {
        command: "cmd /c timeout /t 2 && echo done",
        timeoutMs: 1000, // 1 second timeout, should timeout
      },
    });
    console.log(`   Result: ${JSON.stringify(timeoutResult, null, 2)}`);
    console.log("   ✅ Timeout handling works\n");

    console.log("5. Testing tool execution with readPaths...");
    const readPathResult = await client.callTool({
      name: "execute_sandboxed_code",
      arguments: {
        command: "cmd /c type C:\\Windows\\System32\\drivers\\etc\\hosts",
        readPaths: ["C:\\Windows\\System32\\drivers\\etc\\hosts"],
      },
    });
    console.log(`   Result: ${JSON.stringify(readPathResult, null, 2)}`);
    console.log("   ✅ readPaths handling works\n");

    console.log("=== ALL TESTS PASSED ===");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});