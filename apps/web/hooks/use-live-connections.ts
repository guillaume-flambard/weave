"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchConnections, type ConnectionStatus } from "../lib/api";
import { defaultConnectorStatus } from "../lib/connectors";

const OAUTH = new Set(["slack", "notion", "discord"]);

export type LiveConnectionState = "checking" | "connected" | "disconnected" | "reconnect";

function isExpired(conn: ConnectionStatus): boolean {
  if (!conn.expires_at) return false;
  return new Date(conn.expires_at).getTime() < Date.now();
}

/** Live OAuth connection state from GET /connections (falls back to demo profile if API is down). */
export function useLiveConnections(orgId: string) {
  const [connections, setConnections] = useState<ConnectionStatus[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setConnections(await fetchConnections());
    } catch {
      setConnections(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchConnections()
      .then((conns) => {
        if (alive) setConnections(conns);
      })
      .catch(() => {
        if (alive) setConnections(null);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const byProvider = useMemo(() => {
    const m = new Map<string, ConnectionStatus>();
    for (const c of connections ?? []) m.set(c.provider, c);
    return m;
  }, [connections]);

  const providerState = useCallback(
    (id: string): LiveConnectionState => {
      const conn = byProvider.get(id);
      if (!loaded && OAUTH.has(id)) return "checking";
      if (conn) return isExpired(conn) ? "reconnect" : "connected";
      if (connections !== null) return "disconnected";
      const demo = defaultConnectorStatus(id, orgId);
      return demo === "connected" ? "connected" : "disconnected";
    },
    [byProvider, connections, loaded, orgId],
  );

  const removeProvider = useCallback((id: string) => {
    setConnections((prev) => (prev ? prev.filter((c) => c.provider !== id) : prev));
  }, []);

  return { connections, loaded, providerState, refresh, removeProvider };
}
