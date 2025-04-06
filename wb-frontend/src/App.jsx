import './App.css';
import Canvas from './components/Canvas';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useWhiteboardStore from './stores/whiteboardStore';
import useUIStore from './stores/uiStore';
import { DarkModeToggle } from './components/uiElements';

//const API = 'https://ws.ronkiehn.dev';
const API = 'http://localhost:1234';

function App() {
  const [roomCode, setRoomCode] = useState(null);
  const [createMode, setCreateMode] = useState(false);
  const [error, setError] = useState(null);
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const activeUsers = useWhiteboardStore((state) => state.activeUsers);
  const darkMode = useUIStore((state) => state.darkMode);

  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);
  

  useEffect(() => {
    // Reset room code when navigating to home page
    if (location.pathname === '/') {
      setRoomCode(null);
      setError(null);
    } 
    // Try to join the room when there's a roomId parameter
    else if (roomId && roomId !== roomCode) {
      checkAndJoinRoom(roomId);
    }
  }, [location.pathname, roomId]);

  
  const checkAndJoinRoom = async (code) => {
    try {
      const response = await fetch(`${API}/check-room?roomCode=${code}`, {
        method: 'GET',
      });
      if (response.ok) {
        const { exists } = await response.json();
        if (exists) {
          setRoomCode(code);
          navigate(`/${code}`);
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
      navigate(`/${roomCode}`);
    } catch (error) {
      console.error('Error creating room:', error);
      setError('Error creating room. Please try again.');
    }
  };

  // Room selection UI
// Room selection UI
if (!roomCode) {
  return (
    <div className="h-screen w-full flex flex-col bg-white text-black dark:bg-neutral-900 dark:text-white">
      <main className="fade-in  grow flex flex-col items-center justify-center gap-10 mb-20">
        <div className="absolute top-2 right-2">
        <DarkModeToggle />
        </div>

        <h1 className="sm:text-9xl text-6xl font-bold mb-4">Gandalf</h1>
        <div className="relative  px-4 py-6 rounded-2xl shadow-md border shadow-neutral-500 flex flex-col gap-4
        bg-white text-black border-stone-300
       dark:bg-neutral-900 dark:text-white dark:border-stone-700 dark:shadow-neutral-600" >

      <div className="relative w-full min-w-[200px] shadow-xl max-w-xs h-14 bg-neutral-100 dark:bg-neutral-800 rounded-full cursor-pointer border border-stone-300 dark:border-stone-700"
      onClick={() => setCreateMode(!createMode)}
    >
            <div
              className={`absolute top-[3px] h-12 w-1/2 bg-white dark:bg-neutral-900 rounded-full shadow-md transition-all duration-300 ease-in-out ${
                createMode ? "left-[calc(50%-4px)]" : "left-1"
              }`}
            />

            <div className="relative flex h-full">
              <div
                className={`flex-1 flex items-center justify-center text-lg z-10 transition-colors duration-300 ${
                  !createMode ? "text-black dark:text-white" : "text-neutral-400"
                }`}
              >
                Join
              </div>
              <div
                className={`flex-1 flex items-center justify-center text-lg z-10 transition-colors duration-300 ${
                  createMode ? "text-black dark:text-white" : "text-neutral-400"
                }`}
              >
                Create
              </div>
            </div>
          </div>
          {createMode ? (
              <button
              className="bg-blue-600 dark:bg-blue-300 text-white dark:text-black p-3 w-full rounded-full hover:-translate-y-0.5 transition-all !duration-200 ease-in-out hover:shadow-lg dark:shadow-white/15 cursor-pointer"
              onClick={createRoom}
            >
              Create
            </button>
          ):
          (
            <input
              type="text"
              placeholder="room code"
              className="bg-zinc-100 placeholder:text-stone-500 dark:bg-zinc-700 dark:placeholder:text-stone-300 p-3 rounded-xl text-center focus:outline-blue-600 dark:focus:outline-blue-300 focus:outline-2 focus:ring-0 focus:shadow-none appearance-none"
              onKeyPress={(e) => e.key === 'Enter' && checkAndJoinRoom(e.target.value)}
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
  <div className="h-screen w-full flex flex-col">
    <header className="flex items-center justify-between bg-white dark:bg-neutral-900 dark:text-white">
      <h1 className="p-2 text-2xl font-bold">Gandalf<span className="text-neutral-400">.design/{roomCode}</span></h1>
      <div className="hidden sm:flex gap-2 items-center mr-2">
        {activeUsers.map((user) => (
          <p
            key={user.clientID}
            className="text-white text-sm flex justify-center items-center p-1 w-6 h-6 text-center rounded-full shadow-sm"
            style={{ backgroundColor: user.color }}
          >
            {user.userName?.[0] || '?'}
          </p>
        ))}
      </div>
    </header>
    
    <main className="grow flex h-[calc(100vh-3rem)]">
      <div className="w-full h-full">
        <Canvas roomCode={roomCode} />
      </div>
    </main>
  </div>
);
}

export default App;