import { Mouse, Hand, Eraser, X } from 'lucide-react';
import useWhiteboardStore from '../stores/whiteboardStore';
import useUIStore from '../stores/uiStore';

const Toolbar = () => {
  const store = useWhiteboardStore();
  const { useHandTracking, toggleHandTracking, darkMode } = useUIStore();
  const colors = ['black', 'red', 'blue', 'green'];

  return (
    <div className={`absolute bottom-4 px-3 py-2 flex gap-4 justify-between items-center shadow-lg rounded-2xl shadow-neutral-500 border ${
      darkMode
        ? 'bg-gray-200 text-gray-800 border-gray-300'
        : 'bg-white text-black border-stone-300'
    }`}>
      <button
        className={`cursor-pointer p-2 rounded-full transition-colors ${
          darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
        }`}
        onClick={toggleHandTracking}
      >
        {useHandTracking ? <Hand /> : <Mouse />}
      </button>

      <div className="flex gap-2">
        {colors.map((color, index) => (
          <button
            key={color}
            className={`cursor-pointer w-6 h-6 rounded-full transition-all ${
              color === store.penColor
                ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                : 'opacity-60 hover:opacity-100'
            } ${darkMode ? 'ring-offset-gray-800' : 'ring-offset-white'}`}
            style={{ backgroundColor: color }}
            onClick={() => store.setColor(color)}
            aria-label={color}
          />
        ))}

        <button
          className={`cursor-pointer w-6 h-6 rounded-full transition-all flex items-center justify-center ${
            (darkMode && store.penColor === '#111827') || (!darkMode && store.penColor === 'white')
              ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
              : 'opacity-60 hover:opacity-100'
          } ${darkMode
              ? 'bg-gray-600 ring-offset-gray-800'
              : 'bg-gray-100 ring-offset-white'
          }`}
          onClick={() => store.setColor(darkMode ? '#111827' : 'white')}
          aria-label="Eraser"
        >
          <Eraser size={14} color={darkMode ? "white" : "black"} />
        </button>
      </div>

      <div className="slider-container flex flex-col items-center gap-1 w-full px-2">
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
              ? '[&::-webkit-slider-thumb]:bg-gray-300 [&::-webkit-slider-thumb]:border-gray-400 [&::-moz-range-thumb]:bg-gray-300 bg-gray-700'
              : '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-gray-300 [&::-moz-range-thumb]:bg-black bg-gray-200'
            }`}
          style={{
            background: darkMode
              ? `linear-gradient(to right, #ffffff 0%, #ffffff ${(store.penSize / 32) * 100}%, #4B5563 ${(store.penSize / 32) * 100}%, #4B5563 100%)`
              : `linear-gradient(to right, #000000 0%, #000000 ${(store.penSize / 32) * 100}%, #ccc ${(store.penSize / 32) * 100}%, #ccc 100%)`
          }}
        />
      </div>

      <button
        className={`cursor-pointer p-2 rounded-full text-red-500 transition-colors ${
          darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
        }`}
        onClick={() => store.clearCanvas()}
      >
        <X />
      </button>
    </div>
  );
};

export default Toolbar;
