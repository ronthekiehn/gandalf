import './App.css';
import { Routes, Route } from 'react-router-dom';
import Room from './routes/Room';
import Home from './routes/Home';
import { useEffect } from 'react';
import useUIStore from './stores/uiStore';

function App() {
  const darkMode = useUIStore((state) => state.darkMode);

  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:roomId/*" element={<Room />} />
    </Routes>
  );
}

export default App;