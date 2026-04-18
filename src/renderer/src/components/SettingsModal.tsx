import { useEffect, useState } from 'react';

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (fast, cheap)' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { value: 'o4-mini', label: 'o4-mini (reasoning)' },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setModel(s.model);
      setHasKey(s.hasApiKey);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const payload: { model: string; apiKey?: string } = { model };
    if (apiKey) payload.apiKey = apiKey;
    await window.api.setSettings(payload);
    setSaving(false);
    onClose();
  };

  const clearKey = async () => {
    await window.api.setSettings({ apiKey: '' });
    setHasKey(false);
    setApiKey('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          <span>OpenAI API key</span>
          <input
            type="password"
            placeholder={hasKey ? '•••••••••• (saved)' : 'sk-...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoFocus
          />
          <small>Stored in your OS keychain.</small>
          {hasKey && (
            <button
              className="link"
              type="button"
              onClick={clearKey}
              style={{ marginTop: 4 }}
            >
              Remove saved key
            </button>
          )}
        </label>

        <label className="field">
          <span>Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
