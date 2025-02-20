import { useState } from "react";
import TripwireCanvas from "./TripwireCanvas";

export default function CameraModal({ camera, onClose }) {
  const [tripwire, setTripwire] = useState(null);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-lg w-3/4 max-w-2xl text-center">
        <h2 className="text-xl font-semibold">Camera {camera.id} - Live Feed</h2>
        <p>IP: {camera.ip}</p>
        <div className="mt-4 relative">
        <img
        src="http://localhost:5000/stream"
        alt={`Camera ${camera.id} Live Feed`}
        className="w-full h-64 bg-black"
        />
          <TripwireCanvas tripwire={tripwire} setTripwire={setTripwire} />
        </div>
        <button onClick={onClose} className="mt-4 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded">
          Close
        </button>
      </div>
    </div>
  );
}
