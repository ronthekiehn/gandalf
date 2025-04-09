import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DarkModeToggle } from '../components/uiElements';
import gandalf from '../assets/gandalf-noshadow.svg';
import github from '../assets/github.svg';

const API = (import.meta.env.MODE === 'development')  ? 'http://localhost:1234' : 'https://ws.ronkiehn.dev';

export default function Home() {
  const [createMode, setCreateMode] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const checkAndJoinRoom = async (code) => {
    try {
      const response = await fetch(`${API}/check-room?roomCode=${code}`, {
        method: 'GET',
      });
      if (response.ok) {
        const { exists } = await response.json();
        if (exists) {
          navigate(`/${code}`);
        } else {
          setError('Invalid room code. Please try again.');
        }
      } else {
        setError('Error checking room code');
      }
    } catch (error) {
      console.error('Error finding room:', error);
      setError('Error finding room: ' + error.message);
    }
  };
  
  const createRoom = async () => {
    try {
      const response = await fetch(`${API}/create-room`, {
        method: 'GET',
      });
      const { roomCode } = await response.json();
      navigate(`/${roomCode}`);
    } catch (error) {
      console.error('Error creating room:', error);
      setError('Error creating room: ' + error.message);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-white text-black dark:bg-neutral-900 dark:text-white">
      <main className="fade-in grow flex flex-col items-center justify-center gap-2 mb-28">
        <div className="absolute top-1 right-1">
          <DarkModeToggle />
        </div>

        <h1 className="sm:text-9xl text-8xl font-bold text-center">Gandalf</h1>
        <h2 className="text-lg sm:text-xl font-semibold text-center flex items-center gap-2">
        a magic whiteboard <img className="-mt-1" src={gandalf} alt="Gandalf Logo" width={32} height={32} /> 
        </h2>
        
        <div className="mt-8 relative px-4 py-6 rounded-2xl shadow-md border shadow-neutral-500 flex flex-col gap-4
          bg-white text-black border-stone-300
          dark:bg-neutral-900 dark:text-white dark:border-stone-700 dark:shadow-neutral-600">

          <div className="relative w-full min-w-[200px] shadow-xl max-w-xs h-14 bg-neutral-100 dark:bg-neutral-800 rounded-full cursor-pointer border border-stone-300 dark:border-stone-700"
            onClick={() => setCreateMode(!createMode)}>
            <div className={`absolute top-[3px] h-12 w-1/2 bg-white dark:bg-neutral-900 rounded-full shadow-md transition-all duration-300 ease-in-out ${
              !createMode ? "left-[calc(50%-4px)]" : "left-1"
            }`} />

            <div className="relative flex h-full">
              <div className={`flex-1 flex items-center justify-center text-lg z-10 transition-colors duration-300 ${
                createMode ? "text-black dark:text-white" : "text-neutral-400"
              }`}>
                Create
              </div>
              <div className={`flex-1 flex items-center justify-center text-lg z-10 transition-colors duration-300 ${
                !createMode ? "text-black dark:text-white" : "text-neutral-400"
              }`}>
                Join
              </div>
            </div>
          </div>
          

          {createMode ? (
            <button
              className="bg-blue-600 dark:bg-blue-300 text-white dark:text-black p-3 w-full rounded-full hover:-translate-y-0.5 transition-all !duration-200 ease-in-out hover:shadow-lg dark:shadow-white/15 cursor-pointer"
              onClick={createRoom}>
              Create
            </button>
          ) : (
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
      <footer className="absolute bottom-0 left-1/2 transform -translate-x-1/2 flex gap-2 items-center p-2">
       
      <a href='https://github.com/ronthekiehn/gandalf' target="_blank" rel="noopener noreferrer" className="hover:scale-105">
            <img src={github}  alt="GitHub" className="dark:invert w-6 h-6" />
        </a>
        
        </footer>
    </div>
  );
}