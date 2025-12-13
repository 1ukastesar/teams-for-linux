#!/usr/bin/env node

/**
 * Wrapper script to set BUILD_NUMBER environment variable and run electron-builder
 * This is used by electron-builder to append build number (git revision) to package versions
 */

const { execSync, spawn } = require("node:child_process");

try {
  // Get the short git revision hash
  const gitRevision = execSync("git rev-parse --short HEAD", {
    encoding: "utf8",
  }).trim();

  console.log(`✅ BUILD_NUMBER set to: ${gitRevision}`);
  console.log(
    `   Debian package version will be: [version]-${gitRevision}`
  );

  // Get the arguments passed to this script (everything after the script name)
  const builderArgs = process.argv.slice(2);

  // Run electron-builder with BUILD_NUMBER environment variable
  const builderProcess = spawn("electron-builder", builderArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_NUMBER: gitRevision,
    },
  });

  builderProcess.on("close", (code) => {
    process.exit(code);
  });
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
