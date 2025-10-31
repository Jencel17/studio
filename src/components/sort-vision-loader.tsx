"use client";

import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const SortVisionClient = dynamic(
  () => import("@/components/sort-vision-client"),
  { 
    ssr: false,
    loading: () => <div className="w-full max-w-4xl p-4 sm:p-6"><Skeleton className="w-full h-[600px]" /></div>
  }
);

export default function SortVisionLoader() {
  return <SortVisionClient />;
}
