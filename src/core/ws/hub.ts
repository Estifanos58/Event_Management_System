import type WebSocket from "ws";
import type { WsEnvelope } from "./events";

const channelSubscriptions = new Map<string, Set<WebSocket>>();
const socketSubscriptions = new WeakMap<WebSocket, Set<string>>();

function getSocketChannels(socket: WebSocket) {
  let channels = socketSubscriptions.get(socket);
  if (!channels) {
    channels = new Set<string>();
    socketSubscriptions.set(socket, channels);
  }
  return channels;
}

export function subscribeSocket(socket: WebSocket, channel: string) {
  let sockets = channelSubscriptions.get(channel);
  if (!sockets) {
    sockets = new Set<WebSocket>();
    channelSubscriptions.set(channel, sockets);
  }

  sockets.add(socket);
  getSocketChannels(socket).add(channel);
}

export function unsubscribeSocket(socket: WebSocket, channel: string) {
  const sockets = channelSubscriptions.get(channel);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      channelSubscriptions.delete(channel);
    }
  }

  getSocketChannels(socket).delete(channel);
}

export function removeSocket(socket: WebSocket) {
  const channels = getSocketChannels(socket);
  for (const channel of channels) {
    unsubscribeSocket(socket, channel);
  }
}

export function publishToChannel(channel: string, event: WsEnvelope) {
  const sockets = channelSubscriptions.get(channel);
  if (!sockets || sockets.size === 0) {
    return;
  }

  const payload = JSON.stringify(event);

  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function getChannelStats() {
  const stats: Record<string, number> = {};
  for (const [channel, sockets] of channelSubscriptions.entries()) {
    stats[channel] = sockets.size;
  }
  return stats;
}
