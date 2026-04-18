type Props = {
  onSelectRegion: () => void;
  regionActive: boolean;
  disabled?: boolean;
};

export function ReaderToolbar({
  onSelectRegion,
  regionActive,
  disabled,
}: Props) {
  return (
    <div className="reader-toolbar">
      <button
        className={`tool-btn${regionActive ? ' active' : ''}`}
        onClick={onSelectRegion}
        disabled={disabled}
        title="Select a region to ask about (drag on page)"
        aria-label="Select region"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3"
          />
        </svg>
      </button>
    </div>
  );
}
