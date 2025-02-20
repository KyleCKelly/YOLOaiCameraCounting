import { useState } from "react";
import CameraBox from "./components/CameraBox";
import AddCameraButton from "./components/AddCameraButton";
import CameraOptions from "./components/CameraOptions";

export default function App() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const camerasPerPage = 20;

  const addCamera = (ip) => {
    setCameras([...cameras, { id: cameras.length + 1, ip, inCount: 0, outCount: 0 }]);
  };

  const removeCamera = (id) => {
    setCameras(cameras.filter((camera) => camera.id !== id));
    if (selectedCamera?.id === id) {
      setSelectedCamera(null);
    }
  };

  const totalPages = Math.ceil((cameras.length + 1) / camerasPerPage);
  const startIndex = (currentPage - 1) * camerasPerPage;
  let displayedCameras = cameras.slice(startIndex, startIndex + camerasPerPage);

  // Ensure "Add Camera" button moves to the next page when the current page is full
  if (displayedCameras.length < camerasPerPage) {
    displayedCameras.push({ isAddButton: true });
  }

  return (
    <div className="h-screen w-screen bg-[#212121] flex flex-col">
      {/* Top Banner */}
      <div className="w-full h-[20vh] bg-[#171717] text-white flex flex-col justify-center items-center">
        <h1 className="text-2xl font-bold">Current Occupancy: 0</h1>
        <p className="text-sm mt-2">Occupancy Limit: 0</p>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-grow overflow-hidden">
        {/* Camera Grid, Adjusted When Panel is Open */}
        <div className={`p-6 grid grid-cols-5 grid-rows-4 gap-6 transition-all duration-300 ${selectedCamera ? "w-[75%]" : "w-full"}`}>
          {displayedCameras.map((camera, index) =>
            camera.isAddButton ? (
              currentPage === totalPages ? <AddCameraButton key="add-camera" addCamera={addCamera} /> : null
            ) : (
              <CameraBox
                key={camera.id}
                camera={camera}
                removeCamera={removeCamera}
                setSelectedCamera={setSelectedCamera}
              />
            )
          )}
        </div>

        {/* Right Panel for Camera Options */}
        <CameraOptions selectedCamera={selectedCamera} closePanel={() => setSelectedCamera(null)} />
      </div>

      {/* Pagination Controls - Fixed Layout to Avoid Shifting */}
      {totalPages > 1 && (
        <div className="flex gap-4 py-4 justify-center w-full bg-[#171717]">
          {currentPage > 1 && (
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Last Page
            </button>
          )}
          <span className="text-white text-lg">Page {currentPage} / {totalPages}</span>
          {currentPage < totalPages && (
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Next Page
            </button>
          )}
        </div>
      )}
    </div>
  );
}
