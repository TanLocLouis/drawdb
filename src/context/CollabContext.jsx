import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { nanoid } from "nanoid";
import { CONNECTION_STATE, MESSAGE_TYPES } from "../collaboration/protocol";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

function getIdentity() {
  const stored = sessionStorage.getItem("drawdb-collaboration-identity");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      sessionStorage.removeItem("drawdb-collaboration-identity");
    }
  }
  const suffix = Math.floor(Math.random() * 900 + 100);
  const identity = {
    clientId: nanoid(),
    displayName: `Guest ${suffix}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  sessionStorage.setItem(
    "drawdb-collaboration-identity",
    JSON.stringify(identity),
  );
  return identity;
}

export const CollabContext = createContext(null);

export default function CollabContextProvider({ children }) {
  const identityRef = useRef(getIdentity());
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionRef = useRef(null);
  const pendingRef = useRef(new Map());
  const versionRef = useRef(0);
  const isApplyingRemoteRef = useRef(false);
  const cursorSentAtRef = useRef(0);
  const previewThrottleRef = useRef(new Map());
  const [connectionState, setConnectionState] = useState(
    CONNECTION_STATE.DISCONNECTED,
  );
  const [participants, setParticipants] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});

  const handleMessage = useCallback((event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === MESSAGE_TYPES.JOINED) {
      versionRef.current = message.version;
      setConnectionState(CONNECTION_STATE.CONNECTED);
      reconnectAttemptsRef.current = 0;
      return;
    }
    if (
      message.type === MESSAGE_TYPES.SNAPSHOT ||
      message.type === MESSAGE_TYPES.RESYNC_REQUIRED
    ) {
      versionRef.current = message.version;
      sessionRef.current?.onSnapshot?.(message);
      if (message.type === MESSAGE_TYPES.RESYNC_REQUIRED) {
        for (const pending of pendingRef.current.values())
          pending.reject(message);
        pendingRef.current.clear();
      }
      return;
    }
    if (message.type === MESSAGE_TYPES.OPERATION_APPLIED) {
      versionRef.current = message.version;
      const pending = pendingRef.current.get(message.operationId);
      if (pending) {
        pending.resolve(message);
        pendingRef.current.delete(message.operationId);
      } else if (message.clientId !== identityRef.current.clientId) {
        sessionRef.current?.onSnapshot?.({
          ...message.operation.payload,
          version: message.version,
        });
      }
      return;
    }
    if (message.type === MESSAGE_TYPES.PRESENCE) {
      setParticipants(message.participants || []);
      return;
    }
    if (
      message.type === MESSAGE_TYPES.OPERATION_PREVIEW &&
      message.clientId !== identityRef.current.clientId
    ) {
      sessionRef.current?.onDelta?.(message.operation);
      return;
    }
    if (message.type === MESSAGE_TYPES.CURSOR) {
      setRemoteCursors((current) => ({
        ...current,
        [message.clientId]: {
          x: message.x,
          y: message.y,
          selected: message.selected,
        },
      }));
    }
  }, []);

  const openSocket = useCallback(
    (session) => {
      if (!session || socketRef.current?.readyState === WebSocket.OPEN) return;
      setConnectionState(CONNECTION_STATE.CONNECTING);
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${scheme}//${window.location.host}/ws/diagrams/${encodeURIComponent(session.diagramId)}`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: MESSAGE_TYPES.JOIN,
            diagramId: session.diagramId,
            participant: identityRef.current,
            lastVersion: versionRef.current,
          }),
        );
      };
      socket.onmessage = handleMessage;
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnectionState(CONNECTION_STATE.CONNECTING);
        const delay = Math.min(
          1000 * 2 ** reconnectAttemptsRef.current,
          15_000,
        );
        reconnectAttemptsRef.current += 1;
        reconnectRef.current = window.setTimeout(
          () => openSocket(sessionRef.current),
          delay,
        );
      };
      socket.onerror = () => socket.close();
    },
    [handleMessage],
  );

  const connect = useCallback(
    ({ diagramId, version, onSnapshot, onDelta }) => {
      if (sessionRef.current?.diagramId === diagramId) {
        sessionRef.current.onSnapshot = onSnapshot;
        sessionRef.current.onDelta = onDelta;
        versionRef.current = version;
        return;
      }
      window.clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      sessionRef.current = { diagramId, onSnapshot, onDelta };
      versionRef.current = version;
      setRemoteCursors({});
      openSocket(sessionRef.current);
    },
    [openSocket],
  );

  const disconnect = useCallback(() => {
    sessionRef.current = null;
    window.clearTimeout(reconnectRef.current);
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    setConnectionState(CONNECTION_STATE.DISCONNECTED);
    setParticipants([]);
    setRemoteCursors({});
    for (const preview of previewThrottleRef.current.values()) {
      window.clearTimeout(preview.timer);
    }
    previewThrottleRef.current.clear();
  }, []);

  const sendSnapshot = useCallback((name, document) => {
    const socket = socketRef.current;
    const session = sessionRef.current;
    if (!session || socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new Error("Collaboration connection is unavailable"),
      );
    }
    const operationId = nanoid();
    return new Promise((resolve, reject) => {
      pendingRef.current.set(operationId, { resolve, reject });
      socket.send(
        JSON.stringify({
          type: MESSAGE_TYPES.OPERATION,
          diagramId: session.diagramId,
          clientId: identityRef.current.clientId,
          operationId,
          baseVersion: versionRef.current,
          operation: { type: "snapshot.replace", payload: { name, document } },
        }),
      );
      window.setTimeout(() => {
        if (!pendingRef.current.has(operationId)) return;
        pendingRef.current.delete(operationId);
        reject(new Error("Save acknowledgement timed out"));
      }, 10_000);
    });
  }, []);

  const emitAwareness = useCallback((awareness) => {
    const now = Date.now();
    if (now - cursorSentAtRef.current < 50) return;
    const socket = socketRef.current;
    const session = sessionRef.current;
    if (!session || socket?.readyState !== WebSocket.OPEN) return;
    if (!Number.isFinite(awareness.x) || !Number.isFinite(awareness.y)) return;
    cursorSentAtRef.current = now;
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.CURSOR,
        diagramId: session.diagramId,
        x: awareness.x,
        y: awareness.y,
        selected: awareness.selected ?? null,
      }),
    );
  }, []);

  const emitDelta = useCallback((delta) => {
    if (
      delta?.target !== "table" ||
      delta.action !== "update" ||
      delta.data?.length !== 2
    ) {
      return;
    }
    const [id, values] = delta.data;
    if (!Number.isFinite(values?.x) || !Number.isFinite(values?.y)) return;

    const sendPreview = (payload) => {
      const socket = socketRef.current;
      const session = sessionRef.current;
      if (!session || socket?.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: MESSAGE_TYPES.OPERATION_PREVIEW,
          diagramId: session.diagramId,
          operation: { type: "table.move", payload },
        }),
      );
    };

    const now = Date.now();
    const current = previewThrottleRef.current.get(id) ?? {
      lastSent: 0,
      timer: null,
      payload: null,
    };
    current.payload = { id, x: values.x, y: values.y };
    const remaining = 50 - (now - current.lastSent);
    if (remaining <= 0) {
      window.clearTimeout(current.timer);
      current.timer = null;
      current.lastSent = now;
      sendPreview(current.payload);
    } else if (current.timer === null) {
      current.timer = window.setTimeout(() => {
        current.timer = null;
        current.lastSent = Date.now();
        sendPreview(current.payload);
      }, remaining);
    }
    previewThrottleRef.current.set(id, current);
  }, []);

  useEffect(() => disconnect, [disconnect]);

  const value = useMemo(
    () => ({
      connect,
      disconnect,
      sendSnapshot,
      connectionState,
      participants,
      remoteCursors,
      identity: identityRef.current,
      versionRef,
      emitDelta,
      emitAwareness,
      isApplyingRemoteRef,
    }),
    [
      connect,
      connectionState,
      disconnect,
      emitDelta,
      emitAwareness,
      participants,
      remoteCursors,
      sendSnapshot,
    ],
  );
  return (
    <CollabContext.Provider value={value}>{children}</CollabContext.Provider>
  );
}
