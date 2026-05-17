// Media Toolbox shell.
//
// The window hosts four workflow tabs (Capture, Images, Videos, Queue). Each
// tab manages its own state and reports into the shared job store; this shell
// is intentionally lightweight — sidebar + tab navigation + tab content.

import { useState } from 'react'
import {
  Download,
  FileImage,
  FileVideo,
  Film,
  Image as ImageIcon,
  ListChecks,
  Radio,
  Sparkles,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui'
import { CaptureTab } from './features/capture/CaptureTab'
import { ImagesTab } from './features/images/ImagesTab'
import { VideosTab } from './features/videos/VideosTab'
import { QueueTab } from './features/queue/QueueTab'
import { useJobStore } from './features/queue/job-store'
import { isJobTerminal } from './features/queue/job-store'

type TabKey = 'capture' | 'images' | 'videos' | 'queue'

export default function MediaToolbox() {
  const [tab, setTab] = useState<TabKey>('capture')

  const activeCount = useJobStore((s) =>
    s.jobs.reduce((sum, job) => (isJobTerminal(job.status) ? sum : sum + 1), 0),
  )

  return (
    <div className="vd-shell">
      <div className="vd-page">
        <aside className="vd-side">
          <div className="vd-kicker">
            <Radio className="size-3.5 shrink-0" />
            <span>Local media suite</span>
          </div>
          <div>
            <h1 className="vd-title">Media Toolbox</h1>
            <p className="vd-description">
              Capture links, prepare images, convert videos, and keep local media jobs
              organized — all from one window.
            </p>
          </div>

          <div className="vd-metrics">
            <Metric icon={<Film className="size-4" />} label="Capture" value="yt-dlp" tone="sky" />
            <Metric icon={<FileImage className="size-4" />} label="Images" value="Batch" tone="emerald" />
            <Metric icon={<FileVideo className="size-4" />} label="Videos" value="ffmpeg" tone="pink" />
            <Metric icon={<ListChecks className="size-4" />} label="Queue" value={`${activeCount} active`} tone="indigo" />
          </div>

          <div className="vd-note">
            <Sparkles className="size-4 shrink-0" />
            <span>Jobs are saved to APPDATA/io.desklauncher/modules/video-downloader.</span>
          </div>
        </aside>

        <main className="vd-main">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as TabKey)}
            className="vd-tool-tabs"
          >
            <TabsList className="vd-tabs-list" aria-label="Media Toolbox sections">
              <TabsTrigger value="capture" className="vd-tab-trigger">
                <Download className="size-4" />
                <span>Capture</span>
              </TabsTrigger>
              <TabsTrigger value="images" className="vd-tab-trigger">
                <ImageIcon className="size-4" />
                <span>Images</span>
              </TabsTrigger>
              <TabsTrigger value="videos" className="vd-tab-trigger">
                <Film className="size-4" />
                <span>Videos</span>
              </TabsTrigger>
              <TabsTrigger value="queue" className="vd-tab-trigger">
                <ListChecks className="size-4" />
                <span>Queue</span>
                {activeCount > 0 && (
                  <span className="vd-tab-badge" aria-label={`${activeCount} active`}>
                    {activeCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* `forceMount` keeps each tab's hooks alive so in-flight image /
                video jobs continue to receive Tauri progress events when the
                user is on a different tab. Inactive tabs are still hidden by
                Radix via the `hidden` attribute. */}
            <TabsContent value="capture" className="vd-tab-content" forceMount>
              <CaptureTab />
            </TabsContent>
            <TabsContent value="images" className="vd-tab-content" forceMount>
              <ImagesTab active={tab === 'images'} />
            </TabsContent>
            <TabsContent value="videos" className="vd-tab-content" forceMount>
              <VideosTab active={tab === 'videos'} />
            </TabsContent>
            <TabsContent value="queue" className="vd-tab-content" forceMount>
              <QueueTab />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  )
}

interface MetricProps {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'sky' | 'pink' | 'indigo' | 'emerald'
}

function Metric({ icon, label, value, tone }: MetricProps) {
  return (
    <div className={`vd-metric vd-metric-${tone}`}>
      <div className="vd-metric-icon">{icon}</div>
      <div className="min-w-0">
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  )
}
