import { useEffect, useId, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { LoadingState } from '@os/components/ui';

interface MermaidDiagramProps {
    chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
    const id = useId().replace(/:/g, '');
    const [svg, setSvg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function renderDiagram() {
            setSvg(null);
            setError(null);

            try {
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: 'strict',
                    theme: 'dark',
                    themeVariables: {
                        background: 'transparent',
                        primaryColor: '#1f2534',
                        primaryTextColor: '#edf3f7',
                        primaryBorderColor: '#b79cff',
                        lineColor: '#7ceee6',
                        secondaryColor: '#2d3144',
                        tertiaryColor: '#101015',
                        fontFamily: 'Quicksand, ui-sans-serif, system-ui',
                    },
                });

                const result = await mermaid.render(`mermaid-${id}`, chart);
                if (!cancelled) setSvg(result.svg);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to render diagram');
                }
            }
        }

        renderDiagram();

        return () => {
            cancelled = true;
        };
    }, [chart, id]);

    if (error) {
        return (
            <div className="my-5 flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--error)_42%,transparent)] bg-[color-mix(in_srgb,var(--error-container)_30%,transparent)] p-4 text-sm text-[var(--error)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                    <p className="font-bold">Mermaid render failed</p>
                    <p className="mt-1 opacity-85">{error}</p>
                </div>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="my-5 rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.42)] p-6">
                <LoadingState label="Rendering diagram" />
            </div>
        );
    }

    return (
        <div className="my-5 overflow-x-auto rounded-xl border border-[var(--outline-variant)] bg-[rgba(10,11,16,0.42)] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
            <div
                className="min-w-fit [&_svg]:mx-auto [&_svg]:max-w-none"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    );
}
