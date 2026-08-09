import { createContext, useContext, useState, useEffect } from "react";

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {

    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem("paperwaves-theme");
        if (saved === "dark" || saved === "light") return saved;
        return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("paperwaves-theme", theme);
    }, [theme]);

    const handleToggleTheme = () => {
        return setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
    }

    return (<ThemeContext.Provider value={{ theme, handleToggleTheme }}>
        {children}
    </ThemeContext.Provider>

    );
}

//creating a component

export const ThemeToggle = () => {
    const { theme, handleToggleTheme } = useContext(ThemeContext);
    return (
        <button
            className="theme-toggle"
            onClick={handleToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4.5" />
                    <path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
                </svg>
            )}
        </button>
    );
}