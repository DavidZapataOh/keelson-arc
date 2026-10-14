import { arc } from "@keelson/sdk/arc";
import { useCallback, useEffect, useState } from "react";
import { loadDeployment } from "./deployment/load.ts";
import { Credential } from "./pages/Credential.tsx";
import { Lists } from "./pages/Lists.tsx";
import { Trades } from "./pages/Trades.tsx";
import { Connect } from "./shell/Connect.tsx";
import { DeploymentFailed, Loading, WrongNetwork } from "./shell/states.tsx";
import { ROUTES, type RouteId, TopBar } from "./shell/TopBar.tsx";
import { AppProvider, type Chain } from "./state/context.tsx";
import { useSession } from "./state/useSession.ts";
import { useWallets } from "./state/useWallets.ts";

const DEPLOYMENT_URL = import.meta.env.VITE_DEPLOYMENT_URL ?? "/deployment.json";

const defaultLoad = () => loadDeployment(DEPLOYMENT_URL);

type Boot =
  | { state: "loading" }
  | { state: "failed"; error: Error }
  | { state: "ready"; chain: Chain };

const readRoute = (): RouteId => {
  const id = window.location.hash.replace(/^#\//, "").split("/")[0];
  return ROUTES.find((route) => route.id === id)?.id ?? "trades";
};

function useRoute(): RouteId {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App({ load = defaultLoad }: { load?: () => Promise<Chain> }) {
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
      <TopBar route={route} session={session} onDisconnect={disconnect} />
      <main id="main">
        {boot.state === "loading" && <Loading />}
        {boot.state === "failed" && <DeploymentFailed error={boot.error} onRetry={start} />}
        {boot.state === "ready" && !session && (
          <Connect
            wallets={wallets}
            error={error}
            onConnect={connectWallet}
            onReadOnly={openReadOnly}
          />
        )}
        {boot.state === "ready" && session && wrongChain && (
          <WrongNetwork onSwitch={() => void session.switchChain()} />
        )}
        {boot.state === "ready" && session && !wrongChain && (
          <AppProvider value={{ chain: boot.chain, session }}>
            {route === "trades" && <Trades />}
            {route === "credential" && <Credential />}
            {route === "lists" && <Lists />}
          </AppProvider>
        )}
      </main>
    </>
  );
}
