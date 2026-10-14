import wasmTester from "circom_tester/wasm/tester.js";

const include = [new URL("../node_modules", import.meta.url).pathname];

export const compileFixture = (name: string) =>
  wasmTester(new URL(`./fixtures/${name}.circom`, import.meta.url).pathname, { include, O: 2 });
