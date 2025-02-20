import { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

export default function CameraBox({ camera, removeCamera, setSelectedCamera }) {
  const [counts, setCounts] = useState({ in: camera.inCount, out: camera.outCount, current: camera.inCount - camera.outCount });

  useEffect(() => {
    socket.on("update_counts", (data) => {
      if (data.camera_ip === camera.ip) {
        setCounts({ in: data.in, out: data.out, current: data.current });
      }
    });

    return () => {
      socket.off("update_counts");
    };
  }, [camera]);

  return (
    <div
      onClick={() => setSelectedCamera(camera)}
      className="bg-[#625858] p-4 rounded-lg shadow-lg w-80 h-60 text-center text-white cursor-pointer hover:bg-[#7a6b6b] transition flex flex-col justify-center relative"
    >
      {/* Remove Button in Top-Right */}
      <button
        onClick={(e) => {
          e.stopPropagation(); 
          removeCamera(camera.id);
        }}
        className="absolute top-2 right-2 text-white text-lg"
      >
        ➖
      </button>

      <h2 className="text-lg font-semibold">Camera {camera.id}</h2>
      <p className="text-md">📡 IP: {camera.ip}</p>
      <p className="text-md">🔼 IN: {counts.in}</p>
      <p className="text-md">🔽 OUT: {counts.out}</p>
      <p className="text-md">👥 Current: {counts.current}</p>
    </div>
  );
}
