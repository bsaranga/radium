export type SelectionAction = 'explain' | 'define' | 'ask' | 'highlight';

type Props = {
  /** Viewport-relative rect of the selection */
  rect: { top: number; left: number; width: number; height: number };
  onAction: (action: SelectionAction) => void;
};

const ACTIONS: { key: SelectionAction; label: string; title: string }[] = [
  { key: 'explain', label: 'Explain', title: 'Explain the selection' },
  { key: 'define', label: 'Define', title: 'Define terms in the selection' },
  { key: 'ask', label: 'Ask…', title: 'Ask something about the selection' },
  {
    key: 'highlight',
    label: '★ Highlight',
    title: 'Save as a highlight',
  },
];

export function SelectionToolbar({ rect, onAction }: Props) {
  const top = Math.max(8, rect.top - 44);
  const left = Math.max(8, rect.left + rect.width / 2);
  return (
    <div
      className="selection-toolbar"
      style={{ top, left, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          onClick={() => onAction(a.key)}
          title={a.title}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
