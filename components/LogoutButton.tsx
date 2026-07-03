"use client";

export function LogoutButton() {
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };
  return (
    <button
      onClick={logout}
      title="Sign out"
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        font: "inherit", fontSize: 11, color: "var(--ink-3, #888)", textDecoration: "underline",
      }}
    >
      Sign out
    </button>
  );
}
