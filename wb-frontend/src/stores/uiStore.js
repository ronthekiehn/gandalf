import { create } from 'zustand';

const useUIStore = create((set) => ({
  // UI state
  darkMode: false,
  useHandTracking: false,
  
  // UI actions
  toggleDarkMode: () => set(state => ({ darkMode: !state.darkMode })),
  toggleHandTracking: () => set(state => {
    const newValue = !state.useHandTracking;
    return { useHandTracking: newValue };
  }),
  setHandTracking: (value) => set({ useHandTracking: value }),
}));

export default useUIStore;