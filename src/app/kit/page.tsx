"use client";
// /kit → the newest kit of this browser (GET /api/threads), or /kit/new when there is none (or history fails).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { kitApi } from "@/lib/client/kit-api";

export default function KitIndex() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    kitApi()
      .listThreads()
      .then(
        (threads) => !cancelled && router.replace(threads[0] ? `/kit/t/${threads[0].id}` : "/kit/new"),
        () => !cancelled && router.replace("/kit/new"),
      );
    return () => {
      cancelled = true;
    };
  }, [router]);
  return <p className="p-6 text-center text-sm text-gray-400">Opening your kits…</p>;
}
