#!/usr/bin/env bun
const {
  analyzeFrontendProject,
  validateFrontendOwnershipPolicy,
} = require("./lib/frontend-ownership.cjs");
async function main() {
  const policy = require("../tooling/frontend-ownership-policy.json");
  const errors = validateFrontendOwnershipPolicy(policy);
  if (errors.length) throw new Error(errors.join("; "));
  const report = await analyzeFrontendProject(process.cwd());
  for (const finding of report.findings)
    console.error(
      finding.file +
        ":" +
        (finding.line || 1) +
        ":" +
        (finding.column || 1) +
        " [" +
        finding.id +
        "] " +
        finding.message,
    );
  if (!report.complete || report.findings.length) process.exitCode = 1;
  else console.log("Frontend ownership check passed (" + report.files + " maintained files).");
}
main().catch((error) => {
  console.error("Frontend ownership check failed: " + error.message);
  process.exitCode = 1;
});
