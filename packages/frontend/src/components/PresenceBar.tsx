import type { ConnectionStatus } from "../lib/wsClient";
import type { RemoteUser } from "../hooks/usePresence";

interface PresenceBarProps {
  selfName: string;
  selfColor: string;
  remoteUsers: RemoteUser[];
  status: ConnectionStatus;
  roomId: string;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Connection lost",
};

export function PresenceBar({ selfName, selfColor, remoteUsers, status, roomId }: PresenceBarProps) {
  return (
    <div className="presence-bar">
      <div className="presence-left">
        <span className="room-label">Room {roomId}</span>
        <div className="presence-users">
          <span className="presence-chip" style={{ background: selfColor }}>
            {selfName} (you)
          </span>
          {remoteUsers.map((u) => (
            <span key={u.userId} className="presence-chip" style={{ background: u.color }}>
              {u.displayName}
            </span>
          ))}
        </div>
      </div>
      <span className={`status-pill status-${status}`}>{STATUS_LABEL[status]}</span>
    </div>
  );
}
