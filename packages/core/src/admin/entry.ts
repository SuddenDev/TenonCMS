import registry from "#integral/client-registry";
import { mountAdmin } from "./mount.js";

// Set by the adapters' Vite `define`: the host's favicon, or `null`.
declare const __INTEGRAL_FAVICON__: string | null;

const el = document.getElementById("admin")!;
mountAdmin(el, el.dataset.base, __INTEGRAL_FAVICON__, registry);
