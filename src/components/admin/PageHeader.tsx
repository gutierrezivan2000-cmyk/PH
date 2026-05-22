interface PageHeaderProps {
  section: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ section, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-6 pb-6 mb-6 border-b border-border">
      <div className="min-w-0 flex flex-col gap-2">
        <p
          className="text-[10px] uppercase text-muted-foreground/70"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.18em" }}
        >
          {section}
        </p>
        <h1 className="text-2xl sm:text-3xl font-medium tracking-[-0.025em] text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
