import cv2
import torch
import numpy as np
import base64
import time
from flask import Flask
from flask_socketio import SocketIO
from ultralytics import YOLO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Load YOLO model
device = "cuda" if torch.cuda.is_available() else "cpu"
model = YOLO("yolov8n.pt").to(device)

# Camera state storage
camera_data = {}

# Cooldown for tripwire counting
COOLDOWN_TIME = 1.5
cross_timestamps = {}

# Stores last positions for movement tracking
last_positions = {}

@socketio.on("start_stream")
def start_stream(data):
    """Starts streaming frames to clients."""
    camera_ip = data.get("camera_ip")

    if not camera_ip:
        print("❌ No camera IP provided in start_stream request.")
        return

    print(f"📡 Attempting to connect to {camera_ip}...")

    cap = cv2.VideoCapture(f"rtsp://{camera_ip}:554/videoStreamId=1")

    if not cap.isOpened():
        print(f"❌ Failed to connect to {camera_ip}. Retrying in 5 seconds...")
        time.sleep(5)
        return

    print(f"✅ Streaming started for {camera_ip}")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print(f"⚠️ Lost connection to camera {camera_ip}, retrying...")
            cap.release()
            time.sleep(3)
            start_stream({"camera_ip": camera_ip})
            break

        frame = process_frame(frame, camera_ip)

        _, buffer = cv2.imencode(".jpg", frame)
        encoded_image = base64.b64encode(buffer).decode("utf-8")
        socketio.emit("video_frame", {"camera_ip": camera_ip, "image": encoded_image})

    cap.release()

def process_frame(frame, camera_ip):
    """Processes a frame: applies YOLO, detects tripwire crossings, updates counts, and encodes."""
    global last_positions, cross_timestamps, camera_data

    if camera_ip not in camera_data:
        camera_data[camera_ip] = {
            "in": 0, "out": 0, "current": 0,
            "tripwire": None, "flip_direction": False
        }

    in_count = camera_data[camera_ip]["in"]
    out_count = camera_data[camera_ip]["out"]
    current_count = camera_data[camera_ip]["current"]
    tripwire = camera_data[camera_ip].get("tripwire")
    flip_direction = camera_data[camera_ip].get("flip_direction", False)

    results = model(frame, classes=[0], conf=0.5, iou=0.4)

    for box in results[0].boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
        cv2.circle(frame, (cx, cy), 5, (0, 0, 255), -1)

    if tripwire:
        try:
            (x1_t, y1_t), (x2_t, y2_t) = tripwire
            cv2.line(frame, (int(x1_t), int(y1_t)), (int(x2_t), int(y2_t)), (0, 0, 255), 3)

        except Exception as e:
            print(f"⚠️ Error drawing tripwire for {camera_ip}: {e}")

    cv2.putText(frame, f"IN: {in_count}", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    cv2.putText(frame, f"OUT: {out_count}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    cv2.putText(frame, f"CURRENT: {current_count}", (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    return frame

@socketio.on("set_tripwire")
def set_tripwire(data):
    """Handles setting, flipping, or removing tripwires."""
    camera_ip = data.get("camera_ip")
    tripwire_coords = data.get("tripwire")
    flip_direction = data.get("flip_direction", False)

    if not camera_ip:
        return

    if camera_ip not in camera_data:
        camera_data[camera_ip] = {
            "in": 0, "out": 0, "current": 0,
            "tripwire": None, "flip_direction": False
        }

    if tripwire_coords is None:
        camera_data[camera_ip]["tripwire"] = None
        camera_data[camera_ip]["flip_direction"] = False
    else:
        try:
            x1, y1, x2, y2 = tripwire_coords["x1"], tripwire_coords["y1"], tripwire_coords["x2"], tripwire_coords["y2"]
            camera_data[camera_ip]["tripwire"] = ((float(x1), float(y1)), (float(x2), float(y2)))
            camera_data[camera_ip]["flip_direction"] = flip_direction
        except (TypeError, KeyError, ValueError):
            return

    socketio.emit("tripwire_update", {
        "camera_ip": camera_ip,
        "tripwire": camera_data[camera_ip]["tripwire"],
        "flip_direction": camera_data[camera_ip]["flip_direction"]
    })

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
