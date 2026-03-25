/**
 * Poll an async condition until it returns true or timeout is reached.
 */
export async function waitUntil(
  condition: () => Promise<boolean>,
  timeout = 15_000,
  interval = 300,
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await condition()) return
    await sleep(interval)
  }
  throw new Error(`waitUntil: condition not met within ${timeout}ms`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
