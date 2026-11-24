'use client';

export function PrintButton() {
  return (
    <button className="btn btn-primary mt-8 print:hidden" onClick={() => print()}>
      Print
    </button>
  );
}
