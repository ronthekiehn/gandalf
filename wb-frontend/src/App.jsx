import './App.css';
import Canvas from './components/Canvas';
import { useState } from 'react';

const API = 'https://ws.ronkiehn.dev';

function App() {
  const [roomCode, setRoomCode] = useState(null);

  const createRoom = async () => {
    const response = await fetch(`${API}/create-room`, {
      method: 'GET',
    });
    const { roomCode } = await response.json();
    setRoomCode(roomCode);
  };

  const joinRoom = async (code) => {
    const response = await fetch(`${API}/check-room?roomCode=${code}`, {
      method: 'GET',
    });
    if (response.ok) {
      const { exists } = await response.json();
      if (exists) {
        setRoomCode(code);
      } else {
        alert('Invalid room code. Please try again.');
      }
    } else {
      alert('Error checking room code. Please try again.');
    }
  };

  // Room selection UI
  if (!roomCode) {
    return (
      <div className="min-h-screen w-full flex flex-col">
        <header className="bg-blue-600 text-white p-2 shadow-md">
          <h1 className="text-xl font-bold">Interactive Whiteboard</h1>
        </header>
        <main className="grow flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <button
              className="bg-blue-600 text-white p-2 rounded shadow-lg hover:bg-blue-700"
              onClick={createRoom}
            >
              Create New Room
            </button>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Room Code"
                className="border p-2 rounded"
                onKeyPress={(e) => e.key === 'Enter' && joinRoom(e.target.value)}
              />
              <button
                className="bg-green-600 text-white p-2 rounded shadow-lg hover:bg-green-700"
                onClick={() => joinRoom(document.querySelector('input').value)}
              >
                Join Room
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="bg-blue-600 text-white p-2 shadow-md">
        <h1 className="text-xl font-bold">Interactive Whiteboard - Room: {roomCode}</h1>
      </header>
      
      <main className="grow flex">
        <div className="w-full h-full">
          <Canvas roomCode={roomCode} />
        </div>
      </main>
    </div>
  );
}

export default App;