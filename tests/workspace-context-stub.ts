// Repository integration tests provide isolated authorization contexts explicitly.
export async function getWorkspaceContextIfAvailable() { return null; }
export async function requireWorkspaceContext(): Promise<never> {
  throw new Error("No authenticated request is available in repository tests.");
}
