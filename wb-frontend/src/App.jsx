import './App.css';
import Canvas from './components/Canvas';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API = 'https://ws.ronkiehn.dev';

function App() {
  const [roomCode, setRoomCode] = useState(null);
  const [createMode, setCreateMode] = useState(false);
  const [error, setError] = useState(null);
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
          setError('Invalid room code. Please try again.');
        }
      } else {
        navigate('/', { replace: true });
        setError('Error checking room code. Please try again.');
      }
    } catch (error) {
      console.error('Error checking room:', error);
      setError('Error checking room. Please try again.');
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
      setError('Error creating room. Please try again.');
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
// Room selection UI
if (!roomCode) {
  return (
    <div className="min-h-screen w-full flex flex-col">
      <main className="grow flex flex-col items-center justify-center gap-10">
        <h1 className="sm:text-9xl text-6xl font-bold mb-4">Gandalf</h1>
        <div className="relative bg-white px-4 py-6 rounded-xl shadow-md border border-stone-300 shadow-neutral-500 flex flex-col gap-4" >

      <div className="relative w-full min-w-[200px] shadow-xl max-w-xs h-14 bg-gray-100 rounded-full cursor-pointer border border-stone-300"
      onClick={() => setCreateMode(!createMode)}
    >
            <div
              className={`absolute top-[3px] h-12 w-1/2 bg-white rounded-full shadow-md transition-all duration-300 ease-in-out ${
                createMode ? "left-[calc(50%-2px)]" : "left-1"
              }`}
            />

            <div className="relative flex h-full">
              <div
                className={`flex-1 flex items-center justify-center text-lg z-10 transition-colors duration-300 ${
                  !createMode ? "text-black" : "text-gray-400"
                }`}
              >
                Join
              </div>
              <div
                className={`flex-1 flex items-center justify-center text-lg z-10 transition-colors duration-300 ${
                  createMode ? "text-black" : "text-gray-400"
                }`}
              >
                Create
              </div>
            </div>
          </div>
          {createMode ? (
              <button
              className="bg-blue-600 text-white p-3 w-full rounded-full hover:-translate-y-0.5 transition-all duration-200 ease-in-out hover:shadow-lg cursor-pointer"
              onClick={createRoom}
            >
              Create
            </button>
          ):
          (
            <input
              type="text"
              placeholder="room code"
              className="bg-zinc-100 placeholder:text-stone-500 p-3 rounded-xl text-center "
              onKeyPress={(e) => e.key === 'Enter' && joinRoom(e.target.value)}
            />
          )}
         {error && (
            <div className="absolute text-red-500 text-xs mt-2 -bottom-8 left-1/2 transform -translate-x-1/2 w-full text-center">
              {error}
            </div>
          )}
        </div>
             
      </main>
    </div>
  );
}

return (
  <div className="min-h-screen w-full flex flex-col">
    <header className="">
      <h1 className="p-2 text-2xl font-bold">Gandalf<span className="text-neutral-400">.design/{roomCode}</span></h1>
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