import { useState, useEffect } from 'react'
import { Button, Input, Badge } from '@pk/components/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pk/components/ui/table'
import { Checkbox } from '@pk/components/ui/checkbox'
import { Pagination } from '@pk/components/ui/pagination'
import { Search, RefreshCw, Skull, X } from 'lucide-react'
import type { PortEntry } from '../types/port.types'

const PAGE_SIZE = 10

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
    const [currentPage, setCurrentPage] = useState(1)
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

    useEffect(() => { setCurrentPage(1) }, [filter])

    const totalPages = Math.ceil(filteredPorts.length / PAGE_SIZE)
    const paginatedPorts = filteredPorts.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    )
    const allSelected = paginatedPorts.length > 0 && paginatedPorts.every((p) => selectedPids.has(p.pid))
    const startIdx = (currentPage - 1) * PAGE_SIZE + 1
    const endIdx = Math.min(currentPage * PAGE_SIZE, filteredPorts.length)

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
        <div className="pk-table-section space-y-4">
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Filter by process, port, address, label, or group..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="pk-search-input pl-9 pr-9"
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
                <Badge variant="outline" className="pk-mono">
                    {filteredPorts.length}/{ports.length}
                </Badge>
            </div>

            <div className="pk-table-card">
                <Table className="pk-port-table">
                    <colgroup>
                        <col className="w-16" />
                        <col className="w-[92px]" />
                        <col className="w-[92px]" />
                        <col className="w-[260px]" />
                        <col className="w-[180px]" />
                        <col className="w-[190px]" />
                        <col className="w-[120px]" />
                        <col className="w-[180px]" />
                        <col className="w-16" />
                    </colgroup>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pk-checkbox-cell">
                                <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={onToggleSelectAll}
                                />
                            </TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">Port</TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">PID</TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">Process</TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">Label</TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">Address</TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                            <TableHead className="pk-mono text-[10px] font-bold uppercase tracking-wider">Group</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && ports.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                    <RefreshCw className="mx-auto mb-2 size-5 animate-spin" />
                                    Loading ports...
                                </TableCell>
                            </TableRow>
                        ) : paginatedPorts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                    {filter ? 'No ports match your filter' : 'No listening ports found'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedPorts.map((port) => (
                                <TableRow
                                    key={`${port.pid}-${port.local_port}`}
                                    data-state={selectedPids.has(port.pid) ? 'selected' : undefined}
                                >
                                    <TableCell className="pk-checkbox-cell">
                                        <Checkbox
                                            checked={selectedPids.has(port.pid)}
                                            onCheckedChange={() => onToggleSelect(port.pid)}
                                        />
                                    </TableCell>
                                    <TableCell className="pk-mono font-semibold text-cyan-400">
                                        {port.local_port}
                                    </TableCell>
                                    <TableCell className="pk-mono text-muted-foreground">{port.pid}</TableCell>
                                    <TableCell className="font-medium text-foreground" title={port.name}>
                                        <span className="block max-w-[240px] truncate">{port.name}</span>
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell className="pk-mono text-xs text-muted-foreground" title={port.local_address}>
                                        <span className="block max-w-[180px] truncate">{port.local_address}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                port.status === 'LISTEN'
                                                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                                                    : 'border-blue-400/20 bg-blue-400/10 text-blue-400'
                                            }
                                        >
                                            {port.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell className="pk-row-action-cell">
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={() => onKillSingle(port.pid)}
                                            className="text-muted-foreground hover:bg-red-400/10 hover:text-red-400"
                                            title={`Kill PID ${port.pid}`}
                                        >
                                            <Skull className="size-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                    {filteredPorts.length > 0
                        ? `Showing ${startIdx}–${endIdx} of ${filteredPorts.length}`
                        : `${filteredPorts.length} ports`}
                    {filter && ` (filtered from ${ports.length})`}
                    {selectedPids.size > 0 && (
                        <>
                            <span className="mx-2 text-border">|</span>
                            <span className="text-destructive">
                                <Skull className="mr-1 inline size-3" />
                                {selectedPids.size} selected
                            </span>
                        </>
                    )}
                </span>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
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
                className="h-9 text-sm"
            />
        )
    }

    return (
        <button
            onClick={onStartEdit}
            className="block min-h-9 w-full truncate rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
            title={value || placeholder}
        >
            {value || <span className="italic opacity-50">{placeholder}</span>}
        </button>
    )
}
