import { execSync } from "node:child_process";
import { resolve } from "node:path";

const semverRegex = /^\d+\.\d+\.\d+$/;
const version = process.argv[2];

if (!version || !semverRegex.test(version)) {
  console.error(
    "Usage: bun run scripts/release.ts <version>\nExample: bun run scripts/release.ts 1.2.3",
  );
  process.exit(1);
}

const tag = `v${version}`;
const commitMessage = `chore: bump version to ${version}`;
const rootDir = resolve(import.meta.dirname, "..");

function run(cmd: string, options?: { exitOnError?: boolean }) {
  const exitOnError = options?.exitOnError ?? true;
  try {
    return execSync(cmd, { cwd: rootDir, encoding: "utf-8" }).trim();
  } catch (e) {
    if (exitOnError) {
      console.error(`Command failed: ${cmd}`);
      process.exit(1);
    }
    return null;
  }
}

console.log(`\n🚀 Preparing release ${tag}\n`);

const branch = run("git branch --show-current");
if (branch !== "main") {
  console.error(`Error: Current branch is "${branch}", expected "main".`);
  process.exit(1);
}

const status = run("git status --porcelain");
if (status) {
  console.error("Error: Working tree is not clean. Commit or stash your changes first.");
  process.exit(1);
}

const existingTag = run(`git tag -l ${tag}`, { exitOnError: false });
if (existingTag) {
  console.error(`Error: Tag ${tag} already exists.`);
  process.exit(1);
}

const currentCommit = run("git log --oneline -1");
console.log(`Current HEAD: ${currentCommit}\n`);

run(`bun run scripts/bump-version.ts ${version}`);
console.log("");

const changedFiles = [
  "package.json",
  "packages/server/package.json",
  "packages/desktop/package.json",
];

console.log("About to release:\n");
console.log(`  1. Commit: "${commitMessage}"`);
console.log(`  2. Tag:    ${tag}`);
console.log(`  3. Push:   origin/main (with tags)`);
console.log(`\nCI will build and create a Draft Release on GitHub.`);
console.log(`You need to manually Publish it after reviewing.\n`);

process.stdout.write("Continue? [y/N] ");
const answer = await new Promise<string>((resolve) => {
  process.stdin.once("data", (data) => resolve(data.toString().trim()));
});

if (answer.toLowerCase() !== "y") {
  console.log("\nAborted. Reverting version bump...");
  run("git checkout -- package.json packages/server/package.json packages/desktop/package.json");
  console.log("Version bump reverted.");
  process.exit(0);
}

console.log("\n📦 Committing...");
run(`git add ${changedFiles.join(" ")}`);
run(`git commit -m "${commitMessage}"`);

console.log("🏷️  Tagging...");
run(`git tag ${tag}`);

console.log("📤 Pushing to origin...");
const pushResult = run("git push origin main --tags", { exitOnError: false });

if (pushResult === null) {
  console.error("\n❌ Push failed! Rolling back...");

  run(`git push origin :refs/tags/${tag}`, { exitOnError: false });
  run(`git tag -d ${tag}`, { exitOnError: false });
  run("git reset --hard HEAD~1");

  console.error("Rollback complete. Local commit and tag have been removed.");
  console.error("Please check your network or permissions and try again.");
  process.exit(1);
}

console.log(`\n✅ Done! ${tag} pushed to origin.`);
console.log(`CI will build and create a Draft Release. Check progress at:`);
console.log(`https://github.com/Code-MonkeyZhang/persona-agent/actions\n`);
process.exit(0);
