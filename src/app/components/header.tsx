import LogoutButton from "./LogoutButton";

export default function Header() {
  return (
    <header className="border-b max-md:pl-16 border-gray-300 md:px-8 px-4 py-4 flex gap-3 items-center justify-between">
      <input
        type="text"
        placeholder="Search..."
        className="border hidden border-gray-300 px-3 py-2 rounded-lg text-md w-80 text-[#333] placeholder-[#333] focus:outline-none focus:ring focus:ring-[#ffffff85] transition"
      />

      <div className="bg-gray-200 rounded-full ml-auto"><LogoutButton /></div>
    </header>
  );
}
