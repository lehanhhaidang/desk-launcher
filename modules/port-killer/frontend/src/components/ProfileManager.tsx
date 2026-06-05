import { useState } from 'react'
import { Button, Input } from '@pk/components/ui'
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
        <div className="pk-profile-card rounded-2xl border border-border/40 bg-card/40 p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h3 className="pk-card-title">Profiles</h3>
                    <p className="pk-card-subtitle">Labels & groups</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsCreating(!isCreating)}>
                    <Plus className="size-3" />
                    New
                </Button>
            </div>

            <div className="space-y-3">
                {isCreating && (
                    <div className="flex gap-2">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Profile name..."
                            className="h-9 text-sm"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave()
                                if (e.key === 'Escape') setIsCreating(false)
                            }}
                            autoFocus
                        />
                        <Button variant="default" size="sm" onClick={handleSave}>
                            <Save className="size-3" />
                        </Button>
                    </div>
                )}

                {profiles.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                        No saved profiles. Save your current labels & groups as a profile.
                    </p>
                ) : (
                    <div className="pk-profile-list">
                        {profiles.map((profile) => (
                            <div
                                key={profile.id}
                                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                                    activeProfileId === profile.id
                                        ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                            >
                                <button
                                    onClick={() => onLoad(profile)}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                    <FolderOpen className="size-3.5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                                    <span className="shrink-0 opacity-60">({profile.entries.length})</span>
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => onDelete(profile.id)}
                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <Trash2 className="size-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
