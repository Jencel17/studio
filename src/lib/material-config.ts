
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
    paper: {
        label: "BIODEGRADABLE",
        color: "bg-amber-500",
        textColor: "text-amber-500",
        borderColor: "border-amber-500",
        icon: "📄",
        gradient: "from-amber-400 to-orange-500",
    },
    plastic: {
        label: "RECYCLABLE",
        color: "bg-blue-500",
        textColor: "text-blue-500",
        borderColor: "border-blue-500",
        icon: "🧴",
        gradient: "from-blue-400 to-cyan-500",
    },
    metal: {
        label: "NON-BIODEGRADABLE",
        color: "bg-slate-400",
        textColor: "text-slate-400",
        borderColor: "border-slate-400",
        icon: "🥫",
        gradient: "from-slate-400 to-zinc-500",
    },
    glass: {
        label: "Glass",
        color: "bg-emerald-500",
        textColor: "text-emerald-500",
        borderColor: "border-emerald-500",
        icon: "🫙",
        gradient: "from-emerald-400 to-teal-500",
    },
    organic: {
        label: "Organic",
        color: "bg-green-600",
        textColor: "text-green-600",
        borderColor: "border-green-600",
        icon: "🍂",
        gradient: "from-green-500 to-lime-500",
    },
    ewaste: {
        label: "E-Waste",
        color: "bg-purple-500",
        textColor: "text-purple-500",
        borderColor: "border-purple-500",
        icon: "🔌",
        gradient: "from-purple-400 to-violet-500",
    },
    hazardous: {
        label: "Hazardous",
        color: "bg-red-500",
        textColor: "text-red-500",
        borderColor: "border-red-500",
        icon: "☣️",
        gradient: "from-red-500 to-rose-600",
    },
    textile: {
        label: "Textile",
        color: "bg-pink-500",
        textColor: "text-pink-500",
        borderColor: "border-pink-500",
        icon: "👕",
        gradient: "from-pink-400 to-rose-500",
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
    const recyclable = ["paper", "plastic", "metal", "glass"];
    const organic = ["organic"];
    const special = ["ewaste", "hazardous"];

    const key = materialName.toLowerCase().trim();

    if (recyclable.includes(key)) return "Recyclable";
    if (organic.includes(key)) return "Compostable";
    if (special.includes(key)) return "Special Disposal";
    return "General Waste";
}
