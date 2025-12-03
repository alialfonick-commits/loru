"use client";
import Image from "next/image";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function Home() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="logHero relative min-h-screen grid place-items-center bg-linear-to-b from-[#5935a4] to-[#f5d6d2] p-4">
      <div className="relative border bg-[#ffffff3c] border-[#ffffff71] sm:py-7 py-4 sm:px-6 px-4 z-20 sm:w-md w-[calc(100%-4%)] rounded-[20px] text-[#382f34]">
        <Image
        src="/images/keepr-logo.png"
        width={280}
        height={280}
        alt="Logo"
        className="m-auto sm:mb-6 mb-2.5"
        />
        {/* <h1 className="text-[22px] font-semibold text-center mb-6">
          Welcome to Keeper Dashboard
        </h1> */}

        <form className="grid gap-4 [&_label]:text-md [&_label]:font-medium [&_label]:text-[#222]">
          {/* Email Field */}
          <div className="grid gap-2">
            <label htmlFor="email">
              Email
            </label>
            <input
              type="email"
              id="email"
              placeholder="johndoe@gmail.com"
              className="w-full rounded-lg border border-gray-200 sm:px-4 px-2 sm:py-2.5 py-2 text-sm text-[#222] placeholder-[#3a3a3a] focus:outline-none focus:ring focus:ring-[#ea2c8f] transition"
            />
          </div>

          {/* Password Field */}
          <div className="grid gap-2">
            <label htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="********************"
                className="w-full rounded-lg border border-gray-200 sm:px-4 px-2 sm:py-2.5 py-2 text-sm text-[#222] placeholder-[#3a3a3a] focus:outline-none focus:ring focus:ring-[#ea2c8f] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="w-fit h-fit absolute right-3 top-0 bottom-0 m-auto text-gray-400 hover:text-[#333] cursor-pointer transition"
              >
                {showPassword ? <EyeOff size={18} className="text-[#ea2c8f]" /> : <Eye size={18} className="text-[#222]" />}
              </button>
            </div>
          </div>

          {/* Log In Button */}
          <button
            type="submit"
            className="mt-2 bg-[#ea2c8f] cursor-pointer hover:bg-[#6844ab] text-white text-md font-semibold sm:py-2.5 py-2 rounded-lg transition flex items-center justify-center gap-1"
          >
            Login <span className="text-lg">→</span>
          </button>
        </form>
      </div>
    </div>
  );
}
