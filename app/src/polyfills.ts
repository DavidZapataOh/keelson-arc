import { Buffer } from "buffer";

// circomlibjs and ffjavascript expect Node's Buffer; browsers do not have one.
if (!("Buffer" in globalThis)) Object.assign(globalThis, { Buffer });
