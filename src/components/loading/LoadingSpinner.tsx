interface LoadingSpinnerProps {
  size?: "sm" | "md";
}

export default function LoadingSpinner({
  size = "sm",
}: LoadingSpinnerProps) {
  return (
    <span
      className={`
        inline-block
        ${size === "sm" ? "h-4 w-4" : "h-5 w-5"}
        rounded-full
        border-2
        border-gray-200
        border-t-gray-600
        animate-jira-spinner
      `}
    />
  );
}