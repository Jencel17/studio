import { cn } from "@/lib/utils";

export const PlasticIcon = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("h-6 w-6", className)}
    {...props}
  >
    <path d="M8 21h8" />
    <path d="M6 21h12v-9a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v9Z" />
    <path d="M8 8.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5V12h-8V8.5Z" />
    <path d="M9.5 3h5" />
    <path d="M12 3v5" />
  </svg>
);

export const MetalIcon = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("h-6 w-6", className)}
    {...props}
  >
    <path d="M6 21h12" />
    <path d="M6 21v-3.37a2 2 0 0 1 .63-1.42L9 14" />
    <path d="M18 21v-3.37a2 2 0 0 0-.63-1.42L15 14" />
    <path d="M6.33 7.85A2 2 0 0 1 8 7h8a2 2 0 0 1 1.67.85L19 10H5l1.33-2.15Z" />
    <path d="M7 14h10" />
    <path d="M15 3.63a2 2 0 0 0-3-1.26A2 2 0 0 0 9 3.63L7.5 7h9L15 3.63Z" />
  </svg>
);

export const PaperIcon = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("h-6 w-6", className)}
    {...props}
  >
    <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="m3 12.5 5 2 5-2" />
    <path d="m3 15.5 5 2 5-2" />
    <path d="m3 18.5 5 2 5-2" />
  </svg>
);
