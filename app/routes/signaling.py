"""WebSocket signaling server for WebRTC peer-to-peer file transfer."""

import asyncio
import json
import uuid
from typing import Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Connected peers: {peer_id: {"ws": WebSocket, "name": str}}
connected_peers: Dict[str, dict] = {}

# Heartbeat interval (seconds) — detects and removes dead connections
HEARTBEAT_INTERVAL = 10


async def heartbeat_loop():
    """Periodically ping all peers and remove dead ones."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        dead_peers = []

        for peer_id, peer in list(connected_peers.items()):
            try:
                await peer["ws"].send_json({"type": "ping"})
            except Exception:
                dead_peers.append(peer_id)

        # Remove dead peers and notify others
        for peer_id in dead_peers:
            if peer_id in connected_peers:
                del connected_peers[peer_id]
                await broadcast(peer_id, {
                    "type": "peer-left",
                    "peer_id": peer_id,
                })
                print(f"🧹 Cleaned up dead peer: {peer_id}")


# Start heartbeat when the module loads (will be started by first connection)
_heartbeat_task = None


def ensure_heartbeat():
    """Start heartbeat loop if not already running."""
    global _heartbeat_task
    if _heartbeat_task is None or _heartbeat_task.done():
        _heartbeat_task = asyncio.create_task(heartbeat_loop())


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    WebSocket signaling endpoint for WebRTC.

    Handles:
    - Peer registration (join/leave)
    - WebRTC offer/answer/ICE candidate forwarding
    - Peer discovery (who else is online)
    - Heartbeat ping/pong to clean dead connections
    """
    await ws.accept()
    ensure_heartbeat()

    peer_id = str(uuid.uuid4())[:8]
    peer_name = f"Device-{peer_id[:4]}"

    # Register this peer
    connected_peers[peer_id] = {"ws": ws, "name": peer_name}

    try:
        # Notify this peer of their ID
        await ws.send_json({
            "type": "welcome",
            "peer_id": peer_id,
            "peer_name": peer_name,
        })

        # Send current peer list to the new peer (exclude self)
        await ws.send_json({
            "type": "peers",
            "peers": [
                {"id": pid, "name": p["name"]}
                for pid, p in connected_peers.items()
                if pid != peer_id
            ],
        })

        # Notify all other peers about the new peer
        await broadcast(peer_id, {
            "type": "peer-joined",
            "peer_id": peer_id,
            "peer_name": peer_name,
        })

        # Handle incoming messages
        while True:
            data = await ws.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            # Ignore pong responses (heartbeat reply)
            if msg_type == "pong":
                continue

            if msg_type == "set-name":
                # Update peer name
                peer_name = message.get("name", peer_name)
                connected_peers[peer_id]["name"] = peer_name
                # Notify others of name change
                await broadcast(peer_id, {
                    "type": "peer-updated",
                    "peer_id": peer_id,
                    "peer_name": peer_name,
                })

            elif msg_type in ("offer", "answer", "ice-candidate"):
                # Forward WebRTC signaling to the target peer
                target_id = message.get("target")
                if target_id and target_id in connected_peers:
                    await connected_peers[target_id]["ws"].send_json({
                        "type": msg_type,
                        "from": peer_id,
                        "from_name": peer_name,
                        "data": message.get("data"),
                    })

            elif msg_type == "file-request":
                # Forward file transfer request to target
                target_id = message.get("target")
                if target_id and target_id in connected_peers:
                    await connected_peers[target_id]["ws"].send_json({
                        "type": "file-request",
                        "from": peer_id,
                        "from_name": peer_name,
                        "files": message.get("files"),
                    })

            elif msg_type == "file-response":
                # Forward accept/reject response
                target_id = message.get("target")
                if target_id and target_id in connected_peers:
                    await connected_peers[target_id]["ws"].send_json({
                        "type": "file-response",
                        "from": peer_id,
                        "accepted": message.get("accepted"),
                    })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"⚠️ WebSocket error for {peer_id}: {e}")
    finally:
        # Always remove peer on disconnect and notify others
        if peer_id in connected_peers:
            del connected_peers[peer_id]
            await broadcast(peer_id, {
                "type": "peer-left",
                "peer_id": peer_id,
            })
            print(f"👋 Peer disconnected: {peer_name} ({peer_id})")


async def broadcast(sender_id: str, message: dict):
    """Send a message to all connected peers except the sender."""
    disconnected = []
    for pid, peer in list(connected_peers.items()):
        if pid != sender_id:
            try:
                await peer["ws"].send_json(message)
            except Exception:
                disconnected.append(pid)

    # Clean up any peers that failed during broadcast
    for pid in disconnected:
        if pid in connected_peers:
            del connected_peers[pid]
