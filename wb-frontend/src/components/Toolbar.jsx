import { Mouse, Hand, Eraser, X } from 'lucide-react';
import useWhiteboardStore from '../stores/whiteboardStore';
import useUIStore from '../stores/uiStore';
import { Tooltip } from './uiElements';

const Toolbar = () => {
  const store = useWhiteboardStore();
  const { useHandTracking, toggleHandTracking, darkMode } = useUIStore();
  const colors = ['black', 'red', 'blue', 'green'];

  return (
    <div className='fade-in absolute bottom-3 px-3 py-2 flex gap-4 justify-between items-center shadow-md rounded-2xl shadow-neutral-400 border
    bg-white text-black border-stone-300
    dark:bg-neutral-900 dark:text-white dark:border-stone-700 dark:shadow-neutral-600'>
    <Tooltip content='Toggle between hand tracking and mouse control. When hand tracking is enabled, pinch to draw.'>
      <button
        className='cursor-pointer p-2 rounded transition-colors
        hover:bg-neutral-100 dark:hover:bg-neutral-700'
        onClick={toggleHandTracking}
      >
        {useHandTracking ? <Hand /> : <Mouse />}
      </button>
      </Tooltip>

      <Tooltip content="Select Pen Color">
      <div className="py-2 flex items-center gap-2">
        {colors.map((color, index) => (
          <button
            key={color}
            className={`cursor-pointer w-6 h-6 rounded-full transition-all ${
              color === store.penColor
                ? 'ring-2 ring-offset-2 ring-blue-500'
                : 'opacity-100 hover:opacity-80'
            } ring-offset-white dark:ring-offset-neutral-800`}
            style={{ backgroundColor: color }}
            onClick={() => store.setColor(color)}
            aria-label={color}
          />
        ))}
      </div>
      </Tooltip>
      <Tooltip content="Eraser">
      <button
          className='cursor-pointer p-2 rounded transition-all flex items-center justify-center
          ring-offset-white dark:ring-offset-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700'
          aria-label="Eraser"
        >
          <Eraser />
        </button>
        </Tooltip>
        <Tooltip content="Line Thickness (2-32px)">
      <div className="slider-container flex flex-col items-center gap-1 w-full px-2 py-4">
        <input
          type="range"
          min="1"
          max="16"
          value={store.penSize / 2}
          onChange={(e) => store.setPenSize(parseInt(e.target.value) * 2)}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border
            [&::-moz-range-thumb]:cursor-pointer
            ${darkMode
              ? '[&::-webkit-slider-thumb]:bg-neutral-900 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:bg-neutral-300 bg-neutral-700'
              : '[&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:border-black [&::-moz-range-thumb]:bg-black bg-neutral-200'
            }`}
          style={{
            background: darkMode
              ? `linear-gradient(to right, #ffffff 0%, #ffffff ${(store.penSize / 32) * 100}%, #4B5563 ${(store.penSize / 32) * 100}%, #4B5563 100%)`
              : `linear-gradient(to right, #000000 0%, #000000 ${(store.penSize / 32) * 100}%, #ccc ${(store.penSize / 32) * 100}%, #ccc 100%)`
          }}
        />
      </div>
      </Tooltip>
      <Tooltip content="Clear Canvas">
      <button
        className='cursor-pointer p-2 rounded text-red-500 transition-colors
        hover:bg-neutral-100 dark:hover:bg-neutral-700'
        onClick={() => store.clearCanvas()}
      >
        <X />
      </button>
    </Tooltip>
    </div>
  );
};

export default Toolbar;
