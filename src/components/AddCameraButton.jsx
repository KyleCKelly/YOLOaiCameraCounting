import { useState } from "react";

export default function AddCameraButton({ addCamera }) {
  const [ip, setIp] = useState("");

  const handleAddCamera = () => {
    if (ip.trim() !== "") {
      addCamera(ip);
      setIp("");
    }
  };

  return (
    <div className="bg-[#625858] p-4 rounded-lg shadow-lg w-80 h-60 text-center text-white flex flex-col justify-center">
      <p className="text-lg font-semibold">➕ Add Camera</p>
      <input
        type="text"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        placeholder="Enter Camera IP"
        className="mt-2 px-2 py-1 text-black rounded w-full text-md"
      />
      <button
        onClick={handleAddCamera}
        className="bg-green-500 hover:bg-green-600 text-white py-2 px-3 rounded mt-2 w-full text-md"
      >
        Add
      </button>
    </div>
  );
}
