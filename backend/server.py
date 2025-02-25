import cv2
import torch
import numpy as np
import base64
import time
import threading
from flask import Flask
from flask_socketio import SocketIO
from ultralytics import YOLO
from queue import Queue

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

# Frame queue for YOLO processing (limits queue size to avoid lag)
frame_queue = Queue(maxsize=1)

def start_camera_stream(camera_ip):
    """Handles video stream processing asynchronously."""
    print(f"🔄 Attempting to start video stream for {camera_ip}...")

    cap = cv2.VideoCapture(f"rtsp://{camera_ip}:554/videoStreamId=1")

    if not cap.isOpened():
        print(f"❌ Failed to connect to {camera_ip}. Retrying in 5 seconds...")
        time.sleep(5)
        start_camera_stream(camera_ip)
        return

    print(f"✅ Streaming started for {camera_ip}")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print(f"⚠️ Lost connection to {camera_ip}, retrying...")
            cap.release()
            time.sleep(3)
            start_camera_stream(camera_ip)
            break

        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        if frame_queue.full():
            frame_queue.get()  # Remove oldest frame to prevent lag

        frame_queue.put((frame, camera_ip))

    cap.release()

def detect_tripwire_cross(camera_ip, cx, cy):
    """Detects tripwire crossings and updates counts when a person crosses."""

    print(f"🔍 Entering tripwire check for {camera_ip} at ({cx}, {cy})")

    if camera_ip not in camera_data or not camera_data[camera_ip]["tripwire"]:
        print(f"⚠️ No tripwire set for {camera_ip}, skipping detection.")
        return

    (x1_t, y1_t), (x2_t, y2_t) = camera_data[camera_ip]["tripwire"]
    flip_direction = camera_data[camera_ip]["flip_direction"]

    print(f"🎯 Tripwire set from ({x1_t}, {y1_t}) to ({x2_t}, {y2_t})")

    # Ensure coordinates are in correct left-to-right order
    if x1_t > x2_t:
        x1_t, x2_t = x2_t, x1_t
        y1_t, y2_t = y2_t, y1_t

    crossed = False  # Default to False

    # **Handle Near-Vertical Tripwires**
    if abs(x2_t - x1_t) < 10:  # Consider it vertical if very small x-difference
        print(f"🛑 Detected vertical tripwire at X={x1_t}")
        crossed = abs(cx - x1_t) < 10  # Small margin
        tripwire_y = cy  # Assign `tripwire_y` to prevent UnboundLocalError
    else:
        # **Normal Tripwire Equation**
        m = (y2_t - y1_t) / (x2_t - x1_t)

        # **Clamp extreme slope values**
        if abs(m) > 10:
            print(f"⚠️ Slope {m} is too high, treating as near-vertical.")
            crossed = abs(cx - x1_t) < 10
            tripwire_y = cy
        else:
            b = y1_t - (m * x1_t)
            tripwire_y = (m * cx) + b  # Compute expected Y for cx

        print(f"📏 Tripwire Equation: y = {round(m, 2)}x + {round(b, 2)} | Expected Y for {cx}: {round(tripwire_y, 2)} | Actual Y: {cy}")

        # **Check if Person Crossed the Tripwire**
        crossed = abs(cy - tripwire_y) < 10  # Allow small margin

    if crossed:
        prev_position = last_positions.get(camera_ip, None)
        last_positions[camera_ip] = "IN" if cy < tripwire_y else "OUT"

        if prev_position == "IN" and last_positions[camera_ip] == "OUT":
            if flip_direction:
                camera_data[camera_ip]["out"] += 1
            else:
                camera_data[camera_ip]["in"] += 1
            print(f"🚶 Person crossed OUT at ({cx}, {cy})")

        elif prev_position == "OUT" and last_positions[camera_ip] == "IN":
            if flip_direction:
                camera_data[camera_ip]["in"] += 1
            else:
                camera_data[camera_ip]["out"] += 1
            print(f"🚶 Person crossed IN at ({cx}, {cy})")

        # ✅ Update current count
        camera_data[camera_ip]["current"] = camera_data[camera_ip]["in"] - camera_data[camera_ip]["out"]


def yolo_inference_worker():
    """Processes frames one by one in a dedicated thread to avoid concurrency issues."""
    while True:
        if not frame_queue.empty():
            frame, camera_ip = frame_queue.get()

            if camera_ip not in camera_data:
                camera_data[camera_ip] = {
                    "in": 0, "out": 0, "current": 0,
                    "tripwire": None, "flip_direction": False
                }

            if frame is None or frame.size == 0:
                print(f"⚠️ Skipping empty frame from {camera_ip}")
                continue

            frame_resized = cv2.resize(frame, (640, 480))
            frame_resized = frame_resized.astype(np.float32) / 255.0

            print(f"🔍 Running YOLO on full frame: 640x480")

            roi_tensor = torch.from_numpy(frame_resized).permute(2, 0, 1).unsqueeze(0).to(device)
            roi_tensor = roi_tensor.to(torch.float32)

            if roi_tensor.nelement() == 0:
                print(f"⚠️ Skipping empty tensor from {camera_ip}")
                continue

            with torch.no_grad():
                results = model(roi_tensor, classes=[0], conf=0.5, iou=0.4)

            frame_display = (frame_resized * 255).astype(np.uint8)
            frame_display = cv2.cvtColor(frame_display, cv2.COLOR_RGB2BGR)

            in_count = camera_data[camera_ip]["in"]
            out_count = camera_data[camera_ip]["out"]
            current_count = camera_data[camera_ip]["current"]

            cv2.putText(frame_display, f"IN: {in_count}", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(frame_display, f"OUT: {out_count}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            cv2.putText(frame_display, f"Current: {current_count}", (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2)

            for box in results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2  # Center of bounding box

                # ✅ Now, we ensure tripwire detection happens
                detect_tripwire_cross(camera_ip, cx, cy)

                # ✅ Debugging to confirm it's running
                print(f"🔍 Person detected at ({cx}, {cy}) | Checking tripwire...")

                # Draw bounding box
                cv2.rectangle(frame_display, (x1, y1), (x2, y2), (0, 255, 255), 2)
                cv2.circle(frame_display, (cx, cy), 5, (0, 0, 255), -1)

            send_frame(frame_display, camera_ip)

@socketio.on("set_tripwire")
def set_tripwire(data):
    """Handles setting, flipping, or removing tripwires."""
    camera_ip = data.get("camera_ip")
    tripwire_coords = data.get("tripwire")
    flip_direction = data.get("flip_direction", False)

    print(f"📡 Received tripwire request for {camera_ip} | Data: {data}")

    if not camera_ip:
        print("❌ No camera IP provided.")
        return

    if camera_ip not in camera_data:
        camera_data[camera_ip] = {
            "in": 0, "out": 0, "current": 0,
            "tripwire": None, "flip_direction": False
        }

    if tripwire_coords is None:
        camera_data[camera_ip]["tripwire"] = None
        camera_data[camera_ip]["flip_direction"] = False
        print(f"🛑 Tripwire removed for {camera_ip}")
    else:
        x1, y1 = float(tripwire_coords["x1"]), float(tripwire_coords["y1"])
        x2, y2 = float(tripwire_coords["x2"]), float(tripwire_coords["y2"])

        camera_data[camera_ip]["tripwire"] = ((x1, y1), (x2, y2))
        camera_data[camera_ip]["flip_direction"] = flip_direction

        print(f"✅ Tripwire set for {camera_ip}: {camera_data[camera_ip]['tripwire']} | Flip: {flip_direction}")

@socketio.on("start_stream")
def start_stream(data):
    camera_ip = data.get("camera_ip")
    if not camera_ip:
        print("❌ No camera IP provided in start_stream request.")
        return

    print(f"📡 Received request to start stream for {camera_ip}")
    
    threading.Thread(target=start_camera_stream, args=(camera_ip,), daemon=True).start()

def send_frame(frame, camera_ip):
    _, buffer = cv2.imencode(".jpg", frame)
    encoded_image = base64.b64encode(buffer).decode("utf-8")
    socketio.emit("video_frame", {"camera_ip": camera_ip, "image": encoded_image})

if __name__ == "__main__":
    yolo_thread = threading.Thread(target=yolo_inference_worker, daemon=True)
    yolo_thread.start()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
