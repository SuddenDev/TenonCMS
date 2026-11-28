// `#tenon/client-registry` for sites without a Tenon bundler plugin, through the package's `imports`. Every
// `clientRef()` lookup misses, so the admin bar skips items with browser code.
const registry: Record<string, () => Promise<unknown>> = {};
export default registry;
