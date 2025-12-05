"use client";
import { IoMdPower } from "react-icons/io";
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
      className="px-2 py-2 bg-[#222] cursor-pointer text-white rounded-4xl"
    >
    <IoMdPower />
    </button>
  );
}