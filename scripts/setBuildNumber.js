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
  // Use npx to ensure electron-builder is found in node_modules
  const builderProcess = spawn("npx", ["electron-builder", ...builderArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_NUMBER: gitRevision,
    },
  });

  builderProcess.on("close", (code) => {
    // Exit with the same code as electron-builder
    // Default to 1 if code is null/undefined
    process.exit(code ?? 1);
  });

  builderProcess.on("error", (err) => {
    console.error("❌ Error running electron-builder:", err.message);
    process.exit(1);
  });
} catch (error) {
  console.error("❌ Error getting git revision:", error.message);
  console.error(
    "   Make sure you are in a git repository and git is installed."
  );
  process.exit(1);
}
