import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import useWhiteboardStore from '../stores/whiteboardStore';

const prompt = `
You are a teacher who is trying to make a student's artwork look nicer to impress their parents. You have been given this drawing, and you must enhance, refine and complete this drawing while maintaining its core elements and shapes. Try your best to leave the student's original work there, but add to the scene to make an impressive drawing. You may also only use the following colors: red, green, blue, black, and white.

in other words:
- REPEAT the entire drawing.
- ENHANCE by adding additional lines, colors, fill, etc.
- COMPLETE by adding other features to the foreground and background

Remember to only use lines the same thickness that the student used.

but DO NOT
- modify the original drawing in any way

The image should be the same aspect ratio, and have ALL of the same original lines. Otherwise, the parent might suspect that the teacher did some of the work.`;

const Gemini = () => {
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { bgCanvas, getStrokesForExport } = useWhiteboardStore();

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
      const response = await fetch('http://localhost:1234/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strokes: allStrokes, prompt })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
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
      console.error('Generation failed:', error);
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
    <>
      <button
        className="text-black p-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 dark:shadow-white/10 dark:text-white hover:-translate-y-0.5 transition-all !duration-200 ease-in-out hover:shadow-lg cursor-pointer active:shadow-none active:translate-y-0 !active:duration-100"
        onClick={generateImage}
        disabled={isGenerating}
      >
        {isGenerating ? '⏳ Generating...' : 'Improve Image ✨'}
      </button>

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
    </>
  );
};

export default Gemini;