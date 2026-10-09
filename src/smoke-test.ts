#!/usr/bin/env node
/**
 * Smoke test for MXC SDK - verifies platform support and basic container execution
 */

import { getPlatformSupport, run } from "@microsoft/mxc-sdk/v1";

async function main() {
  console.log("=== MXC SDK Smoke Test ===\n");

  // Step 1: Check platform support
  console.log("1. Checking platform support...");
  const platformSupport = getPlatformSupport();
  console.log(`   Platform: ${process.platform} (${process.arch})`);
  console.log(`   Supported: ${platformSupport.isSupported}`);

  if (!platformSupport.isSupported) {
    console.error("\n❌ FAIL: Platform not supported by MXC SDK");
    console.error(`   Reason: ${platformSupport.reason}`);
    process.exit(1);
  }
  console.log("   ✅ PASS: Platform is supported\n");

  // Step 2: Test basic container execution
  console.log("2. Testing basic container execution (processcontainer backend)...");
  try {
    const result = await run({
      command: "cmd /c echo hello from container",
      containment: { type: "processcontainer" },
    });

    console.log(`   Exit code: ${result.exitCode}`);
    console.log(`   Stdout: "${result.stdout.trim()}"`);
    console.log(`   Stderr: "${result.stderr.trim()}"`);

    if (result.exitCode !== 0) {
      console.error("\n❌ FAIL: Container exited with non-zero code");
      process.exit(1);
    }

    if (!result.stdout.includes("hello from container")) {
      console.error("\n❌ FAIL: Expected output not found in stdout");
      process.exit(1);
    }

    console.log("   ✅ PASS: Container executed successfully\n");
  } catch (error) {
    console.error("\n❌ FAIL: Container execution threw an error");
    console.error(`   Error: ${error}`);
    process.exit(1);
  }

  // Step 3: Test with a more complex command
  console.log("3. Testing multi-line output...");
  try {
    const result = await run({
      command: "cmd /c echo line1 && echo line2 && echo line3",
      containment: { type: "processcontainer" },
    });

    const lines = result.stdout.trim().split(/\r?\n/).map(l => l.trim());
    if (lines.length !== 3 || lines[0] !== "line1" || lines[1] !== "line2" || lines[2] !== "line3") {
      console.error("\n❌ FAIL: Multi-line output mismatch");
      console.error(`   Got: ${JSON.stringify(result.stdout)}`);
      process.exit(1);
    }
    console.log("   ✅ PASS: Multi-line output correct\n");
  } catch (error) {
    console.error("\n❌ FAIL: Multi-line test threw an error");
    console.error(`   Error: ${error}`);
    process.exit(1);
  }

  console.log("=== ALL TESTS PASSED ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});