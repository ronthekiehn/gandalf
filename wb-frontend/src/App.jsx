import './App.css';
import Canvas from './components/Canvas';

function App() {
  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="bg-blue-600 text-white p-2 shadow-md">
        <h1 className="text-xl font-bold">Interactive Whiteboard</h1>
      </header>
      
      <main className="grow flex">
        <div className="w-full h-full">
          <Canvas />
        </div>
      </main>
      
    </div>
  );
}

export default App;
