import { create } from 'zustand';

const useUIStore = create((set) => ({
  darkMode: JSON.parse(localStorage.getItem("darkMode")) || false,
  useHandTracking: false,
  settingsOpen: false,
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  
  toggleDarkMode: () => set((state) => {
    const newMode = !state.darkMode;
    localStorage.setItem('darkMode', JSON.stringify(newMode));
    return { darkMode: newMode }; 
  }),
  toggleHandTracking: () => set((state) => {
    const newValue = !state.useHandTracking;
    return { useHandTracking: newValue };
  }),
  setHandTracking: (value) => set({ useHandTracking: value }),
}));

export default useUIStore;