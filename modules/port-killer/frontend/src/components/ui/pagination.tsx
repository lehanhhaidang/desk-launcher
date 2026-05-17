import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@pk/components/ui'
import { cn } from '@pk/lib/utils'

interface PaginationProps {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    className?: string
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
    if (totalPages <= 1) return null

    const pages: (number | 'dots')[] = []
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
        pages.push(1)
        if (currentPage > 3) pages.push('dots')
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i)
        }
        if (currentPage < totalPages - 2) pages.push('dots')
        pages.push(totalPages)
    }

    return (
        <div className={cn('flex items-center gap-1', className)}>
            <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
            >
                <ChevronLeft className="size-4" />
                Prev
            </Button>

            {pages.map((p, i) =>
                p === 'dots' ? (
                    <span key={`d${i}`} className="flex size-8 items-center justify-center text-muted-foreground">
                        <MoreHorizontal className="size-4" />
                    </span>
                ) : (
                    <Button
                        key={p}
                        variant={p === currentPage ? 'outline' : 'ghost'}
                        size="icon-sm"
                        onClick={() => onPageChange(p)}
                    >
                        {p}
                    </Button>
                ),
            )}

            <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
            >
                Next
                <ChevronRight className="size-4" />
            </Button>
        </div>
    )
}
