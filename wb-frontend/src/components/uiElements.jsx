import useUIStore from "../stores/uiStore"
import { Sun, Moon } from "lucide-react"
import { useState, useRef } from 'react'

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

export const Tooltip = ({ children, direction = "top", content }) => {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef(null);

    const getTooltipPosition = () => {
        switch (direction) {
            case "top":
                return "bottom-full mb-3 left-1/2 -translate-x-1/2";
            case "bottom":
                return "top-full mt-2 left-1/2 -translate-x-1/2";
            case "left":
                return "right-full mr-5 top-1/2 -translate-y-1/2";
            case "right":
                return "left-full ml-2 top-1/2 -translate-y-1/2";
            default:
                return "bottom-full mb-2 left-1/2 -translate-x-1/2";
        }
    };

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setVisible(true);
        }, 750);
    };

    const handleMouseLeave = () => {
        // Clear the timeout and hide the tooltip
        clearTimeout(timeoutRef.current);
        setVisible(false);
    };

    return (
        <div
            className="z-50 relative inline-block"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {visible && (
                <div
                    className={`fade-in-fast absolute ${getTooltipPosition()} w-max max-w-60 px-2 py-1 text-xs text-neutral-600 bg-neutral-100 rounded shadow-lg`}
                >
                    {content}
                </div>
            )}
        </div>
    );
};