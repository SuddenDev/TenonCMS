// The saved theme, else the system's, before the first paint. __root.tsx runs it in the head.
export const themeScript = `try {
  document.documentElement.dataset.theme =
    localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {}`;

function switchTheme() {
  const root = document.documentElement;
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

export function ThemeSwitch() {
  return (
    <button
      className="theme-switch"
      type="button"
      aria-label="Switch between light and dark mode"
      onClick={switchTheme}
    >
      <svg
        className="moon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg
        className="sun"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  );
}
