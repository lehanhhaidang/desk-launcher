import { useState } from 'react'
import { Button } from '@desk-launcher/ui'
import { Input } from '@desk-launcher/ui'
import { Search, RefreshCw, Skull, X, ListFilter } from 'lucide-react'
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
            <div className="pk-panel rounded-xl p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg border border-cyan-200/15 bg-cyan-200/10 text-cyan-100">
                            <ListFilter className="size-4" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-[#edf3f7]">Listening ports</div>
                            <div className="pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Filter, label, group, terminate</div>
                        </div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 pk-mono text-xs pk-subtle">
                        {filteredPorts.length}/{ports.length}
                    </span>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 pk-muted" />
                    <Input
                        placeholder="Filter by process, port, address, label, or group..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="pk-input pl-9 pr-9"
                    />
                    {filter && (
                        <button
                            onClick={() => setFilter('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 pk-muted hover:text-[#edf3f7]"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="pk-panel overflow-hidden rounded-xl">
                <div className="pk-scrollbar overflow-x-auto">
                    <table className="w-full min-w-[720px] table-fixed text-sm">
                        <colgroup>
                            <col className="w-10" />
                            <col className="w-[64px]" />
                            <col className="w-[64px]" />
                            <col />
                            <col className="w-[120px]" />
                            <col className="w-[128px]" />
                            <col className="w-[88px]" />
                            <col className="w-[100px]" />
                            <col className="w-12" />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.035]">
                                <th className="px-2 py-2.5 text-center align-middle">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={onToggleSelectAll}
                                        className="size-3.5 rounded border-white/20 bg-white/[0.04] align-middle"
                                    />
                                </th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Port</th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">PID</th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Process</th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Label</th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Address</th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Status</th>
                                <th className="px-3 py-2.5 text-left align-middle pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Group</th>
                                <th className="px-2 py-2.5"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && ports.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center pk-subtle">
                                        <RefreshCw className="mx-auto mb-2 size-5 animate-spin" />
                                        Loading ports...
                                    </td>
                                </tr>
                            ) : filteredPorts.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center pk-subtle">
                                        {filter ? 'No ports match your filter' : 'No listening ports found'}
                                    </td>
                                </tr>
                            ) : (
                                filteredPorts.map((port) => (
                                    <tr
                                        key={`${port.pid}-${port.local_port}`}
                                        className={`border-b border-white/[0.055] transition-colors hover:bg-white/[0.035] ${
                                            selectedPids.has(port.pid) ? 'bg-red-500/10' : ''
                                        }`}
                                    >
                                        <td className="px-2 py-2 text-center align-middle">
                                            <input
                                                type="checkbox"
                                                checked={selectedPids.has(port.pid)}
                                                onChange={() => onToggleSelect(port.pid)}
                                                className="size-3.5 rounded border-white/20 bg-white/[0.04] align-middle"
                                            />
                                        </td>
                                        <td className="truncate px-3 py-2 align-middle pk-mono font-semibold text-cyan-200">
                                            {port.local_port}
                                        </td>
                                        <td className="truncate px-3 py-2 align-middle pk-mono pk-subtle">{port.pid}</td>
                                        <td className="truncate px-3 py-2 align-middle font-medium text-[#edf3f7]" title={port.name}>{port.name}</td>
                                        <td className="px-3 py-2 align-middle">
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
                                        <td className="truncate px-3 py-2 align-middle pk-mono text-xs pk-subtle" title={port.local_address}>
                                            {port.local_address}
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                            <span
                                                className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    port.status === 'LISTEN'
                                                        ? 'border border-emerald-200/15 bg-emerald-200/10 text-emerald-200'
                                                        : 'border border-blue-200/15 bg-blue-200/10 text-blue-200'
                                                }`}
                                                title={port.status}
                                            >
                                                {port.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 align-middle">
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
                                        <td className="px-2 py-2 text-center align-middle">
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => onKillSingle(port.pid)}
                                                className="pk-muted hover:bg-red-400/10 hover:text-red-200"
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

            <div className="flex items-center justify-between text-xs pk-subtle">
                <span>
                    {filteredPorts.length} port{filteredPorts.length !== 1 ? 's' : ''}
                    {filter && ` (filtered from ${ports.length})`}
                </span>
                {selectedPids.size > 0 && (
                    <span className="pk-danger-text">
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
                className="pk-input h-7 text-xs"
            />
        )
    }

    return (
        <button
            onClick={onStartEdit}
            className="block w-full truncate text-left text-xs pk-subtle hover:text-[#edf3f7]"
            title={value || placeholder}
        >
            {value || <span className="italic pk-muted">{placeholder}</span>}
        </button>
    )
}
