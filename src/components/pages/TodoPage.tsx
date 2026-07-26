interface TodoPageProps {
  children: React.ReactNode;
}

export default function TodoPage({ children }: TodoPageProps) {
  return <>{children}</>;
}