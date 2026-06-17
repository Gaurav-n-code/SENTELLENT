"use client";

import dynamic from "next/dynamic";

const ChatContent = dynamic(() => import("./ChatContent"), { ssr: false });

export default function Home() {
  return <ChatContent />;
}
