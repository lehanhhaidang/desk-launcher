import { useState } from 'react'
import { Button } from '@desk-launcher/ui'
import { Input } from '@desk-launcher/ui'
import { Save, Trash2, FolderOpen, Plus } from 'lucide-react'
import type { PortProfile } from '../types/port.types'

interface ProfileManagerProps {
    profiles: PortProfile[]
    activeProfileId: string | null
    onLoad: (profile: PortProfile) => void
    onSave: (name: string) => void
    onDelete: (id: string) => void
}

export function ProfileManager({
    profiles,
    activeProfileId,
    onLoad,
    onSave,
    onDelete,
}: ProfileManagerProps) {
    const [isCreating, setIsCreating] = useState(false)
    const [newName, setNewName] = useState('')

    const handleSave = () => {
        if (!newName.trim()) return
        onSave(newName.trim())
        setNewName('')
        setIsCreating(false)
    }

    return (
        <div className="pk-panel rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#edf3f7]">Profiles</h3>
                    <p className="pk-mono text-[10px] font-bold uppercase tracking-wider pk-muted">Labels and groups</p>
                </div>
                <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setIsCreating(!isCreating)}
                    className="border-white/10 bg-white/[0.035] text-[#edf3f7] hover:bg-white/[0.07]"
                >
                    <Plus className="size-3" />
                    New
                </Button>
            </div>

            {isCreating && (
                <div className="mb-3 flex gap-2">
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Profile name..."
                        className="pk-input h-7 text-xs"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave()
                            if (e.key === 'Escape') setIsCreating(false)
                        }}
                        autoFocus
                    />
                    <Button className="bg-cyan-200 text-[#071014] hover:bg-cyan-100" size="xs" onClick={handleSave}>
                        <Save className="size-3" />
                    </Button>
                </div>
            )}

            {profiles.length === 0 ? (
                <p className="text-xs italic pk-muted">
                    No saved profiles. Save your current labels & commands as a profile.
                </p>
            ) : (
                <div className="space-y-1">
                    {profiles.map((profile) => (
                        <div
                            key={profile.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                                activeProfileId === profile.id
                                    ? 'border border-cyan-200/15 bg-cyan-200/10 text-cyan-100'
                                    : 'pk-subtle hover:bg-white/[0.045] hover:text-[#edf3f7]'
                            }`}
                        >
                            <button
                                onClick={() => onLoad(profile)}
                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                            >
                                <FolderOpen className="size-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                                <span className="shrink-0 pk-muted">
                                    ({profile.entries.length})
                                </span>
                            </button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => onDelete(profile.id)}
                                className="pk-muted hover:bg-red-400/10 hover:text-red-200"
                            >
                                <Trash2 className="size-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
