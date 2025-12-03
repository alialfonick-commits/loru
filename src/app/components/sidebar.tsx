import Image from "next/image";

export default function Sidebar() {
  return (

    <aside className="w-72 h-screen bg-linear-to-b from-[#5835a4] to-[#f5d6d2] border-r border-[#5835a48c] p-6">
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

  );
}
