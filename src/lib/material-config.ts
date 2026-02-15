
// Material configuration for visual distinction in the UI

export interface MaterialConfig {
    label: string;
    color: string; // Tailwind color class (bg-*)
    textColor: string; // Tailwind text color
    borderColor: string; // Tailwind border color
    icon: string; // Emoji or icon identifier
    gradient: string; // Tailwind gradient classes
}

export const materialConfigs: Record<string, MaterialConfig> = {
    biodegradable: {
        label: "BIODEGRADABLE",
        color: "bg-amber-600",
        textColor: "text-amber-600",
        borderColor: "border-amber-600",
        icon: "📄",
        gradient: "from-amber-600 to-orange-700",
    },
    recyclable: {
        label: "RECYCLABLE",
        color: "bg-blue-600",
        textColor: "text-blue-600",
        borderColor: "border-blue-600",
        icon: "🧴",
        gradient: "from-blue-600 to-cyan-700",
    },
    "non-biodegradable": {
        label: "NON-BIODEGRADABLE",
        color: "bg-slate-700",
        textColor: "text-slate-700",
        borderColor: "border-slate-700",
        icon: "🥫",
        gradient: "from-slate-700 to-zinc-800",
    },
    // Default fallback for unknown materials
    default: {
        label: "Unknown",
        color: "bg-zinc-700",
        textColor: "text-zinc-700",
        borderColor: "border-zinc-700",
        icon: "❓",
        gradient: "from-zinc-700 to-neutral-800",
    },
};

export function getMaterialConfig(materialName: string): MaterialConfig {
    const key = materialName.toLowerCase().trim();
    return materialConfigs[key] || materialConfigs.default;
}

// Get the recyclable status label
export function getRecyclableLabel(materialName: string): string {
    const key = materialName.toLowerCase().trim();

    if (key === "biodegradable") return "Biodegradable";
    if (key === "recyclable") return "Recyclable";
    if (key === "non-biodegradable") return "Non-Biodegradable";

    return "Unknown Category";
}
