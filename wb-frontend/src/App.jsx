import './App.css';
import Canvas from './components/Canvas';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API = 'https://ws.ronkiehn.dev';

function App() {
  const [roomCode, setRoomCode] = useState(null);
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (roomId && !roomCode) {
      checkAndJoinRoom(roomId);
    }
  }, [roomId]);
  
  const checkAndJoinRoom = async (code) => {
    try {
      const response = await fetch(`${API}/check-room?roomCode=${code}`, {
        method: 'GET',
      });
      if (response.ok) {
        const { exists } = await response.json();
        if (exists) {
          setRoomCode(code);
        } else {
          // Room doesn't exist, redirect to home
          navigate('/', { replace: true });
          alert('Invalid room code. Please try again.');
        }
      } else {
        navigate('/', { replace: true });
        alert('Error checking room code. Please try again.');
      }
    } catch (error) {
      console.error('Error checking room:', error);
      navigate('/', { replace: true });
    }
  };
  
  const createRoom = async () => {
    try {
      const response = await fetch(`${API}/create-room`, {
        method: 'GET',
      });
      const { roomCode } = await response.json();
      setRoomCode(roomCode);
      
      // Update URL when creating a new room
      navigate(`/${roomCode}`, { replace: true });
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Error creating room. Please try again.');
    }
  };

  const joinRoom = async (code) => {
    if (!code || code.trim() === '') {
      alert('Please enter a room code');
      return;
    }
    
    await checkAndJoinRoom(code);
    
    // Update URL when joining a room
    if (roomCode) {
      navigate(`/${code}`, { replace: true });
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