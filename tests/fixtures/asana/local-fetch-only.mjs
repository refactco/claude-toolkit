// Keep workflow tests local even if the CLI accidentally ignores ASANA_API_BASE.
const origin = new URL(process.env.ASANA_API_BASE).origin;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== origin) throw new Error(`Workflow fixture blocked non-local fetch: ${url.origin}`);
  return originalFetch(input, init);
};
