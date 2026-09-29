import options from "#integral/admin";
import { mountAdmin } from "./index.js";

// Set by the adapters' Vite `define`: the host's favicon, or `null`.
declare const __INTEGRAL_FAVICON__: string | null;

const el = document.getElementById("admin")!;
mountAdmin(el, options, el.dataset.base, __INTEGRAL_FAVICON__);
