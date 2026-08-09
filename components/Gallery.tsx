"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Media = { key: string; type: "image" | "video"; createdAt: string; url: string };
type UploadState = { id: string; name: string; progress: number; status: "uploading" | "processing" | "error"; error?: string };
const filters = ["all", "image", "video"] as const;
const labels = { all: "すべて", image: "写真", video: "動画" };

async function api<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "アップロードに失敗しました。");
  return result;
}

function put(url: string, blob: Blob, progress: (value: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = (event) => event.lengthComputable && progress(event.loaded / event.total);
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve(request.getResponseHeader("ETag") ?? "")
      : reject(new Error("S3へのアップロードに失敗しました。"));
    request.onerror = () => reject(new Error("通信に失敗しました。"));
    request.send(blob);
  });
}

export default function Gallery({ eventKey }: { eventKey: string }) {
  const [items, setItems] = useState<Media[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [viewing, setViewing] = useState<Media | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [archiveStatus, setArchiveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const visibleItems = useMemo(() => filter === "all" ? items : items.filter((item) => item.type === filter), [items, filter]);
  const viewerIndex = viewing ? visibleItems.findIndex((item) => item.key === viewing.key) : -1;

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/media?eventKey=${encodeURIComponent(eventKey)}`);
      const result = await response.json();
      if (response.ok) setItems(result.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!viewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewing(null);
      if (event.key === "ArrowLeft" && viewerIndex > 0) setViewing(visibleItems[viewerIndex - 1]);
      if (event.key === "ArrowRight" && viewerIndex < visibleItems.length - 1) setViewing(visibleItems[viewerIndex + 1]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewing, viewerIndex, visibleItems]);

  const uploadFile = async (file: File) => {
    const id = crypto.randomUUID();
    setUploads((current) => [...current, { id, name: file.name, progress: 0, status: "uploading" }]);
    try {
      const started = await api<{ key: string; uploadId: string; partSize: number }>({ action: "start", eventKey, name: file.name, type: file.type });
      const parts: { ETag: string; PartNumber: number }[] = [];
      const count = Math.ceil(file.size / started.partSize);
      for (let index = 0; index < count; index += 1) {
        const partNumber = index + 1;
        const signed = await api<{ url: string }>({ action: "part", eventKey, key: started.key, uploadId: started.uploadId, partNumber, name: file.name, type: file.type });
        const etag = await put(signed.url, file.slice(index * started.partSize, Math.min(file.size, (index + 1) * started.partSize)), (value) => {
          setUploads((current) => current.map((item) => item.id === id ? { ...item, progress: (index + value) / count } : item));
        });
        parts.push({ ETag: etag, PartNumber: partNumber });
      }
      await api({ action: "complete", eventKey, key: started.key, uploadId: started.uploadId, parts, name: file.name, type: file.type });
      setUploads((current) => current.map((item) => item.id === id ? { ...item, progress: 1, status: "processing" } : item));
    } catch (error) {
      setUploads((current) => current.map((item) => item.id === id ? { ...item, status: "error", error: error instanceof Error ? error.message : "失敗しました。" } : item));
    }
  };

  const onChoose = (event: ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(event.target.files ?? [])) void uploadFile(file);
    event.target.value = "";
  };

  const toggle = (key: string) => setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  const download = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const requestArchive = async (keys: string[]) => {
    setArchiveStatus("ZIPを準備中です…");
    try {
      const response = await fetch("/api/archives", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventKey, keys }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ZIPを作成できませんでした。");
      const check = async () => {
        const statusResponse = await fetch(`/api/archives?eventKey=${encodeURIComponent(eventKey)}&id=${result.id}`);
        const status = await statusResponse.json();
        if (status.status === "ready") {
          setArchiveStatus("ZIPの準備ができました。");
          download(status.url);
          return;
        }
        window.setTimeout(check, 3000);
      };
      window.setTimeout(check, 3000);
    } catch (error) {
      setArchiveStatus(error instanceof Error ? error.message : "ZIPを作成できませんでした。");
    }
  };
  const downloadSelected = () => {
    const selectedItems = items.filter((item) => selected.includes(item.key));
    if (selectedItems.length >= 20) void requestArchive(selectedItems.map((item) => item.key));
    else selectedItems.forEach((item) => download(item.url));
  };
  const selectedCount = selected.length;
  const finishSelecting = () => { setIsSelecting(false); setSelected([]); };
  const moveViewer = (direction: -1 | 1) => {
    const next = visibleItems[viewerIndex + direction];
    if (next) setViewing(next);
  };

  return <main className="page">
    <header className="hero">
      <p className="eyebrow">Wedding memories</p>
      <h1>Weddind Photo System<br />for Sota and Momoka</h1>
      <p className="lead">写真と動画を、みんなで残そう。</p>
      <label className="button">写真・動画を追加<input hidden type="file" accept="image/*,video/*" multiple onChange={onChoose} /></label>
    </header>

    {uploads.length > 0 && <section className="section"><h2>アップロード</h2><ul className="upload-list">{uploads.map((item) => <li key={item.id}><strong>{item.name}</strong><br /><small>{item.status === "uploading" ? `${Math.round(item.progress * 100)}% アップロード中` : item.status === "processing" ? "変換を準備中" : item.error}</small>{item.status === "uploading" && <progress className="progress" value={item.progress} max="1" />}</li>)}</ul></section>}

    <section className="section gallery-section">
      <div className="toolbar"><div><p className="eyebrow">Memories</p><h2>ギャラリー</h2></div><div className="actions">{isSelecting ? <><span className="selection-count">{selectedCount}件を選択中</span><button className="button subtle" onClick={finishSelecting}>選択を終了</button>{selectedCount > 0 && <button className="button" onClick={downloadSelected}>{selectedCount >= 20 ? `${selectedCount}件をZIPでダウンロード` : `${selectedCount}件をダウンロード`}</button>}<button className="button subtle" onClick={() => void requestArchive(items.map((item) => item.key))} disabled={items.length === 0}>すべてをダウンロード</button></> : <button className="button subtle" onClick={() => setIsSelecting(true)}>選択</button>}</div></div>
      {archiveStatus && <p aria-live="polite">{archiveStatus}</p>}
      <div className="filters">{filters.map((value) => <button key={value} className={`filter ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{labels[value]}</button>)}</div>
      {loading ? <p className="empty">読み込み中…</p> : visibleItems.length === 0 ? <p className="empty">まだ写真・動画はありません。</p> : <div className="grid">{visibleItems.map((item) => <button className={`card ${isSelecting && selected.includes(item.key) ? "selected" : ""}`} key={item.key} onClick={() => isSelecting ? toggle(item.key) : setViewing(item)}>{item.type === "image" ? <img src={item.url} alt="結婚式の投稿写真" /> : <><video src={item.url} preload="metadata" muted /><span className="video-badge">VIDEO</span></>}</button>)}</div>}
    </section>
    {viewing && <div className="viewer" role="dialog" aria-modal="true" aria-label="メディアを拡大表示" onClick={() => setViewing(null)}><button className="viewer-close" aria-label="閉じる">×</button>{viewerIndex > 0 && <button className="viewer-nav previous" aria-label="前のメディア" onClick={(event) => { event.stopPropagation(); moveViewer(-1); }}>‹</button>}<div className="viewer-content" onClick={(event) => event.stopPropagation()}>{viewing.type === "image" ? <img src={viewing.url} alt="結婚式の投稿写真" /> : <video src={viewing.url} controls autoPlay />}</div>{viewerIndex < visibleItems.length - 1 && <button className="viewer-nav next" aria-label="次のメディア" onClick={(event) => { event.stopPropagation(); moveViewer(1); }}>›</button>}<p className="viewer-count">{viewerIndex + 1} / {visibleItems.length}</p></div>}
  </main>;
}
