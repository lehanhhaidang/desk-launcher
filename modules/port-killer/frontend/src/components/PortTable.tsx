import { useState } from 'react'
import { Button } from '@desk-launcher/ui'
import { Input } from '@desk-launcher/ui'
import { Search, RefreshCw, Skull, X } from 'lucide-react'
import type { PortEntry } from '../types/port.types'

interface PortTableProps {
    ports: PortEntry[]
    selectedPids: Set<number>
    onToggleSelect: (pid: number) => void
    onToggleSelectAll: () => void
    onKillSingle: (pid: number) => void
    onUpdateLabel: (port: number, label: string) => void
    onUpdateGroup: (port: number, group: string) => void
    isLoading: boolean
}

export function PortTable({
    ports,
    selectedPids,
    onToggleSelect,
    onToggleSelectAll,
    onKillSingle,
    onUpdateLabel,
    onUpdateGroup,
    isLoading,
}: PortTableProps) {
    const [filter, setFilter] = useState('')
    const [editingCell, setEditingCell] = useState<{ port: number; field: string } | null>(null)
    const [editValue, setEditValue] = useState('')

    const filteredPorts = ports.filter((p) => {
        if (!filter) return true
        const q = filter.toLowerCase()
        return (
            p.name.toLowerCase().includes(q) ||
            p.local_port.toString().includes(q) ||
            (p.label?.toLowerCase().includes(q) ?? false) ||
            (p.group?.toLowerCase().includes(q) ?? false) ||
            p.local_address.includes(q)
        )
    })

    const allSelected = filteredPorts.length > 0 && filteredPorts.every((p) => selectedPids.has(p.pid))

    const startEdit = (port: number, field: string, currentValue: string) => {
        setEditingCell({ port, field })
        setEditValue(currentValue)
    }

    const commitEdit = () => {
        if (!editingCell) return
        const { port, field } = editingCell
        if (field === 'label') onUpdateLabel(port, editValue)
        else if (field === 'group') onUpdateGroup(port, editValue)
        setEditingCell(null)
    }

    return (
        <div className="space-y-3">
            {/* Search filter */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Filter by name, port, label, or group..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="pl-9"
                />
                {filter && (
                    <button
                        onClick={() => setFilter('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                                <th className="w-10 p-3">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={onToggleSelectAll}
                                        className="rounded border-border"
                                    />
                                </th>
                                <th className="p-3 text-left font-medium text-muted-foreground">Port</th>
                                <th className="p-3 text-left font-medium text-muted-foreground">PID</th>
                                <th className="p-3 text-left font-medium text-muted-foreground">Process</th>
                                <th className="p-3 text-left font-medium text-muted-foreground">Label</th>
                                <th className="p-3 text-left font-medium text-muted-foreground">Address</th>
                                <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                                <th className="p-3 text-left font-medium text-muted-foreground">Group</th>
                                <th className="w-12 p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && ports.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                        <RefreshCw className="mx-auto mb-2 size-5 animate-spin" />
                                        Loading ports...
                                    </td>
                                </tr>
                            ) : filteredPorts.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                        {filter ? 'No ports match your filter' : 'No listening ports found'}
                                    </td>
                                </tr>
                            ) : (
                                filteredPorts.map((port) => (
                                    <tr
                                        key={`${port.pid}-${port.local_port}`}
                                        className={`border-b border-border/30 transition-colors hover:bg-muted/20 ${
                                            selectedPids.has(port.pid) ? 'bg-red-500/5' : ''
                                        }`}
                                    >
                                        <td className="p-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedPids.has(port.pid)}
                                                onChange={() => onToggleSelect(port.pid)}
                                                className="rounded border-border"
                                            />
                                        </td>
                                        <td className="p-3 font-mono font-semibold text-orange-400">
                                            {port.local_port}
                                        </td>
                                        <td className="p-3 font-mono text-muted-foreground">{port.pid}</td>
                                        <td className="p-3 font-medium">{port.name}</td>
                                        <td className="p-3">
                                            <EditableCell
                                                value={port.label || ''}
                                                placeholder="Add label..."
                                                isEditing={editingCell?.port === port.local_port && editingCell?.field === 'label'}
                                                editValue={editValue}
                                                onStartEdit={() => startEdit(port.local_port, 'label', port.label || '')}
                                                onEditValueChange={setEditValue}
                                                onCommit={commitEdit}
                                                onCancel={() => setEditingCell(null)}
                                            />
                                        </td>
                                        <td className="p-3 font-mono text-xs text-muted-foreground">
                                            {port.local_address}
                                        </td>
                                        <td className="p-3">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    port.status === 'LISTEN'
                                                        ? 'bg-green-500/10 text-green-400'
                                                        : 'bg-blue-500/10 text-blue-400'
                                                }`}
                                            >
                                                {port.status}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <EditableCell
                                                value={port.group || ''}
                                                placeholder="Add group..."
                                                isEditing={editingCell?.port === port.local_port && editingCell?.field === 'group'}
                                                editValue={editValue}
                                                onStartEdit={() => startEdit(port.local_port, 'group', port.group || '')}
                                                onEditValueChange={setEditValue}
                                                onCommit={commitEdit}
                                                onCancel={() => setEditingCell(null)}
                                            />
                                        </td>
                                        <td className="p-3">
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => onKillSingle(port.pid)}
                                                className="text-muted-foreground hover:text-red-400"
                                                title={`Kill PID ${port.pid}`}
                                            >
                                                <Skull className="size-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    {filteredPorts.length} port{filteredPorts.length !== 1 ? 's' : ''}
                    {filter && ` (filtered from ${ports.length})`}
                </span>
                {selectedPids.size > 0 && (
                    <span className="text-red-400">
                        <Skull className="mr-1 inline size-3" />
                        {selectedPids.size} selected for kill
                    </span>
                )}
            </div>
        </div>
    )
}

function EditableCell({
    value,
    placeholder,
    isEditing,
    editValue,
    onStartEdit,
    onEditValueChange,
    onCommit,
    onCancel,
}: {
    value: string
    placeholder: string
    isEditing: boolean
    editValue: string
    onStartEdit: () => void
    onEditValueChange: (v: string) => void
    onCommit: () => void
    onCancel: () => void
}) {
    if (isEditing) {
        return (
            <Input
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommit()
                    if (e.key === 'Escape') onCancel()
                }}
                autoFocus
                className="h-7 text-xs"
            />
        )
    }

    return (
        <button
            onClick={onStartEdit}
            className="max-w-[150px] truncate text-left text-xs text-muted-foreground hover:text-foreground"
            title={value || placeholder}
        >
            {value || <span className="italic opacity-50">{placeholder}</span>}
        </button>
    )
}
