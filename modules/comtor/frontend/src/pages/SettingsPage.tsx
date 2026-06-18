import { useEffect, useState, useCallback } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Languages, KeyRound, Sparkles, Palette } from 'lucide-react';
import { ThemePicker } from '@desk-launcher/theme';
import { Button } from '@cmt/components/ui/button';
import { Input } from '@cmt/components/ui/input';
import { Label } from '@cmt/components/ui/label';
import { Separator } from '@cmt/components/ui/separator';
import { useI18n, type Locale } from '@cmt/lib/i18n';
import { tauri, type SettingsView } from '@cmt/lib/tauri';
import { SONIOX_WS_URL } from '@cmt/lib/soniox';

export function SettingsPage() {
  const { t, locale, setLocale, locales } = useI18n();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [sonioxKey, setSonioxKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showSoniox, setShowSoniox] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await tauri.settings.get();
      if (!cancelled) setSettings(s);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSavedOk(false);
    try {
      if (sonioxKey.trim()) {
        await tauri.settings.setSonioxKey(sonioxKey.trim());
      }
      if (openaiKey.trim()) {
        await tauri.settings.setOpenaiKey(openaiKey.trim());
      }
      await tauri.settings.setPrefs({ locale });
      const refreshed = await tauri.settings.get();
      setSettings(refreshed);
      setSonioxKey('');
      setOpenaiKey('');
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } finally {
      setSaving(false);
    }
  }, [sonioxKey, openaiKey, locale]);

  const handleTestSoniox = useCallback(async () => {
    setTesting(true);
    setTestResult('idle');
    setTestMessage('');
    try {
      const key = sonioxKey.trim() || (await tauri.settings.getSonioxKey()) || '';
      if (!key) throw new Error('Soniox API key is empty');
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(SONIOX_WS_URL);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 5000);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            api_key: key,
            model: 'stt-rt-v4',
            audio_format: 'pcm_s16le',
            sample_rate: 16000,
            num_channels: 1,
          }));
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.error_code) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(data.error_message ?? 'Auth rejected'));
              return;
            }
          } catch { /* ignore */ }
          clearTimeout(timeout);
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket error'));
        };
      });
      setTestResult('ok');
      setTestMessage('Soniox connection OK');
    } catch (err) {
      setTestResult('fail');
      setTestMessage(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }, [sonioxKey]);

  const handleClearSoniox = useCallback(async () => {
    await tauri.settings.clearSonioxKey();
    const refreshed = await tauri.settings.get();
    setSettings(refreshed);
  }, []);

  const handleClearOpenai = useCallback(async () => {
    await tauri.settings.clearOpenaiKey();
    const refreshed = await tauri.settings.get();
    setSettings(refreshed);
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.settings.profileDescription ?? 'Configure your API keys and preferences.'}
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border/40 bg-card/40 p-6">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Appearance</h2>
        </div>
        <ThemePicker />
      </section>

      <section className="space-y-4 rounded-2xl border border-border/40 bg-card/40 p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Soniox API Key</h2>
          {settings?.sonioxKeySet && <span className="rounded-full bg-vietnamese/15 px-2 py-0.5 text-[10px] font-medium text-vietnamese">SET</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          Required for real-time speech-to-text. Get one at{' '}
          <code className="rounded bg-accent px-1.5 py-0.5 text-xs">console.soniox.com</code>.
        </p>
        <div className="space-y-2">
          <Label htmlFor="sonioxKey">API key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="sonioxKey"
                type={showSoniox ? 'text' : 'password'}
                value={sonioxKey}
                onChange={(e) => setSonioxKey(e.target.value)}
                placeholder={settings?.sonioxKeySet ? '••••••••••••' : 'Paste your Soniox API key'}
                autoComplete="off"
                spellCheck={false}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSoniox((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSoniox ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button variant="outline" disabled={testing || (!sonioxKey.trim() && !settings?.sonioxKeySet)} onClick={handleTestSoniox}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </Button>
            {settings?.sonioxKeySet && (
              <Button variant="ghost" onClick={handleClearSoniox}>Clear</Button>
            )}
          </div>
          {testResult !== 'idle' && (
            <p className={`flex items-center gap-1 text-xs ${testResult === 'ok' ? 'text-vietnamese' : 'text-destructive'}`}>
              {testResult === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {testMessage}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/40 bg-card/40 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">OpenAI API Key (optional)</h2>
          {settings?.openaiKeySet && <span className="rounded-full bg-vietnamese/15 px-2 py-0.5 text-[10px] font-medium text-vietnamese">SET</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          Optional. Enables AI-generated meeting summaries (gpt-4o-mini by default).
        </p>
        <div className="space-y-2">
          <Label htmlFor="openaiKey">API key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="openaiKey"
                type={showOpenai ? 'text' : 'password'}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={settings?.openaiKeySet ? '••••••••••••' : 'sk-...'}
                autoComplete="off"
                spellCheck={false}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowOpenai((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {settings?.openaiKeySet && (
              <Button variant="ghost" onClick={handleClearOpenai}>Clear</Button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/40 bg-card/40 p-6">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">{t.settings.languageSection ?? 'Language'}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t.settings.languageDescription ?? 'Interface language.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {locales.map((l) => (
            <Button
              key={l.code}
              type="button"
              variant={locale === l.code ? 'default' : 'outline'}
              onClick={() => setLocale(l.code as Locale)}
            >
              <span className="mr-2">{l.flag}</span>
              {l.label}
            </Button>
          ))}
        </div>
      </section>

      <Separator />

      <div className="flex items-center justify-between">
        {savedOk && (
          <p className="flex items-center gap-1 text-sm text-vietnamese">
            <CheckCircle2 className="h-4 w-4" />
            {t.settings.saveSuccess ?? 'Saved'}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving} className="ml-auto">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t.settings.saveAll ?? 'Save'}
        </Button>
      </div>
    </div>
  );
}

export default SettingsPage;
