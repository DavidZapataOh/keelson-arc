import { arc } from "@keelson/sdk/arc";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { DeploymentError } from "../src/deployment/schema.ts";
import { fakeEngine } from "./support/engine.ts";
import { FILE, fakeChain } from "./support/fakeChain.ts";
import { testWallet } from "./support/testWallet.ts";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ready = async () => ({ file: FILE, client: fakeChain() });
const engine = fakeEngine();

const announce = (wallet: ReturnType<typeof testWallet>["wallet"]) =>
  act(() => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: wallet }));
  });

afterEach(() => {
  window.location.hash = "";
});

describe("shell", () => {
  it("shows the brand, the network badge and a main region", async () => {
    render(<App load={ready} makeEngine={engine} />);
    expect(screen.getByRole("link", { name: /keelson/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("ARC MAINNET")).toBeInTheDocument();
    await screen.findByRole("heading", { name: /connect a wallet/i });
  });

  it("links to the faucet only when the deployment names one", async () => {
    const { unmount } = render(<App load={ready} makeEngine={engine} />);
    await screen.findByRole("heading", { name: /connect a wallet/i });
    expect(screen.queryByRole("link", { name: /get test funds/i })).toBeNull();
    unmount();
    render(
      <App
        load={async () => ({
          file: { ...FILE, faucetUrl: "https://faucet.example.org" },
          client: fakeChain(),
        })}
        makeEngine={engine}
      />,
    );
    const link = await screen.findByRole("link", { name: /get test funds/i });
    expect(link).toHaveAttribute("href", "https://faucet.example.org");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("blocks everything when the deployment cannot be verified, and retries", async () => {
    const load = vi
      .fn<() => ReturnType<typeof ready>>()
      .mockRejectedValueOnce(new DeploymentError("no-code", "sanctions has no contract"))
      .mockImplementation(ready);
    render(<App load={load} makeEngine={engine} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/missing at a configured address/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByRole("heading", { name: /connect a wallet/i });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("explains that no wallet was found and still offers read-only mode", async () => {
    render(<App load={ready} makeEngine={engine} />);
    expect(await screen.findByText(/no browser wallet was found/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/read-only address/i)).toBeInTheDocument();
  });

  it("connects a wallet and shows its address and the menu actions", async () => {
    const user = userEvent.setup();
    const test = testWallet({ key: KEY });
    render(<App load={ready} makeEngine={engine} />);
    await screen.findByRole("heading", { name: /connect a wallet/i });
    await announce(test.wallet);
    await user.click(await screen.findByRole("button", { name: /test wallet/i }));

    const pill = await screen.findByRole("button", { name: /0x[0-9a-f]{4}…[0-9a-f]{4}/i });
    expect(screen.getByRole("heading", { name: /trades/i })).toBeInTheDocument();
    await user.click(pill);
    expect(screen.getByRole("button", { name: /copy address/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /copy address/i })).not.toBeInTheDocument();
    await user.click(pill);
    await user.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(await screen.findByRole("heading", { name: /connect a wallet/i })).toBeInTheDocument();
  });

  it("blocks the app on the wrong network until the wallet switches", async () => {
    const user = userEvent.setup();
    const test = testWallet({ key: KEY, chainId: 1 });
    render(<App load={ready} makeEngine={engine} />);
    await screen.findByRole("heading", { name: /connect a wallet/i });
    await announce(test.wallet);
    await user.click(await screen.findByRole("button", { name: /test wallet/i }));
    expect(await screen.findByRole("heading", { name: /switch to arc/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^trades$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /switch to arc/i }));
    expect(await screen.findByRole("heading", { name: /^trades$/i })).toBeInTheDocument();
  });

  it("falls back to the wrong-network block when the wallet changes chain mid-session", async () => {
    const user = userEvent.setup();
    const test = testWallet({ key: KEY });
    render(<App load={ready} makeEngine={engine} />);
    await screen.findByRole("heading", { name: /connect a wallet/i });
    await announce(test.wallet);
    await user.click(await screen.findByRole("button", { name: /test wallet/i }));
    await screen.findByRole("heading", { name: /^trades$/i });
    act(() => test.changeChain(1));
    expect(await screen.findByRole("heading", { name: /switch to arc/i })).toBeInTheDocument();
    act(() => test.changeChain(arc.id));
    expect(await screen.findByRole("heading", { name: /^trades$/i })).toBeInTheDocument();
  });

  it("opens in read-only mode from an address", async () => {
    const user = userEvent.setup();
    render(<App load={ready} makeEngine={engine} />);
    await screen.findByRole("heading", { name: /connect a wallet/i });
    await user.type(screen.getByLabelText(/read-only address/i), "not an address");
    await user.click(screen.getByRole("button", { name: /open read-only/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not a valid address/i);

    await user.clear(screen.getByLabelText(/read-only address/i));
    await user.type(
      screen.getByLabelText(/read-only address/i),
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    );
    await user.click(screen.getByRole("button", { name: /open read-only/i }));
    expect(await screen.findByRole("heading", { name: /^trades$/i })).toBeInTheDocument();
  });

  it("navigates between the three sections and marks the current one", async () => {
    const user = userEvent.setup();
    render(<App load={ready} makeEngine={engine} />);
    await user.type(
      await screen.findByLabelText(/read-only address/i),
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    );
    await user.click(screen.getByRole("button", { name: /open read-only/i }));
    const nav = screen.getByRole("navigation", { name: /primary/i });
    await user.click(within(nav).getByRole("link", { name: "Lists" }));
    expect(await screen.findByRole("heading", { name: /^lists$/i })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Lists" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("has no structural accessibility violations in its main states", async () => {
    const { container } = render(<App load={ready} makeEngine={engine} />);
    await screen.findByRole("heading", { name: /connect a wallet/i });
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
