"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { sendChatMessage, loginWithGoogle, getStoredUser, clearToken, clearStoredUser } from "@/lib/api";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type User = {
  id: string;
  email: string;
  name: string;
  picture: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function ChatContent() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your AI assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | undefined>();
  const [user, setUser] = useState<User | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loginBtnRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUser(stored);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleGoogleResponse = useCallback(async (credential: string) => {
    try {
      const data = await loginWithGoogle(credential);
      setUser(data.user);
    } catch (e) {
      console.error("Google login failed", e);
    }
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || user || initializedRef.current) return;
    initializedRef.current = true;

    function initGIS() {
      if (!window.google?.accounts.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res: { credential: string }) => handleGoogleResponse(res.credential),
      });
      if (loginBtnRef.current) {
        window.google.accounts.id.renderButton(loginBtnRef.current, {
          theme: "outline",
          size: "medium",
          text: "signin_with",
        });
      }
    }

    if (window.google?.accounts?.id) {
      initGIS();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGIS;
    document.body.appendChild(script);
  }, [user, handleGoogleResponse]);

  function handleLogout() {
    clearToken();
    clearStoredUser();
    setUser(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const data = await sendChatMessage(userMsg, convId);
      setConvId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
        <h1 className="text-lg font-semibold text-white">Sentellent Agent</h1>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              {user.picture && (
                <img src={user.picture} alt="" className="w-7 h-7 rounded-full ring-2 ring-blue-500/50" />
              )}
              <span className="text-sm text-zinc-400">{user.name}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div ref={loginBtnRef} />
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl w-full mx-auto">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-800 bg-zinc-950 px-4 py-4 max-w-3xl w-full mx-auto"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
