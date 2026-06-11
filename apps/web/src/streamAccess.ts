const LOCAL_STREAM_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function canOpenStreamPage({ agentView, hostname }: { agentView: boolean; hostname: string }) {
  return agentView || isLocalStreamHost(hostname);
}

export function isLocalStreamHost(hostname: string) {
  return LOCAL_STREAM_HOSTS.has(hostname);
}
