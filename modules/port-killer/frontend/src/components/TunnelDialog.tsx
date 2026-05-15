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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-border/50 bg-card p-6 shadow-2xl"
                >
                    <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                            {isEdit ? 'Edit Tunnel' : 'New SSH Tunnel'}
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isBusy}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Label */}
                        <Field label="Label">
                            <Input
                                value={form.label}
                                onChange={(e) => set('label', e.target.value)}
                                placeholder="e.g. Staging DB, Prod Redis"
                                disabled={isBusy}
                                required
                            />
                        </Field>

                        {/* SSH connection */}
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="SSH User" className="col-span-1">
                                <Input
                                    value={form.ssh_user}
                                    onChange={(e) => set('ssh_user', e.target.value)}
                                    placeholder="root"
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="Server Host" className="col-span-1">
                                <Input
                                    value={form.ssh_host}
                                    onChange={(e) => set('ssh_host', e.target.value)}
                                    placeholder="192.168.1.100"
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="SSH Port" className="col-span-1">
                                <Input
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
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="Remote Host" className="col-span-1">
                                <Input
                                    value={form.remote_host}
                                    onChange={(e) => set('remote_host', e.target.value)}
                                    placeholder="localhost"
                                    disabled={isBusy}
                                />
                            </Field>
                            <Field label="Remote Port" className="col-span-1">
                                <Input
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
                            <Field label="Local Port" className="col-span-1">
                                <Input
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
                            <div className="rounded-lg bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                                127.0.0.1:<span className="text-orange-400">{form.local_port}</span>
                                {' → '}
                                {form.remote_host || 'localhost'}:<span className="text-green-400">{form.remote_port}</span>
                                {' via '}
                                {form.ssh_user || 'user'}@{form.ssh_host || 'host'}
                                {form.ssh_port !== 22 && `:${form.ssh_port}`}
                            </div>
                        )}

                        {/* Identity file */}
                        <Field label="Identity File (optional)">
                            <div className="flex gap-2">
                                <Input
                                    value={form.identity_file || ''}
                                    onChange={(e) => set('identity_file', e.target.value)}
                                    placeholder="~/.ssh/id_rsa"
                                    className="flex-1"
                                    disabled={isBusy}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="default"
                                    disabled={isBusy}
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
                                <div className="mt-2 space-y-1 rounded-lg border border-border/50 bg-muted/20 p-2">
                                    {sshKeys.map((k) => (
                                        <button
                                            key={k.path}
                                            type="button"
                                            className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/40 ${
                                                form.identity_file === k.path
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-muted-foreground'
                                            }`}
                                            onClick={() => {
                                                set('identity_file', k.path)
                                                setShowKeyPicker(false)
                                            }}
                                        >
                                            <span className="font-medium">{k.name}</span>
                                            <span className="ml-2 opacity-50">{k.path}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Field>

                        {/* Password */}
                        <Field label="Password (optional)">
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.password || ''}
                                    onChange={(e) => set('password', e.target.value)}
                                    placeholder="Leave empty to use key-based auth"
                                    disabled={isBusy}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                            <div>
                                <p className="font-medium">Connection failed</p>
                                <p className="text-xs opacity-80">{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                            <CheckCircle2 className="size-4" />
                            Connected successfully!
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isBusy}>
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={!isValid || isBusy}>
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {label}
            </label>
            {children}
        </div>
    )
}
