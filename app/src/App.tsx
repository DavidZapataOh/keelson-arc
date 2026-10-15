import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ARC as arc, NETWORKS, SELECTED, selectNetwork } from "./chain.ts";
import { loadDeployment } from "./deployment/load.ts";
import { ListsProvider } from "./lists/context.tsx";
import type { ListsEngine } from "./lists/engine.ts";
import { Trade } from "./pages/Trade.tsx";
import { Trades } from "./pages/Trades.tsx";
import { Connect } from "./shell/Connect.tsx";
import { DeploymentFailed, Loading, WrongNetwork } from "./shell/states.tsx";
import { ROUTES, type RouteId, TopBar } from "./shell/TopBar.tsx";
import { AppProvider, type Chain } from "./state/context.tsx";
import { useSession } from "./state/useSession.ts";
import { useWallets } from "./state/useWallets.ts";
import { VaultProvider } from "./vault/context.tsx";

const Credential = lazy(() =>
  import("./pages/Credential.tsx").then((m) => ({ default: m.Credential })),
);
const Lists = lazy(() => import("./pages/Lists.tsx").then((m) => ({ default: m.Lists })));

const defaultLoad = () => loadDeployment(SELECTED.deploymentUrl);

type Boot =
  | { state: "loading" }
  | { state: "failed"; error: Error }
  | { state: "ready"; chain: Chain };

type Route = { id: RouteId | "trade"; param: string };

const readRoute = (): Route => {
  const [id = "", ...rest] = window.location.hash.replace(/^#\//, "").split("/");
  if (id === "trade" && rest.length > 0) return { id: "trade", param: rest.join("/") };
  return { id: ROUTES.find((route) => route.id === id)?.id ?? "trades", param: "" };
};

function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App({
  load = defaultLoad,
  makeEngine,
}: {
  load?: () => Promise<Chain>;
  makeEngine?: () => ListsEngine;
}) {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const wallets = useWallets();
  const { session, error, connectWallet, openReadOnly, disconnect } = useSession();
  const route = useRoute();

  const start = useCallback(() => {
    setBoot({ state: "loading" });
    load().then(
      (chain) => setBoot({ state: "ready", chain }),
      (cause: Error) => setBoot({ state: "failed", error: cause }),
    );
  }, [load]);
  useEffect(start, [start]);

  const wrongChain = session?.kind === "wallet" && session.snapshot.chainId !== arc.id;

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopBar
        route={route.id === "trade" ? "trades" : route.id}
        session={session}
        faucetUrl={boot.state === "ready" ? boot.chain.file.faucetUrl : undefined}
        networks={NETWORKS}
        current={SELECTED}
        onSelectNetwork={selectNetwork}
        onDisconnect={disconnect}
      />
      <main id="main">
        {boot.state === "loading" && <Loading />}
        {boot.state === "failed" && <DeploymentFailed error={boot.error} onRetry={start} />}
        {boot.state === "ready" && (
          <ListsProvider chain={boot.chain} makeEngine={makeEngine}>
            <VaultProvider>
              {!session && (
                <Connect
                  wallets={wallets}
                  error={error}
                  onConnect={connectWallet}
                  onReadOnly={openReadOnly}
                />
              )}
              {session && wrongChain && (
                <WrongNetwork onSwitch={() => void session.switchChain()} />
              )}
              {session && !wrongChain && (
                <AppProvider value={{ chain: boot.chain, session }}>
                  <Suspense fallback={<Loading />}>
                    {route.id === "trades" && <Trades />}
                    {route.id === "trade" && <Trade fragment={route.param} />}
                    {route.id === "credential" && <Credential />}
                    {route.id === "lists" && <Lists />}
                  </Suspense>
                </AppProvider>
              )}
            </VaultProvider>
          </ListsProvider>
        )}
      </main>
    </>
  );
}
