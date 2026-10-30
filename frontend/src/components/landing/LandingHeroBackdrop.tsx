import { useEffect, useRef, useState } from 'react';

export const HERO_BACKDROP_VIDEO = '/media/hero-backdrop.mp4';
export const HERO_BACKDROP_POSTER = '/media/hero-backdrop-poster.jpg';

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/** Devices that would stutter decoding a looping video get the still poster instead. */
function prefersStillBackdrop(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hints = navigator as Navigator & NavigatorHints;
  if (hints.connection?.saveData) return true;
  if (hints.hardwareConcurrency && hints.hardwareConcurrency < 4) return true;
  return typeof hints.deviceMemory === 'number' && hints.deviceMemory < 4;
}

export function LandingHeroBackdrop({ reducedMotion }: { reducedMotion: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stillOnly] = useState(prefersStillBackdrop);
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = !reducedMotion && !stillOnly && !videoFailed;

  useEffect(() => {
    const video = videoRef.current;
    if (!showVideo || !video || typeof IntersectionObserver !== 'function') return undefined;
    // Stop decoding while the hero is scrolled away.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [showVideo]);

  if (!showVideo) {
    return (
      <img
        className="landing-hero__video"
        src={HERO_BACKDROP_POSTER}
        alt=""
        aria-hidden="true"
        decoding="async"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className="landing-hero__video"
      src={HERO_BACKDROP_VIDEO}
      poster={HERO_BACKDROP_POSTER}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onError={() => setVideoFailed(true)}
    />
  );
}
