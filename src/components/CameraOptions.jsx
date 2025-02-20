import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import TripwireCanvas from "./TripwireCanvas";

const socket = io("http://localhost:5000");

export default function CameraOptions({ selectedCamera, closePanel }) {
  const [frame, setFrame] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [counts, setCounts] = useState({ in: 0, out: 0, current: 0 });
  const videoRef = useRef(null);

  useEffect(() => {
    if (!selectedCamera) return;

    if (isStreaming) {
      socket.emit("start_stream", { camera_ip: selectedCamera.ip });

      socket.on("video_frame", (data) => {
        if (data.camera_ip === selectedCamera.ip) {
          setFrame(`data:image/jpeg;base64,${data.image}`);
        }
      });

      socket.on("update_counts", (data) => {
        if (data.camera_ip === selectedCamera.ip) {
          setCounts({ in: data.in, out: data.out, current: data.current });
        }
      });

      return () => {
        socket.off("video_frame");
        socket.off("update_counts");
      };
    }
  }, [selectedCamera, isStreaming]);

  function handleCloseFullscreen() {
    setIsFullscreen(false);
  }

  function handleBackgroundClick(e) {
    if (e.target.id === "fullscreenOverlay") {
      handleCloseFullscreen();
    }
  }

  if (!selectedCamera) return null;

  return (
    <div className="w-[25%] h-[80vh] bg-[#2C2C2C] text-white flex flex-col items-center justify-center p-4 relative">
      {/* Close Panel Button */}
      <button onClick={closePanel} className="absolute top-2 right-2 text-white text-lg">❌</button>
      <h2 className="text-lg font-bold">Camera {selectedCamera.id} Options</h2>
      <p className="text-sm">IP: {selectedCamera.ip}</p>

      {/* Displaying the updated counts */}
      <p className="mt-2">🔼 In: {counts.in}</p>
      <p>🔽 Out: {counts.out}</p>
      <p>🟢 Current: {counts.current}</p>

      {!isStreaming ? (
        <button
          onClick={() => setIsStreaming(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded mt-4"
        >
          View Feed
        </button>
      ) : (
        <>
          <div className="mt-4 border border-gray-500 relative">
            <img ref={videoRef} src={frame} alt="Live Stream" className="w-full h-48 object-contain" />
            <TripwireCanvas cameraIp={selectedCamera.ip} socket={socket} videoRef={videoRef} />
          </div>

          <button
            onClick={() => setIsFullscreen(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded mt-4"
          >
            View Full / Create Tripwire
          </button>
        </>
      )}

      {isFullscreen && (
        <div
          id="fullscreenOverlay"
          onClick={handleBackgroundClick}
          className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-80 flex items-center justify-center"
        >
          <div className="relative bg-[#171717] p-4 rounded-lg w-[80%] h-[80%] flex flex-col items-center justify-center">
            <button onClick={handleCloseFullscreen} className="absolute top-4 right-4 text-white text-2xl z-50">❌</button>
            <div className="relative w-full h-full flex justify-center items-center">
              <img ref={videoRef} src={frame} alt="Live Stream" className="w-full h-full object-contain" />
              <TripwireCanvas cameraIp={selectedCamera.ip} socket={socket} videoRef={videoRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
