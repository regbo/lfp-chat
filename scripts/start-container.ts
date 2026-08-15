export {};

const children = [
  Bun.spawn(["bun", "server.js"], {
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  }),
  Bun.spawn(["bun", "dist/server/index.js"], {
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  }),
];

let shuttingDown = false;

async function stopChildren(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) child.kill(signal);

  const gracefulExit = Promise.all(children.map((child) => child.exited));
  const forceExit = Bun.sleep(10_000).then(() => {
    for (const child of children) child.kill("SIGKILL");
  });
  await Promise.race([gracefulExit, forceExit]);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stopChildren(signal).then(() => process.exit(0));
  });
}

// The web and agent processes form one service boundary. If either exits, stop
// its sibling so Swarm can replace the whole service instead of leaving it degraded.
const firstExit = await Promise.race(
  children.map(async (child) => ({ child, exitCode: await child.exited })),
);

if (!shuttingDown) {
  await stopChildren("SIGTERM");
  process.exit(firstExit.exitCode === 0 ? 1 : firstExit.exitCode);
}
