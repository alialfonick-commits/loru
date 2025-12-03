"use client";

export default function LogoutButton() {
  const logout = async () => {
    await fetch("/api/logout", {
      method: "POST",
    });
    window.location.href = "/";
  };

  return (
    <button
      onClick={logout}
      className="px-4 py-2 bg-red-600 text-white rounded"
    >
      Logout
    </button>
  );
}