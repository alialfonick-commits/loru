"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function Home() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen grid place-items-center bg-white p-4">
      <div className="lg:min-w-md bg-white rounded-[20px] text-[#382f34]">
        <h1 className="text-[22px] font-semibold text-center mb-6">
          Welcome to Keeper Dashboard
        </h1>

        <form className="grid gap-4">
          {/* Email Field */}
          <div className="grid gap-3">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              type="email"
              id="email"
              placeholder="johndoe@gmail.com"
              className="w-full rounded-lg border border-[#ea2c8f] px-4 py-2 text-sm text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6a47ab] transition"
            />
          </div>

          {/* Password Field */}
          <div className="grid gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="********************"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6a47ab] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="w-fit h-fit absolute right-3 top-0 bottom-0 m-auto text-gray-400 hover:text-[#6a47ab] cursor-pointer transition"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Log In Button */}
          <button
            type="submit"
            className="mt-2 bg-[#333] cursor-pointer hover:bg-[#6a47ab] text-white text-[15px] font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
          >
            Log In <span className="text-lg">→</span>
          </button>
        </form>
      </div>
    </div>
  );
}
