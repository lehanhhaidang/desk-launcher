import { useState, useEffect } from 'react'
import { Button } from '@desk-launcher/ui'
import { Input } from '@desk-launcher/ui'
import { X, Save, FolderOpen, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import type { TunnelConfig, TunnelCreateRequest, TunnelStatus } from '../types/port.types'

interface TunnelDialogProps {
    tunnel?: TunnelConfig | null
    onSave: (data: TunnelCreateRequest) => Promise<TunnelStatus>
    onClose: () => void
}

const DEFAULT_FORM: TunnelCreateRequest = {
    label: '',
    ssh_user: '',
    ssh_host: '',
    ssh_port: 22,
    remote_host: 'localhost',
    remote_port: 0,
    local_port: 0,
}

export function TunnelDialog({ tunnel, onSave, onClose }: TunnelDialogProps) {
    const [form, setForm] = useState<TunnelCreateRequest>(DEFAULT_FORM)
    const [status, setStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [sshKeys, setSshKeys] = useState<{ name: string; path: string }[]>([])
    const [showKeyPicker, setShowKeyPicker] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const isEdit = !!tunnel

    useEffect(() => {
        if (tunnel) {
            setForm({
                label: tunnel.label,
                ssh_user: tunnel.ssh_user,
                ssh_host: tunnel.ssh_host,
                ssh_port: tunnel.ssh_port,
                remote_host: tunnel.remote_host,
                remote_port: tunnel.remote_port,
                local_port: tunnel.local_port,
                identity_file: tunnel.identity_file,
                password: tunnel.password,
                extra_args: tunnel.extra_args,
            })
        }
    }, [tunnel])

    const set = (field: keyof TunnelCreateRequest, value: string | number) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        // Reset error when user changes form
        if (status === 'error') {
            setStatus('idle')
            setErrorMessage('')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setStatus('connecting')
        setErrorMessage('')

        try {
            const result = await onSave(form)

            if (result.is_running) {
                setStatus('success')
                // Close after brief success feedback
                setTimeout(() => onClose(), 800)
            } else {
                setStatus('error')
                setErrorMessage(result.error || 'SSH connection failed')
            }
        } catch (err) {
            setStatus('error')
            setErrorMessage(err instanceof Error ? err.message : 'Request failed')
        }
    }

    const isValid = form.label && form.ssh_user && form.ssh_host && form.remote_port > 0 && form.local_port > 0
    const isBusy = status === 'connecting'

    return (
        <div className="pk-dialog-backdrop">
            <div className="pk-dialog max-w-xl animate-in fade-in zoom-in-95 duration-200">
                <form
                    onSubmit={handleSubmit}
                    className="pk-panel flex max-h-[calc(100vh-36px)] flex-col rounded-xl p-5 shadow-2xl"
                >
                    <div className="mb-4 flex shrink-0 items-start justify-between gap-3 border-b border-blue-200/10 pb-4">
                        <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-semibold leading-tight text-[#edf3f7]">
                                {isEdit ? 'Edit Tunnel' : 'New SSH Tunnel'}
                            </h3>
                            <p className="mt-1 text-xs pk-subtle">Configure local forwarding through an SSH host.</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isBusy}
                            className="shrink-0 pk-muted hover:text-[#edf3f7] disabled:opacity-50"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="pk-dialog-body space-y-4">
                        {/* Label */}
                        <Field label="Label">
                            <Input
                                className="pk-input"
                                value={form.label}
                                onChange={(e) => set('label', e.target.value)}
                                placeholder="e.g. Staging DB, Prod Redis"
                                disabled={isBusy}
                                required
                            />
                        </Field>

                        {/* SSH connection */}
                        <div className="pk-form-grid-3">
                            <Field label="SSH User">
                                <Input
                                    className="pk-input"
                                    value={form.ssh_user}
                                    onChange={(e) => set('ssh_user', e.target.value)}
                                    placeholder="root"
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="Server Host">
                                <Input
                                    className="pk-input"
                                    value={form.ssh_host}
                                    onChange={(e) => set('ssh_host', e.target.value)}
                                    placeholder="192.168.1.100"
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="SSH Port">
                                <Input
                                    className="pk-input"
                                    type="number"
                                    value={form.ssh_port}
                                    onChange={(e) => set('ssh_port', parseInt(e.target.value) || 22)}
                                    min={1}
                                    max={65535}
                                    disabled={isBusy}
                                />
                            </Field>
                        </div>

                        {/* Port forwarding */}
                        <div className="pk-form-grid-3">
                            <Field label="Remote Host">
                                <Input
                                    className="pk-input"
                                    value={form.remote_host}
                                    onChange={(e) => set('remote_host', e.target.value)}
                                    placeholder="localhost"
                                    disabled={isBusy}
                                />
                            </Field>
                            <Field label="Remote Port">
                                <Input
                                    className="pk-input"
                                    type="number"
                                    value={form.remote_port || ''}
                                    onChange={(e) => set('remote_port', parseInt(e.target.value) || 0)}
                                    placeholder="27017"
                                    min={1}
                                    max={65535}
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="Local Port">
                                <Input
                                    className="pk-input"
                                    type="number"
                                    value={form.local_port || ''}
                                    onChange={(e) => set('local_port', parseInt(e.target.value) || 0)}
                                    placeholder="27017"
                                    min={1}
                                    max={65535}
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                        </div>

                        {/* Forwarding preview */}
                        {form.local_port > 0 && form.remote_port > 0 && (
                            <div className="break-all rounded-lg border border-blue-200/10 bg-black/20 px-3 py-2 pk-mono text-xs leading-relaxed pk-subtle">
                                127.0.0.1:<span className="text-cyan-200">{form.local_port}</span>
                                {' → '}
                                {form.remote_host || 'localhost'}:<span className="text-emerald-200">{form.remote_port}</span>
                                {' via '}
                                {form.ssh_user || 'user'}@{form.ssh_host || 'host'}
                                {form.ssh_port !== 22 && `:${form.ssh_port}`}
                            </div>
                        )}

                        {/* Identity file */}
                        <Field label="Identity File (optional)">
                            <div className="flex gap-2">
                                <Input
                                    className="pk-input flex-1"
                                    value={form.identity_file || ''}
                                    onChange={(e) => set('identity_file', e.target.value)}
                                    placeholder="~/.ssh/id_rsa"
                                    disabled={isBusy}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="default"
                                    disabled={isBusy}
                                    className="pk-button-ghost"
                                    onClick={async () => {
                                        const { fetchSshKeys } = await import('../api/port-api')
                                        try {
                                            const keys = await fetchSshKeys()
                                            if (keys.length === 0) {
                                                alert('No SSH keys found in ~/.ssh/')
                                                return
                                            }
                                            setSshKeys(keys)
                                            setShowKeyPicker((v) => !v)
                                        } catch {
                                            alert('Failed to fetch SSH keys')
                                        }
                                    }}
                                    title="Browse for key file"
                                >
                                    <FolderOpen className="size-4" />
                                </Button>
                            </div>
                            {showKeyPicker && sshKeys.length > 0 && (
                                <div className="mt-2 space-y-1 rounded-lg border border-blue-200/10 bg-black/20 p-2">
                                    {sshKeys.map((k) => (
                                        <button
                                            key={k.path}
                                            type="button"
                                            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-blue-200/10 ${
                                                form.identity_file === k.path
                                                    ? 'bg-cyan-200/10 text-cyan-100'
                                                    : 'pk-subtle'
                                            }`}
                                            onClick={() => {
                                                set('identity_file', k.path)
                                                setShowKeyPicker(false)
                                            }}
                                            title={k.path}
                                        >
                                            <span className="shrink-0 font-medium">{k.name}</span>
                                            <span className="min-w-0 flex-1 truncate opacity-50">{k.path}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Field>

                        {/* Password */}
                        <Field label="Password (optional)">
                            <div className="relative">
                                <Input
                                    className="pk-input pr-10"
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.password || ''}
                                    onChange={(e) => set('password', e.target.value)}
                                    placeholder="Leave empty to use key-based auth"
                                    disabled={isBusy}
                                />
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 pk-muted hover:text-[#edf3f7]"
                                    onClick={() => setShowPassword((v) => !v)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                        </Field>

                        {/* Extra args */}
                        <Field label="Extra SSH Arguments (optional)">
                            <Input
                                className="pk-input"
                                value={form.extra_args || ''}
                                onChange={(e) => set('extra_args', e.target.value)}
                                placeholder="-o ProxyJump=bastion"
                                disabled={isBusy}
                            />
                        </Field>
                    </div>

                    {/* Status feedback */}
                    {status === 'error' && (
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium">Connection failed</p>
                                <p className="break-words text-xs opacity-80">{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                            <CheckCircle2 className="size-4" />
                            Connected successfully!
                        </div>
                    )}

                    <div className="mt-5 flex shrink-0 justify-end gap-2 border-t border-blue-200/10 pt-4">
                        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isBusy} className="pk-button-ghost">
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={!isValid || isBusy} className="pk-button-primary disabled:bg-blue-200/10 disabled:text-[#788495]">
                            {isBusy ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Connecting...
                                </>
                            ) : status === 'error' ? (
                                <>
                                    <Save className="size-4" />
                                    Retry
                                </>
                            ) : (
                                <>
                                    <Save className="size-4" />
                                    {isEdit ? 'Update' : 'Create & Start'}
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function Field({
    label,
    children,
    className,
}: {
    label: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold pk-subtle">
                {label}
            </label>
            {children}
        </div>
    )
}
