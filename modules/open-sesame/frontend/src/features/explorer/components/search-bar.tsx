import { useState, useCallback } from 'react';
import { invoke } from '@os/lib/tauri';
import { Search, X, FileText, Folder } from 'lucide-react';
import { Select, Spinner } from '@os/components/ui';

interface SearchResult {
    file_path: string;
    file_name: string;
    matches: Array<{
        line_number: number;
        line_content: string;
        match_start: number;
        match_end: number;
    }>;
}

interface FileNameResult {
    file_path: string;
    file_name: string;
    is_dir: boolean;
}

interface SearchBarProps {
    sourcePath: string;
    onSelectFile: (filePath: string) => void;
}

export function SearchBar({ sourcePath, onSelectFile }: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [fileResults, setFileResults] = useState<FileNameResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchType, setSearchType] = useState<'content' | 'filename'>('content');

    const handleSearch = useCallback(async () => {
        if (!query.trim()) {
            setResults([]);
            setFileResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const data = await invoke<SearchResult[] | FileNameResult[]>('file_search', {
                sourcePath,
                query,
                searchType,
                maxResults: 30,
            });

            if (searchType === 'content') {
                setResults(data as SearchResult[]);
                setFileResults([]);
            } else {
                setFileResults(data as FileNameResult[]);
                setResults([]);
            }
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, [query, sourcePath, searchType]);

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        setFileResults([]);
    };

    return (
        <div className="border-b border-[var(--outline-variant)]">
            <div className="flex items-center gap-2 p-2">
                <Search className="h-4 w-4 shrink-0 text-[var(--on-surface-variant)]" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder={searchType === 'content' ? 'Search content...' : 'Search files...'}
                    className="min-w-0 flex-1 bg-transparent text-sm text-[var(--on-surface)] outline-none placeholder:text-[color-mix(in_srgb,var(--on-surface-variant)_65%,transparent)]"
                />
                {query && (
                    <button onClick={clearSearch} className="rounded p-0.5 hover:bg-[var(--surface-bright)]">
                        <X className="h-3.5 w-3.5 text-[var(--on-surface-variant)]" />
                    </button>
                )}
                <Select
                    value={searchType}
                    onChange={setSearchType}
                    options={[
                        { value: 'content', label: 'Content' },
                        { value: 'filename', label: 'Filename' },
                    ]}
                    className="w-[104px]"
                />
            </div>

            {isSearching && (
                <div className="px-4 py-2">
                    <Spinner size="sm" label="Searching" />
                </div>
            )}

            {/* Content search results */}
            {results.length > 0 && (
                <div className="max-h-64 overflow-auto border-t border-[var(--outline-variant)]">
                    {results.map((result, i) => (
                        <div
                            key={i}
                            className="cursor-pointer border-b border-[var(--outline-variant)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-bright)]"
                            onClick={() => onSelectFile(result.file_path)}
                        >
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--primary)]">
                                <FileText className="w-3.5 h-3.5" />
                                {result.file_name}
                            </div>
                            {result.matches.slice(0, 3).map((match, j) => (
                                <div key={j} className="mt-0.5 truncate pl-5 text-xs text-[var(--on-surface-variant)]">
                                    <span className="text-[var(--outline)]">L{match.line_number}:</span>{' '}
                                    {match.line_content}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* Filename search results */}
            {fileResults.length > 0 && (
                <div className="max-h-64 overflow-auto border-t border-[var(--outline-variant)]">
                    {fileResults.map((result, i) => (
                        <div
                            key={i}
                            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--on-surface)] hover:bg-[var(--surface-bright)]"
                            onClick={() => onSelectFile(result.file_path)}
                        >
                            {result.is_dir ? (
                                <Folder className="w-4 h-4 text-amber-500" />
                            ) : (
                                <FileText className="w-4 h-4 text-[var(--on-surface-variant)]" />
                            )}
                            <span className="truncate">{result.file_name}</span>
                            <span className="ml-auto truncate text-xs text-[var(--on-surface-variant)]">{result.file_path}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
