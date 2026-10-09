#!/usr/bin/env node
/**
 * MCP Server for MXC (Microsoft eXecution Containers)
 * Provides a tool to execute code in isolated process containers
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { run, MxcError } from "@microsoft/mxc-sdk/v1";

// Create the MCP server
const server = new Server(
  {
    name: "mcp-mxc",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the tool schema
const EXECUTE_SANDBOXED_CODE_TOOL = "execute_sandboxed_code";

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: EXECUTE_SANDBOXED_CODE_TOOL,
        description: "Execute a command in an isolated Windows process container using MXC SDK",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The command to execute in the sandbox (e.g., 'cmd /c echo hello')",
            },
            timeoutMs: {
              type: "number",
              description: "Maximum execution time in milliseconds (default: 30000)",
              default: 30000,
              minimum: 1000,
              maximum: 300000,
            },
            readPaths: {
              type: "array",
              items: { type: "string" },
              description: "Additional paths to allow read access to inside the container",
              default: [],
            },
            allowNetwork: {
              type: "boolean",
              description: "Allow network egress (default: false for least privilege)",
              default: false,
            },
          },
          required: ["command"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== EXECUTE_SANDBOXED_CODE_TOOL) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  // Validate arguments
  if (!args || typeof args !== "object") {
    throw new McpError(ErrorCode.InvalidParams, "Arguments must be an object");
  }

  const { command, timeoutMs = 30000, readPaths = [], allowNetwork = false } = args as {
    command: string;
    timeoutMs?: number;
    readPaths?: string[];
    allowNetwork?: boolean;
  };

  if (!command || typeof command !== "string" || command.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Command must be a non-empty string");
  }

  if (typeof timeoutMs !== "number" || timeoutMs < 1000 || timeoutMs > 300000) {
    throw new McpError(ErrorCode.InvalidParams, "timeoutMs must be a number between 1000 and 300000");
  }

  if (!Array.isArray(readPaths) || !readPaths.every((p) => typeof p === "string")) {
    throw new McpError(ErrorCode.InvalidParams, "readPaths must be an array of strings");
  }

  try {
    // Build the MXC request with least-privilege defaults
    const mxcRequest = {
      command,
      timeoutMs,
      containment: {
        type: "processcontainer" as const,
      },
      filesystem: {
        readonlyPaths: readPaths,
        // Default to deny-all network egress for least privilege
      },
      network: {
        egress: {
          default: allowNetwork ? ("allow" as const) : ("deny" as const),
        },
        ingress: {
          default: "deny" as const,
        },
      },
    };

    // Execute in the sandbox
    const result = await run(mxcRequest);

    // Format the response with structured output
    const outputLines = [
      `Exit code: ${result.exitCode}`,
      `Timed out: ${result.timedOut}`,
      `Stdout:`,
      result.stdout || "(empty)",
      `Stderr:`,
      result.stderr || "(empty)",
    ];

    if (result.warnings && result.warnings.length > 0) {
      outputLines.push(`Warnings:`, ...result.warnings.map((w) => `  - ${w}`));
    }

    // Include output metadata if available (denials, etc.)
    if (result.outputMetadata) {
      outputLines.push(`Output Metadata:`, JSON.stringify(result.outputMetadata, null, 2));
    }

    return {
      content: [
        {
          type: "text",
          text: outputLines.join("\n"),
        },
      ],
      isError: result.exitCode !== 0 || result.timedOut,
    };
  } catch (error) {
    // Handle MXC-specific errors
    if (error instanceof MxcError) {
      return {
        content: [
          {
            type: "text",
            text: `MXC Error (${error.code}): ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    if (error instanceof Error) {
      return {
        content: [
          {
            type: "text",
            text: `Execution failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    throw new McpError(ErrorCode.InternalError, `Unexpected error: ${String(error)}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP-MXC server started and listening on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});