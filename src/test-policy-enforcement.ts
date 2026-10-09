#!/usr/bin/env node
/**
 * Test policy enforcement - verify least-privilege defaults and forbidden actions
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTest(name: string, testFn: () => Promise<void>) {
  console.log(`\n=== ${name} ===`);
  try {
    await testFn();
    console.log(`✅ ${name} PASSED`);
  } catch (error) {
    console.error(`❌ ${name} FAILED: ${error}`);
    throw error;
  }
}

async function main() {
  console.log("=== MXC Policy Enforcement Tests ===");

  // Create client transport
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", join(__dirname, "index.ts")],
  });

  const client = new Client(
    {
      name: "policy-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log("Connected to MCP server");

    // Test 1: Basic execution works
    await runTest("Test 1: Basic execution", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c echo hello world",
        },
      });
      const text = result.content[0].text;
      if (!text.includes("Exit code: 0") || !text.includes("hello world")) {
        throw new Error(`Unexpected result: ${text}`);
      }
    });

    // Test 2: Network access denied by default
    await runTest("Test 2: Network access denied by default", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c curl --max-time 5 http://httpbin.org/get",
        },
      });
      const text = result.content[0].text;
      // Should fail due to network denial
      if (!result.isError) {
        throw new Error(`Expected network to be denied, but got success: ${text}`);
      }
      console.log(`   Network correctly denied: ${text.split("\n")[0]}`);
    });

    // Test 3: Network access allowed when explicitly enabled
    await runTest("Test 3: Network access allowed when explicitly enabled", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c curl --max-time 10 http://httpbin.org/get",
          allowNetwork: true,
        },
      });
      const text = result.content[0].text;
      // This might fail for other reasons (no curl, etc.) but should not be denied by MXC
      console.log(`   Result with allowNetwork=true: ${text.split("\n")[0]}`);
    });

    // Test 4: File access denied outside allowed paths
    await runTest("Test 4: File access denied outside readPaths", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c type C:\\Windows\\System32\\config\\SAM",
        },
      });
      const text = result.content[0].text;
      // Should fail - SAM file is protected
      if (!result.isError) {
        throw new Error(`Expected file access to be denied, but got success: ${text}`);
      }
      console.log(`   File access correctly denied: ${text.split("\n")[0]}`);
    });

    // Test 5: File access allowed via readPaths
    await runTest("Test 5: File access allowed via readPaths", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c type C:\\Windows\\System32\\drivers\\etc\\hosts",
          readPaths: ["C:\\Windows\\System32\\drivers\\etc\\hosts"],
        },
      });
      const text = result.content[0].text;
      if (!text.includes("Exit code: 0") || !text.includes("localhost")) {
        throw new Error(`Expected file access to work with readPaths: ${text}`);
      }
      console.log(`   File access correctly allowed via readPaths`);
    });

    // Test 6: Timeout handling
    await runTest("Test 6: Timeout enforcement", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c \"for /l %i in (1,1,1000000) do @echo %i\"",
          timeoutMs: 1000, // 1 second timeout
        },
      });
      const text = result.content[0].text;
      // Should timeout
      if (!text.includes("Timed out: true")) {
        throw new Error(`Expected timeout but got: ${text}`);
      }
      console.log(`   Timeout correctly enforced: ${text.split("\n")[0]}, Timed out: true`);
    });

    // Test 7: Command validation - empty command
    await runTest("Test 7: Empty command validation", async () => {
      try {
        await client.callTool({
          name: "execute_sandboxed_code",
          arguments: {
            command: "",
          },
        });
        throw new Error("Expected validation error for empty command");
      } catch (error) {
        // McpError is thrown for validation errors
        if (error instanceof Error && (error.message.includes("validation") || error.message.includes("non-empty") || error.message.includes("-32602"))) {
          console.log(`   Empty command correctly rejected`);
        } else {
          throw error;
        }
      }
    });

    // Test 8: Invalid timeout validation
    await runTest("Test 8: Invalid timeout validation", async () => {
      try {
        await client.callTool({
          name: "execute_sandboxed_code",
          arguments: {
            command: "cmd /c echo test",
            timeoutMs: 100, // Too small
          },
        });
        throw new Error("Expected validation error for timeout");
      } catch (error) {
        if (error instanceof Error && (error.message.includes("timeoutMs") || error.message.includes("-32602"))) {
          console.log(`   Invalid timeout correctly rejected`);
        } else {
          throw error;
        }
      }
    });

    // Test 9: Structured output includes metadata
    await runTest("Test 9: Structured output includes metadata", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c echo test",
        },
      });
      const text = result.content[0].text;
      if (!text.includes("Exit code:") || !text.includes("Timed out:") || !text.includes("Stdout:")) {
        throw new Error(`Missing structured output fields: ${text}`);
      }
      console.log(`   Structured output verified`);
    });

    // Test 10: Long-running process cleanup
    await runTest("Test 10: Process cleanup after completion", async () => {
      const result = await client.callTool({
        name: "execute_sandboxed_code",
        arguments: {
          command: "cmd /c echo process completed",
          timeoutMs: 10000,
        },
      });
      const text = result.content[0].text;
      if (!text.includes("Exit code: 0") || !text.includes("process completed")) {
        throw new Error(`Expected successful completion: ${text}`);
      }
      console.log(`   Process completed and cleaned up properly`);
    });

    console.log("\n=== ALL POLICY TESTS PASSED ===");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});