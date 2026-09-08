import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const semverRegex = /^\d+\.\d+\.\d+$/;
const rootDir = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
const isTagMode = mode === "tag";
const version = isTagMode ? process.argv[3] : mode;

if (!version || !semverRegex.test(version)) {
  console.error(
    "Usage:\n" +
      "  bun run scripts/release.ts <version>      on dev: bump + push dev + open release PR\n" +
      "  bun run scripts/release.ts tag <version>  on main: verify merge + tag + push tag\n" +
      "Example:\n" +
      "  bun run scripts/release.ts 1.2.3\n" +
      "  bun run scripts/release.ts tag 1.2.3",
  );
  process.exit(1);
}

const tag = `v${version}`;
const commitMessage = `chore: bump version to ${version}`;
const expectedBranch = isTagMode ? "main" : "dev";
const changedFiles = [
  "package.json",
  "packages/server/package.json",
  "packages/desktop/package.json",
  "packages/shared/package.json",
];

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

function expectBranch(branch: string) {
  const current = run("git branch --show-current");
  if (current !== branch) {
    console.error(`Error: Current branch is "${current}", expected "${branch}".`);
    process.exit(1);
  }
}

function expectCleanTree() {
  if (run("git status --porcelain")) {
    console.error("Error: Working tree is not clean. Commit or stash your changes first.");
    process.exit(1);
  }
}

function expectTagMissing() {
  if (run(`git tag -l ${tag}`, { exitOnError: false })) {
    console.error(`Error: Tag ${tag} already exists.`);
    process.exit(1);
  }
}

function expectSyncedWith(remote: string) {
  const localSha = run("git rev-parse HEAD");
  const remoteSha = run(`git rev-parse ${remote}`);
  if (localSha !== remoteSha) {
    console.error(`Error: HEAD is not in sync with ${remote}. Push or pull first.`);
    process.exit(1);
  }
}

function askContinue() {
  process.stdout.write("Continue? [y/N] ");
  return new Promise<string>((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

console.log(`\n🚀 Preparing release ${tag}\n`);

run("git fetch origin");
expectBranch(expectedBranch);
expectCleanTree();
expectTagMissing();

if (isTagMode) {
  expectSyncedWith("origin/main");

  const devMerged = run("git merge-base --is-ancestor origin/dev HEAD", { exitOnError: false });
  if (devMerged === null) {
    console.error("Error: origin/dev has commits not merged into main. Merge the release PR first.");
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
  if (pkg.version !== version) {
    console.error(`Error: package.json version is "${pkg.version}", expected "${version}".`);
    console.error(`Run "bun run scripts/release.ts ${version}" on dev and merge the release PR first.`);
    process.exit(1);
  }

  console.log(`Current HEAD: ${run("git log --oneline -1")}\n`);
  console.log("About to tag:\n");
  console.log(`  1. Tag:  ${tag}`);
  console.log(`  2. Push: origin tag only, branch is not pushed\n`);
  console.log("CI will build and create a Draft Release on GitHub.");
  console.log("You need to manually Publish it after reviewing.\n");

  if ((await askContinue()).toLowerCase() !== "y") {
    console.log("\nAborted.");
    process.exit(0);
  }

  console.log("\n🏷️  Tagging...");
  run(`git tag ${tag}`);

  console.log("📤 Pushing tag to origin...");
  const pushResult = run(`git push origin refs/tags/${tag}`, { exitOnError: false });
  if (pushResult === null) {
    run(`git tag -d ${tag}`, { exitOnError: false });
    console.error("\n❌ Push failed! Local tag has been removed.");
    process.exit(1);
  }

  console.log(`\n✅ Done! ${tag} pushed to origin.`);
  console.log("CI will build and create a Draft Release. Check progress at:");
  console.log("https://github.com/Code-MonkeyZhang/persona-agent/actions\n");
  process.exit(0);
}

expectSyncedWith("origin/dev");

console.log(`Current HEAD: ${run("git log --oneline -1")}\n`);
console.log("About to release:\n");
console.log(`  1. Bump version in ${changedFiles.length} package.json files to ${version}`);
console.log(`  2. Commit: "${commitMessage}"`);
console.log("  3. Push:   origin/dev");
console.log("  4. Open:   release PR dev → main\n");

if ((await askContinue()).toLowerCase() !== "y") {
  console.log("\nAborted.");
  process.exit(0);
}

console.log("\n📦 Bumping version...");
run(`bun run scripts/bump-version.ts ${version}`);

console.log("💾 Committing...");
run(`git add ${changedFiles.join(" ")}`);
run(`git commit -m "${commitMessage}"`);

console.log("📤 Pushing to origin/dev...");
const pushResult = run("git push origin dev", { exitOnError: false });
if (pushResult === null) {
  console.error("\n❌ Push failed! Rolling back...");
  run("git reset --hard HEAD~1", { exitOnError: false });
  console.error("Rollback complete. The version bump commit has been removed.");
  console.error("Please check your network or permissions and try again.");
  process.exit(1);
}

console.log("🔀 Creating release PR...");
const prUrl = run(
  `gh pr create --base main --head dev --title "chore: release ${tag}" --body "Release ${tag}. Merge with a merge commit, do not squash."`,
  { exitOnError: false },
);
if (prUrl) {
  console.log(`\n✅ Done! Release PR created: ${prUrl}`);
} else {
  const existingUrl = run("gh pr view dev --base main --json url --jq .url", { exitOnError: false });
  if (existingUrl) {
    console.log(`\n✅ Done! Release PR already exists: ${existingUrl}`);
  } else {
    console.error("\n⚠️  Failed to create PR automatically. Create it manually:");
    console.error(`   gh pr create --base main --title "chore: release ${tag}"`);
  }
}

console.log("\nAfter CI passes:");
console.log('  1. Merge the PR with a merge commit, do not squash');
console.log("  2. git checkout main && git pull origin main");
console.log(`  3. bun run scripts/release.ts tag ${version}\n`);
process.exit(0);
