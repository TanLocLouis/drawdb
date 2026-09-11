export const MESSAGE_TYPES = Object.freeze({
  JOIN: "join",
  JOINED: "joined",
  OPERATION: "operation",
  OPERATION_APPLIED: "operation_applied",
  OPERATION_PREVIEW: "operation_preview",
  SNAPSHOT: "snapshot",
  RESYNC_REQUIRED: "resync_required",
  PRESENCE: "presence",
  CURSOR: "cursor",
  ERROR: "error",
  PING: "ping",
  PONG: "pong",
});

export const CONNECTION_STATE = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
});
