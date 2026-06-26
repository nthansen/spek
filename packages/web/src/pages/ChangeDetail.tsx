import { useEffect, useMemo } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { extractHeadings } from "@spek/core/headings";
import type { ChangeArtifact } from "@spek/core";
import { useChange, useSpecs } from "../hooks/useOpenSpec";
import { TabView } from "../components/TabView";
import { TaskProgress } from "../components/TaskProgress";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { SpecsTabContent } from "../components/SpecsTabContent";
import { SpecToc } from "../components/SpecToc";
import { formatLifecycleBanner, todayIso } from "../utils/lifecycle";

const TOC_MIN_HEADINGS = 3;

// 對齊 @spek/core 的 parseSlug：去掉開頭 YYYY-MM-DD- 前綴並把 dash 轉空格
function slugTitle(slug: string): string {
  const m = slug.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return (m ? m[1] : slug).replace(/-/g, " ");
}

// 某個 artifact 是否可渲染為 markdown 並支援 TOC（markdown / specs 可，tasks 不可）
function isMarkdownLike(kind: ChangeArtifact["kind"]): boolean {
  return kind === "markdown" || kind === "specs";
}

function renderArtifact(artifact: ChangeArtifact, specTopics: string[]) {
  if (artifact.kind === "markdown") {
    return artifact.content ? (
      <MarkdownRenderer content={artifact.content} specTopics={specTopics} />
    ) : (
      <p className="text-text-muted text-sm">No content</p>
    );
  }
  if (artifact.kind === "specs") {
    return artifact.specs && artifact.specs.length > 0 ? (
      <SpecsTabContent specs={artifact.specs} />
    ) : (
      <p className="text-text-muted text-sm">No delta specs</p>
    );
  }
  // tasks
  return artifact.tasks ? (
    <div className="space-y-4">
      <TaskProgress completed={artifact.tasks.completed} total={artifact.tasks.total} />
      <div className="space-y-4">
        {artifact.tasks.sections.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-semibold text-text-secondary mb-2">{section.title}</h3>
            <div className="space-y-1">
              {section.tasks.map((task, i) => (
                <div key={i} className={`flex items-start gap-2 text-sm ${task.completed ? "opacity-60" : ""}`}>
                  {task.completed ? (
                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-green-400" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.2" />
                      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-text-muted" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  <span className={task.completed ? "text-text-secondary line-through" : "text-text-primary"}>
                    {task.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <p className="text-text-muted text-sm">No content</p>
  );
}

export function ChangeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // 聚合視圖下，wt 指定要從哪個 worktree 讀這個 change（同名 slug 辨識用）
  const wt = searchParams.get("wt") ?? undefined;
  const { data, loading, error } = useChange(slug ?? "", wt);
  const { data: specsData } = useSpecs();
  const specTopics = specsData?.map((s) => s.topic) ?? [];

  const artifacts = useMemo(() => data?.artifacts ?? [], [data]);

  // 活躍 tab：?tab=<artifact-id>；不存在或未知時 fallback 回第一個 artifact
  const tabParam = searchParams.get("tab");
  const activeArtifact =
    artifacts.find((a) => a.id === tabParam) ?? artifacts[0] ?? null;
  const activeTab = activeArtifact?.id ?? "";

  const currentHeadings = useMemo(() => {
    if (!activeArtifact || !isMarkdownLike(activeArtifact.kind)) return [];
    if (activeArtifact.kind === "markdown") {
      return activeArtifact.content ? extractHeadings(activeArtifact.content) : [];
    }
    // specs：每個 delta spec heading 以 topic 前綴避免 id 碰撞
    return (activeArtifact.specs ?? []).flatMap((s) =>
      extractHeadings(s.content).map((h) => ({ ...h, slug: `${s.topic}--${h.slug}` })),
    );
  }, [activeArtifact]);

  // Tab 切換時：URL 只保留 ?tab=<id>，同步清掉 hash（不同 tab 的舊 heading 已無意義），
  // 並把 window 捲回頂端，避免停留在上一個 tab 的視窗位置。
  const handleTabChange = (id: string) => {
    const next: Record<string, string> = { tab: id };
    if (wt) next.wt = wt;
    setSearchParams(next, { replace: false });
    if (location.hash) {
      const wtq = wt ? `&wt=${encodeURIComponent(wt)}` : "";
      window.history.replaceState(null, "", `${location.pathname}?tab=${id}${wtq}`);
    }
    window.scrollTo(0, 0);
  };

  // Hash 錨點：在內容就緒 + hash 或 tab 變更時，捲到對應 heading（等 markdown render 完再試）
  useEffect(() => {
    if (!data) return;
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return;

    const HEADER_OFFSET = 80;
    let attempts = 0;
    let rafId: number | null = null;

    const tryScroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
        window.scrollTo({ top, behavior: "smooth" });
        return;
      }
      if (attempts++ < 10) {
        rafId = requestAnimationFrame(tryScroll);
      }
    };

    rafId = requestAnimationFrame(tryScroll);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [data, activeTab, location.hash]);

  if (loading) return <p className="text-text-muted">Loading...</p>;
  if (error) return <p className="text-red-400">Error: {error}</p>;
  if (!data) return <p className="text-text-muted">Change not found</p>;

  const tabs = artifacts.map((artifact) => ({
    id: artifact.id,
    label: artifact.title,
    content: renderArtifact(artifact, specTopics),
  }));

  const lifecycleBanner = formatLifecycleBanner(data, todayIso());
  const title = slug ? slugTitle(slug) : "";
  const headerEl = (
    <div className="pt-2 pb-3">
      <Link to="/changes" className="text-text-muted text-base font-medium hover:text-accent transition-colors">
        &larr; Back to Changes
      </Link>
      <h1 className="text-2xl font-bold mt-2" title={slug}>{title}</h1>
      <div className="flex items-center gap-2 mt-2 mb-1">
        {data.schema && (
          <span
            className="inline-flex items-center rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-[11px] font-medium text-text-secondary"
            title={`Schema: ${data.schema}`}
          >
            {data.schema}
          </span>
        )}
        {lifecycleBanner && (
          <p className="text-text-muted text-xs tracking-wide [word-spacing:0.15em]">{lifecycleBanner}</p>
        )}
      </div>
    </div>
  );

  const showToc =
    activeArtifact !== null &&
    isMarkdownLike(activeArtifact.kind) &&
    currentHeadings.length >= TOC_MIN_HEADINGS;

  return (
    <div className={showToc ? "xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-8" : ""}>
      <div className="min-w-0">
        <TabView tabs={tabs} header={headerEl} sticky activeId={activeTab} onChange={handleTabChange} />
      </div>
      {showToc && (
        <aside className="hidden xl:block xl:pt-2">
          <SpecToc key={activeTab} headings={currentHeadings} />
        </aside>
      )}
    </div>
  );
}
