import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import useWhiteboardStore from '../stores/whiteboardStore';
import { Tooltip } from './uiElements';

const Gemini = () => {
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { bgCanvas, getStrokesForExport } = useWhiteboardStore();
  const [error, setError] = useState(null);
  const API = (import.meta.env.MODE === 'development') ? 'http://localhost:1234' : 'https://ws.ronkiehn.dev';
  
  // Cleanup URLs only on unmount
  useEffect(() => {
    return () => {
      generatedImages.forEach(img => {
        if (img.objectUrl) URL.revokeObjectURL(img.objectUrl);
      });
    };
  }, []); // Remove dependency array

  const generateImage = async () => {
    if (!bgCanvas) return;
    setIsGenerating(true);

    try {
      const allStrokes = getStrokesForExport();
      const response = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strokes: allStrokes })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();

      if (result.images?.length) {
        const newImages = await Promise.all(result.images.map(async img => {
          const blob = await fetch(`data:${img.mimeType};base64,${img.data}`).then(res => res.blob());
          const objectUrl = URL.createObjectURL(blob);
          return {
            id: crypto.randomUUID(), // Add unique id
            objectUrl,
            alt: 'AI Generated artwork',
            timestamp: Date.now()
          };
        }));
        setGeneratedImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      setError(`Error generating image: ${error.message}`);
      console.error('Error generating image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteGeneratedImage = (id) => {
    setGeneratedImages(prev => {
      const imageToDelete = prev.find(img => img.id === id);
      if (imageToDelete?.objectUrl) {
        URL.revokeObjectURL(imageToDelete.objectUrl);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  return (
    <div className="relative">
    <Tooltip content="Uses Gemini Flash 2.0 to 'complete' your drawing. May hit rate limits!" direction="left" cn='w-full'>
      <button
        className="text-black p-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 dark:shadow-white/10 dark:text-white hover:-translate-y-0.5 transition-all !duration-200 ease-in-out hover:shadow-lg cursor-pointer active:shadow-none active:translate-y-0 !active:duration-100"
        onClick={generateImage}
        disabled={isGenerating}
      >
        {isGenerating ? '⏳ Generating...' : 'Improve Image ✨'}
      </button>
    </Tooltip>
      {error && (
        <span className="absolute text-red-500 text-sm top-16 left-1/2 transform -translate-x-1/2 w-full break-words">
          {error}
        </span>
      )}
      {generatedImages.length > 0 && (
        <div className="fixed bottom-4 left-4 p-4 rounded-lg shadow-lg max-w-[80vw] bg-white/95 text-black dark:bg-gray-800/95 dark:text-white">
          <h3 className="font-bold mb-2">Generated Images</h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {generatedImages.map((img) => (
              <div key={img.id} className="relative group">
                <button
                  onClick={() => deleteGeneratedImage(img.id)}
                  className="cursor-pointer absolute p-1 top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                  title="Delete image"
                >
                  <X />
                </button>
                <img
                  src={img.objectUrl}
                  alt={img.alt}
                  className="h-48 w-48 object-contain rounded-lg border-2 border-gray-200 dark:border-gray-600 cursor-pointer"
                  onClick={() => {
                    try {
                      window.open(img.objectUrl, '_blank');
                    } catch (error) {
                      console.error('Failed to open image:', error);
                    }
                  }}
                />
                <a
                  href={img.objectUrl}
                  download={`generated-${img.timestamp}.png`}
                  className="cursor-pointer absolute p-1 top-2 left-2 bg-neutral-500 text-white w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-neutral-600"
                  title="Download image"
                >
                  <Download />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Gemini;