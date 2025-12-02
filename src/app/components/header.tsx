export default function Header() {
  return (
    <header className="border-b border-gray-300 px-8 py-6 flex items-center justify-between">
      <input
        type="text"
        placeholder="Search..."
        className="border border-gray-300 px-3 py-2 rounded-lg text-md w-80 text-[#333] placeholder-[#333] focus:outline-none focus:ring focus:ring-[#ffffff85] transition"
      />

      <div className="w-9 h-9 bg-gray-200 rounded-full"></div>
    </header>
  );
}
