import { useState, useEffect } from 'react';
import useWhiteboardStore from '../stores/whiteboardStore';
import { DarkModeToggle, Tooltip } from './uiElements';
import Gemini from './Gemini';


const defaultValues = {
  cursorHistorySize: { min: 0, max: 5, default: 1 },
  cursorDeadzone: { min: 0, max: 999, default: 2 },
  drawingDeadzone: { min: 0, max: 999, default: 5 },
  pinchDist: { min: 0, max: 2, default: 0.07 },
  fistToClear: true
};

const TopMenu = () => {
  const { bgCanvas, userName, setUserName, smoothingParams, setSmoothingParams, pinchDist, setPinchDist, fistToClear, setFistToClear } = useWhiteboardStore();
  const [localUserName, setLocalUserName] = useState(userName);

  //everything to do with smoothing
  const [localInputs, setLocalInputs] = useState({
    cursorHistorySize: smoothingParams.cursorHistorySize,
    cursorDeadzone: smoothingParams.cursorDeadzone,
    drawingDeadzone: smoothingParams.drawingDeadzone,
    pinchDist: pinchDist,
    fistToClear: fistToClear
  });

  const hasChanges = () => {
    return localInputs.cursorHistorySize !== smoothingParams.cursorHistorySize ||
           localInputs.cursorDeadzone !== smoothingParams.cursorDeadzone ||
           localInputs.drawingDeadzone !== smoothingParams.drawingDeadzone ||
           localInputs.pinchDist !== pinchDist ||
           localInputs.fistToClear !== fistToClear;
  };

  const hasChangesFromDefault = () => {
    return smoothingParams.cursorHistorySize !== defaultValues.cursorHistorySize.default ||
           smoothingParams.cursorDeadzone !== defaultValues.cursorDeadzone.default ||
           smoothingParams.drawingDeadzone !== defaultValues.drawingDeadzone.default ||
           pinchDist !== defaultValues.pinchDist.default ||
           fistToClear !== defaultValues.fistToClear;
  };

  const validateValue = (value, param) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return defaultValues[param].default;
    return Math.min(Math.max(parsed, defaultValues[param].min), defaultValues[param].max);
  };

  const handleSave = () => {
    const validated = {
      cursorHistorySize: validateValue(localInputs.cursorHistorySize, 'cursorHistorySize'),
      cursorDeadzone: validateValue(localInputs.cursorDeadzone, 'cursorDeadzone'),
      drawingDeadzone: validateValue(localInputs.drawingDeadzone, 'drawingDeadzone')
    };
    
    setSmoothingParams(validated);
    setPinchDist(validateValue(localInputs.pinchDist, 'pinchDist'));
    setFistToClear(localInputs.fistToClear);

    setLocalInputs({
      ...validated,
      pinchDist: validateValue(localInputs.pinchDist, 'pinchDist'),
      fistToClear: localInputs.fistToClear
    });
  };

  const handleReset = () => {
    setLocalInputs({
      cursorHistorySize: defaultValues.cursorHistorySize.default,
      cursorDeadzone: defaultValues.cursorDeadzone.default,
      drawingDeadzone: defaultValues.drawingDeadzone.default,
      pinchDist: defaultValues.pinchDist.default,
      fistToClear: defaultValues.fistToClear
    });
    setSmoothingParams({
      cursorHistorySize: defaultValues.cursorHistorySize.default,
      cursorDeadzone: defaultValues.cursorDeadzone.default,
      drawingDeadzone: defaultValues.drawingDeadzone.default
    });
    setPinchDist(defaultValues.pinchDist.default);
    setFistToClear(defaultValues.fistToClear);
  }

  const exportAsPNG = () => {
    const link = document.createElement('a');
    link.href = bgCanvas.toDataURL('image/png');
    link.download = `gandalf-${Date.now()}.png`;
    link.click();
  } 

  return (
    <div
    className='slide-left absolute sm:top-12 top-14 right-2 p-2 px-4 pb-4 pt-5 rounded-2xl shadow-sm border flex flex-col gap-4 shadow-neutral-400 sm:w-fit left-2 sm:left-auto
    bg-white text-black border-stone-300
    dark:bg-neutral-900 dark:text-white dark:border-stone-700 dark:shadow-neutral-600'
  >
      <div className='z-10 flex flex-col gap-2 items-center'> 
      <Tooltip direction='left' content='Display name (visible to everyone in the room)'>
        <input
          type="text"
          maxLength={20}
          value={localUserName}
          onChange={(e) => {
            const newName = e.target.value;
            setLocalUserName(newName);
            setUserName(newName);
          }}
          className="text-center p-2 mx-4 border rounded shadow-sm
          bg-white text-black border-neutral-800
          dark:bg-neutral-800 dark:text-white dark:border-neutral-300
          dark:shadow-neutral-600"
          placeholder="name"
        />
      </Tooltip>
      <Tooltip direction='left' content='Toggle between light (whiteboard) and dark (blackboard) mode' cn='w-full'>
      <div className='flex gap-2 justify-between items-center'>
        <span>Switch Theme</span>
          <DarkModeToggle />
      </div>
      </Tooltip>
      <button
            className="text-black p-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 dark:shadow-white/10 dark:text-white hover:-translate-y-0.5 transition-all !duration-200 ease-in-out hover:shadow-lg cursor-pointer active:shadow-none active:translate-y-0 !active:duration-100"
            onClick={exportAsPNG}
          >
            Export as PNG
          </button>
      
    </div>
    <div>
      <h3 className="text-center w-full text-neutral-400 text-sm">Handtracking Options</h3>
      <div className="mt-1 mb-2 flex flex-col justify-center gap-2 -mr-4">
      <Tooltip direction='left' content='Determines the number of points to smooth over. May impact performance. Default: 1'>
        <label className="flex justify-between">
          Smoothing
            <input
              type="number"
              min={0}
              value={localInputs.cursorHistorySize}
              onChange={(e) => setLocalInputs(prev => ({ ...prev, cursorHistorySize: parseFloat(e.target.value) }))}
              className="underline underline-offset-2 text-center w-[5ch]"
            />
        </label>
        </Tooltip>
        <Tooltip direction='left' content='Reduces jittering by ignoring movements less than this many pixels. Default: 2px'>
        <label className="flex justify-between">
          Cursor Deadzone
            <input
              type="number"
              min={0}
              value={localInputs.cursorDeadzone}
              onChange={(e) => setLocalInputs(prev => ({ ...prev, cursorDeadzone: parseFloat(e.target.value) }))}
              className="underline underline-offset-2 text-center w-[5ch]"
            />
        </label>
        </Tooltip>
        <Tooltip direction='left' content='Increases line smoothnes by ignoring movements less than this many pixels while drawing. Applied after cursor smoothing and deadzone. Default: 5px'>
        <label className="flex justify-between">
          Drawing Deadzone
            <input
              type="number"
              min={0}
              value={localInputs.drawingDeadzone}
              onChange={(e) => setLocalInputs(prev => ({ ...prev, drawingDeadzone: parseFloat(e.target.value) }))}
              className="underline underline-offset-2 text-center w-[5ch]"
            />
        </label>
        </Tooltip>
        <Tooltip direction='left' content='How close your index finger and thumb must be to trigger drawing. Lower sensitivity means your fingers must be closer together to trigger a pinch. Default: 0.07'>
        <label className="flex justify-between">
          Pinch Sensitivity
            <input
              type="number"
              min={0}
              value={localInputs.pinchDist}
              step={0.01}
              onChange={(e) => setLocalInputs(prev => ({ ...prev, pinchDist: parseFloat(e.target.value) }))}
              className="underline underline-offset-2 text-center w-[5ch]"
            />
        </label>
        </Tooltip>
        <Tooltip direction='left' content='When enabled, hold a fist for 2s to clear the board. Default: On'>
        <label className="flex justify-between items-center">
          Fist to Clear
          <button
            className={`w-4 h-4 mx-[2.5ch] cursor-pointer rounded-full border-black border-2 flex items-center justify-center dark:border-white ${localInputs.fistToClear ? 'bg-black dark:bg-white' : 'bg-white dark:bg-black'}`}
            onClick={() => setLocalInputs(prev => ({ ...prev, fistToClear: !prev.fistToClear }))}
            aria-checked={localInputs.fistToClear}
            role="switch"
          >
          </button>
        </label>
        </Tooltip>
      </div>
      <div className='flex gap-2 justify-around px-2'>
        <button
          onClick={handleReset}
          disabled={!hasChangesFromDefault()}
          className={`w-full px-2 py-1 rounded text-sm ${
            hasChangesFromDefault() 
              ? 'bg-red-500 text-white hover:bg-red-600 cursor-pointer' 
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 cursor-not-allowed'
          }`}
        >
          Reset
        </button>
      <button 
          onClick={handleSave}
          disabled={!hasChanges()}
          className={` w-full px-2 py-1 rounded text-sm ${
            hasChanges() 
              ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer' 
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 cursor-not-allowed'
          }`}
        >
          Save
        </button>
      </div>
      </div>
      <div>
      <h3 className="text-center w-full text-neutral-400 text-sm mb-2 ">Experimental Features</h3>
      <div className='flex flex-col gap-2'> 
      <Gemini />
      </div>
      </div>
      </div>
  );
};

export default TopMenu;