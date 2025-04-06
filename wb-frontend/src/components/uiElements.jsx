import useUIStore from "../stores/uiStore"
import { Sun, Moon } from "lucide-react"

export const DarkModeToggle = () => {
    const darkMode = useUIStore((state) => state.darkMode);
    const toggleDarkMode = useUIStore((state) => state.toggleDarkMode);
    return (
        <button
        className="cursor-pointer p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
        onClick={toggleDarkMode}
        >
        {darkMode ? <Sun /> : <Moon />}
        </button>
    );
};