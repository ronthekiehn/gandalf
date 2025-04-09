import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Canvas from '../components/Canvas';
import TopMenu from '../components/TopMenu';
import useWhiteboardStore from '../stores/whiteboardStore';
import { Settings } from 'lucide-react';
import { Tooltip } from '../components/uiElements';
import useUIStore from '../stores/uiStore';

const API = (import.meta.env.MODE === 'development')  === 'dev' ? 'http://localhost:1234' : 'https://ws.ronkiehn.dev';

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const activeUsers = useWhiteboardStore((state) => state.activeUsers);
  const settingsOpen = useUIStore((state) => state.settingsOpen);
  const toggleSettings = useUIStore((state) => state.toggleSettings);

  useEffect(() => {
    // Validate room on mount
    async function validateRoom() {
      try {
        const response = await fetch(`${API}/check-room?roomCode=${roomId}`);
        const { exists } = await response.json();
        if (!exists) {
          navigate('/', { replace: true });
        }
      } catch (error) {
        console.error('Error validating room:', error);
        navigate('/', { replace: true });
      }
    }
    validateRoom();

    // Cleanup when leaving room
    return () => {
      useWhiteboardStore.getState().cleanupYjs();
    };
  }, [roomId]);

  return (
    <div className="bg-white dark:bg-neutral-900 dark:text-white sm:p-0 p-2 fade-in h-screen w-full flex flex-col">
      <header className=" flex items-center justify-between gap-2 bg-white dark:bg-neutral-900 dark:text-white">
       
        <h1 className="flex p-2 gap-2 items-start text-2xl font-bold">
          <span>Gandalf<span className="text-neutral-400">.design/{roomId}</span></span>
          
        </h1>
        <div className='flex items-center gap-4 mr-1'>
          <div className="hidden sm:flex gap-1 items-center">
            {activeUsers.map((user) => (
              <Tooltip key={user.clientID} direction="bottom" content={user.userName}>
                <p className="text-white text-sm flex justify-center items-center p-1 w-8 h-8 text-center rounded-full shadow-sm"
                   style={{ backgroundColor: user.color }}>
                  {user.userName?.[0] || '?'}
                </p>
              </Tooltip>
            ))}
          </div>
          <Tooltip direction="bottom" content="Settings">
            <button onClick={toggleSettings}
                    className="cursor-pointer p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
              <Settings />
            </button>
          </Tooltip>
          {settingsOpen && <TopMenu />}
        </div>
      </header>
      <main className="grow flex h-[calc(100vh-3rem)]">
        <div className="w-full h-full">
          <Canvas roomCode={roomId} />
        </div>
      </main>
    </div>
  );
}