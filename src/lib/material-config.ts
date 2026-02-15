
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
        color: "bg-amber-500",
        textColor: "text-amber-500",
        borderColor: "border-amber-500",
        icon: "📄",
        gradient: "from-amber-400 to-orange-500",
    },
    recyclable: {
        label: "RECYCLABLE",
        color: "bg-blue-500",
        textColor: "text-blue-500",
        borderColor: "border-blue-500",
        icon: "🧴",
        gradient: "from-blue-400 to-cyan-500",
    },
    "non-biodegradable": {
        label: "NON-BIODEGRADABLE",
        color: "bg-slate-400",
        textColor: "text-slate-400",
        borderColor: "border-slate-400",
        icon: "🥫",
        gradient: "from-slate-400 to-zinc-500",
    },
    // Default fallback for unknown materials
    default: {
        label: "Unknown",
        color: "bg-gray-500",
        textColor: "text-gray-500",
        borderColor: "border-gray-500",
        icon: "❓",
        gradient: "from-gray-400 to-zinc-500",
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
