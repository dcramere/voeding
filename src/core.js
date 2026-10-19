// The app's own calculations (public/core.js) on the server, so automatic adjustments use exactly the
// same formulas as the plan the client sees.
import "./core-shim.js";
import "../public/core.js";
export const DC = globalThis.window.DC;
