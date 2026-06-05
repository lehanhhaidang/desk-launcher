import { useState, useEffect } from 'react'
import { Button, Input } from '@pk/components/ui'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@pk/components/ui/dialog'
import { Label } from '@pk/components/ui/label'
import { Save, FolderOpen, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
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
        <Dialog open onOpenChange={(open) => { if (!open && !isBusy) onClose() }}>
            <DialogContent className="max-w-2xl">
                <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-100px)] flex-col">
                    <DialogHeader className="border-b pb-4">
                        <DialogTitle>{isEdit ? 'Edit Tunnel' : 'New SSH Tunnel'}</DialogTitle>
                        <DialogDescription>Configure local forwarding through an SSH host.</DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 max-h-[calc(100vh-280px)] space-y-4 overflow-y-auto pr-1">
                        <Field label="Label">
                            <Input
                                value={form.label}
                                onChange={(e) => set('label', e.target.value)}
                                placeholder="e.g. Staging DB, Prod Redis"
                                disabled={isBusy}
                                required
                            />
                        </Field>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Field label="SSH User">
                                <Input
                                    value={form.ssh_user}
                                    onChange={(e) => set('ssh_user', e.target.value)}
                                    placeholder="root"
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="Server Host">
                                <Input
                                    value={form.ssh_host}
                                    onChange={(e) => set('ssh_host', e.target.value)}
                                    placeholder="192.168.1.100"
                                    disabled={isBusy}
                                    required
                                />
                            </Field>
                            <Field label="SSH Port">
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

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Field label="Remote Host">
                                <Input
                                    value={form.remote_host}
                                    onChange={(e) => set('remote_host', e.target.value)}
                                    placeholder="localhost"
                                    disabled={isBusy}
                                />
                            </Field>
                            <Field label="Remote Port">
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
                            <Field label="Local Port">
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

                        {form.local_port > 0 && form.remote_port > 0 && (
                            <div className="overflow-hidden rounded-lg border bg-background/50 px-3 py-2 pk-mono text-xs leading-relaxed text-muted-foreground">
                                127.0.0.1:<span className="text-cyan-400">{form.local_port}</span>
                                {' → '}
                                {form.remote_host || 'localhost'}:<span className="text-emerald-400">{form.remote_port}</span>
                                {' via '}
                                {form.ssh_user || 'user'}@{form.ssh_host || 'host'}
                                {form.ssh_port !== 22 && `:${form.ssh_port}`}
                            </div>
                        )}

                        <Field label="Identity File (optional)">
                            <div className="flex gap-2">
                                <Input
                                    className="flex-1"
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
                                <div className="mt-2 space-y-1 rounded-lg border bg-background/50 p-2">
                                    {sshKeys.map((k) => (
                                        <button
                                            key={k.path}
                                            type="button"
                                            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                                                form.identity_file === k.path
                                                    ? 'bg-cyan-400/10 text-cyan-300'
                                                    : 'text-muted-foreground'
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

                        <Field label="Password (optional)">
                            <div className="relative">
                                <Input
                                    className="pr-10"
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.password || ''}
                                    onChange={(e) => set('password', e.target.value)}
                                    placeholder="Leave empty to use key-based auth"
                                    disabled={isBusy}
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

                        <Field label="Extra SSH Arguments (optional)">
                            <Input
                                value={form.extra_args || ''}
                                onChange={(e) => set('extra_args', e.target.value)}
                                placeholder="-o ProxyJump=bastion"
                                disabled={isBusy}
                            />
                        </Field>
                    </div>

                    {status === 'error' && (
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <div className="min-w-0 flex-1">
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

                    <DialogFooter className="mt-5 border-t pt-4">
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
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
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
            <Label className="mb-1.5 text-xs font-semibold text-muted-foreground">
                {label}
            </Label>
            {children}
        </div>
    )
}
