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
        <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Profiles</h3>
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsCreating(!isCreating)}
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
                        className="h-7 text-xs"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave()
                            if (e.key === 'Escape') setIsCreating(false)
                        }}
                        autoFocus
                    />
                    <Button variant="default" size="xs" onClick={handleSave}>
                        <Save className="size-3" />
                    </Button>
                </div>
            )}

            {profiles.length === 0 ? (
                <p className="text-xs italic text-muted-foreground/60">
                    No saved profiles. Save your current labels & commands as a profile.
                </p>
            ) : (
                <div className="space-y-1">
                    {profiles.map((profile) => (
                        <div
                            key={profile.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                                activeProfileId === profile.id
                                    ? 'bg-primary/10 text-primary'
                                    : 'hover:bg-muted/30'
                            }`}
                        >
                            <button
                                onClick={() => onLoad(profile)}
                                className="flex flex-1 items-center gap-1.5 text-left"
                            >
                                <FolderOpen className="size-3" />
                                <span className="truncate">{profile.name}</span>
                                <span className="text-muted-foreground">
                                    ({profile.entries.length})
                                </span>
                            </button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => onDelete(profile.id)}
                                className="text-muted-foreground hover:text-red-400"
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
