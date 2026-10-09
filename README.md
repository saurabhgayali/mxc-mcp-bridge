# MCP-MXC: Model Context Protocol Server for Microsoft eXecution Containers

An open-source Model Context Protocol (MCP) server that empowers AI coding assistants (such as GitHub Copilot and Claude Desktop) to dynamically execute, inspect, and iteratively debug code inside policy-driven, native OS containers using the Microsoft eXecution Container (MXC) SDK (@microsoft/mxc-sdk).




## Overview

This server exposes a single tool `execute_sandboxed_code` that allows AI agents to run commands in isolated Windows process containers with:

- **Least-privilege security** by default (no network, restricted filesystem)
- **Configurable timeouts** (1s - 5min)
- **Controlled file access** via explicit `readPaths` allowlist
- **Optional network access** via `allowNetwork` flag
- **Structured output** with exit codes, stdout, stderr, timeout status, and warnings

## Requirements

- **Windows 11** (Build 26200 or later)
- **Node.js 24+** (for MXC SDK compatibility)
- **MXC SDK dependencies** (included via npm)

## Architectural model

```
+-------------------+        MCP JSON-RPC        +---------------------------+
|                   |  ---------------------->   |                           |
|  AI Agent Client  |                            |   Node.js MCP Server      |
|  (Copilot/Claude) |  <----------------------   |   (Tool Wrapper Interface)|
|                   |    stdout / stderr / logs  +---------------------------+
+-------------------+                                          |
                                                               | @microsoft/mxc-sdk/v1
                                                               v
                                                 +---------------------------+
                                                 |   MXC Execution Engine    |
                                                 +---------------------------+
                                                               |
                                                               v
                                                 +---------------------------+
                                                 |   Native Host Sandbox     |
                                                 |   (ProcessContainer / bwrap)|
                                                 +---------------------------+
```

## Installation

```bash
git clone https://github.com/saurabhgayali/mxc-mcp-bridge
cd mxc-mcp-bridge
npm install
npm run build
```

## Configuration

### For Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-mxc": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "C:\\path\\to\\mcp-mxc"
    }
  }
}
```

### For Custom Agents (stdio)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "my-agent", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: "C:\\path\\to\\mcp-mxc"
});
await client.connect(transport);
```

## Tool: `execute_sandboxed_code`

Execute a command in an isolated Windows process container.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `command` | string | Yes | - | Command to execute (e.g., `cmd /c echo hello`) |
| `timeoutMs` | number | No | 30000 | Max execution time (1000-300000 ms) |
| `readPaths` | string[] | No | [] | Additional paths to allow read access |
| `allowNetwork` | boolean | No | false | Allow network egress (default: denied) |

### Returns

Structured text output containing:
- Exit code
- Timeout status
- Stdout
- Stderr
- Warnings (if any)
- Output metadata (denials, etc.)

### Example Usage

```typescript
// Basic execution
const result = await client.callTool({
  name: "execute_sandboxed_code",
  arguments: { command: "cmd /c echo hello world" }
});

// With file access
const result = await client.callTool({
  name: "execute_sandboxed_code",
  arguments: {
    command: "cmd /c type C:\\Windows\\System32\\drivers\\etc\\hosts",
    readPaths: ["C:\\Windows\\System32\\drivers\\etc\\hosts"]
  }
});

// With network access
const result = await client.callTool({
  name: "execute_sandboxed_code",
  arguments: {
    command: "cmd /c curl https://api.example.com",
    allowNetwork: true,
    timeoutMs: 10000
  }
});

// With timeout
const result = await client.callTool({
  name: "execute_sandboxed_code",
  arguments: {
    command: "cmd /c ping -n 30 127.0.0.1",
    timeoutMs: 1000
  }
});
```

## Security Model

### Default Least Privilege
- **Network**: All egress/ingress denied by default
- **Filesystem**: No access outside container unless explicitly allowed via `readPaths`
- **UI**: Container isolation (no desktop access)
- **Process**: Isolated process container (AppContainer-based)

### Explicit Opt-in
- `allowNetwork: true` → grants `internetClient` capability
- `readPaths: ["path"]` → grants read-only access to specified paths

## Development

### Build
```bash
npm run build
```

### Run Tests
```bash
# Smoke test (platform verification)
npx tsx src/smoke-test.ts

# MCP protocol test
npx tsx src/test-mcp-client.ts

# Policy enforcement tests
npx tsx src/test-policy-enforcement.ts
```

### Project Structure
```
src/
├── index.ts                    # Main MCP server entry point
├── smoke-test.ts               # MXC platform verification
├── test-mcp-client.ts          # MCP protocol integration test
├── test-policy-enforcement.ts  # Security policy verification
└── dist/                       # Compiled output (after build)
```

## Error Handling

The server returns structured errors for:
- **Validation errors** (invalid parameters) → `McpError` with code -32602
- **MXC execution errors** (container failures) → Formatted error text with `isError: true`
- **Timeout errors** → `Timed out: true` in output with `isError: true`
- **Network/filesystem denials** → Non-zero exit codes with stderr details

## Troubleshooting

### "whoami: extra operand '/user'"
This is a known cosmetic warning from the MXC SDK's platform detection. It does not affect functionality.

### "The current directory is invalid"
Some commands (like `ping`, `timeout`) may fail due to container working directory. Use `cmd /c echo test` for simple tests.

### Platform not supported
Ensure you're on Windows 11 Build 26200+ with the `processcontainer` backend available.

## License

MIT



## Use Cases

### 1. Autonomous AI Agent Vibe-Coding & Self-Healing

* **The Scenario:** An AI coding assistant (such as GitHub Copilot or Claude Desktop) writes a brand-new Node.js or Python module on the fly to solve a user request.
* **How MXC Helps:** Instead of executing the untrusted script directly on the host development machine, the MCP tool safely spawns the code inside a native container with read-only workspace bounds and strict network blocking.
* **The Feedback Loop:** If the script throws an error, missing dependency exceptions, or syntax tracebacks, the structured `stdout`, `stderr`, and exit code are instantly piped back to the AI. The agent reads the exact traceback, modifies the source code, and re-runs it iteratively until tests pass cleanly without human intervention.

### 2. Secure Third-Party Plugin & Extension Execution

* **The Scenario:** Your enterprise application allows users or external developers to plug in custom JavaScript/TypeScript scripts or utilities to automate data transformations.
* **How MXC Helps:** Plugins often run with broad permissions if hosted in-process. By routing plugin execution through the MCP-driven MXC bridge, you isolate each extension inside a lightweight container backend (`processcontainer` on Windows or `bubblewrap` on Linux).
* **Policy Enforcement:** You can enforce least-privilege constraints using fine-grained JSON policies—explicitly granting read access only to designated input directories while denying outbound internet egress and sensitive UI or clipboard operations.

### 3. Isolated Dynamic Testing of Untrusted Patches

* **The Scenario:** Evaluating security patches, community-contributed code snippets, or automated vulnerability fixes derived from automated model scans.
* **How MXC Helps:** Malicious or poorly written code could accidentally wipe local configurations, read environment variables, or spawn rogue network sockets. By wrapping execution requests with a strict default-deny network policy (`network.egress.default: 'deny'`) and bounded execution timeouts (e.g., `timeoutMs: 30_000`), the host machine remains completely insulated from infinite loops or data exfiltration attempts.

### 4. Cross-Platform Developer Tooling & Diagnostics

* **The Scenario:** Building internal developer utilities that need to run arbitrary compilation commands or tests across different operating systems without forcing developers to install heavy container daemons like Docker.
* **How MXC Helps:** Because MXC abstracts host-native mechanisms behind unified typed SDKs (`@microsoft/mxc-sdk/v1`), your tool runs seamlessly across Windows 11 (`processcontainer`), Linux (`bubblewrap`), and macOS (`seatbelt`) using the exact same configuration contract. Diagnostic tools like `--audit` or debug logging can be triggered during development to troubleshoot missing resource permissions safely.