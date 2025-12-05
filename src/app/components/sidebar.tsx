"use client";

import { useState } from "react";
import Image from "next/image";
import { GoSidebarCollapse } from "react-icons/go";

export default function Dashboard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">

      {/* MENU BUTTON (visible under 768px) */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-[18px] left-4 z-20"
      >
        <GoSidebarCollapse  className="text-4xl" />
      </button>

      {/* ASIDE SIDEBAR (your exact markup) */}
      <aside
        className={`
          h-screen bg-linear-to-b from-[#5835a4] to-[#f5d6d2] 
          border-r border-[#5835a48c] p-6
          fixed top-0 left-0 z-40
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* CLOSE BUTTON for mobile */}
        <button
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-4 right-4 text-white text-3xl"
        >
          ×
        </button>

        <Image
          src="/images/keepr-logo.png"
          width={280}
          height={280}
          alt="Logo"
          className="m-auto sm:mb-6 mb-2.5"
        />

        <nav className="space-y-2">
          <button className="block w-full text-left py-2 px-3 bg-indigo-50 text-indigo-700 rounded-lg font-medium">
            Dashboard
          </button>
        </nav>
      </aside>
    </div>
  );
}
