import { Moon, Sun } from "lucide-react";

export default function Navigation({ page, path, user, onNavigate, onLogout, theme, onToggleTheme }) {
  return (
    <nav>
      <div className="wrap">
        <button className="logo logo-button" type="button" onClick={() => onNavigate("cars")} aria-label="DriveEasy discovery">GO</button>
        <button className={`link ${page === "cars" ? "active" : ""}`} onClick={() => onNavigate("cars")}>Discover</button>
        {user ? <>
          <button className={`link ${page === "dashboard" ? "active" : ""}`} onClick={() => onNavigate("dashboard")}>My trips</button>
          {user.role === "renter" && <button className={`link ${path === "/admin/fleet" ? "active" : ""}`} onClick={() => onNavigate("fleet")}>Fleet</button>}
          <button className={`link ${page === "trust" ? "active" : ""}`} onClick={() => onNavigate("trust")}>Trust</button>
          <span className="tag">{user.role}</span>
          <button className="btn ghost sm" onClick={onLogout}>Log out</button>
        </> : <>
          <button className="link" onClick={() => onNavigate("login")}>Log in</button>
          <button className="btn sm" onClick={() => onNavigate("register")}>Sign up</button>
        </>}
        <button className="icon-button theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "daylight" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "daylight" : "dark"} theme`}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </nav>
  );
}
