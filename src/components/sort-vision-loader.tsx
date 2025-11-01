"use client";

import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const SortVisionPage = dynamic(
  () => import("@/app/page"),
  { 
    ssr: false,
    loading: () => <div className="grid min-h-screen flex-1 place-items-center p-4 sm:p-6"><div className="w-full max-w-4xl p-4 sm:p-6"><Skeleton className="w-full h-[600px]" /></div></div>
  }
);

export default function SortVisionLoader() {
    return <SortVisionPage />;
}
