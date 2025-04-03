import { create } from 'zustand';

const useUIStore = create((set) => ({
  // UI state
  darkMode: false,
  showWebcam: false,
  sidebarOpen: false,
  
  // UI actions
  toggleDarkMode: () => set(state => ({ darkMode: !state.darkMode })),
  toggleWebcam: () => set(state => ({ showWebcam: !state.showWebcam })),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen }))
}));

export default useUIStore;