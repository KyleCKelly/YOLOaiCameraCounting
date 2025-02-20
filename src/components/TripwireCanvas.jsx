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
        setTripwire(data.tripwire);
        setFlipDirection(data.flip_direction);
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

    // Ensure canvas matches the video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  function drawCanvas() {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    updateCanvasSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (tripwire) {
      let { x1, y1, x2, y2 } = tripwire;

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
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Ensure the user is clicking inside the video stream area
    if (
      e.clientX < videoRect.left || e.clientX > videoRect.right ||
      e.clientY < videoRect.top || e.clientY > videoRect.bottom
    ) {
      return null;
    }

    return {
      x: (e.clientX - videoRect.left) * (canvasRef.current.width / videoRect.width),
      y: (e.clientY - videoRect.top) * (canvasRef.current.height / videoRect.height),
    };
  }

  function handleMouseDown(e) {
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

    drawCanvas(); // Ensure immediate visual feedback
  }

  function handleMouseUp() {
    if (tripwire) {
      console.log("🛠 Final tripwire:", tripwire);
      setDrawing(false);
      socket.emit("set_tripwire", { camera_ip: cameraIp, tripwire, flip_direction: flipDirection });
    }
  }

  function handleMiddleClick(e) {
    e.preventDefault();
    setFlipDirection((prev) => !prev);
    socket.emit("set_tripwire", { camera_ip: cameraIp, tripwire, flip_direction: !flipDirection });
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleMiddleClick} // Middle click to flip IN/OUT
    />
  );
}
