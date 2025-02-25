import { useState, useEffect, useRef } from "react";

export default function TripwireCanvas({ cameraIp, socket, videoRef }) {
  const [tripwire, setTripwire] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [flipDirection, setFlipDirection] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!socket || !cameraIp) return;

    socket.on("tripwire_update", (data) => {
      if (data.camera_ip === cameraIp) {
        console.log("📡 Tripwire update received from server:", data);
        setTripwire(data.tripwire);
        setFlipDirection(data.flip_direction);
        drawCanvas();
      }
    });

    return () => {
      socket.off("tripwire_update");
    };
  }, [cameraIp, socket]);

  useEffect(() => {
    updateCanvasSize();
    drawCanvas();
    window.addEventListener("resize", updateCanvasSize);
    return () => {
      window.removeEventListener("resize", updateCanvasSize);
    };
  }, [tripwire, flipDirection]);

  function updateCanvasSize() {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    // 🎯 Ensure the canvas is exactly 480x640 to match the video stream
    canvas.width = 640;
    canvas.height = 480;
  }

  function drawCanvas() {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    updateCanvasSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (tripwire) {
      let { x1, y1, x2, y2 } = tripwire;

      console.log("🎨 Drawing tripwire:", tripwire);

      // 🎯 Draw tripwire line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "red";
      ctx.lineWidth = 3;
      ctx.stroke();

      // 🎨 Calculate perpendicular vector for in/out zones
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = (dy / length) * 40;
      const ny = (-dx / length) * 40;

      let greenZone = [
        { x: x1 + nx, y: y1 + ny },
        { x: x2 + nx, y: y2 + ny },
        { x: x2, y: y2 },
        { x: x1, y: y1 },
      ];

      let redZone = [
        { x: x1 - nx, y: y1 - ny },
        { x: x2 - nx, y: y2 - ny },
        { x: x2, y: y2 },
        { x: x1, y: y1 },
      ];

      // 🔄 Flip zones if necessary
      if (flipDirection) {
        [greenZone, redZone] = [redZone, greenZone];
      }

      // 🟢 Draw green entry zone
      ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
      ctx.beginPath();
      greenZone.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();

      // 🔴 Draw red exit zone
      ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
      ctx.beginPath();
      redZone.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  function getRelativeCoordinates(e) {
    if (!videoRef.current || !canvasRef.current) return null;

    const videoRect = videoRef.current.getBoundingClientRect();

    // 🚫 Ignore clicks outside the 480x640 video area
    if (
      e.clientX < videoRect.left ||
      e.clientX > videoRect.right ||
      e.clientY < videoRect.top ||
      e.clientY > videoRect.bottom
    ) {
      return null;
    }

    // 🎯 Convert click position to canvas coordinates
    const relativeX = Math.round(((e.clientX - videoRect.left) / videoRect.width) * 640);
    const relativeY = Math.round(((e.clientY - videoRect.top) / videoRect.height) * 480);

    return { x: relativeX, y: relativeY };
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return; // Left click only

    const coords = getRelativeCoordinates(e);
    if (!coords) return;

    console.log("🛠 Starting tripwire at:", coords);

    setTripwire({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
    setDrawing(true);
  }

  function handleMouseMove(e) {
    if (!drawing) return;

    const coords = getRelativeCoordinates(e);
    if (!coords) return;

    console.log("🛠 Updating tripwire to:", coords);

    setTripwire((prev) => ({
      ...prev,
      x2: coords.x,
      y2: coords.y,
    }));

    drawCanvas();
  }

  function handleMouseUp(e) {
    if (e.button !== 0) return; // Left click only

    if (tripwire) {
      console.log("✅ Final tripwire:", tripwire);
      setDrawing(false);
      socket.emit("set_tripwire", { camera_ip: cameraIp, tripwire, flip_direction: flipDirection });
      drawCanvas();
    }
  }

  function handleMiddleClick(e) {
    if (e.button !== 1) return; // Middle click only
    e.preventDefault();

    console.log("🔄 Flipping tripwire direction");
    setFlipDirection((prev) => !prev);
    socket.emit("set_tripwire", { camera_ip: cameraIp, tripwire, flip_direction: !flipDirection });
    drawCanvas();
  }

  function handleRightClick(e) {
    if (e.button !== 2) return; // Right click only
    e.preventDefault();

    console.log("❌ Removing tripwire");
    setTripwire(null);
    socket.emit("set_tripwire", { camera_ip: cameraIp, tripwire: null });
    drawCanvas();
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleRightClick} // Right click removes tripwire
      onAuxClick={handleMiddleClick} // Middle click flips direction
    />
  );
}
