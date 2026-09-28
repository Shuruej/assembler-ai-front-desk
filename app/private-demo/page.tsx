export default function PrivateDemoPage() {
  return (
    <main className="min-h-screen bg-[#F6F8FC] px-6 py-24 text-[#17191D]">
      <div className="mx-auto max-w-xl rounded-2xl border border-[#DDE1E8] bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">Assembler</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Private reviewer demo</h1>
        <p className="mt-4 text-sm leading-6 text-[#687080]">
          This build is available through the reviewer link included with the hackathon submission.
        </p>
      </div>
    </main>
  );
}
