type AssemblerLogoProps = {
  subtitle?: string;
};

export function AssemblerLogo({ subtitle }: AssemblerLogoProps) {
  return (
    <span className="flex items-center gap-3">
      <img
        aria-hidden="true"
        alt=""
        className="h-9 w-9 shrink-0 object-contain"
        src="/assembler/brand/assembler-mark.png"
      />
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
