import { spawn } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src/app/api");
const stashDir = path.join(root, ".api-stash");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(apiDir))) {
  console.error("src/app/api is missing; nothing to stash for the static export.");
  process.exit(1);
}

await rename(apiDir, stashDir);

try {
  // Dev type files reference the API routes. A static export cannot see them
  // after the stash, so start from an empty Next cache.
  await rm(path.join(root, ".next"), { recursive: true, force: true });

  await new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", "build"], {
      stdio: "inherit",
      env: {
        ...process.env,
        GITHUB_PAGES: "true",
        NEXT_PUBLIC_DEMO_MODE: "true",
        NEXT_PUBLIC_WS_URL: "demo://agent",
      },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build exited ${code ?? "null"}`));
    });
  });
} finally {
  if (await exists(stashDir)) {
    await rename(stashDir, apiDir);
  }
}
