import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Backpack, Gem, LogOut, Settings, Shield, ShoppingCart, Smile, Sparkles, UserRound } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { type JoinOptions } from "@mferland/shared";
import { makeGuestIdentity, makeWalletIdentity, getStoredName, rememberName } from "./auth/identity";
import { useTownRoom } from "./game/useTownRoom";
import { TownScene } from "./game/TownScene";
import { Hud } from "./components/Hud";

export function App() {
  const [identity, setIdentity] = useState<JoinOptions | null>(null);

  if (!identity) {
    return <AuthGate onEnter={setIdentity} />;
  }

  return <GameShell identity={identity} onExit={() => setIdentity(null)} />;
}

function AuthGate({ onEnter }: { onEnter: (identity: JoinOptions) => void }) {
  const [name, setName] = useState(() => getStoredName());
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injected = connectors[0];

  const cleanName = name.trim() || getStoredName();

  function enterGuest() {
    rememberName(cleanName);
    onEnter(makeGuestIdentity(cleanName));
  }

  function enterWallet() {
    if (!address) return;
    rememberName(cleanName);
    onEnter(makeWalletIdentity(cleanName, address));
  }

  return (
    <main className="auth-screen">
      <div className="auth-bg">
        <div className="auth-castle" />
        <div className="auth-plaza" />
      </div>
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <span>mf</span>
          </div>
          <div>
            <h1>Mfer Town</h1>
            <p>social plaza alpha</p>
          </div>
        </div>

        <label className="name-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={18}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="auth-actions">
          <button className="primary-btn" type="button" onClick={enterGuest}>
            <UserRound size={18} />
            Enter as guest
          </button>
          {isConnected && address ? (
            <button className="primary-btn wallet" type="button" onClick={enterWallet}>
              <Gem size={18} />
              Enter with wallet
            </button>
          ) : (
            <button
              className="secondary-btn"
              type="button"
              disabled={!injected || isPending}
              onClick={() => injected && connect({ connector: injected })}
            >
              <Sparkles size={18} />
              Connect wallet
            </button>
          )}
          {isConnected && (
            <button className="text-btn" type="button" onClick={() => disconnect()}>
              <LogOut size={16} />
              Disconnect
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function GameShell({ identity, onExit }: { identity: JoinOptions; onExit: () => void }) {
  const room = useTownRoom(identity);
  const localPlayer = room.sessionId ? room.players.get(room.sessionId) : undefined;
  const playerCount = room.players.size;
  const hudIdentity = useMemo(() => ({
    name: localPlayer?.name || identity.name || "mfer",
    avatarSeed: localPlayer?.avatarSeed || identity.avatarSeed || 1,
  }), [identity.avatarSeed, identity.name, localPlayer?.avatarSeed, localPlayer?.name]);

  return (
    <main className="game-shell">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 6, 10], fov: 54, near: 0.1, far: 140 }}
      >
        <TownScene
          players={room.players}
          npcs={room.npcs}
          localSessionId={room.sessionId}
          sendInput={room.sendInput}
          sendInteract={room.sendInteract}
        />
      </Canvas>

      <Hud
        identity={hudIdentity}
        playerCount={playerCount}
        connectionStatus={room.status}
        connectionError={room.error}
        chat={room.chat}
        players={room.players}
        npcs={room.npcs}
        localSessionId={room.sessionId}
        onSendChat={room.sendChat}
        onExit={onExit}
        quickSlots={[
          { icon: Gem, label: "spark" },
          { icon: UserRound, label: "emote" },
          { icon: Shield, label: "guard" },
          { icon: Sparkles, label: "cast" },
          { icon: Smile, label: "vibe" },
        ]}
        menuButtons={[
          { icon: Backpack, label: "Inventory" },
          { icon: ShoppingCart, label: "Shop" },
          { icon: Smile, label: "Collection" },
          { icon: Settings, label: "Settings" },
        ]}
      />
    </main>
  );
}
