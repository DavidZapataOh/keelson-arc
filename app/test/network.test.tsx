import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chooseNetwork, networksFor } from "../src/chain.ts";
import { TopBar } from "../src/shell/TopBar.tsx";

const env = (values: Record<string, string>) => values as unknown as ImportMetaEnv;
const hashes = { wasm: "a".repeat(64), zkey: "b".repeat(64) };
const both = networksFor(
  env({ VITE_NETWORKS: JSON.stringify({ mainnet: hashes, testnet: hashes }) }),
);
const testnetOnly = networksFor(env({ VITE_NETWORKS: JSON.stringify({ testnet: hashes }) }));

describe("networks", () => {
  it("lists mainnet and testnet, and marks the one the build does not include", () => {
    expect(both.map((n) => [n.id, n.available])).toEqual([
      ["mainnet", true],
      ["testnet", true],
    ]);
    expect(testnetOnly.map((n) => [n.id, n.available])).toEqual([
      ["mainnet", false],
      ["testnet", true],
    ]);
    expect(both[0]?.deploymentUrl).toBe("/deployment.mainnet.json");
    expect(both[1]?.hashes).toEqual(hashes);
  });

  it("defaults to mainnet, honours a remembered choice, and never picks what is missing", () => {
    expect(chooseNetwork(both, null).id).toBe("mainnet");
    expect(chooseNetwork(both, "testnet").id).toBe("testnet");
    expect(chooseNetwork(both, "nonsense").id).toBe("mainnet");
    expect(chooseNetwork(testnetOnly, null).id).toBe("testnet");
    expect(chooseNetwork(testnetOnly, "mainnet").id).toBe("testnet");
  });

  it("targets a single network when the build was not made for several", () => {
    const [only, ...rest] = networksFor(env({ VITE_CHAIN_ID: "5042002" }));
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: "default", label: "ARC TESTNET", available: true });
    expect(networksFor(env({}))[0]?.label).toBe("ARC MAINNET");
    expect(networksFor(env({ VITE_CHAIN_ID: "31337" }))[0]?.label).toBe("LOCAL NODE");
  });

  it("refuses a build that includes no network", () => {
    expect(() => chooseNetwork(networksFor(env({ VITE_NETWORKS: "{}" })), null)).toThrow(
      "no network",
    );
  });
});

describe("network selector", () => {
  const bar = (networks: typeof both, current: (typeof both)[number], onSelect = vi.fn()) =>
    render(
      <TopBar
        route="trades"
        session={undefined}
        networks={networks}
        current={current}
        onSelectNetwork={onSelect}
        onDisconnect={() => undefined}
      />,
    );

  it("lets the visitor choose, and shows an undeployed network as unavailable", async () => {
    const onSelect = vi.fn();
    bar(testnetOnly, testnetOnly[1] as (typeof both)[number], onSelect);
    const select = screen.getByRole("combobox", { name: "Network" });
    expect(select).toHaveValue("testnet");
    const mainnet = screen.getByRole("option", { name: /arc mainnet \(not deployed yet\)/i });
    expect(mainnet).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reports the network the visitor picks", async () => {
    const onSelect = vi.fn();
    bar(both, both[0] as (typeof both)[number], onSelect);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Network" }), "testnet");
    expect(onSelect).toHaveBeenCalledWith("testnet");
  });

  it("is a plain label when the build has one network", () => {
    const [only] = networksFor(env({ VITE_CHAIN_ID: "5042002" }));
    bar([only as (typeof both)[number]], only as (typeof both)[number]);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("ARC TESTNET")).toBeInTheDocument();
  });
});
