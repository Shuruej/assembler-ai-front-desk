type AssemblerLogoProps = {
  subtitle?: string;
};

export function AssemblerLogo({ subtitle }: AssemblerLogoProps) {
  return (
    <span className="flex items-center gap-3">
      <svg
        aria-hidden="true"
        className="h-8 w-8 shrink-0"
        fill="none"
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect fill="#1769FF" height="9" rx="2" width="9" x="3" y="3" />
        <rect fill="#0B4ED0" height="9" rx="2" width="9" x="20" y="3" />
        <rect fill="#42C7D5" height="9" rx="2" width="9" x="3" y="20" />
        <rect fill="#1769FF" height="9" rx="2" width="9" x="20" y="20" />
        <path
          d="M12 7.5h8M7.5 12v8M24.5 12v8M12 24.5h8"
          stroke="#17191D"
          strokeWidth="1.5"
        />
      </svg>
      <span>
        <span className="block text-[15px] font-semibold tracking-[-0.01em] text-[#17191D]">
          Assembler
        </span>
        {subtitle ? (
          <span className="block text-[11px] text-[#687080]">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
