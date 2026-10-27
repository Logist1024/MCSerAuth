'use client';

import type { SkinViewer as SkinViewerInstance } from 'skinview3d';
import { useEffect, useRef, useState } from 'react';

interface SkinPreviewProps {
  /** Signed skin URL; null renders the default Steve model. */
  skinUrl: string | null;
  /** Signed cape URL; null hides the cape. */
  capeUrl: string | null;
  variant: 'classic' | 'slim' | null;
  playerName?: string | null;
  /** Refetches signed URLs after they expire. */
  onRefresh?: () => void;
}

/**
 * Three.js appearance preview (skinview3d). Loaded lazily in the browser so
 * the WebGL bundle never runs during server rendering.
 */
export default function SkinPreview({
  skinUrl,
  capeUrl,
  variant,
  playerName = null,
  onRefresh,
}: SkinPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<SkinViewerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [rotating, setRotating] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function setup(): Promise<void> {
      try {
        const { IdleAnimation, SkinViewer } = await import('skinview3d');
        if (cancelled || canvas.current === null) {
          return;
        }
        const instance = new SkinViewer({
          canvas: canvas.current,
          width: 300,
          height: 360,
          fov: 42,
          zoom: 0.92,
        });
        instance.autoRotate = true;
        instance.autoRotateSpeed = 0.55;
        instance.animation = new IdleAnimation();
        viewer.current = instance;
        setReady(true);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setFailed(true);
        }
      }
    }

    void setup();
    return () => {
      cancelled = true;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = viewer.current;
    if (!ready || instance === null) {
      return;
    }
    setLoading(true);
    setFailed(false);
    void instance
      .loadSkin(skinUrl ?? '/default-skin-steve.png', {
        model: variant === 'slim' ? 'slim' : 'default',
      })
      .then(() => setLoading(false))
      .catch(() => {
        setLoading(false);
        setFailed(true);
      });
  }, [ready, skinUrl, variant, retry]);

  useEffect(() => {
    const instance = viewer.current;
    if (!ready || instance === null) {
      return;
    }
    if (capeUrl === null) {
      instance.resetCape();
      return;
    }
    void instance.loadCape(capeUrl).catch(() => undefined);
  }, [ready, capeUrl, retry]);

  useEffect(() => {
    if (viewer.current !== null) {
      viewer.current.autoRotate = rotating;
    }
  }, [rotating]);

  return (
    <div className="appearance-preview">
      <div className="appearance-stage">
        <canvas ref={canvas} className="appearance-canvas" aria-label="3D 外观预览" />
        {loading && !failed ? <span className="appearance-status">加载形象预览…</span> : null}
        {failed ? (
          <span className="appearance-status bad">
            预览加载失败，链接可能已过期。
            {onRefresh !== undefined ? (
              <button
                className="button tiny secondary appearance-retry"
                type="button"
                onClick={() => {
                  setRetry((value) => value + 1);
                  onRefresh?.();
                }}
              >
                刷新形象
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="appearance-toolbar">
        <span className="appearance-name">{playerName ?? '史蒂夫'}</span>
        <button
          className="button tiny secondary"
          type="button"
          onClick={() => setRotating((value) => !value)}
        >
          {rotating ? '暂停旋转' : '自动旋转'}
        </button>
      </div>
      <p className="appearance-hint">拖动旋转 · 滚轮缩放</p>
    </div>
  );
}
