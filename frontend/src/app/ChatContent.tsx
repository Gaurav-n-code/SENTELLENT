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
    <div className="flex flex-col h-screen relative">
      {/* Decorative blobs */}
      <div className="fixed top-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-pink-600/20 blur-[120px] pointer-events-none" />
      <div className="fixed top-[40%] right-[-100px] w-[300px] h-[300px] rounded-full bg-blue-600/15 blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 py-4 max-w-4xl w-full mx-auto">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
          Sentellent Agent
        </h1>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-full px-3 py-1.5 ring-1 ring-white/10">
              {user.picture && (
                <img src={user.picture} alt="" className="w-7 h-7 rounded-full ring-2 ring-purple-500/50" />
              )}
              <span className="text-sm text-zinc-300">{user.name}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-zinc-500 hover:text-pink-400 transition-colors ml-1"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div ref={loginBtnRef} />
          )}
        </div>
      </header>

      {/* Chat container with border */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 pb-4">
        <div className="h-full rounded-2xl border border-white/10 bg-indigo-950/80 backdrop-blur-sm flex flex-col overflow-hidden">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 max-w-3xl w-full mx-auto">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-5 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-lg backdrop-blur-sm ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-br-md shadow-purple-600/20"
                  : "bg-white/5 border border-white/10 text-zinc-100 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start mb-5">
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 text-sm backdrop-blur-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="max-w-3xl w-full mx-auto px-4 pb-4"
      >
        <div className="relative flex gap-2 bg-white/5 backdrop-blur-sm rounded-2xl p-2 ring-1 ring-white/10 focus-within:ring-purple-500/50 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
            className="flex-1 rounded-xl bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-2.5 text-sm font-medium text-white hover:from-purple-500 hover:to-pink-400 disabled:opacity-50 transition-all shadow-lg shadow-purple-600/20"
          >
            Send
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
}
