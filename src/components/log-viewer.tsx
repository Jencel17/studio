
"use client";

import { useRef, useEffect } from "react";
import { LogEntry } from "@/lib/types";

interface LogViewerProps {
    logs: LogEntry[];
    isAutoScrollOn: boolean;
}

export default function LogViewer({ logs, isAutoScrollOn }: LogViewerProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isAutoScrollOn && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, isAutoScrollOn]);

    return (
        <div
            ref={scrollRef}
            className="w-full my-4 bg-muted/20 rounded-md border h-[200px] overflow-y-auto p-4 font-mono text-xs"
        >
            {logs.map((log) => (
                <p key={log.id}>
                    <span className="text-muted-foreground/50">{log.timestamp}</span>
                    <span className="ml-2 text-foreground">{log.message}</span>
                </p>
            ))}
            <div ref={bottomRef} />
        </div>
    );
}
