import { useState, useEffect } from 'react'
import useWhiteboardStore from '../stores/whiteboardStore';
import { Tooltip } from './uiElements';

const StrokeGen = () => {
  const { bgCanvas, getStrokesForExport, importGeneratedStrokes } = useWhiteboardStore();
  const [error, setError] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const API = (import.meta.env.MODE === 'development') ? 'http://localhost:1234' : 'https://ws.ronkiehn.dev';

  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setInterval(() => {
        setCooldownTime(time => Math.max(0, time - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownTime]);

  const generateStrokes = async () => {
    if (!bgCanvas || !prompt || cooldownTime > 0) return;
    setIsGenerating(true);
    setError(null);

    try {
      const canvasData = getStrokesForExport();
      const requestData = {
        strokes: canvasData.strokes,
        userPrompt: prompt,
        canvasWidth: canvasData.canvasWidth,
        canvasHeight: canvasData.canvasHeight
      };

      const response = await fetch(`${API}/generate-strokes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error(errorData.error || 'Please wait between generations');
        }
        throw new Error(errorData.error || 'Server error');
      }

      const result = await response.json();
      const finalStrokes = JSON.parse(result.newStrokes);
      importGeneratedStrokes(finalStrokes);
      setPrompt('');
      setCooldownTime(10); // Set 10 second cooldown

    } catch (error) {
      if (error.message.includes('Unexpected token')) {
        setError('Invalid response from gemini. Maybe make your prompt more specific?');
      
      } else {
        setError(`Error generating: ${error.message}`);
      }
      console.error('Error generating strokes:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative">
      <Tooltip content="AI Drawing (experimental)" direction="top">
        <button
          className={`cursor-pointer px-[11px] py-1.5 rounded transition-all flex items-center justify-center text-lg
          ring-offset-white dark:ring-offset-neutral-800  ${showPrompt ? 'bg-neutral-200 dark:bg-neutral-700' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
          onClick={() => setShowPrompt(!showPrompt)}
          aria-label="AI"
        >
          AI
        </button>
      </Tooltip>

      {showPrompt && (
        <div className='absolute bottom-14 -translate-x-1/2 sm:left-auto sm:right-auto right-2 left-2 fade-in-fast'>
           {error && (
            <div className="bottom-10 absolute text-sm text-red-600 dark:text-red-400 text-center ">
              {error}
            </div>
          )}

        <form className="min-w-xs overflow-hidden flex items-center justify-between shadow-md rounded-xl shadow-neutral-400 border
      bg-white text-black border-stone-300
      dark:bg-neutral-900 dark:text-white dark:border-stone-700 dark:shadow-neutral-600 dark:shadow">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            autoFocus
            placeholder="Add some birds..."
            className="w-full p-2 border text-sm rounded dark:bg-neutral-900 dark:text-white focus:outline-none border-none"
            disabled={isGenerating}
          />
          <button
          type='submit'
            onClick={(e) => { e.preventDefault(); generateStrokes(); }}
            disabled={isGenerating || !prompt || cooldownTime > 0}
            className="text-sm w-fit p-2 bg-blue-500 text-white hover:bg-blue-600 cursor-pointer disabled:bg-neutral-100 disabled:dark:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-nowrap"
          >
            {isGenerating ? 'Generating...' : cooldownTime > 0 ? `Wait ${cooldownTime}s` : 'Generate'}
          </button>

         
        </form>
        </div>
      )}
     
    </div>
  );
};

export default StrokeGen;